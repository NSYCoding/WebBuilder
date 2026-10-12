/**
 * Holds the current project and autosaves it to IndexedDB.
 *
 * A project looks like:
 *   { site: {...}, theme: {...}, sections: [{ id, type, enabled, navLabel, data }] }
 *
 * The project is mutated in place by the editor; call `store.touch(meta)` afterwards
 * so subscribers (preview, autosave) find out. `meta` describes the change:
 *   structure    sections/content were added, removed, reordered or replaced
 *   canvas       the change came from inline editing in the preview
 *   skipPreview  do not re-render the preview (it already shows the change)
 *
 * History: call `store.checkpoint()` BEFORE a change you want to be undoable.
 *
 * Loading from IndexedDB is asynchronous, so start the app with
 * `await store.init()`. Until then `store.project` is a fresh blank project.
 */
(function (WB) {
  const PROJECT_KEY = 'current';
  const LEGACY_LOCAL_STORAGE_KEY = 'webbuilder:project:v1'; // used before IndexedDB support
  const AUTOSAVE_DELAY_MS = 300;
  const MAX_HISTORY = 50;

  const changeListeners = new Set();
  const saveListeners = new Set();
  const historyListeners = new Set();
  const undoStack = [];
  const redoStack = [];
  let saveTimer;

  const snapshot = (value) => structuredClone(value);
  const notifyHistory = () => historyListeners.forEach((fn) => fn());

  function isValidProject(p) {
    return Boolean(
      p && p.site && p.theme && Array.isArray(p.sections) &&
      p.sections.every((s) => s && typeof s.id === 'string' && WB.SCHEMA[s.type] && s.data),
    );
  }

  /** One-time migration of a project saved by an older localStorage-based version. */
  function takeLegacyProject() {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY));
      return isValidProject(legacy) ? legacy : null;
    } catch {
      return null;
    }
  }

  async function loadSaved() {
    const saved = await WB.db.get(PROJECT_KEY);
    if (isValidProject(saved)) return saved;

    const legacy = takeLegacyProject();
    if (legacy) {
      await WB.db.put(PROJECT_KEY, legacy);
      localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    }
    return legacy;
  }

  async function persist(project) {
    let ok = true;
    try {
      await WB.db.put(PROJECT_KEY, project);
    } catch (error) {
      console.error('Autosave failed', error);
      ok = false;
    }
    saveListeners.forEach((fn) => fn(ok));
  }

  let project = WB.blankProject();

  WB.store = {
    get project() { return project; },

    isValidProject,

    /** Load the saved project (if any). Call once before building the UI. */
    async init() {
      try {
        project = (await loadSaved()) || project;
      } catch (error) {
        console.error('Could not read saved project', error); // fall back to the blank project
      }
    },

    /** @param {(project: Object, meta: Object) => void} fn called after every change */
    subscribe(fn) { changeListeners.add(fn); },

    /** @param {(ok: boolean) => void} fn called after each autosave attempt */
    onSaved(fn) { saveListeners.add(fn); },

    /** @param {() => void} fn called when undo/redo availability changes */
    onHistory(fn) { historyListeners.add(fn); },

    /** Signal that the project was mutated in place. */
    touch(meta = {}) {
      changeListeners.forEach((fn) => fn(project, meta));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persist(project), AUTOSAVE_DELAY_MS);
    },

    /** Swap in a whole new project (template, opened file). Undoable. */
    replace(next) {
      this.checkpoint();
      project = next;
      this.touch({ structure: true });
    },

    /* ---------- history ---------- */

    /** Remember the current state so the next change can be undone. */
    checkpoint() {
      undoStack.push(snapshot(project));
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
      notifyHistory();
    },

    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },

    undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshot(project));
      project = undoStack.pop();
      notifyHistory();
      this.touch({ structure: true });
    },

    redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshot(project));
      project = redoStack.pop();
      notifyHistory();
      this.touch({ structure: true });
    },

    /* ---------- section operations (all undoable) ---------- */

    findSection(id) { return project.sections.find((s) => s.id === id); },

    /** Run `change` as one undoable step that restructures the page. */
    mutate(change) {
      this.checkpoint();
      change(project);
      this.touch({ structure: true });
    },

    moveSection(id, delta) {
      const index = project.sections.findIndex((s) => s.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= project.sections.length) return;
      this.mutate((p) => { [p.sections[index], p.sections[target]] = [p.sections[target], p.sections[index]]; });
    },

    removeSection(id) {
      this.mutate((p) => { p.sections = p.sections.filter((s) => s.id !== id); });
    },

    toggleSection(id) {
      const section = this.findSection(id);
      if (section) this.mutate(() => { section.enabled = !section.enabled; });
    },

    addSection(type) {
      const section = WB.newSection(type);
      this.mutate((p) => { p.sections.push(section); });
      return section;
    },
  };
})(window.WB);
