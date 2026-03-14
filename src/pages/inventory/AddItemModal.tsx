import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from '@/store/useInventoryStore';
import { toast } from "react-hot-toast";

interface AddItemModalProps {
    onOpenChange: (isOpen: boolean) => void;
}

export function AddItemModal({ onOpenChange }: AddItemModalProps) {
    const { t, i18n } = useTranslation();
    const { categories, addItem } = useInventoryStore();

    const [formData, setFormData] = useState({
        name: '',
        brand: '',
        model: '',
        sku: '',
        category_uuid: '',
        quantity_on_hand: 0,
        low_stock_threshold: 10,
        buy_price: 0,
        sell_price: 0,
        technical_specs: {} as Record<string, any>
    });
    const [accessorySpecs, setAccessorySpecs] = useState<Array<{ name: string; value: string }>>([
        { name: '', value: '' }
    ]);

    const selectedCategory = useMemo(() =>
        categories.find(c => c.uuid === formData.category_uuid),
    [categories, formData.category_uuid]);
    const isAccessoryCategory = selectedCategory?.name?.toLowerCase() === 'accessories';

    const buildAccessorySpecMap = (rows: Array<{ name: string; value: string }>) => {
        const map: Record<string, any> = {};
        rows.forEach(row => {
            const key = row.name.trim();
            if (key) {
                map[key] = row.value;
            }
        });
        return map;
    };

    const handleCategoryChange = (uuid: string) => {
        const category = categories.find(c => c.uuid === uuid);
        const initialSpecs = {} as Record<string, any>;
        if (category?.name?.toLowerCase() === 'accessories') {
            const rows = [{ name: '', value: '' }];
            setAccessorySpecs(rows);
            setFormData(prev => ({
                ...prev,
                category_uuid: uuid,
                technical_specs: buildAccessorySpecMap(rows)
            }));
            return;
        }
        if (category?.spec_schema) {
            Object.keys(category.spec_schema).forEach(key => {
                initialSpecs[key] = '';
            });
        }
        setFormData(prev => ({
            ...prev,
            category_uuid: uuid,
            technical_specs: initialSpecs
        }));
    };

    const handleSpecChange = (key: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            technical_specs: { ...prev.technical_specs, [key]: value }
        }));
    };

    const updateAccessorySpecs = (rows: Array<{ name: string; value: string }>) => {
        setAccessorySpecs(rows);
        setFormData(prev => ({
            ...prev,
            technical_specs: buildAccessorySpecMap(rows)
        }));
    };

    const handleAccessorySpecChange = (index: number, field: 'name' | 'value', value: string) => {
        const next = accessorySpecs.map((row, i) =>
            i === index ? { ...row, [field]: value } : row
        );
        updateAccessorySpecs(next);
    };

    const addAccessorySpecRow = () => {
        updateAccessorySpecs([...accessorySpecs, { name: '', value: '' }]);
    };

    const removeAccessorySpecRow = (index: number) => {
        const next = accessorySpecs.filter((_, i) => i !== index);
        updateAccessorySpecs(next.length ? next : [{ name: '', value: '' }]);
    };

    const generateSKU = () => {
        if (!formData.category_uuid || !formData.brand) {
            toast.error(t('inventory.sku_gen_error', 'Please select a category and enter a brand first'));
            return;
        }
        const categoryPrefix = selectedCategory?.name.substring(0, 3).toUpperCase() || 'ITM';
        const brandPrefix = formData.brand.substring(0, 3).toUpperCase();
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const sku = `${categoryPrefix}-${brandPrefix}-${randomSuffix}`;
        setFormData(prev => ({ ...prev, sku }));
    };

    const handleSubmit = async () => {
        try {
            await addItem(formData);
            toast.success(t('inventory.add_success', 'Item added to inventory'));
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error.message || t('inventory.add_error', 'Failed to add item'));
        }
    };

    const isFormValid = formData.name && formData.sku && formData.category_uuid && formData.buy_price > 0 && formData.sell_price > 0;

    return (
        <DialogContent className="sm:max-w-[600px] bg-white max-h-[90vh] overflow-y-auto" dir={i18n.dir()}>
            <DialogHeader>
                <DialogTitle className="text-2xl font-bold">{t('inventory.add_item_title', 'Add New Inventory Item')}</DialogTitle>
                <DialogDescription>
                    {t('inventory.add_item_desc', 'Fill in the details to add a new component to your stock.')}
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="category" className="font-semibold">{t('inventory.col.category', 'Category')} *</Label>
                        <Select onValueChange={handleCategoryChange} value={formData.category_uuid}>
                            <SelectTrigger id="category">
                                <SelectValue placeholder={t('inventory.select_category_ph', 'Select category')} />
                            </SelectTrigger>
                            <SelectContent className='bg-white'>
                                {categories.map(cat => (
                                    <SelectItem key={cat.uuid} value={cat.uuid}>{cat.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="sku" className="font-semibold">{t('inventory.col.sku', 'SKU')} *</Label>
                        <div className="flex gap-2">
                            <Input
                                id="sku"
                                value={formData.sku}
                                onChange={e => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                                placeholder="e.g. PAN-JIN-001"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                className="group hover:bg-primary"
                                size="icon"
                                onClick={generateSKU}
                                title={t('inventory.generate_sku', 'Generate SKU')}>
                                <img src="/eva-icons (2)/outline/flash.png" alt="gen" className="w-4 h-4 group-hover:invert" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="name" className="font-semibold">{t('inventory.col.name', 'Item Name')} *</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Jinko Solar 550W Panel"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="brand" className="font-semibold">{t('inventory.col.brand', 'Brand')}</Label>
                        <Input id="brand" value={formData.brand} onChange={e => setFormData(prev => ({ ...prev, brand: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="model" className="font-semibold">{t('inventory.col.model', 'Model')}</Label>
                        <Input id="model" value={formData.model} onChange={e => setFormData(prev => ({ ...prev, model: e.target.value }))} />
                    </div>
                </div>

                {/* Dynamic Specs Section */}
                {selectedCategory && (
                    <div className="p-4 bg-gray-50 rounded-lg border space-y-4">
                        <h4 className="text-sm font-bold text-gray-700">{t('inventory.technical_specs', 'Technical Specifications')}</h4>
                        {isAccessoryCategory ? (
                            <div className="space-y-3">
                                {accessorySpecs.map((row, index) => (
                                    <div key={`acc-spec-${index}`} className="grid grid-cols-5 gap-2 items-end">
                                        <div className="col-span-2 grid gap-1.5">
                                            <Label htmlFor={`acc-spec-name-${index}`} className="text-xs">{t('inventory.spec_name', 'Spec Name')}</Label>
                                            <Input
                                                id={`acc-spec-name-${index}`}
                                                className="h-8 text-sm bg-white"
                                                value={row.name}
                                                onChange={e => handleAccessorySpecChange(index, 'name', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-2 grid gap-1.5">
                                            <Label htmlFor={`acc-spec-value-${index}`} className="text-xs">{t('inventory.spec_value', 'Spec Value')}</Label>
                                            <Input
                                                id={`acc-spec-value-${index}`}
                                                className="h-8 text-sm bg-white"
                                                value={row.value}
                                                onChange={e => handleAccessorySpecChange(index, 'value', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-1 flex justify-end">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className='hover:border-red-400 hover:bg-red-200 hover:text-red-800'
                                                size="sm"
                                                onClick={() => removeAccessorySpecRow(index)}
                                            >
                                                {t('common.remove', 'Remove')}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                <div>
                                    <Button type="button" className='hover:border-primary' variant="outline" size="sm" onClick={addAccessorySpecRow}>
                                        {t('inventory.add', 'Add')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(selectedCategory.spec_schema || {}).map(([key, unit]) => (
                                    <div key={key} className="grid gap-1.5">
                                        <Label htmlFor={`spec-${key}`} className="text-xs">{key
                                                                                            .replace(/_/g, ' ')
                                                                                            .split(' ')
                                                                                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                                                                            .join(' ') + " "}

                                                                                            ({unit})
                                        </Label>
                                        <Input
                                            id={`spec-${key}`}
                                            type="number"
                                            className="h-8 text-sm bg-white"
                                            value={formData.technical_specs[key] || ''}
                                            onChange={e => handleSpecChange(key, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="qty" className="font-semibold">{t('inventory.col.quantity', 'Initial Quantity')}</Label>
                        <Input
                            id="qty"
                            type="number"
                            min="0"
                            value={formData.quantity_on_hand}
                            onChange={e => setFormData(prev => ({ ...prev, quantity_on_hand: Math.max(0, parseInt(e.target.value, 10)) || 0 }))}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="threshold" className="font-semibold">{t('inventory.col.low_stock_threshold', 'Low Stock Alert At')}</Label>
                        <Input
                            id="threshold"
                            type="number"
                            min="0"
                            value={formData.low_stock_threshold}
                            onChange={e => setFormData(prev => ({ ...prev, low_stock_threshold: Math.max(0, parseInt(e.target.value, 10)) || 0 }))}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="buy_price" className="font-semibold">{t('inventory.col.buy_price', 'Buy Price')} *</Label>
                        <Input
                            id="buy_price"
                            type="number"
                            min="0"
                            value={formData.buy_price}
                            onChange={e => setFormData(prev => ({ ...prev, buy_price: Math.max(0, parseFloat(e.target.value)) || 0 }))}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="sell_price" className="font-semibold">{t('inventory.col.sell_price', 'Sell Price')} *</Label>
                        <Input
                            id="sell_price"
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
                    {t('inventory.create_item', 'Add Item')}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
