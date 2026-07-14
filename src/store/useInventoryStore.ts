import { create } from 'zustand';
import api from '@/api/client';
import { registerStore, StoreKeys } from '@/api/storeRegistry';
import isEqual from 'lodash/isEqual';

export interface InventoryCategory {
    uuid: string;
    organization_uuid: string | null;
    user_uuid?: string;
    name: string;
    spec_schema: Record<string, string>; // e.g., {"wattage": "W", "voltage": "V"}
}

export interface InventoryItem {
    uuid: string;
    organization_uuid: string | null;
    branch_uuid?: string;
    user_uuid?: string;
    name: string;
    sku: string;
    brand?: string;
    model?: string;
    category_uuid: string;
    technical_specs: Record<string, any>; // e.g., {"wattage": 550, "voltage": 49.8}
    quantity_on_hand: number;
    low_stock_threshold: number;
    buy_price: number;
    sell_price: number;
    category?: InventoryCategory;
}

export interface StockAdjustment {
    uuid: string;
    organization_uuid: string | null;
    branch_uuid?: string;
    item_uuid: string;
    adjustment: number;
    reason: string;
    user_uuid?: string;
}

interface InventoryState {
    items: InventoryItem[];
    categories: InventoryCategory[];
    isLoading: boolean;
    error: string | null;

    refreshInventory: (options?: { silent?: boolean }) => Promise<void>;
    fetchCategories: (options?: { silent?: boolean }) => Promise<void>;
    fetchItems: (options?: { silent?: boolean }) => Promise<void>;
    addItem: (item: Partial<InventoryItem>) => Promise<InventoryItem | undefined>;
    updateItem: (uuid: string, updates: Partial<InventoryItem>) => Promise<InventoryItem | undefined>;
    deleteItem: (uuid: string) => Promise<void>;
    adjustStock: (itemUuid: string, adjustment: number, reason: string) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set) => ({
    items: [],
    categories: [],
    isLoading: false,
    error: null,

    refreshInventory: async (options) => {
        if (!options?.silent) set({ isLoading: true, error: null });
        try {
            const [categoriesRes, itemsRes] = await Promise.all([
                api.get<InventoryCategory[]>('/inventory/categories'),
                api.get<InventoryItem[]>('/inventory/items'),
            ]);

            set((state) => {
                const nextCategories = isEqual(state.categories, categoriesRes.data)
                    ? state.categories
                    : categoriesRes.data;

                const itemsChanged = !isEqual(state.items, itemsRes.data);
                let nextItems = state.items;

                if (itemsChanged) {
                    // Reconcile: Preserve references for identical items to block unnecessary rerenders
                    nextItems = itemsRes.data.map((newItem) => {
                        const existingItem = state.items.find((i) => i.uuid === newItem.uuid);
                        return existingItem && isEqual(existingItem, newItem) ? existingItem : newItem;
                    });

                    // If the final reconciled array is structurally identical to the previous one, keep the previous reference
                    if (isEqual(state.items, nextItems)) {
                        nextItems = state.items;
                    }
                }

                return {
                    categories: nextCategories,
                    items: nextItems,
                    error: null,
                    isLoading: false,
                };
            });
        } catch (e: any) {
            set({ error: e.message || "Failed to refresh inventory", isLoading: false });
        }
    },

    fetchCategories: async (options) => {
        if (!options?.silent) set({ isLoading: true, error: null });
        try {
            const { data } = await api.get<InventoryCategory[]>('/inventory/categories');
            set((state) => ({
                categories: isEqual(state.categories, data) ? state.categories : data,
                error: null,
                isLoading: false,
            }));
        } catch (e: any) {
            set({ error: e.message || "Failed to fetch categories", isLoading: false });
        }
    },

    fetchItems: async (options) => {
        if (!options?.silent) set({ isLoading: true, error: null });
        try {
            const { data } = await api.get<InventoryItem[]>('/inventory/items');
            set((state) => {
                const itemsChanged = !isEqual(state.items, data);
                if (!itemsChanged) return { isLoading: false };

                const nextItems = data.map((newItem) => {
                    const existingItem = state.items.find((i) => i.uuid === newItem.uuid);
                    return existingItem && isEqual(existingItem, newItem) ? existingItem : newItem;
                });

                return {
                    items: isEqual(state.items, nextItems) ? state.items : nextItems,
                    error: null,
                    isLoading: false,
                };
            });
        } catch (e: any) {
            set({ error: e.message || "Failed to fetch items", isLoading: false });
        }
    },

    addItem: async (item) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post<InventoryItem>('/inventory/items', item);
            set((state) => ({ items: [data, ...state.items], isLoading: false }));
            return data;
        } catch (e: any) {
            const msg = e.response?.data?.error || e.message || "Failed to add item";
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    updateItem: async (uuid, updates) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.put<InventoryItem>(`/inventory/items/${uuid}`, updates);
            set((state) => ({
                items: state.items.map((i) => (i.uuid === uuid ? data : i)),
                isLoading: false,
            }));
            return data;
        } catch (e: any) {
            const msg = e.response?.data?.error || e.message || "Failed to update item";
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    deleteItem: async (uuid) => {
        set({ isLoading: true, error: null });
        try {
            await api.delete(`/inventory/items/${uuid}`);
            set((state) => ({
                items: state.items.filter((i) => i.uuid !== uuid),
                isLoading: false,
            }));
        } catch (e: any) {
            const msg = e.response?.data?.error || e.message || "Failed to delete item";
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    adjustStock: async (itemUuid, adjustment, reason) => {
        try {
            await api.post('/inventory/adjustments', {
                item_uuid: itemUuid,
                adjustment,
                reason,
            });
            // Update local quantity
            set((state) => ({
                items: state.items.map((i) =>
                    i.uuid === itemUuid ? { ...i, quantity_on_hand: i.quantity_on_hand + adjustment } : i
                ),
            }));
        } catch (e: any) {
            set({ error: e.message || "Failed to adjust stock" });
            throw e;
        }
    },
}));

registerStore(StoreKeys.Inventory, () => {
  const { refreshInventory } = useInventoryStore.getState();
  refreshInventory({ silent: true });
}, useInventoryStore);
