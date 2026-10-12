/**
 * The "AI" tab: chat with the local assistant, generate a whole site, and
 * choose the Ollama models.
 *
 * Flow for each message: send the conversation plus the project's chunks to the
 * main process (which embeds them, retrieves the relevant ones and asks the LLM),
 * receive operations, apply them to a COPY of the project, and only if something
 * valid came out, commit it as one undoable step.
 */
(function (WB) {
  const { h, store } = WB;

  const SUGGESTIONS = [
    'Make the menu descriptions more mouth-watering',
    'Give the site a dark, modern look',
    'Write a warm About story for a family-run restaurant',
    'Add a reservations section',
  ];
  const OLLAMA_URL = 'https://ollama.com/download';
  const FOCUS_JSON_CHARS = 6000;

  // Module state: survives tab switches (the panel is redrawn from this).
  let status = null;          // from the main process: reachability, installed models, choices
  let messages = [];          // { role, text, error?, note?, done?, skipped?, undoable? }
  let busy = false;
  let progressTokens = 0;
  let focusId = '';           // section the user is talking about
  let draft = '';             // unsent text in the input
  let container = null;

  /* ---------------- Talking to the assistant ---------------- */

  /** JSON of one section's data for the prompt, with embedded images replaced by a placeholder. */
  function focusedSectionJson() {
    const section = focusId && store.findSection(focusId);
    if (!section) return '';
    const json = JSON.stringify({ id: section.id, type: section.type, data: section.data }, (_key, value) =>
      (typeof value === 'string' && value.startsWith('data:') ? '[uploaded image]' : value));
    return json.slice(0, FOCUS_JSON_CHARS);
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    messages.push({ role: 'user', text });
    draft = '';
    busy = true;
    progressTokens = 0;
    draw();

    const result = await window.desktop.ai.chat({
      messages: messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text })),
      schemaDoc: WB.content.describeSchema(),
      outline: WB.content.outline(store.project),
      chunks: WB.content.chunkProject(store.project),
      focus: focusedSectionJson(),
    });

    busy = false;
    messages.forEach((m) => { m.undoable = false; });
    if (result.ok) messages.push(applyResult(result));
    else messages.push({ role: 'assistant', text: result.error, error: !result.cancelled });
    draw();
  }

  /** Apply the model's operations to a copy; commit as one undoable step if anything changed. */
  function applyResult(result) {
    const draftProject = structuredClone(store.project);
    const { done, skipped } = WB.aiOps.applyOperations(draftProject, result.operations);
    if (done.length) store.mutate((project) => Object.assign(project, draftProject));
    return {
      role: 'assistant',
      text: result.reply || (done.length ? 'Done.' : 'I did not change anything.'),
      note: result.usedEmbeddings ? '' : 'The embedding model was unavailable, so the whole page was sent in order.',
      done,
      skipped,
      undoable: done.length > 0,
    };
  }

  function generateSite(form) {
    const name = form.name.value.trim();
    const kind = form.kind.value.trim();
    const vibe = form.vibe.value.trim();
    if (!name || !kind) return;
    send(
      `Create a complete new website for "${name}", a ${kind} restaurant.` +
      (vibe ? ` Style and personality: ${vibe}.` : '') +
      ' Replace the whole page with set_site, set_theme and replace_all_sections. Write all the copy yourself.');
  }

  /* ---------------- Drawing ---------------- */

  const command = (text) => h('code', { class: 'ai-cmd', title: 'Click to copy', onclick: () => navigator.clipboard.writeText(text) }, text);

  /** Explains what is missing: Ollama itself, the LLM, or the embedding model. */
  function setupCard() {
    const steps = [];
    if (!status.reachable) {
      steps.push(
        h('p', {}, 'Ollama is not running. Install it, start it, then retry.'),
        h('a', { href: OLLAMA_URL, target: '_blank', rel: 'noopener' }, 'Get Ollama'));
    } else {
      if (!status.llm) steps.push(h('p', {}, 'Install a language model:'), command(`ollama pull ${status.suggested.llm}`));
      if (!status.embed) steps.push(h('p', {}, 'Install an embedding model:'), command(`ollama pull ${status.suggested.embed}`));
    }
    return h('div', { class: 'ai-card' },
      h('b', {}, '✨ Set up the local assistant'),
      h('p', { class: 'muted' }, 'The assistant runs on your computer with Ollama: a language model writes the edits and an embedding model finds the parts of your site that matter. Nothing is sent to the cloud.'),
      steps,
      h('button', { class: 'primary', onclick: refreshStatus }, 'Check again'));
  }

  function generatorCard() {
    const form = h('form', { class: 'ai-card' },
      h('b', {}, '🪄 Generate a whole site'),
      h('input', { name: 'name', type: 'text', placeholder: 'Restaurant name' }),
      h('input', { name: 'kind', type: 'text', placeholder: 'Type of food (e.g. Lebanese, ramen, tapas)' }),
      h('input', { name: 'vibe', type: 'text', placeholder: 'Vibe (optional: cosy, upscale, playful…)' }),
      h('button', { class: 'primary', type: 'submit' }, 'Generate'));
    form.addEventListener('submit', (e) => { e.preventDefault(); generateSite(form); });
    return form;
  }

  function messageEl(message) {
    return h('div', { class: `ai-msg ${message.role}${message.error ? ' error' : ''}` },
      h('div', {}, message.text),
      message.done && message.done.length > 0 && h('ul', { class: 'ai-changes' }, message.done.map((line) => h('li', {}, line))),
      message.skipped && message.skipped.length > 0 && h('details', { class: 'ai-skipped' },
        h('summary', {}, `${message.skipped.length} change(s) skipped`),
        h('ul', {}, message.skipped.map((line) => h('li', {}, line)))),
      message.note && h('div', { class: 'muted ai-note' }, message.note),
      message.undoable && h('button', {
        class: 'ai-undo',
        onclick: () => { store.undo(); message.undoable = false; draw(); },
      }, '↶ Undo these changes'));
  }

  function chatLog() {
    const log = h('div', { class: 'ai-log' }, messages.map(messageEl));
    if (busy) {
      log.append(h('div', { class: 'ai-msg assistant thinking' },
        h('div', { class: 'dots' }, h('span', {}), h('span', {}), h('span', {})),
        h('span', { class: 'ai-progress muted' }, progressTokens ? `${progressTokens} tokens` : 'Thinking…'),
        h('button', { class: 'ai-undo', onclick: () => window.desktop.ai.cancel() }, 'Stop')));
    }
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    return log;
  }

  function composer() {
    const section = focusId && store.findSection(focusId);
    const disabled = busy || !status.ready;
    const textarea = h('textarea', {
      rows: 3,
      placeholder: section ? `Tell me how to change “${WB.sectionLabel(section)}”…` : 'Ask me to change anything on your site…',
      disabled,
    }, draft);
    textarea.addEventListener('input', () => { draft = textarea.value; });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(textarea.value); }
    });

    return h('div', { class: 'ai-composer' },
      section && h('div', { class: 'ai-focus' },
        h('span', {}, `Focused on: ${WB.sectionLabel(section)}`),
        h('button', { class: 'icon', title: 'Clear focus', onclick: () => { focusId = ''; draw(); } }, '✕')),
      textarea,
      h('button', { class: 'primary', disabled, onclick: () => send(textarea.value) }, 'Send'));
  }

  function modelSelect(label, names, current, key) {
    const select = h('select', {}, names.map((name) => h('option', { value: name, selected: name === current }, name)));
    select.addEventListener('change', async () => { status = await window.desktop.ai.setSettings({ [key]: select.value }); draw(); });
    return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), select);
  }

  function settings() {
    const host = h('input', { type: 'text', value: status.host });
    host.addEventListener('change', async () => { status = await window.desktop.ai.setSettings({ host: host.value }); draw(); });

    return h('div', { class: 'ai-settings' },
      status.llms.length > 0 && modelSelect('Language model', status.llms, status.llm, 'llm'),
      status.embeds.length > 0 && modelSelect('Embedding model', status.embeds, status.embed, 'embed'),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Ollama address'), host),
      h('button', { class: 'ghost', onclick: refreshStatus }, 'Refresh models'));
  }

  function draw() {
    if (!container || !container.isConnected) return;
    if (!status) { container.replaceChildren(h('p', { class: 'muted' }, 'Looking for Ollama…')); return; }

    const empty = messages.length === 0;
    container.replaceChildren(h('div', { class: 'ai' },
      !status.ready && setupCard(),
      status.ready && empty && generatorCard(),
      status.ready && empty && h('div', { class: 'ai-suggest' },
        h('span', { class: 'lbl' }, 'Try asking'),
        SUGGESTIONS.map((text) => h('button', { class: 'chip', onclick: () => send(text) }, text))),
      !empty || busy ? chatLog() : null,
      composer(),
      settings()));
  }

  async function refreshStatus() {
    status = await window.desktop.ai.status();
    draw();
  }

  // Token progress arrives while a request runs; update the label without redrawing the chat.
  window.desktop.ai.onProgress(({ tokens }) => {
    progressTokens = tokens;
    const label = container && container.querySelector('.ai-progress');
    if (label) label.textContent = `${tokens} tokens`;
  });

  WB.aiPanel = {
    /** Draw the tab into `target` (called by panels.js). */
    async render(target) {
      container = target;
      draw();
      if (!status) await refreshStatus();
    },

    /** Start talking about one section (from the canvas toolbar). */
    focusSection(id) {
      focusId = id;
      draw();
      const textarea = container && container.querySelector('textarea');
      if (textarea) textarea.focus();
    },
  };
})(window.WB);
