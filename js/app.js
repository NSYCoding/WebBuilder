/**
 * Entry point: wires the toolbar, template picker and device switcher to the
 * store, preview and Electron file dialogs (exposed as `window.desktop`).
 */
(function (WB) {
  const { h, $, store } = WB;
  const TOAST_DURATION_MS = 2200;
  const CANVAS_REFRESH_DELAY_MS = 400;

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), TOAST_DURATION_MS);
  }

  /** A filesystem-friendly name derived from the restaurant name. */
  function fileBaseName() {
    const slug = (store.project.site.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || 'restaurant';
  }

  async function saveWithDialog(kind, fileName, content, doneLabel) {
    const savedPath = await window.desktop.saveFile(kind, fileName, content);
    if (savedPath) toast(`${doneLabel}: ${savedPath}`);
  }

  function loadProject(project, message) {
    store.replace(project);
    WB.panels.show('sections');
    toast(message);
  }

  /* ---------- toolbar ---------- */

  function wireToolbar() {
    $('#btn-export').onclick = () =>
      saveWithDialog('html', `${fileBaseName()}.html`, WB.render(store.project), 'Exported');

    $('#btn-save').onclick = () =>
      saveWithDialog('project', `${fileBaseName()}.wbproj`, JSON.stringify(store.project, null, 2), 'Saved');

    $('#btn-browser').onclick = () => window.desktop.previewInBrowser(WB.render(store.project));

    $('#btn-open').onclick = async () => {
      const file = await window.desktop.openProject();
      if (!file) return;
      try {
        const project = JSON.parse(file.content);
        if (!store.isValidProject(project)) throw new Error('Not a project file');
        loadProject(project, 'Project opened');
      } catch {
        toast('That file is not a valid WebBuilder project');
      }
    };
  }

  /* ---------- templates ---------- */

  function templateCard(template, dialog) {
    const { theme } = template.build();
    const swatches = [theme.primary, theme.accent, theme.bg, theme.text]
      .map((color) => h('i', { style: `background:${color}` }));

    return h('button', {
      class: 'tpl',
      onclick: () => {
        dialog.close();
        loadProject(template.build(), `Loaded ${template.name}`);
      },
    },
    h('div', { class: 'sw' }, swatches),
    h('div', { class: 'meta' }, h('b', {}, `${template.emoji} ${template.name}`), h('span', { class: 'muted' }, template.blurb)));
  }

  function wireTemplates() {
    const dialog = $('#templates-dialog');
    $('#tpl-grid').append(...Object.values(WB.PRESETS).map((t) => templateCard(t, dialog)));
    $('#btn-templates').onclick = () => dialog.showModal();
  }

  /* ---------- canvas (the live preview) ---------- */

  function onCanvasSelect(id) {
    // While chatting with the assistant, clicking a section sets what you are talking about.
    if (WB.panels.tab === 'ai') WB.aiPanel.focusSection(id);
    else WB.panels.focusSection(id);
  }

  function onCanvasAction({ type, id }) {
    switch (type) {
      case 'up': store.moveSection(id, -1); break;
      case 'down': store.moveSection(id, 1); break;
      case 'toggle': store.toggleSection(id); break;
      case 'delete':
        if (confirm('Delete this section?')) store.removeSection(id);
        break;
      case 'ai':
        WB.panels.show('ai');
        WB.aiPanel.focusSection(id);
        break;
      case 'add': WB.panels.focusAddSection(); break;
      default: break;
    }
  }

  /** Keep the side panel in step with changes it did not make itself. */
  function wirePanelRefresh() {
    let timer;
    store.subscribe((_project, meta) => {
      if (meta.structure) WB.panels.refresh();
      else if (meta.canvas) { // typing in the preview: refresh once typing pauses
        clearTimeout(timer);
        timer = setTimeout(() => WB.panels.refresh(), CANVAS_REFRESH_DELAY_MS);
      }
    });
  }

  /* ---------- undo / redo ---------- */

  const isTextTarget = (el) => el.closest('input, textarea, select, [contenteditable]');

  function wireHistory() {
    const undo = $('#btn-undo');
    const redo = $('#btn-redo');
    const sync = () => { undo.disabled = !store.canUndo; redo.disabled = !store.canRedo; };
    undo.onclick = () => store.undo();
    redo.onclick = () => store.redo();
    store.onHistory(sync);
    sync();

    // Inside text fields the browser's own undo applies; elsewhere Ctrl/Cmd+Z undoes site changes.
    document.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || isTextTarget(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) store.redo(); else store.undo();
    });
  }

  /* ---------- tabs, devices, status ---------- */

  function wirePanelsAndDevices() {
    $('#tabs').onclick = (event) => {
      if (event.target.dataset.tab) WB.panels.show(event.target.dataset.tab);
    };

    $('#devices').onclick = (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      document.querySelectorAll('#devices button').forEach((b) => b.classList.toggle('on', b === button));
      WB.preview.setWidth(button.dataset.w);
    };
  }

  function wireStatus() {
    const status = $('#status');
    store.subscribe(() => { status.textContent = 'Editing…'; });
    store.onSaved((ok) => { status.textContent = ok ? 'Saved' : 'Could not autosave'; });
  }

  async function start() {
    await store.init(); // load the saved project before anything renders it
    wireToolbar();
    wireTemplates();
    wirePanelsAndDevices();
    wireStatus();
    wireHistory();
    wirePanelRefresh();
    WB.preview.init($('#preview'), { onSelect: onCanvasSelect, onAction: onCanvasAction });
    WB.panels.show('sections');
  }

  start();
})(window.WB);
