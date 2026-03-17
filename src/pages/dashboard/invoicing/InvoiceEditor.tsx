import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { 
    ArrowLeft, 
    Plus, 
    Trash2, 
    FileText, 
    Printer, 
    Share2, 
    Calendar as CalendarIcon,
    AlertCircle,
    Info,
    PlusCircle,
    Package
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { 
    Popover, 
    PopoverContent, 
    PopoverTrigger 
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from '@/components/ui/dialog';
import { Spinner } from "@/components/ui/spinner";
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

import { useInvoiceStore, Invoice } from '@/store/useInvoiceStore';
import { useProjectComponentStore, ProjectComponent } from '@/store/useProjectComponentStore';
import { useUserStore } from '@/store/useUserStore';
import { InventorySelectorModal } from '../components selection/InventorySelectorModal';
import { HoldToConfirmButton } from '@/components/ui/HoldToConfirmButton';
import { InventoryItem } from '@/store/useInventoryStore';

interface InvoiceEditorProps {
    projectUuid: string;
    onBack: () => void;
}

export function InvoiceEditor({ projectUuid, onBack }: InvoiceEditorProps) {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const { 
        currentInvoice, 
        fetchInvoiceByProject, 
        createInvoice, 
        updateInvoice, 
        issueInvoice,
        isLoading: isInvoiceLoading 
    } = useInvoiceStore();
    const { 
        components, 
        fetchComponents, 
        addComponent, 
        updateComponent, 
        removeComponent 
    } = useProjectComponentStore();

    const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
    const [isIssuing, setIsIssuing] = useState(false);

    // Load initial data
    useEffect(() => {
        fetchComponents(projectUuid);
        fetchInvoiceByProject(projectUuid).then((invoice) => {
            if (!invoice && currentUser) {
                // Auto-create a draft invoice if it doesn't exist
                createInvoice({
                    project_uuid: projectUuid,
                    user_uuid: currentUser.uuid,
                    status: 'pending',
                    invoice_details: {
                        shipping_fee: 0,
                        installation_fee: 0,
                        discount_percent: 0,
                        enable_custom_terms: false,
                        terms_and_conditions: ''
                    }
                });
            }
        });
    }, [projectUuid]);

    const isIssued = currentInvoice?.status !== 'pending' && currentInvoice?.issued_at;

    // Totals Calculation
    const subtotal = useMemo(() => {
        return components.reduce((sum, c) => sum + (c.price_at_sale || 0) * c.quantity, 0);
    }, [components]);

    const discountAmount = useMemo(() => {
        const pct = currentInvoice?.invoice_details?.discount_percent || 0;
        return (subtotal * pct) / 100;
    }, [subtotal, currentInvoice?.invoice_details?.discount_percent]);

    const grandTotal = useMemo(() => {
        const details = currentInvoice?.invoice_details;
        if (!details) return subtotal;
        return subtotal + (details.shipping_fee || 0) + (details.installation_fee || 0) - discountAmount;
    }, [subtotal, currentInvoice?.invoice_details, discountAmount]);

    // Handle Field Updates
    const handleDetailUpdate = async (field: string, value: any) => {
        if (!currentInvoice || isIssued) return;
        const newDetails = {
            ...currentInvoice.invoice_details,
            [field]: value
        };
        await updateInvoice(currentInvoice.uuid, { 
            invoice_details: newDetails,
            amount: grandTotal // Update main amount as well
        });
    };

    const handleComponentUpdate = async (uuid: string, updates: Partial<ProjectComponent>) => {
        if (isIssued) return;
        await updateComponent(uuid, updates);
    };

    const handleSelectItem = async (item: InventoryItem) => {
        await addComponent({
            project_uuid: projectUuid,
            item_uuid: item.uuid,
            quantity: 1,
            price_at_sale: item.sell_price,
            is_recommended: false
        });
        setIsInventoryModalOpen(false);
        toast.success(t('components.item_added', 'Item added.'));
    };

    const handleAddManual = async () => {
        await addComponent({
            project_uuid: projectUuid,
            custom_name: 'New Accessory',
            quantity: 1,
            price_at_sale: 0,
            is_recommended: false
        });
    };

    const handleIssue = async () => {
        if (!currentInvoice || !currentUser) return;
        setIsIssuing(true);
        try {
            await issueInvoice(currentInvoice.uuid, currentUser.uuid);
            toast.success(t('invoicing.issue_success', 'Invoice issued successfully!'));
        } catch (e: any) {
            toast.error(e.message || t('invoicing.issue_error', 'Failed to issue invoice.'));
        } finally {
            setIsIssuing(false);
        }
    };

    if (isInvoiceLoading && !currentInvoice) {
        return <div className="flex flex-col items-center justify-center h-full"><Spinner className="w-12 h-12" /></div>;
    }

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-20">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-xl font-bold">{t('invoicing.title', 'Invoice Editor')}</h2>
                        <p className="text-sm text-muted-foreground">{t('invoicing.subtitle', 'Review and customize your invoice before issuance.')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toast.info('Preview coming soon!')}>
                        <Printer className="h-4 w-4 mr-2" /> {t('invoicing.preview_print', 'Preview & Print')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toast.info('Sharing coming soon!')}>
                        <Share2 className="h-4 w-4 mr-2" /> {t('invoicing.share', 'Share')}
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-grow">
                <div className="max-w-5xl mx-auto p-6 space-y-8">
                    {/* Items Table */}
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Package className="h-5 w-5 text-blue-600" />
                                {t('invoicing.summary', 'Invoice Summary')}
                            </h3>
                            {!isIssued && (
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setIsInventoryModalOpen(true)}>
                                        <PlusCircle className="h-4 w-4 mr-1" /> {t('invoicing.add_item', 'Add Item')}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleAddManual}>
                                        <Plus className="h-4 w-4 mr-1" /> {t('invoicing.add_manual', 'Manual Item')}
                                    </Button>
                                </div>
                            )}
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-start">{t('invoicing.item', 'Item')}</TableHead>
                                    <TableHead className="text-center w-[150px]">{t('invoicing.unit_price', 'Unit Price')}</TableHead>
                                    <TableHead className="text-center w-[120px]">{t('invoicing.quantity', 'Qty')}</TableHead>
                                    <TableHead className="text-end w-[150px]">{t('invoicing.total', 'Total')}</TableHead>
                                    {!isIssued && <TableHead className="w-[50px]"></TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {components.map((c) => (
                                    <TableRow key={c.uuid}>
                                        <TableCell>
                                            {c.item ? (
                                                <div>
                                                    <div className="font-medium">{c.item.name}</div>
                                                    <div className="text-xs text-muted-foreground">{c.item.brand} | {c.item.model}</div>
                                                </div>
                                            ) : (
                                                <Input 
                                                    value={c.custom_name} 
                                                    onChange={(e) => handleComponentUpdate(c.uuid, { custom_name: e.target.value })}
                                                    className="h-8 font-medium"
                                                    disabled={isIssued}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Input 
                                                type="number"
                                                value={c.price_at_sale || 0}
                                                onChange={(e) => handleComponentUpdate(c.uuid, { price_at_sale: parseFloat(e.target.value) || 0 })}
                                                className="h-8 text-center"
                                                disabled={isIssued}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input 
                                                type="number"
                                                value={c.quantity}
                                                onChange={(e) => handleComponentUpdate(c.uuid, { quantity: parseInt(e.target.value) || 1 })}
                                                className="h-8 text-center"
                                                disabled={isIssued}
                                            />
                                        </TableCell>
                                        <TableCell className="text-end font-bold">
                                            {((c.price_at_sale || 0) * c.quantity).toLocaleString()}
                                        </TableCell>
                                        {!isIssued && (
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeComponent(c.uuid)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                <TableRow className="bg-gray-50/50">
                                    <TableCell colSpan={3} className="text-end font-semibold">{t('invoicing.subtotal', 'Subtotal')}</TableCell>
                                    <TableCell className="text-end font-bold">{subtotal.toLocaleString()}</TableCell>
                                    {!isIssued && <TableCell />}
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Fees & Add-ons */}
                        <div className="space-y-6">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <PlusCircle className="h-5 w-5 text-blue-600" />
                                {t('invoicing.add_ons', 'Fees & Discounts')}
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">{t('invoicing.shipping_fee', 'Shipping Fee')}</Label>
                                    <Input 
                                        type="number" 
                                        value={currentInvoice?.invoice_details?.shipping_fee || 0} 
                                        onChange={(e) => handleDetailUpdate('shipping_fee', parseFloat(e.target.value) || 0)}
                                        disabled={isIssued}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">{t('invoicing.installation_fee', 'Installation Fee')}</Label>
                                    <Input 
                                        type="number" 
                                        value={currentInvoice?.invoice_details?.installation_fee || 0} 
                                        onChange={(e) => handleDetailUpdate('installation_fee', parseFloat(e.target.value) || 0)}
                                        disabled={isIssued}
                                    />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <Label className="text-xs">{t('invoicing.discount', 'Discount (%)')}</Label>
                                    <Input 
                                        type="number" 
                                        value={currentInvoice?.invoice_details?.discount_percent || 0} 
                                        onChange={(e) => handleDetailUpdate('discount_percent', parseFloat(e.target.value) || 0)}
                                        max={100}
                                        disabled={isIssued}
                                    />
                                </div>
                            </div>

                            {/* Terms */}
                            <div className="space-y-4 pt-4 border-t">
                                <div className="flex items-center justify-between">
                                    <Label className="font-bold">{t('invoicing.terms_title', 'Terms & Conditions')}</Label>
                                    <div className="flex items-center gap-2">
                                        <Switch 
                                            checked={currentInvoice?.invoice_details?.enable_custom_terms} 
                                            onCheckedChange={(v) => handleDetailUpdate('enable_custom_terms', v)}
                                            disabled={isIssued}
                                        />
                                        <span className="text-xs">{t('invoicing.enable_custom_terms', 'Custom')}</span>
                                    </div>
                                </div>
                                {currentInvoice?.invoice_details?.enable_custom_terms && (
                                    <Textarea 
                                        placeholder={t('invoicing.custom_terms_ph', 'Enter terms...')}
                                        value={currentInvoice?.invoice_details?.terms_and_conditions || ''}
                                        onChange={(e) => handleDetailUpdate('terms_and_conditions', e.target.value)}
                                        className="h-24"
                                        disabled={isIssued}
                                    />
                                )}
                                <div className="space-y-2">
                                    <Label className="text-xs">{t('invoicing.due_date', 'Due Date')}</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button 
                                                variant="outline" 
                                                className={cn("w-full justify-start text-left font-normal", !currentInvoice?.invoice_details?.due_date && "text-muted-foreground")}
                                                disabled={isIssued}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {currentInvoice?.invoice_details?.due_date ? format(new Date(currentInvoice.invoice_details.due_date), "PPP") : <span>{t('invoicing.pick_date', 'Pick a date')}</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={currentInvoice?.invoice_details?.due_date ? new Date(currentInvoice.invoice_details.due_date) : undefined}
                                                onSelect={(date) => handleDetailUpdate('due_date', date?.toISOString())}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>

                        {/* Grand Total & Confirmation */}
                        <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 flex flex-col h-fit sticky top-24">
                            <h3 className="font-bold text-xl mb-6 text-blue-900">{t('invoicing.grand_total', 'Grand Total')}</h3>
                            <div className="space-y-3 mb-8 text-blue-800">
                                <div className="flex justify-between text-sm">
                                    <span>{t('invoicing.subtotal', 'Subtotal')}</span>
                                    <span>{subtotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t('invoicing.shipping_fee', 'Shipping')}</span>
                                    <span>+ {(currentInvoice?.invoice_details?.shipping_fee || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>{t('invoicing.installation_fee', 'Installation')}</span>
                                    <span>+ {(currentInvoice?.invoice_details?.installation_fee || 0).toLocaleString()}</span>
                                </div>
                                {discountAmount > 0 && (
                                    <div className="flex justify-between text-sm text-green-600 font-medium">
                                        <span>{t('invoicing.discount', 'Discount')} ({currentInvoice?.invoice_details?.discount_percent}%)</span>
                                        <span>- {discountAmount.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="pt-3 border-t border-blue-200 flex justify-between text-2xl font-black text-blue-900">
                                    <span>{t('invoicing.total', 'Total')}</span>
                                    <span>{grandTotal.toLocaleString()}</span>
                                </div>
                            </div>

                            {!isIssued ? (
                                <HoldToConfirmButton
                                    onConfirm={handleIssue}
                                    variant="default"
                                    className="bg-blue-600 hover:bg-blue-700 h-12 text-lg font-bold"
                                    confirmationLabel={t('invoicing.issuing', 'Issuing...')}
                                    disabled={isIssuing || components.length === 0}
                                >
                                    {t('invoicing.confirm_issue', 'Confirm & Issue')}
                                </HoldToConfirmButton>
                            ) : (
                                <div className="p-4 bg-green-100 text-green-800 border border-green-200 rounded-lg flex items-center gap-3">
                                    <FileText className="h-6 w-6" />
                                    <div>
                                        <p className="font-bold">{t('invoicing.issued', 'Invoice Issued')}</p>
                                        <p className="text-xs">{format(new Date(currentInvoice.issued_at!), "PPP")}</p>
                                    </div>
                                </div>
                            )}

                            <p className="text-[10px] text-muted-foreground mt-4 text-center">
                                <Info className="h-3 w-3 inline mr-1" />
                                {t('invoicing.issue_disclaimer', 'Issuing an invoice will deduct items from inventory and finalize prices.')}
                            </p>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <Dialog open={isInventoryModalOpen} onOpenChange={setIsInventoryModalOpen}>
                <InventorySelectorModal 
                    onSelect={handleSelectItem}
                />
            </Dialog>
        </div>
    );
}
