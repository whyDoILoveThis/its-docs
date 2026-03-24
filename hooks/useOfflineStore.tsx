"use client";
import { create } from "zustand";

export interface PendingChange {
  id: string;
  label: string;
  method: string;
  url: string;
  body: unknown;
  createdAt: number;
}

interface OfflineState {
  pendingChanges: PendingChange[];
  isOpen: boolean;
  isOnline: boolean;
  forceOffline: boolean;
  cacheRevision: number;
  setIsOpen: (open: boolean) => void;
  goOffline: () => void;
  goOnline: () => void;
  setForceOffline: (value: boolean) => void;
  addChange: (change: PendingChange) => void;
  removeChange: (id: string) => void;
  clearAll: () => void;
  bumpCacheRevision: () => void;
}

const QUEUE_KEY = "its-the-docs-offline-queue";
const CACHE_KEY = "its-the-docs-project-cache";

function loadQueue(): PendingChange[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(changes: PendingChange[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(changes));
  } catch {
    // localStorage full or unavailable
  }
}

// ── Project cache helpers ────────────────────────────────
export function cacheProject(project: Project) {
  if (typeof window === "undefined") return;
  try {
    const cache = getCachedProjects();
    cache[project.uid] = project;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full
  }
}

export function updateCachedProject(
  uid: string,
  updater: (project: Project) => Project,
): Project | null {
  const project = getCachedProject(uid);
  if (!project) return null;
  const updated = updater(project);
  cacheProject(updated);
  return updated;
}

export function getCachedProject(uid: string): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const cache = getCachedProjects();
    return cache[uid] || null;
  } catch {
    return null;
  }
}

export function getCachedProjects(): Record<string, Project> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCachedProjectsByCreator(creatorUid: string): Project[] {
  const all = getCachedProjects();
  return Object.values(all).filter((p) => p.creatorUid === creatorUid);
}

function removeCachedProject(uid: string) {
  if (typeof window === "undefined") return;
  try {
    const cache = getCachedProjects();
    delete cache[uid];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full
  }
}

/** Revert an optimistic cache update for a pending change, then notify components. */
export function revertCachedChange(change: PendingChange) {
  const body = change.body as Record<string, unknown>;
  const projUid = body?.projUid as string | undefined;

  switch (change.url) {
    case "/api/addDoc": {
      const doc = body?.doc as { uid?: string } | undefined;
      if (projUid && doc?.uid) {
        updateCachedProject(projUid, (p) => ({
          ...p,
          docs: p.docs?.filter((d) => d.uid !== doc.uid),
        }));
      }
      break;
    }
    case "/api/addDocItem": {
      const docUid = body?.docUid as string | undefined;
      const docItem = body?.docItem as { uid?: string } | undefined;
      if (projUid && docUid && docItem?.uid) {
        updateCachedProject(projUid, (p) => ({
          ...p,
          docs: p.docs?.map((d) =>
            d.uid === docUid
              ? {
                  ...d,
                  docItems: d.docItems?.filter((i) => i.uid !== docItem.uid),
                }
              : d,
          ),
        }));
      }
      break;
    }
    case "/api/addPDM": {
      const diagram = body?.diagram as { uid?: string } | undefined;
      if (projUid && diagram?.uid) {
        updateCachedProject(projUid, (p) => ({
          ...p,
          pdmDiagrams: p.pdmDiagrams?.filter((d) => d.uid !== diagram.uid),
        }));
      }
      break;
    }
    case "/api/addProject": {
      const project = body?.project as { uid?: string } | undefined;
      if (project?.uid) {
        removeCachedProject(project.uid);
      }
      break;
    }
    // For updates/deletes we don't have the previous state to restore.
    // The user can refresh when back online.
    default:
      break;
  }

  // Signal components to re-read from cache
  useOfflineStore.getState().bumpCacheRevision();
}

// ── Store ────────────────────────────────────────────────
export const useOfflineStore = create<OfflineState>((set, get) => ({
  pendingChanges: loadQueue(),
  isOpen: false,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  forceOffline: false,
  cacheRevision: 0,

  setIsOpen: (open) => set({ isOpen: open }),

  bumpCacheRevision: () => set({ cacheRevision: get().cacheRevision + 1 }),

  goOffline: () => {
    if (get().isOnline) set({ isOnline: false });
  },

  goOnline: () => {
    if (get().forceOffline) return;
    if (!get().isOnline) set({ isOnline: true });
  },

  setForceOffline: (value) => {
    set({ forceOffline: value });
    if (value) {
      set({ isOnline: false });
    }
  },

  addChange: (change) => {
    const updated = [...get().pendingChanges, change];
    saveQueue(updated);
    set({ pendingChanges: updated, isOpen: true });
  },

  removeChange: (id) => {
    const updated = get().pendingChanges.filter((c) => c.id !== id);
    saveQueue(updated);
    set({ pendingChanges: updated });
  },

  clearAll: () => {
    saveQueue([]);
    set({ pendingChanges: [] });
  },
}));
