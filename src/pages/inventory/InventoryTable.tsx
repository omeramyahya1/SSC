import { useState, useMemo } from 'react';
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
import { cn, formatCurrency } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdjustStockModal } from './AdjustStockModal';
import { EditItemModal } from './EditItemModal';
import { toast } from "react-hot-toast";
import { SortDirection, SortOption } from './Inventory';

export interface SortConfig {
    key: SortOption;
    direction: SortDirection;
}
interface InventoryTableProps {
    items: InventoryItem[];
    sortConfig: SortConfig;
    onSort: (key: SortOption) => void;
}

const SortableHeader = ({
  sortKey,
  sortConfig,
  onSort,
  children,
  className,
}: {
  sortKey: SortOption;
  sortConfig: SortConfig;
  onSort: (key: SortOption) => void;
  children: React.ReactNode;
  className?: string;
}) => {
  const isActive = sortConfig.key === sortKey;
  const icon = isActive ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '';

  return (
    <TableHead className={cn("cursor-pointer", className)} onClick={() => onSort(sortKey)}>
      <div className="flex items-center gap-2">
        {children}
        <span className="text-xs">{icon}</span>
      </div>
    </TableHead>
  );
};

export function InventoryTable({ items, sortConfig, onSort }: InventoryTableProps) {
    const { t, i18n } = useTranslation();
    const { deleteItem } = useInventoryStore();

    const [showSKU, setShowSKU] = useState(true);
    const [showSpecs, setShowSpecs] = useState(true);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const stats = useMemo(() => {
        const counts = { inStock: 0, lowStock: 0, outOfStock: 0 };
        items.forEach(item => {
            if (item.quantity_on_hand === 0) {
                counts.outOfStock++;
            } else if (item.quantity_on_hand <= item.low_stock_threshold) {
                counts.lowStock++;
            } else {
                counts.inStock++;
            }
        });
        return counts;
    }, [items]);

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            await deleteItem(itemToDelete.uuid);
            toast.success(t('inventory.delete_success', 'Item deleted successfully'));
        } catch (error: any) {
            toast.error(error.message || t('inventory.delete_error', 'Failed to delete item'));
        } finally {
            setItemToDelete(null);
        }
    };

    const getStatusBadge = (item: InventoryItem) => {
        if (item.quantity_on_hand === 0) {
            return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-300">
                    {t('inventory.status.out_of_stock', 'Out of Stock')}
                    </Badge>;
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
        if (!specs) return 'N/A';
        const specEntries = Object.entries(specs);
        if (specEntries.length === 0) return 'N/A';
        return specEntries
            .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
            .join(' | ');
    };

    const columnCount = [showSKU, showSpecs, true, true, true, true, true, true].filter(Boolean).length;


    return (
        <>
            <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-8 bg-green-500 rounded-full" />
                        <span className="text-xl font-black">{stats.inStock}</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t('inventory.status.in_stock', 'In Stock')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-8 bg-yellow-500 rounded-full" />
                        <span className="text-xl font-black">{stats.lowStock}</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t('inventory.status.low_stock', 'Low Stock')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-8 bg-red-500 rounded-full" />
                        <span className="text-xl font-black">{stats.outOfStock}</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t('inventory.status.out_of_stock', 'Out of Stock')}</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSpecs(!showSpecs)}
                        className="text-xs text-muted-foreground font-bold border rounded-lg h-9 px-3"
                    >
                        {showSpecs ? t('inventory.hide_specs', 'Hide Specs') : t('inventory.show_specs', 'Show Specs')}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSKU(!showSKU)}
                        className="text-xs text-muted-foreground font-bold border rounded-lg h-9 px-3"
                    >
                        {showSKU ? t('inventory.hide_sku', 'Hide SKU') : t('inventory.show_sku', 'Show SKU')}
                    </Button>
                </div>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <SortableHeader sortKey="name" sortConfig={sortConfig} onSort={onSort} className="font-bold">
                            {t('inventory.col.name', 'Name')}
                        </SortableHeader>
                        {showSKU && (
                            <TableHead className="font-bold text-start">
                                {t('inventory.col.sku', 'SKU')}
                            </TableHead>
                        )}
                        {showSpecs && <TableHead className="font-bold text-start">{t('inventory.col.specs', 'Specs')}</TableHead>}
                        <TableHead className="font-bold text-center">
                            {t('inventory.col.quantity', 'Quantity')}
                        </TableHead>
                        <TableHead className="font-bold text-center">
                            {t('inventory.col.buy_price', 'Buy Price')}
                        </TableHead>
                        <TableHead className="font-bold text-center">
                            {t('inventory.col.sell_price', 'Sell Price')}
                        </TableHead>
                        <TableHead className="font-bold text-center">{t('inventory.col.status', 'Status')}</TableHead>
                        <TableHead className="w-[100px] text-center font-bold">{t('inventory.col.actions', 'Actions')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={columnCount} className="text-center py-10 text-muted-foreground">
                                {t('inventory.no_items_found', 'No items found in this category.')}
                            </TableCell>
                        </TableRow>
                    ) : (
                        items.map((item) => (
                            <TableRow
                                key={item.uuid}
                                className={cn(
                                    item.quantity_on_hand <= item.low_stock_threshold ? "bg-yellow-50/50" : "",
                                    item.quantity_on_hand === 0 ? "bg-red-50/100" : ""
                                )}
                            >
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{item.name}</span>
                                        <span className="text-xs text-muted-foreground">{item.brand} {item.model}</span>
                                    </div>
                                </TableCell>
                                {showSKU && <TableCell className="text-xs font-mono">{item.sku}</TableCell>}
                                {showSpecs && <TableCell className="text-xs max-w-[200px] truncate">{formatSpecs(item.technical_specs)}</TableCell>}
                                <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-2">
                                                                                <span className={cn(
                                            "font-bold min-w-[30px]",
                                            item.quantity_on_hand <= item.low_stock_threshold ? "text-yellow-700" : "",
                                            item.quantity_on_hand === 0 ? "text-red-600" : ""
                                        )}>
                                            {item.quantity_on_hand}
                                        </span>

                                    </div>
                                </TableCell>
                                <TableCell className="text-center font-semibold">{formatCurrency(item.buy_price)}</TableCell>
                                <TableCell className="text-center font-semibold text-primary">{formatCurrency(item.sell_price)}</TableCell>
                                <TableCell className="text-center">{getStatusBadge(item)}</TableCell>
                                <TableCell className="text-center">
                                    <DropdownMenu dir={i18n.dir()}>
                                        <DropdownMenuTrigger asChild>
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                                                <img src="/eva-icons (2)/outline/more-vertical.png" alt="options" className="w-5 h-5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-white">
                                            <DropdownMenuItem
                                                className="cursor-pointer rounded-lg hover:bg-gray-100"
                                                onClick={() => {
                                                    setSelectedItem(item);
                                                    setIsAdjustModalOpen(true);
                                                }}
                                            >
                                                <img src="/eva-icons (2)/outline/swap.png" alt="adjust" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70" />
                                                {t('inventory.adjust_stock', 'Adjust Stock')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="cursor-pointer rounded-lg hover:bg-gray-100"
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
                                                className="cursor-pointer group rounded-lg text-red-600 hover:bg-red-50 focus:bg-red-500 hover:text-white"
                                                onClick={() => setItemToDelete(item)}
                                            >
                                                <img src="/eva-icons (2)/outline/trash-2.png" alt="delete" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70 group-hover:invert" />
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
                        key={selectedItem.uuid}
                        item={selectedItem}
                        onOpenChange={setIsEditModalOpen}
                    />
                )}
            </Dialog>

            <AlertDialog open={!!itemToDelete} onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}>
                <AlertDialogContent className='bg-white border-2 border-gray'>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('inventory.confirm_delete.title', 'Are you sure you want to delete this item?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('inventory.confirm_delete.description', 'This action cannot be undone. This will permanently delete the inventory item.')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setItemToDelete(null)}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-50 text-red-700 border-red-200 hover:text-white  hover:bg-red-500"
                            onClick={handleConfirmDelete}
                        >
                            {t('common.delete', 'Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
