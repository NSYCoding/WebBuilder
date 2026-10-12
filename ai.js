/**
 * Main-process AI assistant.
 *
 * The API key lives only here (never sent to the renderer). The renderer sends a
 * conversation plus the current project; Claude answers by calling one tool,
 * `edit_site`, whose operations the renderer validates and applies.
 */
const { app, ipcMain, safeStorage } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best results)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest)' },
];
const DEFAULT_MODEL = MODELS[0].id;

const MAX_OUTPUT_TOKENS = 16000;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_HISTORY_TURNS = 12;
const MAX_TEXT_LENGTH = 4000;

const keyFile = () => path.join(app.getPath('userData'), 'ai-key.bin');
const settingsFile = () => path.join(app.getPath('userData'), 'ai-settings.json');

/* ---------------- Key + settings storage ---------------- */

let sessionKey = null; // used when the OS cannot encrypt, or before the first save

async function readSavedKey() {
  try {
    return safeStorage.decryptString(await fs.readFile(keyFile()));
  } catch {
    return null;
  }
}

async function resolveKey() {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
  if (sessionKey) return { key: sessionKey, source: 'session' };
  const saved = await readSavedKey();
  return saved ? { key: saved, source: 'saved' } : { key: null, source: null };
}

async function readSettings() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
    return MODELS.some((m) => m.id === settings.model) ? settings : {};
  } catch {
    return {};
  }
}

async function getStatus() {
  const { key, source } = await resolveKey();
  const settings = await readSettings();
  return {
    hasKey: Boolean(key),
    source,
    canPersist: safeStorage.isEncryptionAvailable(),
    model: settings.model || DEFAULT_MODEL,
    models: MODELS,
  };
}

/* ---------------- Prompt + tool ---------------- */

const SYSTEM_PROMPT = `You are the AI assistant inside WebBuilder, a visual website builder for restaurants.
You help the owner build and edit their restaurant website by calling the edit_site tool.

How to work:
- To change the site, call edit_site once with every operation needed. To answer a question or chat, reply in text without calling it.
- Prefer small, targeted operations ("set" with a path) over replacing whole sections. Only touch what the user asked about.
- Use only section ids that appear in the current project JSON. Never invent ids.
- Write realistic, specific, appealing copy in the restaurant's own voice. Keep currency and price format consistent with existing prices. Do not invent awards, press quotes from real publications, or health claims.
- Never set image fields or URLs. The owner uploads their own photos.
- Colours must be 6-digit hex with good text contrast. Fonts must come from the allowed list.
- If the request is vague, make a sensible choice instead of asking questions.
- After editing, reply with one or two short sentences saying what you changed.

When asked to create a whole new site, use set_site, set_theme and replace_all_sections. A good site has a hero, about, menu with 2-4 categories of 3-5 dishes, hours, and contact; add gallery, reviews and reservations when they suit the restaurant.`;

const EDIT_TOOL = {
  name: 'edit_site',
  description:
    'Apply edits to the restaurant website. Operations run in order. The renderer validates every value against the section schema and drops anything invalid.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One short sentence describing the change, for the change log.' },
      operations: {
        type: 'array',
        description: 'Ordered list of edits.',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: [
                'set', 'update_section', 'add_section', 'remove_section', 'move_section',
                'set_visibility', 'set_site', 'set_theme', 'replace_all_sections',
              ],
              description:
                'set: change one value by path. update_section: merge several top-level fields into a section (list fields are replaced whole). add_section / remove_section / move_section / set_visibility manage sections. set_site / set_theme change site details and design. replace_all_sections rebuilds the whole page.',
            },
            id: { type: 'string', description: 'Target section id (set, update_section, remove_section, move_section, set_visibility).' },
            path: { type: 'string', description: "For set: dot path inside the section's data, e.g. 'title', 'categories.0.name', 'categories.1.items.2.price'. 'navLabel' is also allowed." },
            value: { description: 'For set: the new value (string, or array/object for list fields).' },
            data: { type: 'object', description: 'For update_section / add_section: field values keyed by schema field name.', additionalProperties: true },
            type: { type: 'string', description: 'For add_section: the section type.' },
            after_id: { type: 'string', description: "For add_section / move_section: place after this section id. Use 'FIRST' to place at the top. Omit to append." },
            enabled: { type: 'boolean', description: 'For set_visibility.' },
            values: { type: 'object', description: 'For set_site / set_theme: fields to change.', additionalProperties: true },
            sections: {
              type: 'array',
              description: 'For replace_all_sections: the new page, in order.',
              items: {
                type: 'object',
                properties: { type: { type: 'string' }, data: { type: 'object', additionalProperties: true } },
                required: ['type'],
              },
            },
          },
          required: ['op'],
        },
      },
    },
    required: ['operations'],
  },
};

