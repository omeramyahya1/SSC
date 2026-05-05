import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
    ArrowLeft,
    ArrowRight,
    Trash2,
    FileText,
    Printer,
    Calendar as CalendarIcon,
    Info,
    PlusCircle,
    Package,
    MapPin,
    Mail,
    Phone,
    Hash,
    Settings,
    Download,
    ChevronDown,
    Table as TableIcon,
    FileSpreadsheet
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { toast } from 'react-hot-toast';
import { cn, formatCurrency } from '@/lib/utils';
import { useLocationData } from '@/hooks/useLocationData';
import { useInvoiceStore, InvoiceDetails } from '@/store/useInvoiceStore';
import { useProjectComponentStore, ProjectComponent } from '@/store/useProjectComponentStore';
import { useUserStore, User } from '@/store/useUserStore';
import { InventorySelectorModal } from '../components selection/InventorySelectorModal';
import { HoldToConfirmButton } from '@/components/ui/HoldToConfirmButton';
import { InventoryItem } from '@/store/useInventoryStore';
import { Project } from '@/store/useProjectStore';
import { useSystemConfigurationStore } from '@/store/useSystemConfigurationStore';
import { SystemConfigSummary } from './SystemConfigSummary';
import api from '@/api/client';

// Tauri API imports
// Using global window.__TAURI__ if available, or direct imports if using @tauri-apps/api
const tauriDialog = (window as any).__TAURI__?.dialog;
const tauriFs = (window as any).__TAURI__?.fs;

interface InvoiceEditorProps {
    project: Project;
    User?: User | null;
    onBack: () => void;
}

