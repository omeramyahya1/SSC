// src/store/useSubscriptionStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { registerStore, StoreKeys } from '@/api/storeRegistry';

// --- 1. Define Types ---

export interface Subscription {
  subscription_id: number;
  uuid: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
  expiration_date: string;
  grace_period_end: string;
  type: "trial" | "monthly" | "annual" | "lifetime";
  status: "active" | "expired" | "trial" | "pending";
  license_code: string;
  tampered: boolean;
}

export type NewSubscriptionData = Omit<Subscription, 'subscription_id' | 'uuid' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/subscriptions';

// --- 2. Define Store ---

export interface SubscriptionStore {
  subscriptions: Subscription[];
  currentSubscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  fetchSubscriptions: (user_uuid?: string) => Promise<void>;
  fetchSubscription: (id: string) => Promise<void>;
  createSubscription: (data: NewSubscriptionData) => Promise<Subscription | undefined>;
  updateSubscription: (id: string, data: Partial<NewSubscriptionData>) => Promise<Subscription | undefined>;
  deleteSubscription: (id: string) => Promise<void>;
  setCurrentSubscription: (subscription: Subscription | null) => void;
  refreshSubscriptionStatus: () => Promise<void>;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  currentSubscription: null,
  isLoading: false,
  error: null,

  setCurrentSubscription: (subscription) => {
    set({ currentSubscription: subscription });
  },

  fetchSubscriptions: async (user_uuid?: string) => {
    set({ isLoading: true, error: null });
    try {
      const url = user_uuid ? `${resource}?user_uuid=${user_uuid}` : resource;
      const { data } = await api.get<Subscription[]>(url);
      const active = data.find((s) => s.status === "active") || null;
      set({ subscriptions: data, currentSubscription: active || data[0] || null, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch subscriptions";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  refreshSubscriptionStatus: async () => {
      await get().fetchSubscriptions();
  },

  fetchSubscription: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Subscription>(`${resource}/${id}`);
      set({ currentSubscription: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch subscription ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createSubscription: async (newSubscriptionData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Subscription>(resource, newSubscriptionData);
      set((state) => ({ subscriptions: [...state.subscriptions, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create subscription";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateSubscription: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Subscription>(`${resource}/${id}`, updatedData);
      set((state) => ({
        subscriptions: state.subscriptions.map((s) => (s.uuid === id ? data : s)),
        currentSubscription: state.currentSubscription?.uuid === id ? data : state.currentSubscription,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update subscription ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteSubscription: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.uuid !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete subscription ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));

registerStore(StoreKeys.Subscription, () => {
  useSubscriptionStore.getState().fetchSubscriptions();
});
