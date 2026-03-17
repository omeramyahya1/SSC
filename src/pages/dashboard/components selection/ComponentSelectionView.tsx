import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    Plus,
    Trash2,
    ArrowLeft,
    Zap,
    Battery as BatteryIcon,
    Sun,
    Settings,
    AlertCircle,
    CheckCircle2,
    Info,
    Edit3,
    ShoppingCart
} from 'lucide-react';
import { useProjectComponentStore, ProjectComponent } from '@/store/useProjectComponentStore';
import { useInventoryStore, InventoryItem } from '@/store/useInventoryStore';
import { InventorySelectorModal } from './InventorySelectorModal';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface ComponentSelectionViewProps {
    projectUuid: string;
    bleResults: any;
    onBack: () => void;
}

export function ComponentSelectionView({ projectUuid, bleResults, onBack }: ComponentSelectionViewProps) {
    const { t, i18n } = useTranslation();
    const {
        components,
        isLoading,
        error,
        fetchComponents,
        addComponent,
        updateComponent,
        removeComponent,
        generateRecommendations
    } = useProjectComponentStore();

    const { items, categories, fetchItems, fetchCategories } = useInventoryStore();

    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedSlotCategory, setSelectedSlotCategory] = useState<string | null>(null);
    const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);

    useEffect(() => {
        fetchComponents(projectUuid);
        fetchItems();
        fetchCategories();
    }, [projectUuid]);

    const handleGenerateRecommendations = async () => {
        if (!bleResults) {
            toast.error(t('components.no_ble_results', 'No calculation results found. Please run calculation first.'));
            return;
        }
        setIsGenerating(true);
        try {
            await generateRecommendations(projectUuid, bleResults);
            toast.success(t('components.recommendations_generated', 'Recommendations generated successfully!'));
        } catch (e: any) {
            toast.error(e.message || "Failed to generate recommendations");
        } finally {
            setIsGenerating(false);
        }
    };

    const getCategoryNameForItem = (item: InventoryItem | undefined) => {
        if (!item) return '';
        if (item.category?.name) return item.category.name;
        const category = categories.find(c => c.uuid === item.category_uuid);
        return category?.name || '';
    };

    const handleSelectItem = async (item: InventoryItem) => {
        try {
            const existingInSlot = components.find(c => {
                const catName = getCategoryNameForItem(item).toLowerCase();
                return selectedSlotCategory && catName.includes(selectedSlotCategory.toLowerCase());
            });

            if (existingInSlot && selectedSlotCategory) {
                 await updateComponent(existingInSlot.uuid, {
                    item_uuid: item.uuid,
                    price_at_sale: item.sell_price,
                    is_recommended: false
                 });
            } else {
                await addComponent({
                    project_uuid: projectUuid,
                    item_uuid: item.uuid,
                    quantity: 1,
                    price_at_sale: item.sell_price,
                    is_recommended: false
                });
            }
            setIsInventoryModalOpen(false);
            toast.success(t('components.item_added', 'Item added to project components.'));
        } catch (e: any) {
            toast.error(e.message || "Failed to add item");
        }
    };

    const handleUpdateQuantity = async (uuid: string, qty: number) => {
        if (qty < 1) return;
        try {
            await updateComponent(uuid, { quantity: qty });
        } catch (e: any) {
             toast.error(e.message || "Failed to update quantity");
        }
    };

    const handleRemove = async (uuid: string) => {
        try {
            await removeComponent(uuid);
            toast.success(t('components.item_removed', 'Item removed.'));
        } catch (e: any) {
            toast.error(e.message || "Failed to remove item");
        }
    };

    // Requirement helpers
    const reqInverter = bleResults?.data?.inverter;
    const reqBattery = bleResults?.data?.battery_bank;
    const reqPanels = bleResults?.data?.solar_panels;

    const getCategoryNameForComponent = (component?: ProjectComponent) => {
        if (!component) return '';
        if (component.item?.category?.name) return component.item.category.name;
        if (component.item?.category_uuid) {
            const category = categories.find(c => c.uuid === component.item?.category_uuid);
            if (category?.name) return category.name;
        }
        if (component.item_uuid) {
            const item = items.find(i => i.uuid === component.item_uuid);
            return getCategoryNameForItem(item);
        }
        return '';
    };

    const findComponentByCategory = (name: string) => {
        const needle = name.toLowerCase();
        return components.find(c => getCategoryNameForComponent(c).toLowerCase().includes(needle));
    };

    const slotInverter = findComponentByCategory('inverter');
    const slotBattery = findComponentByCategory('battery');
    const slotPanels = findComponentByCategory('panel');

    const accessories = components.filter(c => {
        const catName = getCategoryNameForComponent(c).toLowerCase();
        return !catName.includes('inverter') &&
               !catName.includes('battery') &&
               !catName.includes('panel');
    });

    const totalCost = useMemo(() => {
        return components.reduce((sum, c) => sum + (c.price_at_sale || 0) * c.quantity, 0);
    }, [components]);

    if (isLoading && components.length === 0) {
        return <div className="flex flex-col items-center justify-center h-full"><Spinner className="w-12 h-12 mb-4" /><p>{t('common.loading', 'Loading components...')}</p></div>;
    }

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            <div className="flex items-center justify-between p-4 bg-white border-b sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-xl font-bold">{t('components.title', 'Component Selection')}</h2>
                        <p className="text-sm text-muted-foreground">{t('components.subtitle', 'Map calculated requirements to real inventory items.')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={handleGenerateRecommendations}
                        disabled={isGenerating || !bleResults}
                        className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    >
                        {isGenerating ? <Spinner className="mr-2 h-4 w-4" /> : <Settings className="mr-2 h-4 w-4" />}
                        {t('components.auto_select', 'Auto-Select')}
                    </Button>
                    <div className="h-10 px-4 flex items-center bg-green-600 text-white rounded-lg font-bold shadow-sm">
                        <ShoppingCart className="mr-2 h-5 w-5" />
                        {totalCost.toLocaleString()}
                    </div>
                </div>
            </div>

            <ScrollArea className="flex-grow p-6">
                <div className="max-w-5xl mx-auto space-y-8">
                    {/* Primary Slots */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <ComponentSlot
                            title={t('components.inverter', 'Inverter')}
                            icon={<Zap className="h-6 w-6 text-yellow-500" />}
                            requirement={reqInverter ? `${reqInverter.recommended_rating}W, ${reqInverter.output_voltage_v}V` : 'N/A'}
                            requirementValue={reqInverter?.recommended_rating}
                            component={slotInverter}
                            onSelect={() => { setSelectedSlotCategory('Inverter'); setIsInventoryModalOpen(true); }}
                            onRemove={handleRemove}
                            onUpdateQty={handleUpdateQuantity}
                        />
                        <ComponentSlot
                            title={t('components.battery_bank', 'Battery Bank')}
                            icon={<BatteryIcon className="h-6 w-6 text-green-500" />}
                            requirement={reqBattery ? `${reqBattery.capacity_per_unit_ah}Ah x ${reqBattery.quantity}` : 'N/A'}
                            requirementValue={reqBattery?.capacity_per_unit_ah}
                            component={slotBattery}
                            onSelect={() => { setSelectedSlotCategory('Battery'); setIsInventoryModalOpen(true); }}
                            onRemove={handleRemove}
                            onUpdateQty={handleUpdateQuantity}
                        />
                        <ComponentSlot
                            title={t('components.solar_array', 'Solar Array')}
                            icon={<Sun className="h-6 w-6 text-orange-500" />}
                            requirement={reqPanels ? `${reqPanels.power_rating_w}W x ${reqPanels.quantity}` : 'N/A'}
                            requirementValue={reqPanels?.power_rating_w}
                            component={slotPanels}
                            onSelect={() => { setSelectedSlotCategory('Panel'); setIsInventoryModalOpen(true); }}
                            onRemove={handleRemove}
                            onUpdateQty={handleUpdateQuantity}
                        />
                    </div>

                    {/* All Components Table */}
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                            <h3 className="font-bold text-lg">{t('components.system_components_table', 'Solar System Components')}</h3>
                            <Button size="sm" onClick={() => { setSelectedSlotCategory(null); setIsInventoryModalOpen(true); }}>
                                <Plus className="h-4 w-4 mr-1" /> {t('components.add_from_inventory', 'Add Item')}
                            </Button>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('components.item', 'Item')}</TableHead>
                                    <TableHead className="text-center w-[150px]">{t('components.quantity', 'Quantity')}</TableHead>
                                    <TableHead className="text-right w-[150px]">{t('components.unit_price', 'Unit Price')}</TableHead>
                                    <TableHead className="text-right w-[150px]">{t('components.total', 'Total')}</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {components.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
                                            {t('components.no_components', 'No components added yet.')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    components.map((c) => (
                                        <TableRow key={c.uuid} className={cn(c.is_recommended && "bg-blue-50/30")}>
                                            <TableCell>
                                                <div className="font-medium">{c.item?.name || c.custom_name}</div>
                                                <div className="text-xs text-muted-foreground">{c.item?.brand} {c.item?.model}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-center gap-2">
                                                    <Input
                                                        type="number"
                                                        className="w-20 text-center h-8"
                                                        value={c.quantity}
                                                        onChange={(e) => handleUpdateQuantity(c.uuid, parseInt(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {(c.price_at_sale || 0).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                {((c.price_at_sale || 0) * c.quantity).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => handleRemove(c.uuid)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Stock Alert */}
                    {components.some(c => c.item && c.item.quantity_on_hand < c.quantity) && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t('components.stock_warning_title', 'Insufficient Stock')}</AlertTitle>
                            <AlertDescription>
                                {t('components.stock_warning_desc', 'Some selected items exceed current inventory levels. Please adjust quantities or check stock.')}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </ScrollArea>

            <Dialog open={isInventoryModalOpen} onOpenChange={setIsInventoryModalOpen}>
                <InventorySelectorModal
                    categoryName={selectedSlotCategory || undefined}
                    onSelect={handleSelectItem}
                    selectedItemUuid={selectedSlotCategory === 'Inverter' ? slotInverter?.item_uuid : selectedSlotCategory === 'Battery' ? slotBattery?.item_uuid : selectedSlotCategory === 'Panel' ? slotPanels?.item_uuid : undefined}
                />
            </Dialog>
        </div>
    );
}

interface ComponentSlotProps {
    title: string;
    icon: React.ReactNode;
    requirement: string;
    requirementValue?: number;
    component?: ProjectComponent;
    onSelect: () => void;
    onRemove: (uuid: string) => void;
    onUpdateQty: (uuid: string, qty: number) => void;
}

function ComponentSlot({ title, icon, requirement, requirementValue, component, onSelect, onRemove, onUpdateQty }: ComponentSlotProps) {
    const { t } = useTranslation();

    // Logic to determine fulfillment status
    const isUnderstocked = component?.item && component.item.quantity_on_hand < component.quantity;

    const safe_float = (val: any) => {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
    };

    // Simple spec validation (Power/Capacity)
    const getStatus = () => {
        if (!component) return {
            status: 'empty',
            msg: t('components.status.empty', 'No item selected to fulfill requirements.'),
            color: 'text-muted-foreground'
        };

        const specs = component.item?.technical_specs || {};
        const itemValue = safe_float(
            specs.power_rating_w ||
            specs.inverter_rated_power ||
            specs.panel_rated_power ||
            specs.battery_rated_capacity_ah ||
            specs.capacity_ah
        );

        if (requirementValue && itemValue < requirementValue) {
            return {
                status: 'misaligned',
                msg: t('components.status.misaligned', 'Selected item does not meet minimum requirements.'),
                color: 'text-orange-600'
            };
        }

        if (isUnderstocked) {
            return {
                status: 'understocked',
                msg: t('components.status.understocked', 'Requirement fulfilled but stock is insufficient.'),
                color: 'text-red-600'
            };
        }

        return {
            status: 'fulfilled',
            msg: t('components.status.fulfilled', 'Requirement successfully fulfilled.'),
            color: 'text-green-600'
        };
    };

    const statusInfo = getStatus();

    return (
        <div className={cn(
            "flex flex-col p-4 rounded-xl border bg-white shadow-sm transition-all relative overflow-hidden h-full",
            component ? "border-blue-200 ring-1 ring-blue-50" : "border-dashed border-gray-300"
        )}>
            {component?.is_recommended && (
                <div className="absolute top-0 right-0 px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-bl-lg z-10">
                    {t('components.recommended', 'Recommended')}
                </div>
            )}

            <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
                <div className="flex-grow">
                    <h4 className="font-bold">{title}</h4>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">{t('components.required', 'Required')}: {requirement}</p>
                </div>
            </div>

            <div className="flex-grow flex flex-col">
                {component ? (
                    <div className="space-y-3 flex-grow flex flex-col">
                        <div className="p-3 bg-blue-50/30 rounded-lg border border-blue-100 flex-grow">
                            <div className="font-semibold text-sm line-clamp-2 mb-1">{component.item?.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">{component.item?.brand} | {component.item?.model}</div>

                            <div className="mt-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold">{t('components.qty', 'Qty')}:</span>
                                    <Input
                                        type="number"
                                        className="w-14 h-7 text-center text-xs px-1"
                                        value={component.quantity}
                                        onChange={(e) => onUpdateQty(component.uuid, parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="text-sm font-bold text-blue-700">
                                    {((component.price_at_sale || 0) * component.quantity).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        <div className={cn("flex items-start gap-1.5 p-2 rounded text-[10px] font-bold leading-tight",
                            statusInfo.status === 'fulfilled' ? "bg-green-50" : statusInfo.status === 'misaligned' ? "bg-orange-50" : "bg-red-50"
                        )}>
                            {statusInfo.status === 'empty' ? <CheckCircle2 className="h-3 w-3 mt-0.5" /> : <AlertCircle className="h-3 w-3 mt-0.5" />}
                            <span className={statusInfo.color}>{statusInfo.msg}</span>
                        </div>

                        <div className="flex gap-2 mt-auto">
                            <Button variant="outline" size="sm" className="flex-grow h-8 text-xs font-semibold" onClick={onSelect}>
                                <Edit3 className="h-3 w-3 mr-1" /> {t('common.change', 'Change')}
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 border-red-100" onClick={() => onRemove(component.uuid)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-100 rounded-lg bg-gray-50/50">
                        <div className="text-center px-4 mb-4">
                            <Info className="h-5 w-5 text-gray-300 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground leading-relaxed">{statusInfo.msg}</p>
                        </div>
                        <Button size="sm" className="h-8 font-bold bg-white text-blue-600 border-blue-200 hover:bg-blue-50 shadow-none" variant="outline" onClick={onSelect}>
                            <Plus className="h-3 w-3 mr-1" /> {t('components.select_item', 'Select Item')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
