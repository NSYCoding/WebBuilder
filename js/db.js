/**
 * Tiny promise wrapper around IndexedDB: one database, one object store,
 * values stored via structured clone (no JSON round-trip).
 */
(function (WB) {
  const DB_NAME = 'webbuilder';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';

  let connection = null;

  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      // Allow a retry later if opening failed.
      connection.catch(() => { connection = null; });
    }
    return connection;
  }

  /** Run one request inside its own transaction and resolve with its result. */
  async function run(mode, makeRequest) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = makeRequest(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  WB.db = {
    /** @returns {Promise<any|undefined>} */
    get: (key) => run('readonly', (store) => store.get(key)),
    put: (key, value) => run('readwrite', (store) => store.put(value, key)),
    delete: (key) => run('readwrite', (store) => store.delete(key)),
  };
})(window.WB);
