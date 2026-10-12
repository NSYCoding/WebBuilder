/**
 * The "AI" tab: chat with the assistant, generate a whole site, manage the API key.
 *
 * Flow for each message: send conversation + current project to the main process,
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
  const API_KEYS_URL = 'https://console.anthropic.com/settings/keys';

  // Module state: survives tab switches (the panel is redrawn from this).
  let status = null;          // from the main process: key / model info
  let messages = [];          // { role, text, error?, done?, skipped?, undoable? }
  let busy = false;
  let focusId = '';           // section the user is talking about
  let draft = '';             // unsent text in the input
  let container = null;
  let keyError = '';

  /* ---------------- Talking to the assistant ---------------- */

  /** Project JSON for the model, with embedded images replaced by a placeholder. */
  function projectForModel() {
    return JSON.stringify(store.project, (_key, value) =>
      (typeof value === 'string' && value.startsWith('data:') ? '[uploaded image]' : value), 1);
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    messages.push({ role: 'user', text });
    draft = '';
    busy = true;
    draw();

    const result = await window.desktop.ai.chat({
      messages: messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text })),
      schemaDoc: WB.content.describeSchema(),
      projectJson: projectForModel(),
      focusId,
    });

    busy = false;
    messages.forEach((m) => { m.undoable = false; });
    messages.push(result.ok ? applyResult(result) : { role: 'assistant', text: result.error, error: true });
    draw();
  }

  /** Apply the model's operations to a copy; commit as one undoable step if anything changed. */
  function applyResult(result) {
    const draftProject = structuredClone(store.project);
    const { done, skipped } = WB.aiOps.applyOperations(draftProject, result.operations);
    if (done.length) store.mutate((project) => Object.assign(project, draftProject));
    return {
      role: 'assistant',
      text: result.text || result.summary || (done.length ? 'Done.' : 'I did not change anything.'),
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
      ' Replace the whole page: set_site, set_theme and replace_all_sections. Write all the copy yourself.');
  }

  /* ---------------- Drawing ---------------- */

  function keySetup() {
    const input = h('input', { type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off' });
    const save = async () => {
      const result = await window.desktop.ai.setKey(input.value);
      keyError = result.ok ? '' : result.error;
      if (result.ok) status = result.status;
      draw();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

    return h('div', { class: 'ai-card' },
      h('b', {}, '✨ Connect Claude'),
      h('p', { class: 'muted' }, 'Paste an Anthropic API key to turn on the assistant. It is stored encrypted on this computer and only used to talk to Anthropic.'),
      input,
      keyError && h('p', { class: 'ai-error' }, keyError),
      h('div', { class: 'ai-row' },
        h('button', { class: 'primary', onclick: save }, 'Save key'),
        h('a', { href: API_KEYS_URL, target: '_blank', rel: 'noopener', class: 'muted' }, 'Get a key')));
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
    const bubble = h('div', { class: `ai-msg ${message.role}${message.error ? ' error' : ''}` },
      h('div', {}, message.text),
      message.done && message.done.length > 0 && h('ul', { class: 'ai-changes' }, message.done.map((line) => h('li', {}, line))),
      message.skipped && message.skipped.length > 0 && h('details', { class: 'ai-skipped' },
        h('summary', {}, `${message.skipped.length} change(s) skipped`),
        h('ul', {}, message.skipped.map((line) => h('li', {}, line)))),
      message.undoable && h('button', {
        class: 'ai-undo',
        onclick: () => { store.undo(); message.undoable = false; draw(); },
      }, '↶ Undo these changes'));
    return bubble;
  }

  function chatLog() {
    const log = h('div', { class: 'ai-log' }, messages.map(messageEl));
    if (busy) log.append(h('div', { class: 'ai-msg assistant thinking' }, h('span', {}), h('span', {}), h('span', {})));
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    return log;
  }

  function composer() {
    const section = focusId && store.findSection(focusId);
    const textarea = h('textarea', {
      rows: 3,
      placeholder: section ? `Tell me how to change “${WB.sectionLabel(section)}”…` : 'Ask me to change anything on your site…',
      disabled: busy || !status.hasKey,
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
      h('button', { class: 'primary', disabled: busy || !status.hasKey, onclick: () => send(textarea.value) }, 'Send'));
  }

  function settings() {
    const select = h('select', {}, status.models.map((m) => h('option', { value: m.id, selected: m.id === status.model }, m.label)));
    select.addEventListener('change', async () => { status = await window.desktop.ai.setModel(select.value); draw(); });

    const notes = [];
    if (status.source === 'env') notes.push('Using the ANTHROPIC_API_KEY environment variable.');
    if (status.hasKey && status.source !== 'env' && !status.canPersist) notes.push('Your system cannot encrypt keys, so this one is kept for this session only.');

    return h('div', { class: 'ai-settings' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Model'), select),
      notes.map((note) => h('p', { class: 'muted' }, note)),
      status.hasKey && status.source !== 'env' && h('button', {
        class: 'ghost',
        onclick: async () => { status = await window.desktop.ai.clearKey(); draw(); },
      }, 'Remove API key'));
  }

  function draw() {
    if (!container || !container.isConnected) return;
    if (!status) { container.replaceChildren(h('p', { class: 'muted' }, 'Loading…')); return; }

    container.replaceChildren(h('div', { class: 'ai' },
      !status.hasKey && keySetup(),
      status.hasKey && messages.length === 0 && generatorCard(),
      status.hasKey && messages.length === 0 && h('div', { class: 'ai-suggest' },
        h('span', { class: 'lbl' }, 'Try asking'),
        SUGGESTIONS.map((text) => h('button', { class: 'chip', onclick: () => send(text) }, text))),
      messages.length > 0 || busy ? chatLog() : null,
      composer(),
      settings()));
  }

  WB.aiPanel = {
    /** Draw the tab into `target` (called by panels.js). */
    async render(target) {
      container = target;
      draw();
      if (!status) {
        status = await window.desktop.ai.status();
        draw();
      }
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
