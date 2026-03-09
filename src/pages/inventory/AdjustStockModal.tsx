import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InventoryItem, useInventoryStore } from '@/store/useInventoryStore';
import { toast } from "sonner";

interface AdjustStockModalProps {
    item: InventoryItem;
    onOpenChange: (isOpen: boolean) => void;
}

export function AdjustStockModal({ item, onOpenChange }: AdjustStockModalProps) {
    const { t, i18n } = useTranslation();
    const { adjustStock } = useInventoryStore();

    const [adjustment, setAdjustment] = useState<number>(0);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (adjustment === 0) {
            toast.error(t('inventory.adjustment_zero_error', 'Adjustment cannot be zero'));
            return;
        }
        if (!reason.trim()) {
            toast.error(t('inventory.reason_required_error', 'Reason is required for manual adjustments'));
            return;
        }

        setIsSubmitting(true);
        try {
            await adjustStock(item.uuid, adjustment, reason);
            toast.success(t('inventory.adjust_success', 'Stock adjusted successfully'));
            onOpenChange(false);
        } catch (error: any) {
            console.error("Adjust Stock Failed:", error);
            toast.error(t('inventory.adjust_error', 'Failed to adjust stock'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <DialogHeader>
                <DialogTitle>{t('inventory.adjust_stock_title', 'Adjust Stock')}</DialogTitle>
                <DialogDescription>
                    {item.name} ({item.sku})
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{t('inventory.current_stock', 'Current Stock')}</span>
                        <span className="text-xl font-bold">{item.quantity_on_hand}</span>
                    </div>
                    <div className="flex flex-col text-right">
                        <span className="text-xs text-muted-foreground">{t('inventory.new_stock', 'New Stock')}</span>
                        <span className="text-xl font-bold text-primary">{item.quantity_on_hand + adjustment}</span>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="adjustment" className="font-semibold">
                        {t('inventory.adjustment_amount', 'Adjustment Amount')}
                    </Label>
                    <div className="flex items-center gap-3">
                        <Button 
                            type="button"
                            variant="outline" 
                            size="icon" 
                            className="h-10 w-10 flex-shrink-0"
                            onClick={() => setAdjustment(prev => prev - 1)}
                        >
                            <img src="/eva-icons (2)/outline/minus.png" alt="minus" className="w-5 h-5 opacity-60" />
                        </Button>
                        <Input 
                            id="adjustment" 
                            type="number" 
                            value={adjustment} 
                            onChange={e => setAdjustment(parseInt(e.target.value) || 0)}
                            className="text-center font-bold text-lg"
                        />
                        <Button 
                            type="button"
                            variant="outline" 
                            size="icon" 
                            className="h-10 w-10 flex-shrink-0"
                            onClick={() => setAdjustment(prev => prev + 1)}
                        >
                            <img src="/eva-icons (2)/outline/plus.png" alt="plus" className="w-5 h-5 opacity-60" />
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                        {t('inventory.adjustment_hint', 'Use positive numbers to add, negative to remove stock.')}
                    </p>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="reason" className="font-semibold">
                        {t('inventory.adjustment_reason', 'Reason for Adjustment')} *
                    </Label>
                    <Input 
                        id="reason" 
                        value={reason} 
                        onChange={e => setReason(e.target.value)}
                        placeholder={t('inventory.reason_ph', 'e.g., Damaged item, Restock, Sale error')}
                    />
                </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                    {t('common.cancel', 'Cancel')}
                </Button>
                <Button 
                    type="button"
                    onClick={handleSubmit} 
                    disabled={adjustment === 0 || !reason.trim() || isSubmitting}
                    className="text-white"
                >
                    {isSubmitting ? t('common.saving', 'Saving...') : t('inventory.confirm_adjustment', 'Confirm Adjustment')}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
