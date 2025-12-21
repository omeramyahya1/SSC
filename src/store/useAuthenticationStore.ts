// src/store/useAuthenticationStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { User } from './useUserStore'; // Import User type from useUserStore

// --- 1. Define Types ---

export interface Authentication {
  auth_id: number;
  user_id: number;
  password_hash: string;
  password_salt: string;
  current_jwt?: string | null;
  jwt_issued_at: string;
  device_id?: string | null;
  is_logged_in: boolean;
  last_active: string;
  created_at: string;
  updated_at: string;
}

export type NewAuthenticationData = Omit<Authentication, 'auth_id' | 'created_at' | 'updated_at'>;

const resource = '/authentications';

// Login Response Types (matching auth_schemas.py)
export interface LoginResponseAuthentication {
    auth_id: number;
    user_id: number;
    is_logged_in: boolean;
    current_jwt: string | null;
    jwt_issued_at: string | null;
    device_id: string | null;
    last_active: string | null;
    created_at: string;
    updated_at: string;
}

// User type is already defined in useUserStore, so we can extend it or use it directly
// For consistency with Python schema, creating a new interface that maps directly to the response
export interface LoginResponseUser extends User {}


export interface LoginResponse {
    user: LoginResponseUser;
    authentication: LoginResponseAuthentication;
}


// --- 2. Define Store ---

export interface AuthenticationStore {
  authentications: Authentication[];
  currentAuthentication: Authentication | null;
  isLoading: boolean;
  error: string | null;
  fetchAuthentications: () => Promise<void>;
  fetchAuthentication: (id: number) => Promise<void>;
  fetchLatestAuthentication: () => Promise<Authentication | undefined>;
  createAuthentication: (data: NewAuthenticationData) => Promise<Authentication | undefined>;
  updateAuthentication: (id: number, data: Partial<NewAuthenticationData>) => Promise<Authentication | undefined>;
  deleteAuthentication: (id: number) => Promise<void>;
  setCurrentAuthentication: (auth: Authentication | null) => void;
}

export const useAuthenticationStore = create<AuthenticationStore>((set) => ({
  authentications: [],
  currentAuthentication: null,
  isLoading: false,
  error: null,

  setCurrentAuthentication: (auth) => {
    set({ currentAuthentication: auth });
  },

  fetchAuthentications: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Authentication[]>(resource);
      set({ authentications: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch authentications";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchAuthentication: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Authentication>(`${resource}/${id}`);
      set({ currentAuthentication: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch authentication ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchLatestAuthentication: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Authentication>(`${resource}/latest`);
      set({ currentAuthentication: data, isLoading: false });
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch latest authentication`;
      set({ error: errorMsg, isLoading: false, currentAuthentication: null });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  createAuthentication: async (newAuthData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Authentication>(resource, newAuthData);
      set((state) => ({ authentications: [...state.authentications, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create authentication";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateAuthentication: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Authentication>(`${resource}/${id}`, updatedData);
      set((state) => ({
        authentications: state.authentications.map((a) => (a.auth_id === id ? data : a)),
        currentAuthentication: state.currentAuthentication?.auth_id === id ? data : state.currentAuthentication,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update authentication ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteAuthentication: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        authentications: state.authentications.filter((a) => a.auth_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete authentication ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));