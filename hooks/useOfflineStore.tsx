"use client";
import { create } from "zustand";
import {
  loadQueue,
  saveQueueItem,
  removeQueueItem,
  clearQueue,
  updateCachedProject,
  removeCachedProject,
  ensurePersisted,
  isPersisted,
} from "@/lib/offlineDB";
import type { PendingChange } from "@/lib/offlineDB";

// Re-export so existing imports keep working
export type { PendingChange } from "@/lib/offlineDB";
export {
  cacheProject,
  getCachedProject,
  getAllCachedProjects,
  getCachedProjectsByCreator,
  updateCachedProject,
  removeCachedProject,
} from "@/lib/offlineDB";

interface OfflineState {
  pendingChanges: PendingChange[];
  isOpen: boolean;
  isOnline: boolean;
  forceOffline: boolean;
  cacheRevision: number;
  storagePersisted: boolean;
  setIsOpen: (open: boolean) => void;
  goOffline: () => void;
  goOnline: () => void;
  setForceOffline: (value: boolean) => void;
  addChange: (change: PendingChange) => void;
  removeChange: (id: string) => void;
  clearAll: () => void;
  bumpCacheRevision: () => void;
  hydrateQueue: () => Promise<void>;
  requestPersistence: () => Promise<boolean>;
}

/** Revert an optimistic cache update for a pending change, then notify components. */
export async function revertCachedChange(change: PendingChange) {
  const body = change.body as Record<string, unknown>;
  const projUid = body?.projUid as string | undefined;

  switch (change.url) {
    case "/api/addDoc": {
      const doc = body?.doc as { uid?: string } | undefined;
      if (projUid && doc?.uid) {
        await updateCachedProject(projUid, (p) => ({
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
        await updateCachedProject(projUid, (p) => ({
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
        await updateCachedProject(projUid, (p) => ({
          ...p,
          pdmDiagrams: p.pdmDiagrams?.filter((d) => d.uid !== diagram.uid),
        }));
      }
      break;
    }
    case "/api/addProject": {
      const project = body?.project as { uid?: string } | undefined;
      if (project?.uid) {
        await removeCachedProject(project.uid);
      }
      break;
    }
    default:
      break;
  }

  useOfflineStore.getState().bumpCacheRevision();
}

// ── Store ────────────────────────────────────────────────
export const useOfflineStore = create<OfflineState>((set, get) => ({
  pendingChanges: [],
  isOpen: false,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  forceOffline: false,
  cacheRevision: 0,
  storagePersisted: false,

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
    set({ pendingChanges: updated, isOpen: true });
    saveQueueItem(change).catch(() => {});
  },

  removeChange: (id) => {
    const updated = get().pendingChanges.filter((c) => c.id !== id);
    set({ pendingChanges: updated });
    removeQueueItem(id).catch(() => {});
  },

  clearAll: () => {
    set({ pendingChanges: [] });
    clearQueue().catch(() => {});
  },

  hydrateQueue: async () => {
    const changes = await loadQueue();
    set({ pendingChanges: changes });
  },

  requestPersistence: async () => {
    const granted = await ensurePersisted();
    set({ storagePersisted: granted });
    return granted;
  },
}));

// Hydrate from IndexedDB on first client load
if (typeof window !== "undefined") {
  useOfflineStore.getState().hydrateQueue();
  isPersisted().then((val) =>
    useOfflineStore.setState({ storagePersisted: val }),
  );
}
