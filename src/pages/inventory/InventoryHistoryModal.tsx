import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Spinner } from '@/components/ui/spinner';
import api from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface StockAdjustment {
    uuid: string;
    item_uuid: string;
    item_name?: string;
    item_sku?: string;
    adjustment: number;
    reason: string;
    created_at: string;
}

export function InventoryHistoryModal() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const [history, setHistory] = useState<StockAdjustment[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setIsLoading(true);
            try {
                const params = {
                    org_uuid: currentUser?.organization_uuid,
                    user_uuid: !currentUser?.organization_uuid ? currentUser?.uuid : undefined,
                };
                const { data } = await api.get('/inventory/adjustments/history', { params });
                setHistory(data);
            } catch (error) {
                console.error("Failed to fetch inventory history", error);
            } finally {
                setIsLoading(false);
            }
        };
        if (currentUser) {
            fetchHistory();
        }
    }, [currentUser]);

    return (
        <DialogContent className="sm:max-w-[800px] bg-white max-h-[80vh] overflow-hidden flex flex-col" dir={i18n.dir()}>
            <DialogHeader className="px-1">
                <DialogTitle className="text-2xl font-bold">{t('inventory.history_title', 'Inventory Movement History')}</DialogTitle>
                <DialogDescription>
                    {t('inventory.history_desc', 'Track all stock ins and outs across your inventory.')}
                </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto mt-4 border rounded-lg">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <Spinner className="w-12 h-12" />
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex justify-center items-center h-64 text-muted-foreground">
                        {t('inventory.no_history', 'No movements recorded yet.')}
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-gray-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="font-bold">{t('inventory.col.date', 'Date')}</TableHead>
                                <TableHead className="font-bold">{t('inventory.col.item', 'Item')}</TableHead>
                                <TableHead className="font-bold text-center">{t('inventory.col.adjustment', 'Adjustment')}</TableHead>
                                <TableHead className="font-bold">{t('inventory.col.reason', 'Reason')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map((adj) => (
                                <TableRow key={adj.uuid}>
                                    <TableCell className="text-xs whitespace-nowrap">
                                        {format(parseISO(adj.created_at), 'dd/MM/yyyy HH:mm')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm">{adj.item_name}</span>
                                            <span className="text-[10px] font-mono text-muted-foreground">{adj.item_sku}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge
                                            className={cn(
                                                "font-bold",
                                                adj.adjustment > 0
                                                    ? "bg-green-100 text-green-700 border-green-200"
                                                    : "bg-red-100 text-red-700 border-red-200"
                                            )}
                                        >
                                            {adj.adjustment > 0 ? `+${adj.adjustment}` : adj.adjustment}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {adj.reason || t('common.none', 'None')}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </DialogContent>
    );
}
