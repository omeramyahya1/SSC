import { useState, useMemo } from 'react';
import { useTranslation } from "react-i18next";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
} from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useInventoryStore, InventoryItem } from '@/store/useInventoryStore';
import { Search, Package, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InventorySelectorModalProps {
    categoryName?: string; // e.g., "Inverter", "Battery", "Panel"
    onSelect: (item: InventoryItem) => void;
    selectedItemUuid?: string;
}

export function InventorySelectorModal({ categoryName, onSelect, selectedItemUuid }: InventorySelectorModalProps) {
    const { t, i18n } = useTranslation();
    const { items, categories } = useInventoryStore();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredItems = useMemo(() => {
        let result = items;
        
        if (categoryName) {
            const category = categories.find(c => c.name.toLowerCase().includes(categoryName.toLowerCase()));
            if (category) {
                result = result.filter(item => item.category_uuid === category.uuid);
            }
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(item => 
                item.name.toLowerCase().includes(q) || 
                item.brand?.toLowerCase().includes(q) || 
                item.model?.toLowerCase().includes(q) ||
                item.sku?.toLowerCase().includes(q)
            );
        }

        return result;
    }, [items, categories, categoryName, searchQuery]);

    const formatSpecs = (specs: Record<string, any>) => {
        if (!specs) return 'N/A';
        return Object.entries(specs)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
    };

    return (
        <DialogContent className="max-w-[80vw] h-[80vh] flex flex-col p-0 bg-white">
            <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-xl flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {categoryName ? t('inventory.select_category_item', { category: categoryName, defaultValue: `Select ${categoryName}` }) : t('inventory.select_item', 'Select Item')}
                </DialogTitle>
                <div className="relative mt-2">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t('common.search_ph', 'Search by name, brand, model...')}
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </DialogHeader>

            <ScrollArea className="flex-grow">
                <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                            <TableHead className="w-[200px]">{t('inventory.brand_model', 'Brand / Model')}</TableHead>
                            <TableHead>{t('inventory.name', 'Name')}</TableHead>
                            <TableHead className="hidden md:table-cell">{t('inventory.specs', 'Technical Specs')}</TableHead>
                            <TableHead className="text-center">{t('inventory.stock', 'Stock')}</TableHead>
                            <TableHead className="text-right">{t('inventory.price', 'Price')}</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredItems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                    {t('common.no_items_found', 'No items found matching your criteria.')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredItems.map((item) => (
                                <TableRow 
                                    key={item.uuid} 
                                    className={cn("cursor-pointer hover:bg-gray-50", selectedItemUuid === item.uuid && "bg-blue-50")}
                                    onClick={() => onSelect(item)}
                                >
                                    <TableCell>
                                        <div className="font-semibold">{item.brand || 'N/A'}</div>
                                        <div className="text-xs text-muted-foreground">{item.model || 'N/A'}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-gray-400">SKU: {item.sku}</div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        <div className="text-xs max-w-[300px] truncate" title={formatSpecs(item.technical_specs)}>
                                            {formatSpecs(item.technical_specs)}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <span className={cn(
                                            "px-2 py-1 rounded-full text-xs font-bold",
                                            item.quantity_on_hand <= item.low_stock_threshold ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                                        )}>
                                            {item.quantity_on_hand}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right font-bold">
                                        {item.sell_price ? `${item.sell_price.toLocaleString()} ` : 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {selectedItemUuid === item.uuid && <Check className="h-5 w-5 text-blue-600 mx-auto" />}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </ScrollArea>
        </DialogContent>
    );
}
