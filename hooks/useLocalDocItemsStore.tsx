// store/userStore.ts
import { create } from "zustand";

interface DocItemsState {
  localDocItems: DocItem[] | null;
  setLocalDocItems: (items: DocItem[] | null) => void;
}

// Create Zustand store
export const useLocalDocItemsStore = create<DocItemsState>((set) => ({
  localDocItems: null,

  setLocalDocItems: (items: DocItem[] | null) => {
    set({ localDocItems: items });
  },
}));
