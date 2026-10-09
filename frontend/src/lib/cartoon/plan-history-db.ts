/**
 * Contentine Create — Cartoon Studio: plan-history persistence (WS-4 layer)
 *
 * Client-side, IndexedDB-primary storage for scene-plan snapshots — the
 * timeline editor's version history (restore + diff). Only the SERIALIZABLE
 * plan JSON is stored here; the live render objects (voice-take PCM, the MP4
 * Blob, the GSAP timeline) never persist — they are rebuilt from the plan.
 *
 * A dedicated IndexedDB database (not `lib/local-db.ts`) so this ships without
 * touching the shared 16-store schema / DB_VERSION owned by the sync layer.
 * The scene-plan doctrine (scene-plan-schema skill): IndexedDB not localStorage
 * (no 5 MB cap), bounded snapshot stack, garbage-collect the oldest on write.
 */

import type { ScenePlan } from '@/engine/cartoon';

const DB_NAME = 'contentine-cartoon-history';
const DB_VERSION = 1;
const STORE = 'plan_snapshots';

/** One version-history entry. Everything here is plain JSON — safe to persist. */
export interface PlanSnapshot {
  /** Snapshot id (uuid). */
  id: string;
  /** Project the snapshot belongs to (`ScenePlan.id`). Index key for listing. */
  projectId: string;
  /** Content hash of the plan at capture time (`hashScenePlan`). */
  planHash: string;
  /** Human label, e.g. "Initial render" or "Re-rolled scene 2". */
  label: string;
  /** Epoch ms. */
  createdAt: number;
  /** The full scene plan captured at this version. */
  plan: ScenePlan;
}

/** Newest snapshots kept per project; older ones are garbage-collected. */
export const MAX_SNAPSHOTS_PER_PROJECT = 50;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** All snapshots for a project, newest first. */
export async function listSnapshots(projectId: string): Promise<PlanSnapshot[]> {
  const db = await openDB();
  try {
    const rows = await new Promise<PlanSnapshot[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('projectId');
      const req = index.getAll(IDBKeyRange.only(projectId));
      req.onsuccess = () => resolve(req.result as PlanSnapshot[]);
      req.onerror = () => reject(req.error);
    });
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

/**
 * Persist a snapshot, then trim the project's history to
 * `MAX_SNAPSHOTS_PER_PROJECT` (oldest deleted). Returns the stored snapshot.
 */
export async function putSnapshot(snapshot: PlanSnapshot): Promise<PlanSnapshot> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await gc(db, snapshot.projectId);
    return snapshot;
  } finally {
    db.close();
  }
}

/** Delete one snapshot by id. */
export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Drop the oldest snapshots beyond the per-project cap. */
async function gc(db: IDBDatabase, projectId: string): Promise<void> {
  const rows = await new Promise<PlanSnapshot[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('projectId');
    const req = index.getAll(IDBKeyRange.only(projectId));
    req.onsuccess = () => resolve(req.result as PlanSnapshot[]);
    req.onerror = () => reject(req.error);
  });
  if (rows.length <= MAX_SNAPSHOTS_PER_PROJECT) return;

  const doomed = rows
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, rows.length - MAX_SNAPSHOTS_PER_PROJECT);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const row of doomed) os.delete(row.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
