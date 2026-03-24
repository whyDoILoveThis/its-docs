/**
 * IndexedDB persistence layer for offline queue and project cache.
 * Replaces the previous localStorage approach.
 *
 * Uses navigator.storage.persist() for durable storage.
 */

const DB_NAME = "its-the-docs-offline";
const DB_VERSION = 1;
const QUEUE_STORE = "queue"; // PendingChange[]
const CACHE_STORE = "projectCache"; // keyed by project uid

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "uid" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

// ── Storage Persistence ──────────────────────────────────

export async function ensurePersisted(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  const already = await navigator.storage.persisted();
  if (already) return true;
  return navigator.storage.persist();
}

export async function isPersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

// ── Queue (PendingChange[]) ──────────────────────────────

export interface PendingChange {
  id: string;
  label: string;
  method: string;
  url: string;
  body: unknown;
  createdAt: number;
}

export async function loadQueue(): Promise<PendingChange[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const request = tx.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveQueueItem(change: PendingChange): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(change);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeQueueItem(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Project Cache ────────────────────────────────────────

export async function cacheProject(project: Project): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedProject(uid: string): Promise<Project | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const request = tx.objectStore(CACHE_STORE).get(uid);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllCachedProjects(): Promise<Project[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const request = tx.objectStore(CACHE_STORE).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedProjectsByCreator(
  creatorUid: string,
): Promise<Project[]> {
  const all = await getAllCachedProjects();
  return all.filter((p) => p.creatorUid === creatorUid);
}

export async function removeCachedProject(uid: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).delete(uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateCachedProject(
  uid: string,
  updater: (project: Project) => Project,
): Promise<Project | null> {
  const project = await getCachedProject(uid);
  if (!project) return null;
  const updated = updater(project);
  await cacheProject(updated);
  return updated;
}
