// src/store/useUserStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface User {
    user_id: number;
    username: string;
    created_at: string;
    updated_at: string;
    is_dirty: boolean;
    email: string;
    business_name?: string;
    account_type: "enterprise" | "standard";
    location?: string;
    business_logo?: any; // Assuming LargeBinary can be complex
    business_email?: string;
    status: "active" | "expired" | "grace" | "trial";
    org_id?: number;
    org_name?: string;
    branch_id?: number;
    branch_location?: string;
    role?: "admin" | "employee";
}

export type NewUserData = Omit<User, 'user_id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/users';

// --- 2. Define Store ---

export interface UserStore {
  users: User[];
  currentUser: User | null;
  isLoading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  fetchUser: (id: number) => Promise<void>;
  createUser: (data: NewUserData) => Promise<User | undefined>;
  updateUser: (id: number, data: Partial<NewUserData>) => Promise<User | undefined>;
  deleteUser: (id: number) => Promise<void>;
  setCurrentUser: (user: User | null) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  users: [],
  currentUser: null,
  isLoading: false,
  error: null,

  setCurrentUser: (user) => {
    set({ currentUser: user });
  },

  fetchUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<User[]>(resource);
      set({ users: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch users";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchUser: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<User>(`${resource}/${id}`);
      set({ currentUser: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch user ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createUser: async (newUserData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<User>(resource, newUserData);
      set((state) => ({ users: [...state.users, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create user";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateUser: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<User>(`${resource}/${id}`, updatedData);
      set((state) => ({
        users: state.users.map((u) => (u.user_id === id ? data : u)),
        currentUser: state.currentUser?.user_id === id ? data : state.currentUser,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update user ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteUser: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        users: state.users.filter((u) => u.user_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete user ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));
