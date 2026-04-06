// src/store/useOrganizationStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { registerStore, StoreKeys } from '@/api/storeRegistry';

export interface Organization {
  organization_id: number;
  uuid: string;
  name: string;
  plan_type: string;
  emp_count: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
  deleted_at?: string | null;
}

const resource = '/organizations';

export interface OrganizationStore {
  organizations: Organization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  error: string | null;
  fetchOrganizations: () => Promise<void>;
  fetchOrganization: (id: string | number) => Promise<void>;
  updateOrganization: (id: number, data: Partial<Organization>) => Promise<Organization | undefined>;
  setCurrentOrganization: (org: Organization | null) => void;
}

export const useOrganizationStore = create<OrganizationStore>((set) => ({
  organizations: [],
  currentOrganization: null,
  isLoading: false,
  error: null,

  setCurrentOrganization: (org) => {
    set({ currentOrganization: org });
  },

  fetchOrganizations: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Organization[]>(resource);
      set({ organizations: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch organizations";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchOrganization: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Organization>(`${resource}/${id}`);
      set({ currentOrganization: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch organization ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  updateOrganization: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Organization>(`${resource}/${id}`, updatedData);
      set((state) => ({
        organizations: state.organizations.map((o) => (o.organization_id === id ? data : o)),
        currentOrganization: state.currentOrganization?.organization_id === id ? data : state.currentOrganization,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update organization ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },
}));

registerStore(StoreKeys.Organization, () => {
  // Can be used to register store if needed
});
