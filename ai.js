/**
 * Main-process AI assistant, backed by a local Ollama server.
 *
 * Two models are used:
 *   - an embedding model, to find the parts of the site relevant to a request
 *     (retrieval keeps the prompt small enough for local models), and
 *   - an LLM, which answers with a JSON list of edit operations.
 *
 * Nothing leaves the machine unless the user points the host setting elsewhere.
 * The renderer validates every operation before applying it (js/ai-ops.js).
 */
const { app, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_HOST = 'http://127.0.0.1:11434';
const SUGGESTED_LLM = 'llama3.1:8b';
const SUGGESTED_EMBEDDING = 'nomic-embed-text';

const CONTEXT_TOKENS = 8192;      // Ollama's default (2048) silently truncates our prompt
const MAX_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0.4;
const STATUS_TIMEOUT_MS = 2500;
const EMBED_TIMEOUT_MS = 60 * 1000;
const CHAT_TIMEOUT_MS = 10 * 60 * 1000;

const RETRIEVED_CHAR_BUDGET = 9000;   // how much retrieved site content goes in the prompt
const MAX_CHUNKS = 400;
const MAX_HISTORY_TURNS = 6;
const MAX_TEXT_LENGTH = 4000;

const settingsFile = () => path.join(app.getPath('userData'), 'ai-settings.json');

/* ---------------- Settings ---------------- */

async function readSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
    return {
      host: typeof raw.host === 'string' ? raw.host : DEFAULT_HOST,
      llm: typeof raw.llm === 'string' ? raw.llm : '',
      embed: typeof raw.embed === 'string' ? raw.embed : '',
    };
  } catch {
    return { host: DEFAULT_HOST, llm: '', embed: '' };
  }
}

async function writeSettings(patch) {
  const next = { ...(await readSettings()), ...patch };
  await fs.writeFile(settingsFile(), JSON.stringify(next));
  return next;
}

