import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { useInventoryStore, InventoryItem } from '@/store/useInventoryStore';
import { useUserStore } from '@/store/useUserStore';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InventoryTable } from './InventoryTable';
import { AddItemModal } from './AddItemModal';
import { toast } from "sonner";

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

    useEffect(() => {
        fetchItems();
        fetchCategories();
    }, [fetchItems, fetchCategories]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                item.brand?.toLowerCase().includes(searchQuery.toLowerCase());
            
            if (activeTab === 'all') return matchesSearch;
            
            const category = categories.find(c => c.uuid === item.category_uuid);
            return matchesSearch && category?.name.toLowerCase() === activeTab.toLowerCase();
        });
    }, [items, categories, searchQuery, activeTab]);

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
                <InventoryTable items={filteredItems} />
            </div>
        );
    };

    return (
        <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
            <div className="p-6 space-y-6">
                {/* Header & Toolbar */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold">{t('inventory.title', 'Inventory')}</h1>
                        <Button
                            onClick={() => setIsAddItemModalOpen(true)}
                            disabled={isExpired}
                            className="text-white rounded-lg hover:shadow-lg"
                        >
                            <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert me-2" />
                            <span className='me-2'>{t('inventory.add_item', 'Add New Item')}</span>
                        </Button>
                    </div>

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
                                    className="absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    onClick={() => setSearchQuery('')}
                                >
                                    <img src="/eva-icons (2)/outline/close.png" alt="clear" className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="bg-white border p-1 h-auto flex-wrap justify-start">
                        <TabsTrigger value="all" className="font-bold px-6">{t('inventory.tabs.all', 'All Items')}</TabsTrigger>
                        <TabsTrigger value="panels" className="font-bold px-6">{t('inventory.tabs.panels', 'Panels')}</TabsTrigger>
                        <TabsTrigger value="inverters" className="font-bold px-6">{t('inventory.tabs.inverters', 'Inverters')}</TabsTrigger>
                        <TabsTrigger value="batteries" className="font-bold px-6">{t('inventory.tabs.batteries', 'Batteries')}</TabsTrigger>
                        <TabsTrigger value="accessories" className="font-bold px-6">{t('inventory.tabs.accessories', 'Accessories')}</TabsTrigger>
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
