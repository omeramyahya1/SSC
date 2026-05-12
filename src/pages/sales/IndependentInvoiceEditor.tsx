import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarIcon,
  ChevronDown,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Hash,
  Info,
  Mail,
  MapPin,
  Phone,
  PlusCircle,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import api from "@/api/client";
import { cn, formatCurrency } from "@/lib/utils";
import { useInvoiceStore, InvoiceDetails } from "@/store/useInvoiceStore";
import { Customer } from "@/store/useCustomerStore";
import { User } from "@/store/useUserStore";
import { InventoryItem } from "@/store/useInventoryStore";
import { InventorySelectorModal } from "@/pages/dashboard/components selection/InventorySelectorModal";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoldToConfirmButton } from "@/components/ui/HoldToConfirmButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useLocationData } from "@/hooks/useLocationData";

interface IndependentInvoiceEditorProps {
  invoiceUuid: string;
  user: User | null | undefined;
  onBack: () => void;
}

type ManualItem = { id: string; name: string; quantity: number; price: number };
type InventoryLineItem = {
  id: string;
  item_uuid: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  quantity: number;
  unit_price: number;
};

export function IndependentInvoiceEditor({ invoiceUuid, user, onBack }: IndependentInvoiceEditorProps) {
  const { t, i18n } = useTranslation();
  const { currentInvoice, fetchInvoice, updateInvoice, issueInvoice, isLoading } = useInvoiceStore();
  const { getClimateDataForCity } = useLocationData();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryLineItem[]>([]);

  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [dueDate, setDueDate] = useState<Date | null>(new Date());
  const [shippingFeeInput, setShippingFeeInput] = useState("0");
  const [installationFeeInput, setInstallationFeeInput] = useState("0");
  const [discountPercentInput, setDiscountPercentInput] = useState("0");
  const [customTermsEnabled, setCustomTermsEnabled] = useState(false);
  const [customTerms, setCustomTerms] = useState("");

  const [topMargin, setTopMargin] = useState(0);
  const [bottomMargin, setBottomMargin] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceUuid) return;
    fetchInvoice(invoiceUuid);
  }, [invoiceUuid, fetchInvoice]);

  useEffect(() => {
    if (!currentInvoice || currentInvoice.uuid !== invoiceUuid) return;

    const details = currentInvoice.invoice_details || ({} as InvoiceDetails);
    setShippingFeeInput(String(details.shipping_fee ?? 0));
    setInstallationFeeInput(String(details.installation_fee ?? 0));
    setDiscountPercentInput(String(details.discount_percent ?? 0));
    setDueDate(details.due_date ? new Date(details.due_date) : new Date());
    setCustomTermsEnabled(!!details.enable_custom_terms);
    setCustomTerms(details.terms_and_conditions || "");

    setManualItems(currentInvoice.invoice_items?.manual || []);
    setInventoryItems(currentInvoice.invoice_items?.inventory || []);

    const customerUuid = (details as any)?.customer_uuid;
    if (!customerUuid) return;
    api
      .get<Customer>(`/customers/${customerUuid}`)
      .then(({ data }) => setCustomer(data))
      .catch(() => setCustomer(null));
  }, [currentInvoice, invoiceUuid]);

  const isIssued = Boolean(currentInvoice?.issued_at);
  const projectLocation = (currentInvoice?.invoice_details as any)?.project_location || "";

  const handleNumberInputChange = (setter: (value: string) => void, rawValue: string) => {
    if (!/^\d*\.?\d*$/.test(rawValue)) return;
    setter(rawValue);
  };

  const normalizeNumberInput = (
    value: string,
    setter: (value: string) => void,
    { clampMax }: { clampMax?: number } = {}
  ) => {
    let numeric = value === "" ? 0 : Number(value);
    if (Number.isNaN(numeric)) numeric = 0;
    if (typeof clampMax === "number") numeric = Math.min(clampMax, Math.max(0, numeric));
    setter(String(numeric));
  };

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

  const displayLocation = formatProjectLocation(projectLocation);

  const shippingFee = useMemo(() => toNumber(shippingFeeInput), [shippingFeeInput]);
  const installationFee = useMemo(() => toNumber(installationFeeInput), [installationFeeInput]);
  const discountPercent = useMemo(() => toNumber(discountPercentInput), [discountPercentInput]);

  const subtotal = useMemo(() => {
    const manualSubtotal = (manualItems || []).reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0
    );
    const inventorySubtotal = (inventoryItems || []).reduce(
      (sum, item) => sum + (item.unit_price || 0) * (item.quantity || 0),
      0
    );
    return manualSubtotal + inventorySubtotal;
  }, [manualItems, inventoryItems]);

  const discountAmount = useMemo(() => (subtotal * discountPercent) / 100, [subtotal, discountPercent]);
  const grandTotal = useMemo(
    () => subtotal + shippingFee + installationFee - discountAmount,
    [subtotal, shippingFee, installationFee, discountAmount]
  );

  const generateDefaultTerms = useCallback(() => {
    const validityDate = dueDate ? format(dueDate, "dd/MM/yyyy") : "dd/mm/yyyy";
    const discount = discountPercent;

    if (i18n.dir() === "ltr") {
      return [
        `- Payment Terms: Payment is due within 7 days of the invoice date.`,
        `- Validity: This quotation is valid until ${validityDate}.`,
        `- Discount: A ${discount}% discount has been applied.`,
        `- Additional Costs: Any additional costs after the invoice issuance will be quoted separately.`,
      ].join("\n");
    }

    return [
      `- شروط الدفع: يستحق الدفع خلال 7 أيام من تاريخ الفاتورة.`,
      `- الصلاحية: هذا العرض صالح حتى ${validityDate}.`,
      `- الخصم: تم تطبيق خصم بنسبة ${discount}%.`,
      `- تكاليف إضافية: سيتم تسعير أي تكاليف إضافية بعد إصدار الفاتورة بشكل منفصل.`,
    ].join("\n");
  }, [dueDate, discountPercent, i18n]);

  const handleAddManualItem = () => {
    setManualItems((prev) => [...(prev || []), { id: crypto.randomUUID(), name: "", quantity: 1, price: 1 }]);
  };

  const updateManualItem = (id: string, updates: Partial<Pick<ManualItem, "name" | "quantity" | "price">>) => {
    setManualItems((prev) => (prev || []).map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeManualItem = (id: string) => {
    setManualItems((prev) => (prev || []).filter((item) => item.id !== id));
  };

  const handleSelectInventoryItem = (item: InventoryItem) => {
    setInventoryItems((prev) => [
      ...(prev || []),
      {
        id: crypto.randomUUID(),
        item_uuid: item.uuid,
        name: item.name,
        brand: item.brand,
        model: item.model,
        quantity: 1,
        unit_price: Number(item.sell_price || 0),
      },
    ]);
    setIsInventoryModalOpen(false);
    toast.success(t("components.item_added", "Item added."));
  };

  const updateInventoryItem = (id: string, updates: Partial<Pick<InventoryLineItem, "quantity" | "unit_price">>) => {
    setInventoryItems((prev) => (prev || []).map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeInventoryItem = (id: string) => {
    setInventoryItems((prev) => (prev || []).filter((item) => item.id !== id));
  };

  const handleSaveInvoice = async () => {
    if (!currentInvoice) return;
    const details: InvoiceDetails = {
      shipping_fee: shippingFee,
      installation_fee: installationFee,
      discount_percent: discountPercent,
      due_date: dueDate ? dueDate.toISOString() : undefined,
      enable_custom_terms: customTermsEnabled,
      terms_and_conditions: customTermsEnabled ? customTerms : generateDefaultTerms(),
      customer_uuid: (currentInvoice.invoice_details as any)?.customer_uuid,
      project_location: (currentInvoice.invoice_details as any)?.project_location,
    };
    await updateInvoice(currentInvoice.uuid, {
      invoice_details: details,
      invoice_items: { manual: manualItems, inventory: inventoryItems },
      amount: grandTotal,
    });
  };

  // Tauri compat (copied from InvoiceEditor)
  const tauriDialog = (window as any).__TAURI__?.dialog;
  const tauriFs = (window as any).__TAURI__?.fs;

  const sanitizeFileName = (name: string) => {
    return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
  };

  const writeBinaryFileCompat = async (path: string, data: Uint8Array) => {
    const fsApi: any = tauriFs;
    if (!fsApi) throw new Error("Tauri FS API not available");

    if (typeof fsApi.writeBinaryFile === "function") {
      return await fsApi.writeBinaryFile(path, data);
    }

    if (typeof fsApi.writeFile === "function") {
      try {
        return await fsApi.writeFile({ path, contents: data });
      } catch {
        return await fsApi.writeFile(path, data);
      }
    }

    throw new Error("Tauri FS write method not available");
  };

  const extractExportErrorMessage = async (e: any) => {
    const fallback = t("invoicing.export_error", "Failed to export file.");
    const maybeBlob: unknown = e?.response?.data;
    if (typeof Blob !== "undefined" && maybeBlob instanceof Blob) {
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

  const handleExport = async (type: "pdf" | "excel" | "csv") => {
    if (!currentInvoice?.uuid) return;
    setIsExporting(type);
    try {
      await handleSaveInvoice();
      const rawFileName = `${customer?.full_name || "Invoice"}_${type.toUpperCase()}_${format(new Date(), "yyyy-MM-dd")}.${
        type === "excel" ? "xlsx" : type
      }`;
      const fileName = sanitizeFileName(rawFileName);

      const pdfMarginParams = type === "pdf" ? { top_mm: topMargin, bottom_mm: bottomMargin } : {};
      const response = await api.get(`/export/${type === "excel" ? "excel" : type}/invoice/${currentInvoice.uuid}`, {
        params: type === "pdf" ? { lang: i18n.language, ...pdfMarginParams } : {},
        responseType: "blob",
      });

      const blob = response.data;
      if (tauriDialog && tauriFs) {
        const savePath = await tauriDialog.save({
          defaultPath: fileName,
          filters: [{ name: type.toUpperCase(), extensions: [type === "excel" ? "xlsx" : type] }],
        });
        if (!savePath) {
          toast.error(t("invoicing.export_cancelled", "Export cancelled."));
          return;
        }
        const uint8Array = new Uint8Array(await blob.arrayBuffer());
        await writeBinaryFileCompat(savePath, uint8Array);
        toast.success(t("invoicing.export_success", "File saved successfully!"));
      } else {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      toast.error(await extractExportErrorMessage(e));
    } finally {
      setIsExporting(null);
    }
  };

  const handleIssue = useCallback(async () => {
    if (!user?.uuid) {
      toast.error(t("invoicing.error_no_user", "User not authenticated."));
      return;
    }
    if (!currentInvoice) {
      toast.error(t("invoicing.error_no_invoice", "Failed to load invoice."));
      return;
    }

    const details: InvoiceDetails = {
      shipping_fee: shippingFee,
      installation_fee: installationFee,
      discount_percent: discountPercent,
      due_date: dueDate ? dueDate.toISOString() : undefined,
      enable_custom_terms: customTermsEnabled,
      terms_and_conditions: customTermsEnabled ? customTerms : generateDefaultTerms(),
      customer_uuid: (currentInvoice.invoice_details as any)?.customer_uuid,
      project_location: (currentInvoice.invoice_details as any)?.project_location,
    };

    try {
      await updateInvoice(currentInvoice.uuid, {
        invoice_details: details,
        invoice_items: { manual: manualItems, inventory: inventoryItems },
        amount: grandTotal,
      });
      await issueInvoice(currentInvoice.uuid, user.uuid);
      toast.success(t("invoicing.issue_success", "Invoice issued successfully!"));
    } catch (e: any) {
      toast.error(e.message || t("invoicing.issue_error", "Failed to issue invoice."));
    }
  }, [
    user?.uuid,
    currentInvoice,
    shippingFee,
    installationFee,
    discountPercent,
    dueDate,
    updateInvoice,
    issueInvoice,
    grandTotal,
    manualItems,
    inventoryItems,
    customTermsEnabled,
    customTerms,
    generateDefaultTerms,
    t,
  ]);

  if (isLoading && !currentInvoice) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Spinner className="w-12 h-12" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white" dir={i18n.dir()}>
      <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-20 no-print">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            {i18n.dir() === "ltr" ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
          </Button>
          <div>
            <h2 className="text-xl font-bold">{t("invoicing.title", "Invoice Editor")}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu dir={i18n.dir()}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!!isExporting}>
                {isExporting ? <Spinner className=" h-4 w-4" /> : <Download className="h-4 w-4 " />}
                {t("invoicing.export", "Export")}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white">
              <DropdownMenuItem onClick={() => setIsPreviewOpen(true)}>
                <FileText className=" h-4 w-4" /> PDF
              </DropdownMenuItem>
              {currentInvoice?.issued_at && (
                <>
                  <DropdownMenuItem onClick={() => handleExport("excel")}>
                    <FileSpreadsheet className=" h-4 w-4" /> Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    <TableIcon className=" h-4 w-4" /> CSV
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-grow" dir={i18n.dir()}>
        <div className="max-w-5xl mx-auto p-8 space-y-10">
          <div className="flex flex-col md:flex-row justify-between gap-8 pb-8 border-b">
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-primary mb-4 flex items-center gap-2">
                {customer?.full_name || t("dashboard.no_customer", "Customer")}
              </h3>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-sm font-bold">
                  {t("invoicing.address", "Address")}: {displayLocation}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="text-sm font-bold">{t("invoicing.email", "Email")}: {customer?.email || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                <span className="text-sm font-bold">
                  {t("invoicing.phone", "Phone No")}: {customer?.phone_number || "N/A"}
                </span>
              </div>
            </div>

            <div className="md:text-end flex flex-col gap-2">
              <div className="flex flex-col items-end">
                <span className="w-fit text-[10px] uppercase font-bold text-gray-400 block">
                  {t("invoicing.invoice_no", "Invoice No")}
                </span>
                <div className="w-fit h-fit inline-flex items-center text-red-500 text-xl font-mono font-bold">
                  <Hash className="h-4 w-4 text-neutral" />
                  {currentInvoice?.issued_at != null ? String(currentInvoice.invoice_id).padStart(5, "0") : "PROFORMA"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                  {t("invoicing.issue_date", "Issue Date")}
                </div>
                <span className="text-sm font-bold">
                  {currentInvoice?.issued_at ? format(new Date(currentInvoice.issued_at), "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy")}
                </span>
              </div>
              <div className="space-y-3">
              <Label className="text-[10px] uppercase font-bold text-gray-400 block">{t("invoicing.due_date", "Due Date")}</Label>
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
                <PopoverContent className="w-auto p-0 bg-white" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate || undefined}
                    onSelect={(d) => {
                      setDueDate(d || null);
                      setIsCalendarOpen(false);
                    }}
                    disabled={
                          (date) => {
                              const min = currentInvoice?.issued_at ? new Date(currentInvoice.issued_at) : new Date();
                              min.setHours(0, 0, 0, 0);
                              const d = new Date(date);
                              d.setHours(0, 0, 0, 0);
                              return d < min;
                          }
                      }
                  />
                </PopoverContent>
              </Popover>
                )
              }

            </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden print:border-none">
            {!isIssued && (
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between no-print">
                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <ClipboardList className="h-5 w-5 text-primary" />
                                    {t('invoicing.summary', 'Invoice Summary')}
                                </h3>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="default" onClick={() => setIsInventoryModalOpen(true)} className="border-primary text-white" >
                                            <Archive className="h-4 w-4" />{t('invoicing.select_from_inventory', 'Select from Inventory')}
                                        </Button>
                  <Button size="sm" variant="default" onClick={handleAddManualItem}>
                    <PlusCircle className="h-4 w-4 text-white" /> {t("invoicing.add_item", "Add Item")}
                  </Button>
                </div>
              </div>
            )}

            <Table className="print:table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold text-start">{t("invoicing.item", "Item")}</TableHead>
                  <TableHead className="font-bold text-center w-[150px]">{t("invoicing.unit_price", "Unit Price")}</TableHead>
                  <TableHead className="font-bold text-center w-[120px]">{t("invoicing.quantity", "Qty")}</TableHead>
                  <TableHead className="font-bold text-end w-[150px]">{t("invoicing.total", "Total")}</TableHead>
                  {!isIssued && <TableHead className="w-[50px] no-print"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(item.brand || "N/A") + " | " + (item.model || "N/A")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center">
                        {isIssued ? (
                          <span className="font-bold">{formatCurrency(item.unit_price)}</span>
                        ) : (
                          <Input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) => {
                              const p = parseFloat(e.target.value);
                              updateInventoryItem(item.id, { unit_price: Math.max(1, isFinite(p) ? p : 1) });
                            }}
                            min={1}
                            className="h-8 text-center no-print"
                            disabled={isIssued}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center">
                        {isIssued ? (
                          <span className="font-bold">{item.quantity}</span>
                        ) : (
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const q = parseInt(e.target.value, 10);
                              updateInventoryItem(item.id, { quantity: Math.max(1, Number.isFinite(q) ? Math.trunc(q) : 1) });
                            }}
                            className="h-8 text-center no-print"
                            min={1}
                            disabled={isIssued}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-bold">{formatCurrency(item.unit_price * item.quantity)}</TableCell>
                    {!isIssued && (
                      <TableCell className="no-print">
                        <Button variant="ghost" size="icon" onClick={() => removeInventoryItem(item.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}

                {manualItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {isIssued ? (
                        <span>{item.name}</span>
                      ) : (
                        <Input
                          placeholder={t("invoicing.item_name_ph", "Item Name")}
                          value={item.name}
                          onChange={(e) => updateManualItem(item.id, { name: e.target.value })}
                          className="h-8 font-medium no-print"
                          disabled={isIssued}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center">
                        {isIssued ? (
                          <span className="font-bold">{formatCurrency(item.price)}</span>
                        ) : (
                          <Input
                            type="number"
                            value={item.price}
                            onChange={(e) => {
                              const p = parseFloat(e.target.value);
                              updateManualItem(item.id, { price: Math.max(1, isFinite(p) ? p : 1) });
                            }}
                            min={1}
                            className="h-8 text-center no-print"
                            disabled={isIssued}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center">
                        {isIssued ? (
                          <span className="font-bold">{item.quantity}</span>
                        ) : (
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const q = parseInt(e.target.value, 10);
                              updateManualItem(item.id, { quantity: Math.max(1, Number.isFinite(q) ? Math.trunc(q) : 1) });
                            }}
                            min={1}
                            className="h-8 text-center no-print"
                            disabled={isIssued}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-bold">{formatCurrency(item.price * item.quantity)}</TableCell>
                    {!isIssued && (
                      <TableCell className="no-print">
                        <Button variant="ghost" size="icon" onClick={() => removeManualItem(item.id)}>
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
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                const num = parseFloat(val);

                                                // 1. Allow empty input so the user can backspace/clear it
                                                if (val === "") {
                                                  handleNumberInputChange(setDiscountPercentInput, "");
                                                  return;
                                                }

                                                // 2. Only update if the value is a valid number AND <= 100
                                                // This prevents entering 101+, but allows 100 (3 digits)
                                                if (!isNaN(num) && num <= 100) {
                                                  handleNumberInputChange(setDiscountPercentInput, val);
                                                }
                                              }}
                                              onBlur={() =>
                                                normalizeNumberInput(discountPercentInput, setDiscountPercentInput, {
                                                  clampMax: 100,
                                                })
                                              }
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
                                            <span className="font-medium">{t('invoicing.discount_no_percent', 'Discount')}</span>
                                            <span className="font-bold">- {formatCurrency(discountAmount)}</span>
                                        </div>

                                    <div className="pt-6 border-t border-primary-gray flex justify-between text-3xl font-black text-primary print:text-xl">
                                        <span>{t('invoicing.grand_total', 'Total')}</span>
                                        <span className="text-end">{formatCurrency(grandTotal)}</span>
                                    </div>
                                </div>

                                {!isIssued ? (
                                    <HoldToConfirmButton
                                        onConfirm={handleIssue}
                                        variant="default"
                                        className="bg-primary h-14 text-xl font-bold no-print"
                                        disabled={manualItems.length == 0 && inventoryItems.length == 0}
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
                                            <p className="text-sm opacity-80">{t('invoicing.issued_by', "by") + ": " + (user?.username || t('common.unknown', 'Unknown'))}</p>
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
      </ScrollArea>

      <Dialog open={isInventoryModalOpen} onOpenChange={setIsInventoryModalOpen}>
        <InventorySelectorModal onSelect={handleSelectInventoryItem} />
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[900px] bg-white">
          <DialogHeader>
            <DialogTitle>{t("invoicing.print_preview", "Print Preview")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="font-bold">{t("invoicing.margin_top", "Top margin (mm)")}</Label>
                <Slider value={[topMargin]} onValueChange={(v) => setTopMargin(v[0] ?? 0)} max={40} step={1} />
              </div>
              <div className="space-y-2">
                <Label className="font-bold">{t("invoicing.margin_bottom", "Bottom margin (mm)")}</Label>
                <Slider value={[bottomMargin]} onValueChange={(v) => setBottomMargin(v[0] ?? 0)} max={40} step={1} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={async () => {
                  await handleExport("pdf");
                  setIsPreviewOpen(false);
                }}
                disabled={!!isExporting}
              >
                {isExporting === "pdf" ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                {t("invoicing.export_pdf", "Export PDF")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