/** Normalise a user-supplied Ollama address; returns null if it is not an http(s) URL. */
function normaliseHost(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/* ---------------- Ollama HTTP ---------------- */

async function ollama(host, endpoint, body, { timeoutMs, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort());
  try {
    const response = await fetch(`${host}${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      let message = detail;
      try { message = JSON.parse(detail).error || detail; } catch { /* plain text */ }
      throw new Error(message || `Ollama returned HTTP ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

const EMBEDDING_NAME_HINT = /embed|bge|minilm|e5-|gte-|arctic/i;

/** Installed models, each flagged as embedding or generative. */
async function listModels(host) {
  const tags = await (await ollama(host, '/api/tags', null, { timeoutMs: STATUS_TIMEOUT_MS })).json();
  return Promise.all((tags.models || []).map(async (model) => {
    let isEmbedding = EMBEDDING_NAME_HINT.test(model.name);
    try { // newer Ollama versions report capabilities; prefer them when present
      const info = await (await ollama(host, '/api/show', { model: model.name }, { timeoutMs: STATUS_TIMEOUT_MS })).json();
      if (Array.isArray(info.capabilities)) {
        isEmbedding = info.capabilities.includes('embedding') && !info.capabilities.includes('completion');
      }
    } catch { /* keep the name-based guess */ }
    return { name: model.name, isEmbedding };
  }));
}

async function getStatus() {
  const settings = await readSettings();
  const base = { host: settings.host, suggested: { llm: SUGGESTED_LLM, embed: SUGGESTED_EMBEDDING } };
  try {
    const models = await listModels(settings.host);
    const llms = models.filter((m) => !m.isEmbedding).map((m) => m.name);
    const embeds = models.filter((m) => m.isEmbedding).map((m) => m.name);
    // A saved choice only counts if the model is still installed.
    const llm = llms.includes(settings.llm) ? settings.llm : llms[0] || '';
    const embed = embeds.includes(settings.embed) ? settings.embed : embeds[0] || '';
    return { ...base, reachable: true, llms, embeds, llm, embed, ready: Boolean(llm && embed) };
  } catch {
    return { ...base, reachable: false, llms: [], embeds: [], llm: '', embed: '', ready: false };
  }
}

/* ---------------- Embeddings + retrieval ---------------- */

const embeddingCache = new Map(); // "model|hash" -> vector; unchanged text is never re-embedded
const sha = (text) => crypto.createHash('sha1').update(text).digest('hex');

async function embed(host, model, texts, signal) {
  const keys = texts.map((text) => `${model}|${sha(text)}`);
  const missing = [...new Set(keys.filter((k) => !embeddingCache.has(k)))];

  if (missing.length) {
    const textByKey = new Map(keys.map((key, i) => [key, texts[i]]));
    const response = await ollama(host, '/api/embed', {
      model,
      input: missing.map((key) => textByKey.get(key)),
    }, { timeoutMs: EMBED_TIMEOUT_MS, signal });
    const { embeddings } = await response.json();
    if (!Array.isArray(embeddings) || embeddings.length !== missing.length) throw new Error('Unexpected embedding response');
    missing.forEach((key, i) => embeddingCache.set(key, embeddings[i]));
  }
  return keys.map((key) => embeddingCache.get(key));
}

function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  return dot / (Math.sqrt(normA * normB) || 1);
}

/**
 * Pick the chunks most related to the request, best first, until the budget is spent.
 * Falls back to document order if embeddings are unavailable.
 */
async function retrieve({ host, model, query, chunks, signal }) {
  const lineOf = (c) => `[${c.address}] ${c.text}`;
  let ordered = chunks;
  let usedEmbeddings = false;

  if (model && chunks.length) {
    try {
      const vectors = await embed(host, model, [query, ...chunks.map((c) => c.text)], signal);
      const [queryVector, ...chunkVectors] = vectors;
      ordered = chunks
        .map((chunk, i) => ({ chunk, score: cosine(queryVector, chunkVectors[i]) }))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.chunk);
      usedEmbeddings = true;
    } catch (error) {
      if (signal && signal.aborted) throw error;
      // keep document order
    }
  }

  const picked = [];
  let used = 0;
  for (const chunk of ordered) {
    const length = lineOf(chunk).length + 1;
    if (used + length > RETRIEVED_CHAR_BUDGET) continue;
    picked.push(lineOf(chunk));
    used += length;
  }
  return { lines: picked, usedEmbeddings };
}

/* ---------------- Prompt ---------------- */

const SYSTEM_PROMPT = `You are the assistant inside WebBuilder, a visual website builder for restaurants.
You edit the owner's website by returning edit operations.

Reply with ONLY a JSON object, no other text:
{"reply": "<one or two short sentences saying what you did, or answering the question>", "operations": [ ... ]}
Use an empty operations list when the user only asks a question.

Operations (section ids must come from OUTLINE; never invent ids):
{"op":"set","id":"<section id>","path":"<field path>","value":"<new value>"}   change one value. Paths look like "title", "categories.1.name", "categories.0.items.2.price". "navLabel" is also allowed.
{"op":"update_section","id":"<section id>","data":{"title":"...","intro":"..."}}   change several fields of one section; list fields are replaced whole.
{"op":"add_section","type":"<type>","data":{...},"after_id":"<section id or FIRST>"}
{"op":"remove_section","id":"<section id>"}
{"op":"move_section","id":"<section id>","after_id":"<section id or FIRST>"}
{"op":"set_visibility","id":"<section id>","enabled":false}
{"op":"set_site","values":{"name":"...","tagline":"..."}}
{"op":"set_theme","values":{"primary":"#7a2e2e","accent":"#c9a15a","bg":"#fbf7f2","text":"#2b2220","headingFont":"Lora","bodyFont":"Inter","radius":12}}
{"op":"replace_all_sections","sections":[{"type":"hero","data":{...}},{"type":"menu","data":{...}}]}

Rules:
- Only change what the user asked for. Prefer "set" with a path for small edits.
- RELEVANT CONTENT lists the parts of the site most related to the request, each with an address [id=... path=...] you can use in operations.
- Write specific, appealing copy in the restaurant's own voice. Keep price formats and currency consistent. Do not invent awards or health claims.
- Never set images or URLs. Colours are 6-digit hex with good contrast. Fonts must come from the schema list.
- When creating a whole site use set_site, set_theme and replace_all_sections: a hero, about, a menu (2-3 categories of 3-4 dishes), hours and contact, plus other sections that fit. Keep it compact.

Example request: "make the duck confit cost $31"
Example reply: {"reply":"Set the duck confit to $31.","operations":[{"op":"set","id":"s1","path":"categories.1.items.0.price","value":"$31"}]}`;

const clamp = (value, max = MAX_TEXT_LENGTH) => String(value ?? '').slice(0, max);

function parsePayload(payload) {
  if (!payload || !Array.isArray(payload.messages)) throw new Error('No message to send.');
  const turns = payload.messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: clamp(m.text) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('The last message must be from the user.');

  const chunks = (Array.isArray(payload.chunks) ? payload.chunks : [])
    .slice(0, MAX_CHUNKS)
    .filter((c) => c && typeof c.address === 'string' && typeof c.text === 'string')
    .map((c) => ({ address: clamp(c.address, 200), text: clamp(c.text, 600) }));

  return {
    turns,
    chunks,
    schemaDoc: clamp(payload.schemaDoc),
    outline: clamp(payload.outline, 3000),
    focus: clamp(payload.focus, 6000),
  };
}

/* ---------------- Chat ---------------- */

let currentRequest = null; // AbortController of the running request, for the Stop button

/** Read an Ollama NDJSON chat stream, reporting progress; resolves with the full text. */
async function readChatStream(response, onProgress) {
  const decoder = new TextDecoder();
  let buffered = '';
  let text = '';
  let tokens = 0;

  for await (const part of response.body) {
    buffered += decoder.decode(part, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      if (event.message && event.message.content) {
        text += event.message.content;
        tokens += 1;
        if (tokens % 8 === 0) onProgress(tokens);
      }
    }
  }
  return text;
}

/** Turn the model's JSON reply into { reply, operations }; tolerant of key-name drift. */
function parseModelReply(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const operations = data.operations || data.ops || data.edits || [];
  const reply = data.reply || data.message || data.response || '';
  return {
    reply: typeof reply === 'string' ? reply.trim() : '',
    operations: Array.isArray(operations) ? operations : [],
  };
}

async function chat(payload, sender) {
  let parsed;
  try { parsed = parsePayload(payload); } catch (error) { return { ok: false, error: error.message }; }

  const status = await getStatus();
  if (!status.reachable) return { ok: false, error: 'Cannot reach Ollama. Is it running?' };
  if (!status.llm) return { ok: false, error: 'No language model installed. Run: ollama pull ' + SUGGESTED_LLM };

  const controller = new AbortController();
  currentRequest = controller;
  const progress = (tokens) => { if (!sender.isDestroyed()) sender.send('ai:progress', { tokens }); };

  try {
    const query = parsed.turns[parsed.turns.length - 1].content;
    const { lines, usedEmbeddings } = await retrieve({
      host: status.host, model: status.embed, query, chunks: parsed.chunks, signal: controller.signal,
    });

    const context = [
      'OUTLINE (all sections, in page order):', parsed.outline,
      '', 'RELEVANT CONTENT (most related to the request first):', lines.join('\n') || '(none)',
      parsed.focus ? `\nSELECTED SECTION (full data):\n${parsed.focus}` : '',
    ].join('\n');

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nSCHEMA:\n${parsed.schemaDoc}` },
      ...parsed.turns.slice(0, -1),
      { role: 'user', content: `${context}\n\nREQUEST: ${query}` },
    ];

    const response = await ollama(status.host, '/api/chat', {
      model: status.llm,
      messages,
      stream: true,
      format: 'json', // guarantees syntactically valid JSON; the renderer validates the content
      options: { temperature: TEMPERATURE, num_ctx: CONTEXT_TOKENS, num_predict: MAX_OUTPUT_TOKENS },
    }, { timeoutMs: CHAT_TIMEOUT_MS, signal: controller.signal });

    const raw = await readChatStream(response, progress);
    const reply = parseModelReply(raw);
    if (!reply) return { ok: false, error: `${status.llm} did not return valid JSON. Try again, or choose a larger model.` };
    return { ok: true, ...reply, usedEmbeddings };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, cancelled: true, error: 'Stopped.' };
    return { ok: false, error: error.message || 'Something went wrong.' };
  } finally {
    currentRequest = null;
  }
}

/* ---------------- IPC ---------------- */

function registerAiHandlers() {
  ipcMain.handle('ai:status', getStatus);

  ipcMain.handle('ai:setSettings', async (_event, patch) => {
    const next = {};
    if (patch && typeof patch.host === 'string') {
      const host = normaliseHost(patch.host.trim());
      if (host) next.host = host;
    }
    for (const key of ['llm', 'embed']) {
      if (patch && typeof patch[key] === 'string' && patch[key].length < 200) next[key] = patch[key];
    }
    await writeSettings(next);
    return getStatus();
  });

  ipcMain.handle('ai:chat', (event, payload) => chat(payload, event.sender));
  ipcMain.handle('ai:cancel', () => { if (currentRequest) currentRequest.abort(); });
}

module.exports = { registerAiHandlers };
