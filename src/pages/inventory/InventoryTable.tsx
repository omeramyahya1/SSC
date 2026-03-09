import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { InventoryItem, useInventoryStore } from '@/store/useInventoryStore';
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { AdjustStockModal } from './AdjustStockModal';
import { EditItemModal } from './EditItemModal';
import { toast } from "sonner";

interface InventoryTableProps {
    items: InventoryItem[];
}

export function InventoryTable({ items }: InventoryTableProps) {
    const { t, i18n } = useTranslation();
    const { adjustStock, deleteItem } = useInventoryStore();

    const [showSKU, setShowSKU] = useState(true);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const handleQuickAdjust = async (item: InventoryItem, amount: number) => {
        try {
            await adjustStock(item.uuid, amount, "Quick adjustment from table");
            toast.success(t('inventory.quick_adjust_success', 'Stock updated successfully'));
        } catch (error: any) {
            console.error("Quick Adjust Failed:", error);
            toast.error(t('inventory.quick_adjust_error', 'Failed to update stock'));
        }
    };

    const getStatusBadge = (item: InventoryItem) => {
        if (item.quantity_on_hand === 0) {
            return <Badge variant="destructive">{t('inventory.status.out_of_stock', 'Out of Stock')}</Badge>;
        }
        if (item.quantity_on_hand <= item.low_stock_threshold) {
            return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300">
                {t('inventory.status.low_stock', 'Low Stock')}
            </Badge>;
        }
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-300">
            {t('inventory.status.in_stock', 'In Stock')}
        </Badge>;
    };

    const formatSpecs = (specs: Record<string, any>) => {
        return Object.entries(specs)
            .map(([key, value]) => `${key}: ${value}`)
            .join(' | ');
    };

    return (
        <>
            <div className="p-4 border-b flex justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSKU(!showSKU)}
                    className="text-xs text-muted-foreground"
                >
                    {showSKU ? t('inventory.hide_sku', 'Hide SKU') : t('inventory.show_sku', 'Show SKU')}
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-bold">{t('inventory.col.name', 'Name')}</TableHead>
                        {showSKU && <TableHead className="font-bold">{t('inventory.col.sku', 'SKU')}</TableHead>}
                        <TableHead className="font-bold">{t('inventory.col.specs', 'Specs')}</TableHead>
                        <TableHead className="font-bold text-center">{t('inventory.col.quantity', 'Quantity')}</TableHead>
                        <TableHead className="font-bold text-center">{t('inventory.col.buy_price', 'Buy Price')}</TableHead>
                        <TableHead className="font-bold text-center">{t('inventory.col.sell_price', 'Sell Price')}</TableHead>
                        <TableHead className="font-bold text-center">{t('inventory.col.status', 'Status')}</TableHead>
                        <TableHead className="w-[100px] text-center font-bold">{t('inventory.col.actions', 'Actions')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={showSKU ? 8 : 7} className="text-center py-10 text-muted-foreground">
                                {t('inventory.no_items_found', 'No items found in this category.')}
                            </TableCell>
                        </TableRow>
                    ) : (
                        items.map((item) => (
                            <TableRow
                                key={item.uuid}
                                className={cn(
                                    item.quantity_on_hand <= item.low_stock_threshold ? "bg-yellow-50/50" : "",
                                    item.quantity_on_hand === 0 ? "bg-red-50/50" : ""
                                )}
                            >
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{item.name}</span>
                                        <span className="text-xs text-muted-foreground">{item.brand} {item.model}</span>
                                    </div>
                                </TableCell>
                                {showSKU && <TableCell className="text-xs font-mono">{item.sku}</TableCell>}
                                <TableCell className="text-xs">{formatSpecs(item.technical_specs)}</TableCell>
                                <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-6 w-6 rounded-full"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuickAdjust(item, -1);
                                            }}
                                            disabled={item.quantity_on_hand <= 0}
                                        >
                                            <img src="/eva-icons (2)/outline/minus.png" alt="minus" className="w-3 h-3 opacity-60" />
                                        </Button>
                                        <span className={cn(
                                            "font-bold min-w-[30px]",
                                            item.quantity_on_hand <= item.low_stock_threshold ? "text-yellow-700" : "",
                                            item.quantity_on_hand === 0 ? "text-red-600" : ""
                                        )}>
                                            {item.quantity_on_hand}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-6 w-6 rounded-full"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuickAdjust(item, 1);
                                            }}
                                        >
                                            <img src="/eva-icons (2)/outline/plus.png" alt="plus" className="w-3 h-3 opacity-60" />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell className="text-center font-semibold">{item.buy_price.toLocaleString()} </TableCell>
                                <TableCell className="text-center font-semibold text-primary">{item.sell_price.toLocaleString()} </TableCell>
                                <TableCell className="text-center">{getStatusBadge(item)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                                                <img src="/eva-icons (2)/outline/more-vertical.png" alt="options" className="w-5 h-5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-white">
                                            <DropdownMenuItem
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    setSelectedItem(item);
                                                    setIsAdjustModalOpen(true);
                                                }}
                                            >
                                                <img src="/eva-icons (2)/outline/swap.png" alt="adjust" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70" />
                                                {t('inventory.adjust_stock', 'Adjust Stock')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    setSelectedItem(item);
                                                    setIsEditModalOpen(true);
                                                }}
                                            >
                                                <img src="/eva-icons (2)/outline/edit.png" alt="edit" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70" />
                                                {t('common.edit', 'Edit Details')}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50"
                                                onClick={async () => {
                                                    if(confirm(t('common.confirm_delete', 'Are you sure you want to delete this item?'))) {
                                                        try {
                                                            await deleteItem(item.uuid);
                                                            toast.success(t('inventory.delete_success', 'Item deleted successfully'));
                                                        } catch (error: any) {
                                                            toast.error(error.message || t('inventory.delete_error', 'Failed to delete item'));
                                                        }
                                                    }
                                                }}
                                            >
                                                <img src="/eva-icons (2)/outline/trash-2.png" alt="delete" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70" />
                                                {t('common.delete', 'Delete')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <Dialog open={isAdjustModalOpen} onOpenChange={setIsAdjustModalOpen}>
                {selectedItem && (
                    <AdjustStockModal
                        item={selectedItem}
                        onOpenChange={setIsAdjustModalOpen}
                    />
                )}
            </Dialog>

            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                {selectedItem && (
                    <EditItemModal
                        item={selectedItem}
                        onOpenChange={setIsEditModalOpen}
                    />
                )}
            </Dialog>
        </>
    );
}