/* ---------------- Request ---------------- */

const clampText = (value) => String(value ?? '').slice(0, MAX_TEXT_LENGTH);

/** Check and normalise what the renderer sent; never trust shapes blindly. */
function parsePayload(payload) {
  if (!payload || !Array.isArray(payload.messages) || !payload.messages.length) throw new Error('No message to send.');
  const turns = payload.messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, text: clampText(m.text) }));
  if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('The last message must be from the user.');
  // The API requires the first turn to be a user turn.
  while (turns[0].role !== 'user') turns.shift();
  return {
    turns,
    schemaDoc: clampText(payload.schemaDoc),
    projectJson: String(payload.projectJson ?? '').slice(0, 200000),
    focusId: typeof payload.focusId === 'string' ? payload.focusId.slice(0, 40) : '',
  };
}

function buildMessages({ turns, projectJson, focusId }) {
  // The live project state rides on the newest user turn so older turns never carry stale state.
  const lastIndex = turns.length - 1;
  return turns.map((turn, i) => {
    if (i !== lastIndex) return { role: turn.role, content: turn.text };
    const focus = focusId ? `\nThe user has this section selected: ${focusId}` : '';
    return {
      role: 'user',
      content: `<current_project>\n${projectJson}\n</current_project>${focus}\n\n${turn.text}`,
    };
  });
}

function friendlyError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in the AI settings.';
  if (error instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.';
  if (error instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a moment and try again.';
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API. Check your internet connection.';
  if (error instanceof Anthropic.BadRequestError) return `The request was rejected: ${error.message}`;
  if (error instanceof Anthropic.APIError) return `API error (${error.status}): ${error.message}`;
  return error.message || 'Something went wrong.';
}

async function chat(payload) {
  const { key } = await resolveKey();
  if (!key) return { ok: false, error: 'Add your Anthropic API key first.' };

  let parsed;
  try { parsed = parsePayload(payload); } catch (error) { return { ok: false, error: error.message }; }

  const { model } = await getStatus();
  const client = new Anthropic({ apiKey: key, timeout: REQUEST_TIMEOUT_MS });
  const request = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    output_config: { effort: 'medium' },
    system: `${SYSTEM_PROMPT}\n\n<schema>\n${parsed.schemaDoc}\n</schema>`,
    tools: [EDIT_TOOL],
    messages: buildMessages(parsed),
  };
  // Fall back to another model if a safety classifier declines (not offered for Haiku).
  if (!model.includes('haiku')) {
    request.betas = ['server-side-fallback-2026-07-01'];
    request.fallbacks = 'default';
  }

  try {
    const response = await client.beta.messages.create(request);

    if (response.stop_reason === 'refusal') return { ok: false, error: 'The model declined that request. Try rephrasing it.' };
    if (response.stop_reason === 'max_tokens') return { ok: false, error: 'That response was too long. Try a smaller request.' };

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'edit_site');
    const input = toolUse && toolUse.input && typeof toolUse.input === 'object' ? toolUse.input : {};
    return {
      ok: true,
      text,
      summary: typeof input.summary === 'string' ? input.summary : '',
      operations: Array.isArray(input.operations) ? input.operations : [],
    };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

/* ---------------- IPC ---------------- */

function registerAiHandlers() {
  ipcMain.handle('ai:status', getStatus);

  ipcMain.handle('ai:setKey', async (_event, rawKey) => {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key || key.length > 400) return { ok: false, error: 'That does not look like an API key.' };
    sessionKey = key;
    if (safeStorage.isEncryptionAvailable()) {
      await fs.writeFile(keyFile(), safeStorage.encryptString(key));
    }
    return { ok: true, status: await getStatus() };
  });

  ipcMain.handle('ai:clearKey', async () => {
    sessionKey = null;
    await fs.rm(keyFile(), { force: true });
    return getStatus();
  });

  ipcMain.handle('ai:setModel', async (_event, modelId) => {
    if (!MODELS.some((m) => m.id === modelId)) return getStatus();
    await fs.writeFile(settingsFile(), JSON.stringify({ model: modelId }));
    return getStatus();
  });

  ipcMain.handle('ai:chat', (_event, payload) => chat(payload));
}

module.exports = { registerAiHandlers };
