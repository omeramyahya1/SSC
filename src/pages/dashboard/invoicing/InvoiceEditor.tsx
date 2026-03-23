import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { format, addDays } from "date-fns";
import {
    ArrowLeft,
    Plus,
    Trash2,
    FileText,
    Printer,
    Share2,
    Calendar as CalendarIcon,
    Info,
    PlusCircle,
    Package,
    MapPin,
    Mail,
    Phone,
    User as UserIcon,
    Hash
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

import { useInvoiceStore, Invoice, InvoiceDetails } from '@/store/useInvoiceStore';
import { useProjectComponentStore, ProjectComponent } from '@/store/useProjectComponentStore';
import { useUserStore } from '@/store/useUserStore';
import { InventorySelectorModal } from '../components selection/InventorySelectorModal';
import { HoldToConfirmButton } from '@/components/ui/HoldToConfirmButton';
import { InventoryItem } from '@/store/useInventoryStore';
import { Project } from '@/store/useProjectStore';

interface InvoiceEditorProps {
    project: Project;
    onBack: () => void;
}

export function InvoiceEditor({ project, onBack }: InvoiceEditorProps) {
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
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    // Local-only state for fees/discount/date/terms
    const [dueDate, setDueDate] = useState<Date | null>(addDays(new Date(), 7));
    const [shippingFeeInput, setShippingFeeInput] = useState('0');
    const [installationFeeInput, setInstallationFeeInput] = useState('0');
    const [discountPercentInput, setDiscountPercentInput] = useState('0');
    const [customTermsEnabled, setCustomTermsEnabled] = useState(false);
    const [customTerms, setCustomTerms] = useState('');

    // Load initial data
    useEffect(() => {
        fetchComponents(project.uuid);
        fetchInvoiceByProject(project.uuid).then((invoice) => {
            if (invoice) {
                const details = invoice.invoice_details;
                setShippingFeeInput(String(details.shipping_fee ?? 0));
                setInstallationFeeInput(String(details.installation_fee ?? 0));
                setDiscountPercentInput(String(details.discount_percent ?? 0));
                setDueDate(details.due_date ? new Date(details.due_date) : addDays(new Date(), 7));
                setCustomTermsEnabled(!!details.enable_custom_terms);
                setCustomTerms(details.terms_and_conditions || '');
                return;
            }

            if (currentUser) {
                const initialDetails: InvoiceDetails = {
                    shipping_fee: 0,
                    installation_fee: 0,
                    discount_percent: 0,
                    enable_custom_terms: false,
                    terms_and_conditions: '',
                    due_date: addDays(new Date(), 7).toISOString()
                };
                setShippingFeeInput('0');
                setInstallationFeeInput('0');
                setDiscountPercentInput('0');
                setDueDate(new Date(initialDetails.due_date!));
                setCustomTermsEnabled(false);
                setCustomTerms('');
                createInvoice({
                    project_uuid: project.uuid,
                    user_uuid: currentUser.uuid,
                    status: 'pending',
                    invoice_details: initialDetails
                });
            }
        });
    }, [project.uuid, currentUser, fetchComponents, fetchInvoiceByProject, createInvoice]);

    const toNumber = (value: string) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const shippingFee = useMemo(() => toNumber(shippingFeeInput), [shippingFeeInput]);
    const installationFee = useMemo(() => toNumber(installationFeeInput), [installationFeeInput]);
    const discountPercent = useMemo(() => toNumber(discountPercentInput), [discountPercentInput]);

    const isIssued = currentInvoice?.status !== 'pending' && !!currentInvoice?.issued_at;

    // Totals Calculation
    const subtotal = useMemo(() => {
        return components.reduce((sum, c) => sum + (c.price_at_sale || 0) * c.quantity, 0);
    }, [components]);

    const discountAmount = useMemo(() => {
        const pct = discountPercent;
        return (subtotal * pct) / 100;
    }, [subtotal, discountPercent]);

    const grandTotal = useMemo(() => {
        return subtotal + shippingFee + installationFee - discountAmount;
    }, [subtotal, shippingFee, installationFee, discountAmount]);

    // Generate Default Terms
    const generateDefaultTerms = useCallback(() => {
        const validityDate = dueDate ? format(dueDate, "dd/MM/yyyy") : "dd/mm/yyyy";
        const discount = discountPercent;

        return `Payment Terms: Payment is due within 7 days of the invoice date.\n` +
               `Validity: This quotation is valid until ${validityDate}.\n` +
               `Discount: A ${discount}% discount has been applied.\n` +
               `Additional Costs: Any additional costs after the invoice issuance will be quoted separately.`;
    }, [dueDate, discountPercent]);

    const handleNumberInputChange = (
        setter: (value: string) => void,
        rawValue: string
    ) => {
        if (!/^\d*\.?\d*$/.test(rawValue)) return;
        setter(rawValue);
    };

    const normalizeNumberInput = (
        value: string,
        setter: (value: string) => void,
        { clampMax }: { clampMax?: number } = {}
    ) => {
        let numeric = value === '' ? 0 : Number(value);
        if (Number.isNaN(numeric)) numeric = 0;
        if (typeof clampMax === 'number') numeric = Math.min(clampMax, Math.max(0, numeric));
        setter(String(numeric));
    };

    const handleComponentUpdate = async (uuid: string, updates: Partial<ProjectComponent>) => {
        if (isIssued) return;
        await updateComponent(uuid, updates);
    };

    const handleSelectItem = async (item: InventoryItem) => {
        await addComponent({
            project_uuid: project.uuid,
            item_uuid: item.uuid,
            quantity: 1,
            price_at_sale: item.sell_price,
            is_recommended: false
        });
        setIsInventoryModalOpen(false);
        toast.success(t('components.item_added', 'Item added.'));
    };

    const handleIssue = useCallback(async () => {
        if (!currentUser) {
            toast.error(t('invoicing.error_no_user', 'User not authenticated.'));
            console.log(currentUser)
            return;
        }

        const details: InvoiceDetails = {
            shipping_fee: shippingFee,
            installation_fee: installationFee,
            discount_percent: discountPercent,
            due_date: dueDate ? dueDate.toISOString() : undefined,
            enable_custom_terms: customTermsEnabled,
            terms_and_conditions: customTermsEnabled ? customTerms : generateDefaultTerms()
        };

        setIsIssuing(true);
        try {
            let invoice = currentInvoice;
            if (!invoice) {
                const created = await createInvoice({
                    project_uuid: project.uuid,
                    user_uuid: currentUser.uuid,
                    status: 'pending',
                    invoice_details: details,
                    amount: grandTotal
                });
                if (!created) {
                    toast.error(t('invoicing.error_no_invoice', 'Failed to create invoice.'));
                    return;
                }
                invoice = created;
            } else {
                await updateInvoice(invoice.uuid, {
                    invoice_details: details,
                    amount: grandTotal
                });
            }
            await issueInvoice(invoice.uuid, currentUser.uuid);
            toast.success(t('invoicing.issue_success', 'Invoice issued successfully!'));
        } catch (e: any) {
            toast.error(e.message || t('invoicing.issue_error', 'Failed to issue invoice.'));
        } finally {
            setIsIssuing(false);
        }
    }, [currentInvoice, currentUser, shippingFee, installationFee, discountPercent, dueDate, customTermsEnabled, customTerms, generateDefaultTerms, grandTotal, t, updateInvoice, issueInvoice, createInvoice, project.uuid]);

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
                    <Button variant="outline" size="sm" onClick={() => toast.custom('Preview coming soon!')}>
                        <Printer className="h-4 w-4 " /> {t('invoicing.preview_print', 'Preview & Print')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toast.custom('Sharing coming soon!')}>
                        <Share2 className="h-4 w-4 " /> {t('invoicing.share', 'Share')}
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-grow">
                <div className="max-w-5xl mx-auto p-8 space-y-10">

                    {/* Customer & Invoice Info Header */}
                    <div className="flex flex-col md:flex-row justify-between gap-8 pb-8 border-b">
                        {/* Customer Info (Start) */}
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-primary mb-4 flex items-center gap-2">
                                <UserIcon className="h-6 w-6" />
                                {project.customer?.full_name || t('dashboard.no_customer', 'Customer')}
                            </h3>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0" />
                                <span className="text-sm font-bold">Address: {project.project_location || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-4 w-4 shrink-0" />
                                <span className="text-sm font-bold">Email: {project.customer?.email || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="h-4 w-4 shrink-0" />
                                <span className="text-sm font-bold">Phone No: {project.customer?.phone_number || 'N/A'}</span>
                            </div>
                        </div>

                        {/* Invoice Metadata (End) */}
                        <div className="md:text-end space-y-2">
                            <div className='flex flex-col gap-2 items-end'>
                                <span className='w-fit text-[10px] uppercase font-bold text-gray-400 block '>{t('invoicing.invoice_no', 'Invoice No')}</span>
                                <div className="w-fit h-fit inline-flex items-center text-red-500 text-xl font-mono font-bold">
                                    <Hash className="h-4 w-4 text-neutral" />
                                    {String(currentInvoice?.invoice_id).padStart(5, '0') || 'DRAFT'}
                                </div>

                            </div>
                                <div className='text-[10px] uppercase font-bold text-gray-400 block mb-1'>
                                    {t('invoicing.issue_date', 'Issue Date')}
                                </div>

                                <span className="text-sm font-bold"> {currentInvoice?.issued_at ? format(new Date(currentInvoice.issued_at), "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy")}</span>


                            {/* Date Selection Section (Requested to be above summary) */}
                            <div className="pt-4">
                                <Label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t('invoicing.due_date', 'Due Date')}</Label>
                                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn("w-fit justify-end text-left font-bold", !dueDate && "text-muted-foreground")}
                                        disabled={isIssued}
                                    >
                                        <CalendarIcon className="h-4 w-4 text-primary" />
                                        {dueDate ? format(dueDate, "PPP") : <span>{t('invoicing.pick_date', 'Pick a date')}</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar
                                        mode="single"
                                        className='bg-white'
                                        disabled={
                                            (date) => {
                                                const min = currentInvoice?.issued_at ? new Date(currentInvoice.issued_at) : new Date();
                                                min.setHours(0, 0, 0, 0);
                                                const d = new Date(date);
                                                d.setHours(0, 0, 0, 0);
                                                return d < min;
                                            }
                                        }
                                        selected={dueDate ?? undefined}
                                        onSelect={(date) => {
                                            if (date) {
                                                setDueDate(date);
                                                setIsCalendarOpen(false);
                                            }
                                        }}

                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Package className="h-5 w-5 text-primary" />
                                {t('invoicing.summary', 'Invoice Summary')}
                            </h3>
                            {!isIssued && (
                                <div className="flex gap-2">
                                    <Button size="sm" variant="default" onClick={() => setIsInventoryModalOpen(true)} >
                                        <PlusCircle className="h-4 w-4  text-white" /> {t('invoicing.add_item', 'Add Item')}
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        {/* Fees & Terms */}
                        <div className="space-y-8">
                            <div>
                                <h3 className="font-bold text-lg flex items-center gap-2 mb-4">
                                    <PlusCircle className="h-5 w-5 text-primary" />
                                    {t('invoicing.add_ons', 'Fees & Discounts')}
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs">{t('invoicing.shipping_fee', 'Shipping Fee')}</Label>
                                        <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={shippingFeeInput}
                                            onChange={(e) => handleNumberInputChange(setShippingFeeInput, e.target.value)}
                                            onBlur={() => normalizeNumberInput(shippingFeeInput, setShippingFeeInput)}
                                            disabled={isIssued}
                                            className="font-medium"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">{t('invoicing.installation_fee', 'Installation Fee')}</Label>
                                        <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={installationFeeInput}
                                            onChange={(e) => handleNumberInputChange(setInstallationFeeInput, e.target.value)}
                                            onBlur={() => normalizeNumberInput(installationFeeInput, setInstallationFeeInput)}
                                            disabled={isIssued}
                                            className="font-medium"
                                        />
                                    </div>
                                    <div className="space-y-2 col-span-2">
                                        <Label className="text-xs">{t('invoicing.discount', 'Discount (%)')}</Label>
                                        <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={discountPercentInput}
                                            onChange={(e) => handleNumberInputChange(setDiscountPercentInput, e.target.value)}
                                            onBlur={() => normalizeNumberInput(discountPercentInput, setDiscountPercentInput, { clampMax: 100 })}
                                            disabled={isIssued}
                                            className="font-medium"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-6 border-t">
                                <div className="flex items-center justify-between">
                                    <Label className="font-bold text-lg">{t('invoicing.terms_title', 'Terms & Conditions')}</Label>
                                    <div className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded-md">
                                        <Switch
                                            checked={customTermsEnabled}
                                            onCheckedChange={(v) => {
                                                setCustomTermsEnabled(v);
                                                if (v && !customTerms) {
                                                    setCustomTerms(generateDefaultTerms());
                                                }
                                            }}
                                            disabled={isIssued}
                                        />
                                        <span className="text-xs font-bold">{t('invoicing.enable_custom_terms', 'Custom')}</span>
                                    </div>
                                </div>
                                {customTermsEnabled ? (
                                    <Textarea
                                        placeholder={t('invoicing.custom_terms_ph', 'Enter terms...')}
                                        value={customTerms}
                                        onChange={(e) => setCustomTerms(e.target.value)}
                                        className="h-40 font-mono text-sm leading-relaxed"
                                        disabled={isIssued}
                                    />
                                ) : (
                                    <div className="p-4 bg-gray-50 border rounded-md h-40 overflow-y-auto font-mono text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                        {generateDefaultTerms()}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Grand Total & Confirmation */}
                        <div className="bg-gray-50 p-8 rounded-2xl border border-primary-gray flex flex-col h-fit sticky top-24">
                            <div className="space-y-4 mb-8 text-primary">
                                <div className="flex justify-between text-base">
                                    <span className="font-medium">{t('invoicing.subtotal', 'Subtotal')}</span>
                                    <span className="font-bold">{subtotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-base">
                                    <span className="font-medium">{t('invoicing.shipping_fee', 'Shipping')}</span>
                                        <span className="font-bold">+ {shippingFee.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-base">
                                        <span className="font-medium">{t('invoicing.installation_fee', 'Installation')}</span>
                                        <span className="font-bold">+ {installationFee.toLocaleString()}</span>
                                    </div>

                                    <div className="flex justify-between text-base text-red-600">
                                        <span className="font-medium">{t('invoicing.discount', 'Discount')}</span>
                                        <span className="font-bold">- {discountAmount.toLocaleString()}</span>
                                    </div>

                                <div className="pt-6 border-t border-primary flex justify-between text-3xl font-black text-primary">
                                    <span>Total</span>
                                    <span>{grandTotal.toLocaleString()}</span>
                                </div>
                            </div>

                            {!isIssued ? (
                                <HoldToConfirmButton
                                    // onConfirm={handleIssue}
                                    onConfirm={
                                        () => {
                                            console.log(currentInvoice)
                                        }
                                    }
                                    variant="default"
                                    className="bg-primary h-14 text-xl font-bold"
                                    confirmationLabel={t('invoicing.issuing', 'Issuing...')}
                                >
                                    {t('invoicing.confirm_issue', 'Confirm & Issue')}
                                </HoldToConfirmButton>
                            ) : (
                                <div className="p-6 bg-green-100 text-green-800 border border-green-200 rounded-xl flex items-center gap-4">
                                    <FileText className="h-8 w-8" />
                                    <div>
                                        <p className="font-black text-lg leading-none mb-1">{t('invoicing.issued', 'Invoice Issued')}</p>
                                        <p className="text-sm opacity-80">{format(new Date(currentInvoice.issued_at!), "PPP")}</p>
                                    </div>
                                </div>
                            )}

                            <p className="text-[13px] text-muted-foreground mt-6 text-start flex flex-row">

                                <Info className="h-3 w-3 inline me-1 mt-0.5" />
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