export function InvoiceEditor({ project, User,onBack }: InvoiceEditorProps) {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const resolvedUser = useMemo(() => User ?? currentUser, [User, currentUser]);
    const { getClimateDataForCity } = useLocationData();
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

    const {
        systemConfiguration,
        fetchSystemConfiguration
    } = useSystemConfigurationStore();

    const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    // Print Settings
    const [isPlainMode, setIsPlainMode] = useState(false);
    const [topMargin, setTopMargin] = useState(0);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isExporting, setIsExporting] = useState<string | null>(null);

    // Local-only state for fees/discount/date/terms
    const [dueDate, setDueDate] = useState<Date | null>(new Date());
    const [shippingFeeInput, setShippingFeeInput] = useState('0');
    const [installationFeeInput, setInstallationFeeInput] = useState('0');
    const [discountPercentInput, setDiscountPercentInput] = useState('0');
    const [customTermsEnabled, setCustomTermsEnabled] = useState(false);
    const [customTerms, setCustomTerms] = useState('');

    // Load initial data
    useEffect(() => {
        fetchComponents(project.uuid);
        fetchSystemConfiguration(project.uuid);
        fetchInvoiceByProject(project.uuid).then((invoice) => {
            if (invoice) {
                const details = invoice.invoice_details;
                setShippingFeeInput(String(details.shipping_fee ?? 0));
                setInstallationFeeInput(String(details.installation_fee ?? 0));
                setDiscountPercentInput(String(details.discount_percent ?? 0));
                setDueDate(details.due_date ? new Date(details.due_date) : new Date());
                setCustomTermsEnabled(!!details.enable_custom_terms);
                setCustomTerms(details.terms_and_conditions || '');
                return;
            }

            if (resolvedUser?.uuid) {
                const initialDetails: InvoiceDetails = {
                    shipping_fee: 0,
                    installation_fee: 0,
                    discount_percent: 0,
                    enable_custom_terms: false,
                    terms_and_conditions: '',
                    due_date: new Date().toISOString()
                };
                setShippingFeeInput('0');
                setInstallationFeeInput('0');
                setDiscountPercentInput('0');
                setDueDate(new Date(initialDetails.due_date!));
                setCustomTermsEnabled(false);
                setCustomTerms('');
                createInvoice({
                    project_uuid: project.uuid,
                    user_uuid: resolvedUser.uuid,
                    status: 'pending',
                    invoice_details: initialDetails
                });
            }

        });
    }, [project.uuid, resolvedUser, fetchComponents, fetchInvoiceByProject, createInvoice, fetchSystemConfiguration]);

    const toNumber = (value: string) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const formatProjectLocation = (location: string | null) => {
        if (!location) return '';
        const [city, state] = location.split(',').map(s => s.trim());
        const locationData = getClimateDataForCity(city, state);

        if (i18n.language === 'ar' && locationData) {
            return `${locationData.city_ar}, ${locationData.state_ar}`;
        }

        return [city, state].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
    };

    const displayLocation = formatProjectLocation(project.project_location ?? null);

    const shippingFee = useMemo(() => toNumber(shippingFeeInput), [shippingFeeInput]);
    const installationFee = useMemo(() => toNumber(installationFeeInput), [installationFeeInput]);
    const discountPercent = useMemo(() => toNumber(discountPercentInput), [discountPercentInput]);

    const isIssued = Boolean(currentInvoice?.issued_at);

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

        return (i18n.dir() === "ltr") ? (
                    `- Payment Terms: Payment is due within 7 days of the invoice date.\n` +
                    `- Validity: This quotation is valid until ${validityDate}.\n` +
                    `- Discount: A ${discount}% discount has been applied.\n` +
                    `- Additional Costs: Any additional costs after the invoice issuance will be quoted separately.`
        ) : (
                    `- شروط الدفع: يستحق الدفع خلال 7 أيام من تاريخ الفاتورة.\n` +
                    `- الصلاحية: هذا العرض صالح حتى ${validityDate}.\n` +
                    `- الخصم: تم تطبيق خصم بنسبة ${discount}%.\n` +
                    `- تكاليف إضافية: سيتم تسعير أي تكاليف إضافية بعد إصدار الفاتورة بشكل منفصل.`

        )
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

    const handleSaveInvoice = async () => {
        if (!resolvedUser?.uuid || !currentInvoice) return;
        const details: InvoiceDetails = {
            shipping_fee: shippingFee,
            installation_fee: installationFee,
            discount_percent: discountPercent,
            due_date: dueDate ? dueDate.toISOString() : undefined,
            enable_custom_terms: customTermsEnabled,
            terms_and_conditions: customTermsEnabled ? customTerms : generateDefaultTerms()
        };
        await updateInvoice(currentInvoice.uuid, {
            invoice_details: details,
            amount: grandTotal
        });
    };

    const handleIssue = useCallback(async () => {
        if (!resolvedUser?.uuid) {
            toast.error(t('invoicing.error_no_user', 'User not authenticated.'));
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

        try {
            let invoice = currentInvoice;
            if (!invoice) {
                const created = await createInvoice({
                    project_uuid: project.uuid,
                    user_uuid: resolvedUser.uuid,
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
            await issueInvoice(invoice.uuid, resolvedUser.uuid);
            toast.success(t('invoicing.issue_success', 'Invoice issued successfully!'));
        } catch (e: any) {
            toast.error(e.message || t('invoicing.issue_error', 'Failed to issue invoice.'));
        }

    }, [currentInvoice, resolvedUser, shippingFee, installationFee, discountPercent, dueDate, customTermsEnabled, customTerms, generateDefaultTerms, grandTotal, t, updateInvoice, issueInvoice, createInvoice, project.uuid]);

    const handlePrint = () => {
        window.print();
    };

    const sanitizeFileName = (name: string) => {
        // Replace characters that are invalid on Windows/macOS/Linux filesystems.
        // Also strip ASCII control characters.
        return name
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const writeBinaryFileCompat = async (path: string, data: Uint8Array) => {
        const fsApi: any = tauriFs;
        if (!fsApi) throw new Error('Tauri FS API not available');

        if (typeof fsApi.writeBinaryFile === 'function') {
            return await fsApi.writeBinaryFile(path, data);
        }

        // Some Tauri setups expose `writeFile` instead (often taking an object payload).
        if (typeof fsApi.writeFile === 'function') {
            try {
                return await fsApi.writeFile({ path, contents: data });
            } catch {
                return await fsApi.writeFile(path, data);
            }
        }

        throw new Error('Tauri FS write method not available');
    };

    const extractExportErrorMessage = async (e: any) => {
        const fallback = t('invoicing.export_error', 'Failed to export file.');

        const maybeBlob: unknown = e?.response?.data;
        if (typeof Blob !== 'undefined' && maybeBlob instanceof Blob) {
            try {
                const text = await maybeBlob.text();
                try {
                    const json = JSON.parse(text);
                    return json?.error || json?.message || fallback;
                } catch {
                    return text || fallback;
                }
            } catch {
                return fallback;
            }
        }

        return e?.response?.data?.error || e?.message || fallback;
    };

    const handleExport = async (type: 'pdf' | 'excel' | 'csv') => {
        setIsExporting(type);
        try {
            await handleSaveInvoice();
            const rawFileName = `${project.customer?.full_name || 'Invoice'}_${type.toUpperCase()}_${format(new Date(), 'yyyy-MM-dd')}.${type === 'excel' ? 'xlsx' : type}`;
            const fileName = sanitizeFileName(rawFileName);

            const response = await api.get(`/export/${type === 'excel' ? 'excel' : type}/${project.uuid}`, {
                params: type === 'pdf' ? { lang: i18n.language } : {},
                responseType: 'blob'
            });

            const blob = response.data;

            // 1) Save/download the file first (don't block file delivery on DB upsert)
            if (tauriDialog && tauriFs) {
                const savePath = await tauriDialog.save({
                    defaultPath: fileName,
                    filters: [{ name: type.toUpperCase(), extensions: [type === 'excel' ? 'xlsx' : type] }]
                });

                if (!savePath) {
                    toast.error(t('invoicing.export_cancelled', 'Export cancelled.'));
                    return;
                }

                const uint8Array = new Uint8Array(await blob.arrayBuffer());
                await writeBinaryFileCompat(savePath, uint8Array);
                toast.success(t('invoicing.export_success', 'File saved successfully!'));
            } else {
                // Fallback to browser download if not in Tauri
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
                toast.success(t('invoicing.export_success', 'File exported successfully!'));
            }

            // 2) Best-effort: store in Documents table for in-app access/sync.
            try {
                const base64data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = (reader.result as string).split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });

                await api.post('/documents/upsert', {
                    project_uuid: project.uuid,
                    doc_type: type === 'pdf' ? 'Invoice' : 'Project Breakdown',
                    file_name: fileName,
                    file_blob: base64data
                });
            } catch (upsertErr: any) {
                console.error("Document upsert failed (export still succeeded):", upsertErr);
                toast.error(t('invoicing.export_doc_save_failed', 'File exported, but failed to save in Documents.'));
            }
        } catch (e: any) {
            console.error("Export failed:", e);
            toast.error(await extractExportErrorMessage(e));
        } finally {
            setIsExporting(null);
        }
    };

    if (isInvoiceLoading && !currentInvoice) {
        return <div className="flex flex-col items-center justify-center h-full"><Spinner className="w-12 h-12" /></div>;
    }

    return (
        <div className="flex flex-col h-full bg-white" dir={i18n.dir()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-20 no-print">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        {i18n.dir() === "ltr"? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                    </Button>
                    <div>
                        <h2 className="text-xl font-bold">{t('invoicing.title', 'Invoice Editor')}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={!!isExporting}>
                                {isExporting ? <Spinner className=" h-4 w-4" /> : <Download className="h-4 w-4 " />}
                                {t('invoicing.export', 'Export')}
                                <ChevronDown className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className='bg-white'>
                            <DropdownMenuItem onClick={() => handleExport('pdf')}>
                                <FileText className=" h-4 w-4" /> PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('excel')}>
                                <FileSpreadsheet className=" h-4 w-4" /> Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('csv')}>
                                <TableIcon className=" h-4 w-4" /> CSV
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="default" size="sm" onClick={() => setIsPreviewOpen(true)}>
                        <Printer className="h-4 w-4" /> {t('common.print', 'Print')}
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-grow" dir={i18n.dir()}>
                <div className="max-w-5xl mx-auto p-8 space-y-10">
                    <div className="space-y-10">
                        {/* Customer & Invoice Info Header */}
                        <div className="flex flex-col md:flex-row justify-between gap-8 pb-8 border-b">
                            {/* Customer Info (Start) */}
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-primary mb-4 flex items-center gap-2">
                                    {project.customer?.full_name || t('dashboard.no_customer', 'Customer')}
                                </h3>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-4 w-4 shrink-0" />
                                    <span className="text-sm font-bold">{t('invoicing.address', 'Address')}: {displayLocation}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Mail className="h-4 w-4 shrink-0" />
                                    <span className="text-sm font-bold">{t('invoicing.email', 'Email')}: {project.customer?.email || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Phone className="h-4 w-4 shrink-0" />
                                    <span className="text-sm font-bold">{t('invoicing.phone_No', 'Phone No')}: {project.customer?.phone_number || 'N/A'}</span>
                                </div>
                            </div>

                            {/* Invoice Metadata (End) */}
                            <div className="md:text-end flex flex-col gap-2">
                                <div className='flex flex-col items-end'>
                                    <span className='w-fit text-[10px] uppercase font-bold text-gray-400 block '>{t('invoicing.invoice_no', 'Invoice No')}</span>
                                    <div className="w-fit h-fit inline-flex items-center text-red-500 text-xl font-mono font-bold">
                                        <Hash className="h-4 w-4 text-neutral" />
                                        {
                                            currentInvoice?.issued_at != null
                                            ? String(currentInvoice.invoice_id).padStart(5, '0')
                                            : (
                                                <span className="text-base">
                                                    {i18n.dir() === 'ltr' ? "PROFORMA" : "فاتورة مبدئية"}
                                                </span>
                                            )
                                        }
                                    </div>

                                </div>
                                <div>
                                    <div className='text-[10px] uppercase font-bold text-gray-400 block mb-1'>
                                        {t('invoicing.issue_date', 'Issue Date')}
                                    </div>
                                    <span className="text-sm font-bold"> {currentInvoice?.issued_at ? format(new Date(currentInvoice.issued_at), "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy")}</span>
                                </div>



                                {/* Date Selection Section (Requested to be above summary) */}
                                <div className="no-print-val">
                                    <Label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t('invoicing.due_date', 'Due Date')}</Label>
                                    {
                                        currentInvoice?.issued_at ? (
                                            <span className="text-sm font-bold">{dueDate ? format(dueDate, "dd/MM/yyyy") : ""}</span>
                                        ) : (
                                             <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn("w-fit justify-end text-left font-bold no-print")}
                                            >
                                                <CalendarIcon className="h-4 w-4 text-primary" />
                                                {dueDate ? format(dueDate, "dd/MM/yyyy") : <span>{t('invoicing.pick_date', 'Pick a date')}</span>}
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
                                        )
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="bg-white rounded-xl border shadow-sm overflow-hidden print:border-none">
                            <div className="p-4 border-b bg-gray-50 flex items-center justify-between no-print">
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
                            <Table className="print:table-fixed">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-start">{t('invoicing.item', 'Item')}</TableHead>
                                        <TableHead className="text-center w-[150px]">{t('invoicing.unit_price', 'Unit Price')}</TableHead>
                                        <TableHead className="text-center w-[120px]">{t('invoicing.quantity', 'Qty')}</TableHead>
                                        <TableHead className="text-end w-[150px]">{t('invoicing.total', 'Total')}</TableHead>
                                        {!isIssued && <TableHead className="w-[50px] no-print"></TableHead>}
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
                                                        className="h-8 font-medium no-print"
                                                        disabled={isIssued}
                                                    />
                                                )}
                                                <span className="font-medium print-only">{c.custom_name}</span>
                                            </TableCell>
                                            <TableCell>
                                                <div className='flex flex-col items-center'>
                                                    {
                                                        isIssued ? (
                                                            <span className='font-bold'>{formatCurrency(c.price_at_sale)}</span>
                                                        ) : (
                                                            <Input
                                                                type="number"
                                                                value={c.price_at_sale || 0}
                                                                onChange={(e) => handleComponentUpdate(c.uuid, { price_at_sale: parseFloat(e.target.value) || 0 })}
                                                                className="h-8 text-center no-print"
                                                                disabled={isIssued}
                                                            />
                                                        )
                                                    }
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className='flex flex-col items-center'>
                                                    {
                                                        isIssued ? (
                                                            <span className='font-bold'>{c.quantity}</span>
                                                        ) : (
                                                            <Input
                                                                type="number"
                                                                value={c.quantity}
                                                                onChange={(e) => handleComponentUpdate(c.uuid, { quantity: parseInt(e.target.value) || 1 })}
                                                                className="h-8 text-center no-print"
                                                                disabled={isIssued}
                                                            />
                                                        )
                                                    }
                                                </div>

                                            </TableCell>
                                            <TableCell className="text-end font-bold">
                                                {formatCurrency((c.price_at_sale || 0) * c.quantity)}
                                            </TableCell>
                                            {!isIssued && (
                                                <TableCell className="no-print">
                                                    <Button variant="ghost" size="icon" onClick={() => removeComponent(c.uuid)}>
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-gray-50/50 print:bg-white">
                                        <TableCell colSpan={3} className="text-end font-semibold">{t('invoicing.subtotal', 'Subtotal')}</TableCell>
                                        <TableCell className="text-end font-bold">{formatCurrency(subtotal)}</TableCell>
                                        {!isIssued && <TableCell className="no-print" />}
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            {/* Fees & Terms */}
                            <div className="space-y-8">
                                {
                                    currentInvoice?.issued_at ? (
                                        ""
                                    ) : (
                                        <div className="no-print">
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
                                    )
                                }


                                <div className={`space-y-4 ${!currentInvoice?.issued_at && "pt-6 border-t print:border-none"}`}>
                                    <div className="flex items-center justify-between">
                                        <Label className="font-bold text-lg">{t('invoicing.terms_title', 'Terms & Conditions')}</Label>
                                        { !currentInvoice?.issued_at &&
                                            <div className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded-md no-print">
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
                                        }
                                    </div>
                                    {customTermsEnabled && !currentInvoice?.issued_at ? (
                                                <Textarea
                                                    placeholder={t('invoicing.custom_terms_ph', 'Enter terms...')}
                                                    value={customTerms}
                                                    onChange={(e) => setCustomTerms(e.target.value)}
                                                    className="h-40 font-mono text-sm leading-relaxed no-print"
                                                    disabled={isIssued}
                                                />
                                    ) : (
                                        <div
                                            className={`${!currentInvoice?.issued_at? "p-4 bg-gray-50 border rounded-md h-40 overflow-y-auto font-mono text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap print:border-none print:bg-white print:h-auto print:p-0" : "font-bold font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap text-[16px]"}`}
                                        >
                                            {generateDefaultTerms()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Grand Total & Confirmation */}
                            <div className="bg-gray-50 p-8 rounded-2xl border border-primary-gray flex flex-col h-fit sticky top-24 print:static print:border-none print:bg-white print:p-0">
                                <div className="space-y-4 mb-8 text-primary print:mb-0">
                                    <div className="flex justify-between text-base">
                                        <span className="font-medium">{t('invoicing.subtotal', 'Subtotal')}</span>
                                        <span className="font-bold">{formatCurrency(subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-base">
                                        <span className="font-medium">{t('invoicing.shipping_fee', 'Shipping')}</span>
                                            <span className="font-bold">+ {formatCurrency(shippingFee)}</span>
                                        </div>
                                        <div className="flex justify-between text-base">
                                            <span className="font-medium">{t('invoicing.installation_fee', 'Installation')}</span>
                                            <span className="font-bold">+ {formatCurrency(installationFee)}</span>
                                        </div>

                                        <div className="flex justify-between text-base text-red-600">
                                            <span className="font-medium">{t('invoicing.discount', 'Discount')}</span>
                                            <span className="font-bold">- {formatCurrency(discountAmount)}</span>
                                        </div>

                                    <div className="pt-6 border-t border-primary-gray flex justify-between text-3xl font-black text-primary print:text-xl">
                                        <span>Total</span>
                                        <span>{formatCurrency(grandTotal)}</span>
                                    </div>
                                </div>

                                {!isIssued ? (
                                    <HoldToConfirmButton
                                        onConfirm={handleIssue}
                                        variant="default"
                                        className="bg-primary h-14 text-xl font-bold no-print"
                                        confirmationLabel={t('invoicing.issuing', 'Issuing...')}
                                    >
                                        {t('invoicing.confirm_issue', 'Confirm & Issue')}
                                    </HoldToConfirmButton>
                                ) : (
                                    <div className="px-4 py-4 bg-green-100 text-green-800 border border-green-200 rounded-xl flex items-center gap-4 no-print">
                                        <FileText className="h-14 w-14" />
                                        <div>
                                            <p className="font-black text-lg leading-none mb-1">{t('invoicing.issued', 'Invoice Issued')}</p>
                                            <p className="text-sm opacity-80">{format(new Date(currentInvoice?.issued_at!), "PPP")}</p>
                                            <p className="text-sm opacity-80">{t('invoicing.issued_by', "by") + ": " + (resolvedUser?.username || t('common.unknown', 'Unknown'))}</p>
                                        </div>
                                    </div>
                                )}

                                {!currentInvoice?.issued_at &&
                                    <p className="text-[13px] text-muted-foreground mt-6 text-start flex flex-row no-print">
                                        <Info className="h-3 w-3 inline me-1 mt-0.5" />
                                        {t('invoicing.issue_disclaimer', 'Issuing an invoice will deduct items from inventory and finalize prices.')}
                                    </p>
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            {/* Print Preview Modal */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-[850px] h-[95vh] flex flex-col p-0 overflow-hidden bg-gray-100">
                    <DialogHeader className="p-4 bg-white border-b flex flex-row items-center justify-between no-print">
                        <DialogTitle className="text-xl font-bold">
                            {t('invoicing.print_preview', 'Print Preview')}
                        </DialogTitle>
                        <div className="flex items-center gap-4">
                            {/* Settings inside Preview */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Settings className="h-4 w-4 " /> {t('invoicing.settings', 'Settings')}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-4 space-y-4 bg-white" align="end">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="preview-plain-mode" className="font-bold">{t('invoicing.plain_mode', 'Plain Mode (Data Only)')}</Label>
                                        <Switch id="preview-plain-mode" checked={isPlainMode} onCheckedChange={setIsPlainMode} />
                                    </div>
                                    {isPlainMode && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label className="text-xs font-bold">{t('invoicing.top_margin', 'Top Margin Offset')}</Label>
                                                <span className="text-xs font-mono">{topMargin}mm</span>
                                            </div>
                                            <Slider
                                                value={[topMargin]}
                                                onValueChange={([v]) => setTopMargin(v)}
                                                max={100}
                                                step={1}
                                            />
                                        </div>
                                    )}
                                </PopoverContent>
                            </Popover>

                            <Button size="sm" onClick={handlePrint} className="me-10">
                                <Printer className="h-4 w-4 " /> {t('common.print', 'Print')}
                            </Button>
                        </div>
                    </DialogHeader>

                    <ScrollArea className="flex-grow p-8 bg-gray-200">
                        {/* A4 Document Wrapper */}
                        <div
                            className={cn(
                                "bg-white mx-auto shadow-2xl transition-all duration-300 origin-top",
                                isPlainMode && "plain-print-preview"
                            )}
                            style={{
                                width: '210mm',
                                minHeight: '297mm',
                                padding: '15mm',
                                paddingTop: isPlainMode ? `${15 + topMargin}mm` : '15mm'
                            }}
                        >
                            {/* Invoice Content */}
                            <div className="space-y-10">
                                {/* Header with icons and full details */}
                                <div className="flex flex-col md:flex-row justify-between gap-8 pb-8 border-b">
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-black text-primary mb-4 flex items-center gap-2">
                                            {project.customer?.full_name || t('dashboard.no_customer', 'Customer')}
                                        </h3>
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <MapPin className="h-4 w-4 shrink-0" />
                                            <span className="text-sm font-bold">{t('invoicing.address', 'Address')}: {displayLocation}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Mail className="h-4 w-4 shrink-0" />
                                            <span className="text-sm font-bold">{t('invoicing.email', 'Email')}: {project.customer?.email || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Phone className="h-4 w-4 shrink-0" />
                                            <span className="text-sm font-bold">{t('invoicing.phone_No', 'Phone No')}: {project.customer?.phone_number || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <div className="md:text-end flex flex-col gap-2">
                                        <div className='flex flex-col items-end'>
                                            <span className='w-fit text-[10px] uppercase font-bold text-gray-400 block '>{t('invoicing.invoice_no', 'Invoice No')}</span>
                                            <div className="w-fit h-fit inline-flex items-center text-red-500 text-xl font-mono font-bold">
                                                <Hash className="h-4 w-4 text-neutral" />
                                                {
                                                    currentInvoice?.issued_at != null
                                                    ? String(currentInvoice.invoice_id).padStart(5, '0')
                                                    : (
                                                        <span className="text-base">
                                                            {i18n.dir() === 'ltr' ? "PROFORMA" : "فاتورة مبدئية"}
                                                        </span>
                                                    )
                                                }
                                            </div>
                                        </div>
                                        <div>
                                            <div className='text-[10px] uppercase font-bold text-gray-400 block mb-1'>
                                                {t('invoicing.issue_date', 'Issue Date')}
                                            </div>
                                            <span className="text-sm font-bold"> {currentInvoice?.issued_at ? format(new Date(currentInvoice.issued_at), "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy")}</span>
                                        </div>
                                        <div>
                                            <div className='text-[10px] uppercase font-bold text-gray-400 block mb-1'>
                                                {t('invoicing.due_date', 'Due Date')}
                                            </div>
                                            <span className="text-sm font-bold">{dueDate ? format(dueDate, "dd/MM/yyyy") : ""}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="bg-white border-b overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="text-start">{t('invoicing.item', 'Item')}</TableHead>
                                                <TableHead className="text-center w-[150px]">{t('invoicing.unit_price', 'Unit Price')}</TableHead>
                                                <TableHead className="text-center w-[120px]">{t('invoicing.quantity', 'Qty')}</TableHead>
                                                <TableHead className="text-end w-[150px]">{t('invoicing.total', 'Total')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {components.map((c) => (
                                                <TableRow key={c.uuid}>
                                                    <TableCell>
                                                        <div>
                                                            <div className="font-medium">{c.item?.name || c.custom_name}</div>
                                                            <div className="text-xs text-muted-foreground">{c.item?.brand} | {c.item?.model}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center font-bold">
                                                        {formatCurrency(c.price_at_sale)}
                                                    </TableCell>
                                                    <TableCell className="text-center font-bold">
                                                        {c.quantity}
                                                    </TableCell>
                                                    <TableCell className="text-end font-bold">
                                                        {formatCurrency((c.price_at_sale || 0) * c.quantity)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="border-t">
                                                <TableCell colSpan={3} className="text-end font-semibold">{t('invoicing.subtotal', 'Subtotal')}</TableCell>
                                                <TableCell className="text-end font-bold">{formatCurrency(subtotal)}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="grid grid-cols-2 gap-12">
                                    <div className="space-y-4">
                                        <Label className="font-bold text-lg">{t('invoicing.terms_title', 'Terms & Conditions')}</Label>
                                        <div className="font-mono text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                            {customTermsEnabled ? customTerms : generateDefaultTerms()}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-base">
                                            <span className="font-medium">{t('invoicing.shipping_fee', 'Shipping')}</span>
                                            <span className="font-bold">+ {formatCurrency(shippingFee)}</span>
                                        </div>
                                        <div className="flex justify-between text-base">
                                            <span className="font-medium">{t('invoicing.installation_fee', 'Installation')}</span>
                                            <span className="font-bold">+ {formatCurrency(installationFee)}</span>
                                        </div>
                                        <div className="flex justify-between text-base text-red-600">
                                            <span className="font-medium">{t('invoicing.discount', 'Discount')}</span>
                                            <span className="font-bold">- {formatCurrency(discountAmount)}</span>
                                        </div>
                                        <div className="pt-4 border-t flex justify-between text-2xl font-black text-primary">
                                            <span>Total</span>
                                            <span>{formatCurrency(grandTotal)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* System Config Page (appended) */}
                                {systemConfiguration && (
                                    <div className="page-break-before pt-10 border-t mt-20">
                                        <SystemConfigSummary data={systemConfiguration.config_items} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={isInventoryModalOpen} onOpenChange={setIsInventoryModalOpen}>
                <InventorySelectorModal
                    onSelect={handleSelectItem}
                />
            </Dialog>

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    /* We only print the PREVIEW container when printing */
                    [role="dialog"] [class*="plain-print-preview"],
                    [role="dialog"] [class*="bg-white mx-auto shadow-2xl"] {
                        visibility: visible !important;
                        position: fixed;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        box-shadow: none !important;
                    }
                    [role="dialog"] [class*="plain-print-preview"] *,
                    [role="dialog"] [class*="bg-white mx-auto shadow-2xl"] * {
                        visibility: visible !important;
                    }
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .page-break-before {
                        break-before: page;
                    }
                }

                /* Plain Mode Styling for Preview Modal */
                .plain-print-preview * {
                    border-color: #000 !important;
                    background-color: transparent !important;
                    color: black !important;
                    box-shadow: none !important;
                    fill: black !important;
                }
                .plain-print-preview svg {
                    stroke: black !important;
                }
                .plain-print-preview .text-primary,
                .plain-print-preview .text-blue-600,
                .plain-print-preview .text-orange-500,
                .plain-print-preview .text-yellow-500,
                .plain-print-preview .text-green-500 {
                    color: black !important;
                }
                /* Exceptions for Plain Mode: RED */
                .plain-print-preview .text-red-500,
                .plain-print-preview .text-red-600 {
                    color: #ef4444 !important;
                }
                .plain-print-preview .font-mono.font-bold.text-red-500 {
                    color: #ef4444 !important;
                }
            `}} />
        </div>
    );
}
