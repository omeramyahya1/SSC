import { create } from 'zustand';
import api from '@/api/client';

interface UserStore {
  userData: any | null;
  isLoading: boolean;
  fetchUser: (userId: number) => Promise<void>;
}

export const useUserStore = create<UserStore>((set) => ({
  userData: null,
  isLoading: false,

  fetchUser: async (userId: number) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get(`users/${userId}`);
      set({ userData: data, isLoading: false });
    } catch (error) {
      console.error("Fetch error:", error);
      set({ isLoading: false });
    }
  },
}));