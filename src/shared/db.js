const DB_NAME = 'silo-analyzer';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('runs')) {
        db.createObjectStore('runs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pages')) {
        // key is `${runId}|${normalizedUrl}` — one row per page per run.
        const pages = db.createObjectStore('pages', { keyPath: 'key' });
        pages.createIndex('runId', 'runId');
      }
      if (!db.objectStoreNames.contains('links')) {
        const links = db.createObjectStore('links', { autoIncrement: true });
        links.createIndex('runId', 'runId');
      }
      if (!db.objectStoreNames.contains('discovered')) {
        // key is `${runId}|${normalizedUrl}`, same shape as pages.
        const discovered = db.createObjectStore('discovered', { keyPath: 'key' });
        discovered.createIndex('runId', 'runId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const ask = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * The run record and the discovered-URL rows that changed, atomically — so a
 * resumed run never sees stats from one moment and a frontier from another.
 */
export async function saveProgress(run, discoveredRows) {
  const db = await open();
  const tx = db.transaction(['runs', 'discovered'], 'readwrite');
  tx.objectStore('runs').put(run);
  const store = tx.objectStore('discovered');
  for (const row of discoveredRows) store.put(row);
  await done(tx);
}

export async function getDiscovered(runId) {
  const db = await open();
  return ask(db.transaction('discovered').objectStore('discovered').index('runId').getAll(runId));
}

export async function getRun(id) {
  const db = await open();
  return ask(db.transaction('runs').objectStore('runs').get(id));
}

/** Most recently started run, or null. Used to restore the popup's view. */
export async function latestRun() {
  const db = await open();
  const all = await ask(db.transaction('runs').objectStore('runs').getAll());
  if (!all.length) return null;
  return all.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** One transaction for the page and all of its outgoing links. */
export async function savePageWithLinks(page, links) {
  const db = await open();
  const tx = db.transaction(['pages', 'links'], 'readwrite');
  tx.objectStore('pages').put(page);
  const linkStore = tx.objectStore('links');
  for (const link of links) linkStore.put(link);
  await done(tx);
}

export async function getPages(runId) {
  const db = await open();
  return ask(db.transaction('pages').objectStore('pages').index('runId').getAll(runId));
}

export async function getLinks(runId) {
  const db = await open();
  return ask(db.transaction('links').objectStore('links').index('runId').getAll(runId));
}

/** Deletes a run and everything it produced. */
export async function deleteRun(runId) {
  const db = await open();
  const tx = db.transaction(['runs', 'pages', 'links', 'discovered'], 'readwrite');
  tx.objectStore('runs').delete(runId);
  for (const store of ['pages', 'links', 'discovered']) {
    const index = tx.objectStore(store).index('runId');
    const cursorReq = index.openCursor(IDBKeyRange.only(runId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  }
  await done(tx);
}
