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
  setIsOpen: (open: boolean) => void;
  goOffline: () => void;
  goOnline: () => void;
  addChange: (change: PendingChange) => void;
  removeChange: (id: string) => void;
  clearAll: () => void;
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

// ── Store ────────────────────────────────────────────────
export const useOfflineStore = create<OfflineState>((set, get) => ({
  pendingChanges: loadQueue(),
  isOpen: false,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,

  setIsOpen: (open) => set({ isOpen: open }),

  goOffline: () => {
    if (get().isOnline) set({ isOnline: false });
  },

  goOnline: () => {
    if (!get().isOnline) set({ isOnline: true });
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
