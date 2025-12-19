// src/store/createCrudStore.ts
import { create } from 'zustand';

// Defines the shape of a generic service with CRUD methods.
interface CrudService<T, TCreate> {
  getAll: () => Promise<T[]>;
  getById: (id: number | string) => Promise<T>;
  create: (data: TCreate) => Promise<T>;
  update: (id: number | string, data: Partial<TCreate>) => Promise<T>;
  delete: (id: number | string) => Promise<void>;
}

// Defines the state and actions for a generic CRUD store.
export interface CrudStore<T> {
  items: T[];
  currentItem: T | null;
  isLoading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  fetchItem: (id: number | string) => Promise<void>;
  createItem: (data: any) => Promise<T | undefined>;
  updateItem: (id: number | string, data: any) => Promise<T | undefined>;
  deleteItem: (id: number | string) => Promise<void>;
  setCurrentItem: (item: T | null) => void;
}

// The factory function to create a new CRUD store.
export function createCrudStore<T extends { [key: string]: any }, TCreate>(
  service: CrudService<T, TCreate>
) {
  return create<CrudStore<T>>((set, get) => ({
    items: [],
    currentItem: null,
    isLoading: false,
    error: null,

    /**
     * Sets the currently active/selected item in the store.
     */
    setCurrentItem: (item: T | null) => {
      set({ currentItem: item });
    },

    /**
     * Fetches all items and updates the state.
     */
    fetchItems: async () => {
      set({ isLoading: true, error: null });
      try {
        const items = await service.getAll();
        set({ items, isLoading: false });
      } catch (e: any) {
        set({ error: e.message, isLoading: false });
        console.error("Failed to fetch items:", e);
      }
    },

    /**
     * Fetches a single item by ID and updates the state.
     */
    fetchItem: async (id: number | string) => {
      set({ isLoading: true, error: null });
      try {
        const item = await service.getById(id);
        set({ currentItem: item, isLoading: false });
      } catch (e: any) {
        set({ error: e.message, isLoading: false });
        console.error(`Failed to fetch item ${id}:`, e);
      }
    },

    /**
     * Creates a new item and updates the state.
     */
    createItem: async (data: TCreate) => {
      set({ isLoading: true, error: null });
      try {
        const newItem = await service.create(data);
        set((state) => ({ items: [...state.items, newItem], isLoading: false }));
        return newItem;
      } catch (e: any) {
        set({ error: e.message, isLoading: false });
        console.error("Failed to create item:", e);
        return undefined;
      }
    },

    /**
     * Updates an existing item and updates the state.
     */
    updateItem: async (id: number | string, data: Partial<TCreate>) => {
      set({ isLoading: true, error: null });
      try {
        const updatedItem = await service.update(id, data);
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? updatedItem : item)),
          currentItem: state.currentItem && state.currentItem.id === id ? updatedItem : state.currentItem,
          isLoading: false,
        }));
        return updatedItem;
      } catch (e: any) {
        set({ error: e.message, isLoading: false });
        console.error(`Failed to update item ${id}:`, e);
        return undefined;
      }
    },

    /**
     * Deletes an item and removes it from the state.
     */
    deleteItem: async (id: number | string) => {
      set({ isLoading: true, error: null });
      try {
        await service.delete(id);
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          isLoading: false,
        }));
      } catch (e: any) {
        set({ error: e.message, isLoading: false });
        console.error(`Failed to delete item ${id}:`, e);
      }
    },
  }));
}
