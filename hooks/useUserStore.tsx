// store/userStore.ts
import { create } from "zustand";
import axios from "axios";

interface UserState {
  dbUser: User | null;
  loadingUser: boolean;
  fetchUser: (userId: string) => Promise<void>;
  refetchUser: () => Promise<void>;
  setDbUser: (user: User | null) => void;
}

// Create Zustand store
export const useUserStore = create<UserState>((set, get) => ({
  dbUser: null,
  loadingUser: true,

  // Fetch user data function (requires userId)
  fetchUser: async (uid: string) => {
    if (!uid) {
      set({ loadingUser: false });
      return;
    }

    try {
      set({ loadingUser: true });

      // Fetch the user from the MongoDB API
      const response = await axios.post("/api/checkUserExists", {
        uid,
      });
      const data = response.data;

      if (data.exists) {
        set({ dbUser: data.user });
      } else {
        set({ dbUser: null });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      set({ dbUser: null });
    } finally {
      set({ loadingUser: false });
    }
  },

  // Refetch user (this will reuse the current userId from the state)
  refetchUser: async () => {
    const { dbUser } = get();
    if (dbUser?.uid) {
      await get().fetchUser(dbUser.uid);
    }
  },

  // Set user manually
  setDbUser: (user: User | null) => {
    set({ dbUser: user });
  },
}));
