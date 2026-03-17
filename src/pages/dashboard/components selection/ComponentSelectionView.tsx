import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog } from '@/components/ui/dialog';
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
    AlertCircle,
    CheckCircle2,
    Info,
    Edit3,
    ShoppingCart,
    ArrowRight
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
    onCheckout: () => void;
}

export function ComponentSelectionView({ projectUuid, bleResults, onBack, onCheckout }: ComponentSelectionViewProps) {
    const { t, i18n } = useTranslation();
    const {
        components,
        isLoading,
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
    const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
    const inFlightQtyRef = useRef<Record<string, boolean>>({});
    const latestQtyRef = useRef<Record<string, number>>({});

    useEffect(() => {
        fetchComponents(projectUuid);
        fetchItems();
        fetchCategories();
    }, [projectUuid]);

    useEffect(() => {
        setQuantityDrafts(prev => {
            const next = { ...prev };
            for (const c of components) {
                if (next[c.uuid] === undefined) {
                    next[c.uuid] = String(c.quantity ?? 1);
                }
            }
            return next;
        });
    }, [components]);

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

    const normalizeName = (value: string) => value.trim().toLowerCase();

    const getSlotKey = (label?: string | null) => {
        const v = normalizeName(label || '');
        if (!v) return null;
        if (v.includes('inverter')) return 'inverter';
        if (v.includes('battery')) return 'battery';
        if (v.includes('panel')) return 'panel';
        return null;
    };

    const getCategoryNameForItem = (item: InventoryItem | undefined) => {
        if (!item) return '';
        if (item.category?.name) return item.category.name;
        const category = categories.find(c => c.uuid === item.category_uuid);
        return category?.name || '';
    };

    const getCategoryUuidForComponent = (component?: ProjectComponent) => {
        if (!component) return undefined;
        if (component.item?.category_uuid) return component.item.category_uuid;
        if (component.item_uuid) {
            const item = items.find(i => i.uuid === component.item_uuid);
            return item?.category_uuid;
        }
        return undefined;
    };

    const getCategoryNameForComponent = (component?: ProjectComponent) => {
        if (!component) return '';
        if (component.item?.category?.name) return component.item.category.name;
        const catUuid = getCategoryUuidForComponent(component);
        if (catUuid) {
            const category = categories.find(c => c.uuid === catUuid);
            return category?.name || '';
        }
        if (component.item_uuid) {
            const item = items.find(i => i.uuid === component.item_uuid);
            return getCategoryNameForItem(item);
        }
        return '';
    };

    const getCategoryUuidsByAliases = (aliases: string[]) => {
        const aliasSet = new Set(aliases.map(normalizeName));
        return categories
            .filter(c => aliasSet.size > 0 && Array.from(aliasSet).some(a => normalizeName(c.name).includes(a)))
            .map(c => c.uuid);
    };

    const categoryUuidsBySlot = useMemo(() => ({
        inverter: getCategoryUuidsByAliases(['inverter']),
        battery: getCategoryUuidsByAliases(['battery', 'battery bank', 'batteries', 'bank']),
        panel: getCategoryUuidsByAliases(['panel', 'solar panel', 'solar panels', 'pv', 'module', 'modules']),
    }), [categories]);

    const handleSelectItem = async (item: InventoryItem) => {
        try {
            const slotKey = getSlotKey(selectedSlotCategory);
            const slotCategoryUuids = slotKey ? new Set(categoryUuidsBySlot[slotKey]) : null;
            const existingInSlot = slotCategoryUuids
                ? components.find(c => {
                    const catUuid = getCategoryUuidForComponent(c);
                    return !!catUuid && slotCategoryUuids.has(catUuid);
                })
                : undefined;

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

    const commitQuantityUpdate = async (uuid: string, qty: number) => {
        if (qty < 1) return;
        try {
            latestQtyRef.current[uuid] = qty;
            if (inFlightQtyRef.current[uuid]) return;

            inFlightQtyRef.current[uuid] = true;
            while (true) {
                const targetQty = latestQtyRef.current[uuid];
                await updateComponent(uuid, { quantity: targetQty });
                if (latestQtyRef.current[uuid] === targetQty) break;
            }
        } catch (e: any) {
             toast.error(e.message || "Failed to update quantity");
        } finally {
            inFlightQtyRef.current[uuid] = false;
        }
    };

    const handleDraftChange = (uuid: string, value: string) => {
        setQuantityDrafts(prev => ({ ...prev, [uuid]: value }));
    };

    const handleDraftCommit = (uuid: string) => {
        const raw = quantityDrafts[uuid];
        const qty = parseInt(raw || '0', 10);
        if (!qty || qty < 1) {
            const fallback = components.find(c => c.uuid === uuid)?.quantity ?? 1;
            setQuantityDrafts(prev => ({ ...prev, [uuid]: String(fallback) }));
            return;
        }
        commitQuantityUpdate(uuid, qty);
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

    const findComponentByCategoryKey = (key: keyof typeof categoryUuidsBySlot) => {
        const allowed = new Set(categoryUuidsBySlot[key]);
        if (allowed.size === 0) {
            const needle = key.toLowerCase();
            return components.find(c => getCategoryNameForComponent(c).toLowerCase().includes(needle));
        }
        return components.find(c => {
            const catUuid = getCategoryUuidForComponent(c);
            return !!catUuid && allowed.has(catUuid);
        });
    };

    const slotInverter = findComponentByCategoryKey('inverter');
    const slotBattery = findComponentByCategoryKey('battery');
    const slotPanels = findComponentByCategoryKey('panel');



    const totalCost = useMemo(() => {
        return components.reduce((sum, c) => sum + (c.price_at_sale || 0) * c.quantity, 0);
    }, [components]);

    if (isLoading && components.length === 0) {
        return <div className="flex flex-col items-center justify-center h-full"><Spinner className="w-12 h-12 mb-4" /><p>{t('common.loading', 'Loading components...')}</p></div>;
    }

    return (
        <div className="flex flex-col h-full bg-gray-50/50" dir={i18n.dir()}>
            <div className="flex items-center justify-between p-4 bg-white border-b sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        {i18n.dir() === "ltr"? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                    </Button>
                    <div>
                        <h2 className="text-xl font-bold">{t('components.title', 'Component Selection')}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={handleGenerateRecommendations}
                        disabled={isGenerating || !bleResults}
                        className="h-10 rounded-lg group hover:shadow-lg hover:text-white bg-white hover:bg-primary border shadow-sm"
                    >
                        {isGenerating ? <Spinner className=" h-4 w-4 group-hover:invert" /> : <img src="public/eva-icons (2)/outline/bulb.png" className=" h-5 w-5 group-hover:invert" />}
                        {t('components.auto_select', 'Auto-Select')}
                    </Button>
                    <Button
                        variant="default"
                        onClick={onCheckout}
                        disabled={components.length === 0}
                        className="h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
                    >
                        <ShoppingCart className="me-2 h-5 w-5" />
                        {t('invoicing.checkout', 'Check Out')}
                    </Button>
                    <div className="h-10 px-4 flex items-center bg-green-600 text-white rounded-lg font-bold shadow-sm">
                        <ShoppingCart className="me-2 h-5 w-5" />
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
                            requirement={reqInverter ? `${reqInverter.recommended_rating} W` + `, ${reqInverter.output_voltage_v} V` : 'N/A'}
                            requirementValue={reqInverter?.recommended_rating}
                            requirementQuantity={reqInverter?.quantity}
                            requirementUnit="W"
                            component={slotInverter}
                            quantityDrafts={quantityDrafts}
                            onDraftChange={handleDraftChange}
                            onDraftCommit={handleDraftCommit}
                            onSelect={() => { setSelectedSlotCategory('Inverter'); setIsInventoryModalOpen(true); }}
                            onRemove={handleRemove}
                        />
                        <ComponentSlot
                            title={t('components.battery_bank', 'Battery Bank')}
                            icon={<BatteryIcon className="h-6 w-6 text-green-500" />}
                            requirement={reqBattery ? `${reqBattery.capacity_per_unit_ah} Ah` + ` x ${reqBattery.quantity}` : 'N/A'}
                            requirementValue={reqBattery?.capacity_per_unit_ah}
                            requirementQuantity={reqBattery?.quantity}
                            requirementUnit="Ah"
                            component={slotBattery}
                            quantityDrafts={quantityDrafts}
                            onDraftChange={handleDraftChange}
                            onDraftCommit={handleDraftCommit}
                            onSelect={() => { setSelectedSlotCategory('Battery'); setIsInventoryModalOpen(true); }}
                            onRemove={handleRemove}
                        />
                        <ComponentSlot
                            title={t('components.solar_array', 'Solar Array')}
                            icon={<Sun className="h-6 w-6 text-orange-500" />}
                            requirement={reqPanels ? `${reqPanels.power_rating_w} W` + ` x ${reqPanels.quantity}` : 'N/A'}
                            requirementValue={reqPanels?.power_rating_w}
                            requirementQuantity={reqPanels?.quantity}
                            requirementUnit="W"
                            component={slotPanels}
                            quantityDrafts={quantityDrafts}
                            onDraftChange={handleDraftChange}
                            onDraftCommit={handleDraftCommit}
                            onSelect={() => { setSelectedSlotCategory('Panel'); setIsInventoryModalOpen(true); }}
                            onRemove={handleRemove}
                        />
                    </div>
                    {/* All Components Table */}
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden" dir={i18n.dir()}>
                        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                            <h3 className="font-bold text-lg">{t('components.system_components_table', 'Solar System Components')}</h3>
                            <Button size="sm" onClick={() => { setSelectedSlotCategory(null); setIsInventoryModalOpen(true); }}>
                                <Plus className="h-4 w-4 me-1" /> {t('components.add_from_inventory', 'Add Item')}
                            </Button>
                        </div>
                        <Table dir={i18n.dir()}>
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
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic">
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
                                                        value={quantityDrafts[c.uuid] ?? String(c.quantity ?? 1)}
                                                        onChange={(e) => handleDraftChange(c.uuid, e.target.value)}
                                                        onBlur={() => handleDraftCommit(c.uuid)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                (e.currentTarget as HTMLInputElement).blur();
                                                            }
                                                        }}
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
    requirementQuantity?: number;
    requirementUnit?: string;
    component?: ProjectComponent;
    quantityDrafts: Record<string, string>;
    onDraftChange: (uuid: string, value: string) => void;
    onDraftCommit: (uuid: string) => void;
    onSelect: () => void;
    onRemove: (uuid: string) => void;
}

function ComponentSlot({
    title,
    icon,
    requirement,
    requirementValue,
    requirementQuantity,
    requirementUnit,
    component,
    quantityDrafts,
    onDraftChange,
    onDraftCommit,
    onSelect,
    onRemove
}: ComponentSlotProps) {
    const { t, i18n } = useTranslation();

    // Logic to determine fulfillment status
    const isUnderstocked = component?.item && component.item.quantity_on_hand < component.quantity;

    const safe_float = (val: any) => {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
    };

    // Spec and Quantity validation
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

        const msgs: string[] = [];
        let status: 'fulfilled' | 'misaligned' | 'understocked' | 'over' = 'fulfilled';
        let color = 'text-green-600';

        // 1. Check Technical Specs
        if (requirementValue && itemValue < requirementValue) {
            status = 'misaligned';
            color = 'text-orange-600';
            msgs.push(t('components.status.spec_below', 'Spec below requirement ({{val}}{{unit}})', { val: itemValue, unit: requirementUnit }));
        } else if (requirementValue && itemValue > requirementValue * 1.5) {
            // Significant over-spec (50%+)
            if (status === 'fulfilled') status = 'over';
            msgs.push(t('components.status.spec_over', 'Spec exceeds requirement ({{val}}{{unit}})', { val: itemValue, unit: requirementUnit }));
        }

        // 2. Check Quantity
        if (requirementQuantity && component.quantity < requirementQuantity) {
            status = 'misaligned';
            color = 'text-orange-600';
            msgs.push(t('components.status.qty_below', 'Quantity below requirement ({{qty}}/{{req}})', { qty: component.quantity, req: requirementQuantity }));
        } else if (requirementQuantity && component.quantity > requirementQuantity) {
            if (status === 'fulfilled' || status === 'over') status = 'over';
            msgs.push(t('components.status.qty_over', 'Quantity exceeds requirement ({{qty}}/{{req}})', { qty: component.quantity, req: requirementQuantity }));
        }

        // 3. Check Stock
        if (isUnderstocked) {
            status = 'understocked';
            color = 'text-red-600';
            msgs.push(t('components.status.stock_insufficient', 'Insufficient stock ({{count}} available)', { count: component.item?.quantity_on_hand }));
        }

        if (msgs.length === 0) {
            return {
                status: 'fulfilled',
                msg: t('components.status.fulfilled', 'Requirement successfully fulfilled.'),
                color: 'text-green-600'
            };
        }

        return {
            status,
            msg: msgs.join(' | '),
            color
        };
    };

    const statusInfo = getStatus();

    return (
        <div className={cn(
            "flex flex-col p-4 rounded-xl border bg-white shadow-sm transition-all relative overflow-hidden h-full",
            component ? "border-blue-200 ring-1 ring-blue-50" : "border-dashed border-gray-300"
        )}
            dir={i18n.dir()}
        >
            {component?.is_recommended && (
                <div className="absolute top-0 end-0 px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-bs-lg z-10">
                    {t('components.recommended', 'Recommended')}
                </div>
            )}

            <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
                <div className="flex-grow">
                    <h4 className="font-bold">{title}</h4>
                    <p className="text-[10px] text-muted-foreground text-semantic-error font-bold uppercase">{t('components.required', 'Required')}: {requirement}</p>
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
                                        value={quantityDrafts[component.uuid] ?? String(component.quantity ?? 1)}
                                        onChange={(e) => onDraftChange(component.uuid, e.target.value)}
                                        onBlur={() => onDraftCommit(component.uuid)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                    />
                                </div>
                                <div className="text-sm font-bold text-blue-700">
                                    {((component.price_at_sale || 0) * component.quantity).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        <div className={cn("flex items-start gap-1.5 p-2 rounded text-[10px] font-bold leading-tight",
                            statusInfo.status === 'fulfilled' ? "bg-green-50" : statusInfo.status === 'over' ? "bg-blue-50" : statusInfo.status === 'misaligned' ? "bg-orange-50" : "bg-red-50"
                        )}>
                            {statusInfo.status === 'fulfilled' ? <CheckCircle2 className="h-3 w-3 mt-0.5" /> : <AlertCircle className="h-3 w-3 mt-0.5" />}
                            <span className={statusInfo.color}>{statusInfo.msg}</span>
                        </div>

                        <div className="flex gap-2 mt-auto">
                            <Button variant="outline" size="sm" className="flex-grow h-8 text-xs font-semibold" onClick={onSelect}>
                                <Edit3 className="h-3 w-3 me-1" /> {t('common.change', 'Change')}
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
                            <Plus className="h-3 w-3 me-1" /> {t('components.select_item', 'Select Item')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
