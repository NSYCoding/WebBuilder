/**
 * Holds the current project and autosaves it to IndexedDB.
 *
 * A project looks like:
 *   { site: {...}, theme: {...}, sections: [{ id, type, enabled, navLabel, data }] }
 *
 * The project is mutated in place by the editor; call `store.touch()` afterwards
 * so subscribers (preview, autosave) find out.
 *
 * Loading from IndexedDB is asynchronous, so start the app with
 * `await store.init()`. Until then `store.project` is a fresh blank project.
 */
(function (WB) {
  const PROJECT_KEY = 'current';
  const LEGACY_LOCAL_STORAGE_KEY = 'webbuilder:project:v1'; // used before IndexedDB support
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
