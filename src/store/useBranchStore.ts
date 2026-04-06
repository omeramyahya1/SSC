import { create } from 'zustand';
import api from '@/api/client';
import { registerStore, StoreKeys } from '@/api/storeRegistry';

// --- 1. Define Types ---

export interface Branch {
  branch_id: number;
  uuid: string;
  name: string;
  location?: string | null;
  organization_uuid: string;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
  deleted_at?: string | null;
}

export type NewBranchData = Omit<Branch, 'branch_id' | 'uuid' | 'created_at' | 'updated_at' | 'is_dirty' | 'deleted_at'>;
const resource = '/branches';

// --- 2. Define Store ---

export interface BranchStore {
  branches: Branch[];
  currentBranch: Branch | null;
  isLoading: boolean;
  error: string | null;
  fetchBranches: () => Promise<void>;
  fetchBranch: (id: number) => Promise<void>;
  createBranch: (data: NewBranchData) => Promise<Branch | undefined>;
  updateBranch: (id: number, data: Partial<NewBranchData>) => Promise<Branch | undefined>;
  deleteBranch: (id: number) => Promise<void>;
  setCurrentBranch: (branch: Branch | null) => void;
}

export const useBranchStore = create<BranchStore>((set) => ({
  branches: [],
  currentBranch: null,
  isLoading: false,
  error: null,

  setCurrentBranch: (branch) => {
    set({ currentBranch: branch });
  },

  fetchBranches: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Branch[]>(resource);
      set({ branches: data.filter(b => !b.deleted_at), isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch branches";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchBranch: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Branch>(`${resource}/${id}`);
      set({ currentBranch: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch branch ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createBranch: async (newBranchData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Branch>(resource, newBranchData);
      set((state) => ({ branches: [...state.branches, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create branch";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateBranch: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Branch>(`${resource}/${id}`, updatedData);
      set((state) => ({
        branches: state.branches.map((b) => (b.branch_id === id ? data : b)),
        currentBranch: state.currentBranch?.branch_id === id ? data : state.currentBranch,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update branch ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteBranch: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        branches: state.branches.filter((b) => b.branch_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete branch ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      throw e;
    }
  },
}));

registerStore(StoreKeys.Branch, () => {
  useBranchStore.getState().fetchBranches();
});
