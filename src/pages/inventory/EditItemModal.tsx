import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore, InventoryItem } from '@/store/useInventoryStore';
import { toast } from "react-hot-toast";

interface EditItemModalProps {
    item: InventoryItem;
    onOpenChange: (isOpen: boolean) => void;
}

export function EditItemModal({ item, onOpenChange }: EditItemModalProps) {
    const { t, i18n } = useTranslation();
    const { categories, updateItem } = useInventoryStore();

    const buildFormData = (source: InventoryItem) => ({
        name: source.name,
        brand: source.brand || '',
        model: source.model || '',
        sku: source.sku,
        category_uuid: source.category_uuid || source.category?.uuid || '',
        low_stock_threshold: source.low_stock_threshold,
        buy_price: source.buy_price,
        sell_price: source.sell_price,
        technical_specs: { ...(source.technical_specs || {}) }
    });

    const [formData, setFormData] = useState(buildFormData(item));

    useEffect(() => {
        setFormData(buildFormData(item));
    }, [item]);

    const selectedCategory = useMemo(() => {
        const normalizedUuid = String(formData.category_uuid || '');
        const fromStore = categories.find(c => String(c.uuid) === normalizedUuid);
        return fromStore ?? item.category ?? null;
    }, [categories, formData.category_uuid, item.category]);

    const handleSpecChange = (key: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            technical_specs: { ...prev.technical_specs, [key]: value }
        }));
    };

    const formatSpecLabel = (key: string) =>
        key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());

    const handleSubmit = async () => {
        try {
            await updateItem(item.uuid, formData);
            toast.success(t('inventory.update_success', 'Item updated successfully'));
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error.message || t('inventory.update_error', 'Failed to update item'));
        }
    };

    const isFormValid = formData.name && formData.sku && formData.buy_price > 0 && formData.sell_price > 0;
    // console.log(selectedCategory?.name);

    return (
        <DialogContent className="sm:max-w-[600px] bg-white max-h-[90vh] overflow-y-auto" dir={i18n.dir()}>
            <DialogHeader>
                <DialogTitle className="text-2xl font-bold">{t('inventory.edit_item_title', 'Edit Inventory Item')}</DialogTitle>
                <DialogDescription></DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2 opacity-70">
                        <Label className="font-semibold">{t('inventory.col.category', 'Category')}</Label>
                        <Input value={selectedCategory?.name || ''} disabled className="bg-gray-100" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-sku" className="font-semibold">{t('inventory.col.sku', 'SKU')}</Label>
                        <Input
                            id="edit-sku"
                            disabled
                            className="bg-gray-100"
                            value={formData.sku}
                            onChange={e => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                        />
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="edit-name" className="font-semibold">{t('inventory.col.name', 'Item Name')} *</Label>
                    <Input
                        id="edit-name"
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-brand" className="font-semibold">{t('inventory.col.brand', 'Brand')}</Label>
                        <Input id="edit-brand" value={formData.brand} onChange={e => setFormData(prev => ({ ...prev, brand: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-model" className="font-semibold">{t('inventory.col.model', 'Model')}</Label>
                        <Input id="edit-model" value={formData.model} onChange={e => setFormData(prev => ({ ...prev, model: e.target.value }))} />
                    </div>
                </div>


                    {
                        selectedCategory && (
                            <div className="p-4 bg-gray-50 rounded-lg border space-y-4">
                        <h4 className="text-sm font-bold text-gray-700">{t('inventory.technical_specs', 'Technical Specifications')}</h4>
                        <div className="grid grid-cols-2 gap-4">
                            {Object.entries(selectedCategory.spec_schema || {}).map(([key, unit]) => (
                                <div key={key} className="grid gap-1.5">
                                    <Label htmlFor={`edit-spec-${key}`} className="text-xs">
                                        {unit ? `${formatSpecLabel(key)} (${unit})` : formatSpecLabel(key)}
                                    </Label>
                                    {key === 'battery_type' ? (
                                        <Select
                                            onValueChange={(value) => handleSpecChange(key, value)}
                                            value={formData.technical_specs[key] || ''}
                                            dir={i18n.dir()}
                                        >
                                            <SelectTrigger id={`edit-spec-${key}`} className="h-8 text-sm bg-white">
                                                <SelectValue placeholder={t('inventory.select_battery_type', 'Select type')} />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white">
                                                <SelectItem value="lithium">{t('project_modal.battery_type.lithium', 'Lithium-ion')}</SelectItem>
                                                <SelectItem value="liquid">{t('project_modal.battery_type.liquid', 'Lead-Acid (Liquid)')}</SelectItem>
                                                <SelectItem value="dry">{t('project_modal.battery_type.dry', 'Lead-Acid (AGM/Gel)')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input
                                            id={`edit-spec-${key}`}
                                            type="number"
                                            className="h-8 text-sm"
                                            value={formData.technical_specs[key] ?? ''}
                                            onChange={e => handleSpecChange(key, e.target.value)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                        )
                    }

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-threshold" className="font-semibold">{t('inventory.col.low_stock_threshold', 'Low Stock Alert At')}</Label>
                        <Input
                            id="edit-threshold"
                            type="number"
                            min="0"
                            value={formData.low_stock_threshold}
                            onChange={e => setFormData(prev => ({ ...prev, low_stock_threshold: Math.max(0, parseInt(e.target.value, 10)) || 0 }))}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-buy_price" className="font-semibold">{t('inventory.col.buy_price', 'Buy Price')} *</Label>
                        <Input
                            id="edit-buy_price"
                            type="number"
                            min="0"
                            value={formData.buy_price}
                            onChange={e => setFormData(prev => ({ ...prev, buy_price: Math.max(0, parseFloat(e.target.value)) || 0 }))}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-sell_price" className="font-semibold">{t('inventory.col.sell_price', 'Sell Price')} *</Label>
                        <Input
                            id="edit-sell_price"
                            type="number"
                            min="0"
                            value={formData.sell_price}
                            onChange={e => setFormData(prev => ({ ...prev, sell_price: Math.max(0, parseFloat(e.target.value)) || 0 }))}
                        />
                    </div>
                </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
                <Button type="button" onClick={handleSubmit} disabled={!isFormValid} className="text-white">
                    {t('common.save_changes', 'Save Changes')}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
