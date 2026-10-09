'use client';

/**
 * Contentine Create — Quarantined F5 cache purge migration (Law L4)  [WS-5]
 *
 * The prior clone model was fetched from `huggingfacess/F5-TTS-ONNX`, confirmed
 * (2026-07-03) to be an ONNX repackage of the official SWivid/F5-TTS `F5TTS_Base`
 * checkpoint, license cc-by-nc-4.0 → banned from production (LICENSES.md). Any
 * user who ran the old build may have that binary cached in IndexedDB under the
 * asset-cache `models` store, key `f5-tts`. This migration removes it so no
 * NC-licensed weights linger on device.
 *
 * SAFETY: this ONLY deletes the quarantined MODEL binary. It never touches the
 * user's own recorded voice samples (a different store/DB) — deleting user data
 * is out of scope and an escalation trigger. Runs once per client, guarded by a
 * localStorage flag; idempotent and safe to call on every app init.
 */

const MIGRATION_FLAG = 'contentine.migration.f5-purge.v1';
const DB_NAME = 'contentine-assets';
const MODELS_STORE = 'models';
/** Cache keys the quarantined F5 model may have been stored under. */
const QUARANTINED_KEYS = ['f5-tts', 'f5tts', 'models/f5-tts', 'f5-tts-onnx'];

function openAssetDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      // Do NOT bump the version — opening at the existing version avoids an
      // unwanted upgrade if the DB is absent/older. If it doesn't exist yet,
      // there's nothing to purge.
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Remove any quarantined F5 model binary from the on-device asset cache.
 * @returns the number of cache entries deleted.
 */
export async function purgeQuarantinedF5Cache(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  const db = await openAssetDb();
  if (!db) return 0;
  if (!db.objectStoreNames.contains(MODELS_STORE)) { db.close(); return 0; }

  const deleted = await new Promise<number>((resolve) => {
    let count = 0;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(MODELS_STORE, 'readwrite');
    } catch {
      resolve(0);
      return;
    }
    const store = tx.objectStore(MODELS_STORE);

    // Delete the known exact keys.
    for (const k of QUARANTINED_KEYS) store.delete(k);

    // Scan for any other key that references f5 (defensive).
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const key = String(cursor.key);
        if (/f5/i.test(key)) { cursor.delete(); count++; }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(count + QUARANTINED_KEYS.length);
    tx.onerror = () => resolve(count);
    tx.onabort = () => resolve(count);
  });

  db.close();
  return deleted;
}

/**
 * Run the purge once per client (localStorage-guarded). Call from app init and
 * from f5tts-engine before it reports availability. Never throws.
 */
export async function runF5PurgeMigrationOnce(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATION_FLAG)) return;
    await purgeQuarantinedF5Cache();
    if (typeof localStorage !== 'undefined') localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
  } catch {
    /* best-effort; a failed purge simply retries next init */
  }
}
