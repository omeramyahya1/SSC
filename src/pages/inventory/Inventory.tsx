import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useUserStore } from '@/store/useUserStore';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InventoryTable, SortConfig } from './InventoryTable';
import { AddItemModal } from './AddItemModal';
import { Toaster } from "react-hot-toast";

export type SortOption = 'name' | 'sku' | 'quantity_on_hand' | 'buy_price' | 'sell_price';
export type SortDirection = 'asc' | 'desc';

export default function Inventory() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const isExpired = currentUser?.status === 'expired';

    const {
        items,
        categories,
        isLoading,
        error,
        fetchItems,
        fetchCategories
    } = useInventoryStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });

    useEffect(() => {
        fetchItems();
        fetchCategories();
    }, [fetchItems, fetchCategories]);

    const filteredAndSortedItems = useMemo(() => {
        const filtered = items.filter(item => {
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                item.name.toLowerCase().includes(q) ||
                (item.sku ?? '').toLowerCase().includes(q) ||
                (item.brand ?? '').toLowerCase().includes(q);

            if (activeTab === 'all') return matchesSearch;

            const category = categories.find(c => c.uuid === item.category_uuid);
            return matchesSearch && category?.name.toLowerCase() === activeTab.toLowerCase();
        });

        const sorted = [...filtered].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (aValue === undefined || aValue === null) return 1;
            if (bValue === undefined || bValue === null) return -1;

            let comparison = 0;
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                comparison = aValue.localeCompare(bValue);
            } else if (typeof aValue === 'number' && typeof bValue === 'number') {
                comparison = aValue - bValue;
            }

            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [items, categories, searchQuery, activeTab, sortConfig]);

    const handleSortChange = (key: SortOption) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const renderContent = () => {
        if (isLoading && items.length === 0) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Spinner className="w-12 h-12" />
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Alert variant="destructive" className="max-w-md">
                        <AlertTitle>{t('inventory.error_title', 'Failed to Load Inventory')}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                </div>
            );
        }

        return (
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <InventoryTable
                    items={filteredAndSortedItems}
                    sortConfig={sortConfig}
                    onSort={handleSortChange}
                />
            </div>
        );
    };

    return (
        <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
            <Toaster />
            <div className="p-6 space-y-6">
                {/* Header & Toolbar */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold">{t('inventory.title', 'Inventory')}</h1>

                    </div>



                    <div className='flex flex-row justify-between'>
                        <div className="flex flex-wrap items-center gap-3">
                        {/* Search */}
                        <div className="relative flex-grow max-w-md">
                            <img src="/eva-icons (2)/outline/search.png" alt="search" className="w-5 h-5 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-60" />
                            <Input
                                placeholder={t('inventory.search_ph', 'Search by name, SKU, brand...')}
                                className="bg-white ltr:pl-10 rtl:pr-10 border-gray-200"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    onClick={() => setSearchQuery('')}
                                >
                                    <img src="/eva-icons (2)/outline/close.png" alt="clear" className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                         {/* Sort */}
                        <Select
                            value={`${sortConfig.key}-${sortConfig.direction}`}
                            onValueChange={(value) => {
                                const [key, direction] = value.split('-') as [SortOption, SortDirection];
                                setSortConfig({ key, direction });
                            }}
                        >
                            <SelectTrigger className={`w-auto border-gray-200 flex gap-2 ${sortConfig.key !== "name" || sortConfig.direction !== "asc" ? "bg-primary text-white" : "bg-white"}`}>
                                <img src="/eva-icons (2)/outline/swap.png" alt="sort" className={`w-4 h-4 rotate-90 ${sortConfig.key !== "name" || sortConfig.direction !== "asc" ? "invert" : "opacity-60"}`} />
                                <SelectValue placeholder={t('dashboard.sort_by', 'Sort by')} />
                            </SelectTrigger>
                            <SelectContent className='bg-white'>
                                <SelectItem value="name-asc">{t('inventory.sort.name_asc', 'Name A-Z')}</SelectItem>
                                <SelectItem value="name-desc">{t('inventory.sort.name_desc', 'Name Z-A')}</SelectItem>
                                <SelectItem value="quantity_on_hand-asc">{t('inventory.sort.quantity_asc', 'Quantity Low-High')}</SelectItem>
                                <SelectItem value="quantity_on_hand-desc">{t('inventory.sort.quantity_desc', 'Quantity High-Low')}</SelectItem>
                                <SelectItem value="buy_price-asc">{t('inventory.sort.buy_price_asc', 'Buy Price Low-High')}</SelectItem>
                                <SelectItem value="buy_price-desc">{t('inventory.sort.buy_price_desc', 'Buy Price High-Low')}</SelectItem>
                                <SelectItem value="sell_price-asc">{t('inventory.sort.sell_price_asc', 'Sell Price Low-High')}</SelectItem>
                                <SelectItem value="sell_price-desc">{t('inventory.sort.sell_price_desc', 'Sell Price High-Low')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                        {/* Add New Item */}
                        <Button
                            type="button"
                            onClick={() => setIsAddItemModalOpen(true)}
                            disabled={isExpired}
                            className="text-white rounded-lg hover:shadow-lg"
                        >
                            <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert me-2" />
                            <span className='me-2'>{t('inventory.add_item', 'Add New Item')}</span>
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="" dir={i18n.dir()}>
                    <TabsList className="bg-white border p-1 h-auto flex-wrap justify-start">
                        <TabsTrigger value="all" className={`font-bold px-6 ${activeTab == "all"? "text-white bg-primary": ""}`}>{t('inventory.tabs.all', 'All Items')}</TabsTrigger>
                        <TabsTrigger value="solar panels" className={`font-bold px-6 ${activeTab == "solar panels"? "text-white bg-primary": ""}`}>{t('inventory.tabs.panels', 'Panels')}</TabsTrigger>
                        <TabsTrigger value="inverters" className={`font-bold px-6 ${activeTab == "inverters"? "text-white bg-primary": ""}`}>{t('inventory.tabs.inverters', 'Inverters')}</TabsTrigger>
                        <TabsTrigger value="batteries" className={`font-bold px-6 ${activeTab == "batteries"? "text-white bg-primary": ""}`}>{t('inventory.tabs.batteries', 'Batteries')}</TabsTrigger>
                        <TabsTrigger value="accessories" className={`font-bold px-6 ${activeTab == "accessories"? "text-white bg-primary": ""}`}>{t('inventory.tabs.accessories', 'Accessories')}</TabsTrigger>
                    </TabsList>

                    <TabsContent value={activeTab} className="mt-6">
                        {renderContent()}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Modals */}
            <Dialog open={isAddItemModalOpen} onOpenChange={setIsAddItemModalOpen}>
                <AddItemModal onOpenChange={setIsAddItemModalOpen} />
            </Dialog>
        </main>
    );
}
