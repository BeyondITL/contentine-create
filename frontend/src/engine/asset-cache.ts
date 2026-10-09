/**
 * Contentine Create — Unified IndexedDB Asset Cache
 * Caches WASM binaries, ML models, generated images, and audio.
 * LRU eviction at 500MB cap. WASM + model entries are never evicted.
 */

const DB_NAME = 'contentine-assets';
const DB_VERSION = 1;

/** Store names inside IndexedDB. */
const STORES = {
  wasm: 'wasm',
  models: 'models',
  images: 'images',
  audio: 'audio',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

interface CacheEntry {
  key: string;
  data: ArrayBuffer | Blob;
  size: number;
  createdAt: number;
  lastAccessed: number;
  /** If true, entry is never evicted (WASM, model weights). */
  permanent: boolean;
}

/** Maximum cache size in bytes (500 MB). */
const MAX_CACHE_BYTES = 500 * 1024 * 1024;

/** Open (or create) the IndexedDB database. */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'key' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get a single entry from a store. */
async function getEntry(store: StoreName, key: string): Promise<CacheEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Put an entry into a store. */
async function putEntry(store: StoreName, entry: CacheEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete an entry from a store. */
async function deleteEntry(store: StoreName, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all entries in a store. */
async function getAllEntries(store: StoreName): Promise<CacheEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

/** Compute total cache size across all stores. */
async function totalSize(): Promise<number> {
  let total = 0;
  for (const store of Object.values(STORES)) {
    const entries = await getAllEntries(store);
    total += entries.reduce((sum, e) => sum + e.size, 0);
  }
  return total;
}

/** LRU eviction — remove oldest non-permanent entries until under budget. */
async function evictIfNeeded(): Promise<void> {
  let current = await totalSize();
  if (current <= MAX_CACHE_BYTES) return;

  // Collect all evictable entries across stores
  const evictable: { store: StoreName; entry: CacheEntry }[] = [];
  for (const store of Object.values(STORES)) {
    const entries = await getAllEntries(store);
    for (const entry of entries) {
      if (!entry.permanent) {
        evictable.push({ store, entry });
      }
    }
  }

  // Sort by lastAccessed ascending (oldest first)
  evictable.sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);

  for (const { store, entry } of evictable) {
    if (current <= MAX_CACHE_BYTES) break;
    await deleteEntry(store, entry.key);
    current -= entry.size;
  }
}

/** Create a SHA-256 hash of a string (for content-addressable caching). */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Public API ───────────────────────────────────────────────

export const assetCache = {
  /**
   * Get a cached asset. Returns null if not found.
   * Updates lastAccessed timestamp on hit.
   */
  async get(store: StoreName, key: string): Promise<ArrayBuffer | Blob | null> {
    try {
      const entry = await getEntry(store, key);
      if (!entry) return null;

      // Touch lastAccessed
      entry.lastAccessed = Date.now();
      await putEntry(store, entry);
      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Store an asset in the cache.
   * @param permanent — If true, never evicted (use for WASM/models).
   */
  async set(
    store: StoreName,
    key: string,
    data: ArrayBuffer | Blob,
    permanent = false
  ): Promise<void> {
    try {
      const size = data instanceof Blob ? data.size : data.byteLength;
      const entry: CacheEntry = {
        key,
        data,
        size,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        permanent,
      };

      await putEntry(store, entry);
      await evictIfNeeded();
    } catch (err) {
      console.warn('[AssetCache] Failed to cache:', key, err);
    }
  },

  /** Check if a key exists in a store. */
  async has(store: StoreName, key: string): Promise<boolean> {
    const entry = await getEntry(store, key);
    return entry !== null;
  },

  /** Remove a specific entry. */
  async remove(store: StoreName, key: string): Promise<void> {
    await deleteEntry(store, key);
  },

  /** Get total cache size in bytes. */
  async size(): Promise<number> {
    return totalSize();
  },

  /** Clear all non-permanent entries from all stores. */
  async clearEvictable(): Promise<void> {
    for (const store of Object.values(STORES)) {
      const entries = await getAllEntries(store);
      for (const entry of entries) {
        if (!entry.permanent) {
          await deleteEntry(store, entry.key);
        }
      }
    }
  },

  /** Clear everything. */
  async clearAll(): Promise<void> {
    const db = await openDB();
    for (const store of Object.values(STORES)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  },

  /** Hash a string for content-addressable storage keys. */
  hash: hashString,

  /** Store name constants for convenience. */
  STORES,
};

export type { StoreName, CacheEntry };
