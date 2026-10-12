/**
 * Holds the current project and persists it to localStorage.
 *
 * A project looks like:
 *   { site: {...}, theme: {...}, sections: [{ id, type, enabled, navLabel, data }] }
 *
 * The project is mutated in place by the editor; call `store.touch()` afterwards
 * so subscribers (preview, autosave) find out.
 */
(function (WB) {
  const STORAGE_KEY = 'webbuilder:project:v1';
  const AUTOSAVE_DELAY_MS = 300;

  const changeListeners = new Set();
  const saveListeners = new Set();
  let saveTimer;

  function isValidProject(p) {
    return Boolean(
      p && p.site && p.theme && Array.isArray(p.sections) &&
      p.sections.every((s) => s && typeof s.id === 'string' && WB.SCHEMA[s.type] && s.data),
    );
  }

  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return isValidProject(saved) ? saved : null;
    } catch {
      return null;
    }
  }

  function persist(project) {
    let ok = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      ok = false; // typically: embedded images exceeded the storage quota
    }
    saveListeners.forEach((fn) => fn(ok));
  }

  let project = loadSaved() || WB.blankProject();

  WB.store = {
    get project() { return project; },

    isValidProject,

    /** @param {(project: Object) => void} fn called after every change */
    subscribe(fn) { changeListeners.add(fn); },

    /** @param {(ok: boolean) => void} fn called after each autosave attempt */
    onSaved(fn) { saveListeners.add(fn); },

    /** Signal that the project was mutated in place. */
    touch() {
      changeListeners.forEach((fn) => fn(project));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persist(project), AUTOSAVE_DELAY_MS);
    },

    /** Swap in a whole new project (template, opened file). */
    replace(next) {
      project = next;
      this.touch();
    },
  };
})(window.WB);
