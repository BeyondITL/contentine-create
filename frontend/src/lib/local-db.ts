/**
 * Local-first IndexedDB wrapper for Contentine Create.
 * Every store uses this as PRIMARY data source.
 * Backend API is an optional sync layer.
 */

const DB_NAME = 'contentine-data';
const DB_VERSION = 2;

const OBJECT_STORES = [
  'videos', 'scheduled_posts', 'remix_projects', 'remix_outputs',
  'writer_documents', 'team', 'team_members', 'team_activities',
  'analytics_snapshots', 'notifications', 'marketplace_listings',
  'marketplace_purchases', 'favourites', 'stock_cache', 'settings',
  'social_accounts',
] as const;

type StoreName = typeof OBJECT_STORES[number];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of OBJECT_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const localDB = {
  async getAll<T>(store: StoreName): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  },

  async get<T>(store: StoreName, id: number | string): Promise<T | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async put<T extends { id?: number | string }>(store: StoreName, item: T): Promise<T> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const record = item.id
        ? item
        : { ...item, id: Date.now() + Math.floor(Math.random() * 1000) };
      const req = tx.objectStore(store).put(record);
      req.onsuccess = () => resolve({ ...record, id: req.result } as T);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(store: StoreName, id: number | string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async clear(store: StoreName): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async count(store: StoreName): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
};
