import { create } from 'zustand';
import api from '@/api/client';
import { registerStore, StoreKeys } from '@/api/storeRegistry';

export interface InventoryCategory {
    uuid: string;
    organization_uuid: string;
    name: string;
    spec_schema: Record<string, string>; // e.g., {"wattage": "W", "voltage": "V"}
}

export interface InventoryItem {
    uuid: string;
    organization_uuid: string;
    branch_uuid?: string;
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
    organization_uuid: string;
    branch_uuid?: string;
    item_uuid: string;
    adjustment: number;
    reason: string;
    user_uuid: string;
}

interface InventoryState {
    items: InventoryItem[];
    categories: InventoryCategory[];
    isLoading: boolean;
    error: string | null;

    refreshInventory: () => Promise<void>;
    fetchCategories: () => Promise<void>;
    fetchItems: () => Promise<void>;
    addItem: (item: Partial<InventoryItem>) => Promise<InventoryItem | undefined>;
    updateItem: (uuid: string, updates: Partial<InventoryItem>) => Promise<InventoryItem | undefined>;
    deleteItem: (uuid: string) => Promise<void>;
    adjustStock: (itemUuid: string, adjustment: number, reason: string, organization_uuid: string, branch_uuid: string | undefined, user_uuid: string) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
    items: [],
    categories: [],
    isLoading: false,
    error: null,

    refreshInventory: async () => {
        set({ isLoading: true, error: null });
        try {
            const [categoriesRes, itemsRes] = await Promise.all([
                api.get<InventoryCategory[]>('/inventory/categories'),
                api.get<InventoryItem[]>('/inventory/items'),
            ]);
            set({
                categories: categoriesRes.data,
                items: itemsRes.data,
                isLoading: false,
            });
        } catch (e: any) {
            set({ error: e.message || "Failed to refresh inventory", isLoading: false });
        }
    },

    fetchCategories: async () => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.get<InventoryCategory[]>('/inventory/categories');
            set({ categories: data, isLoading: false });
        } catch (e: any) {
            set({ error: e.message || "Failed to fetch categories", isLoading: false });
        }
    },

    fetchItems: async () => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.get<InventoryItem[]>('/inventory/items');
            set({ items: data, isLoading: false });
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

    adjustStock: async (itemUuid, adjustment, reason, organization_uuid, branch_uuid, user_uuid) => {
        try {
            await api.post('/inventory/adjustments', {
                item_uuid: itemUuid,
                adjustment,
                reason,
                organization_uuid,
                ...(branch_uuid !== undefined ? { branch_uuid } : {}),
                user_uuid,
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
  refreshInventory();
});
