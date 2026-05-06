import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { FileText, Hash, Info, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "react-hot-toast";
import { formatCurrency } from "@/lib/utils";
import { HoldToConfirmButton } from "@/components/ui/HoldToConfirmButton";
import api from "@/api/client";
import { useInvoiceStore, InvoiceDetails } from "@/store/useInvoiceStore";
import { Customer } from "@/store/useCustomerStore";
import { User } from "@/store/useUserStore";

interface IndependentInvoiceEditorProps {
  invoiceUuid: string;
  user: User | null | undefined;
  onBack: () => void;
}

export function IndependentInvoiceEditor({ invoiceUuid, user, onBack }: IndependentInvoiceEditorProps) {
  const { t, i18n } = useTranslation();
  const { currentInvoice, fetchInvoice, updateInvoice, issueInvoice, isLoading } = useInvoiceStore();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [manualItems, setManualItems] = useState<{ id: string; name: string; quantity: number; price: number }[]>([]);

  const [dueDate, setDueDate] = useState<Date | null>(new Date());
  const [shippingFeeInput, setShippingFeeInput] = useState("0");
  const [installationFeeInput, setInstallationFeeInput] = useState("0");
  const [discountPercentInput, setDiscountPercentInput] = useState("0");

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
    setManualItems(currentInvoice.invoice_items?.manual || []);

    const customerUuid = currentInvoice.customer_uuid;
    if (!customerUuid) return;
    api
      .get<Customer>(`/customers/${customerUuid}`)
      .then(({ data }) => setCustomer(data))
      .catch(() => setCustomer(null));
  }, [currentInvoice, invoiceUuid]);

  const toNumber = (value: string) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const shippingFee = useMemo(() => toNumber(shippingFeeInput), [shippingFeeInput]);
  const installationFee = useMemo(() => toNumber(installationFeeInput), [installationFeeInput]);
  const discountPercent = useMemo(() => toNumber(discountPercentInput), [discountPercentInput]);

  const isIssued = Boolean(currentInvoice?.issued_at);

  const subtotal = useMemo(() => {
    return (manualItems || []).reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  }, [manualItems]);

  const discountAmount = useMemo(() => (subtotal * discountPercent) / 100, [subtotal, discountPercent]);
  const grandTotal = useMemo(
    () => subtotal + shippingFee + installationFee - discountAmount,
    [subtotal, shippingFee, installationFee, discountAmount]
  );

  const handleAddManualItem = () => {
    setManualItems((prev) => [
      ...(prev || []),
      { id: crypto.randomUUID(), name: "", quantity: 1, price: 0 }
    ]);
  };

  const updateManualItem = (id: string, updates: Partial<{ name: string; quantity: number; price: number }>) => {
    setManualItems((prev) => (prev || []).map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeManualItem = (id: string) => {
    setManualItems((prev) => (prev || []).filter((item) => item.id !== id));
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
    };

    try {
      await updateInvoice(currentInvoice.uuid, {
        invoice_details: details,
        invoice_items: { manual: manualItems },
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
    manualItems,
    grandTotal,
    t,
    updateInvoice,
    issueInvoice,
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
        <div>
          <h2 className="text-xl font-bold">{t("invoicing.title", "Invoice Editor")}</h2>
          <div className="text-sm text-muted-foreground font-semibold">
            {(customer?.full_name || t("dashboard.no_customer", "Customer")) + (customer?.email ? ` • ${customer.email}` : "")}
          </div>
        </div>
        <span className="text-sm cursor-pointer" onClick={onBack}>
          X
        </span>
      </div>

      <ScrollArea className="flex-grow" dir={i18n.dir()}>
        <div className="max-w-5xl mx-auto p-8 space-y-10">
          <div className="flex flex-col md:flex-row justify-between gap-8 pb-8 border-b">
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-primary mb-4 flex items-center gap-2">
                {customer?.full_name || t("dashboard.no_customer", "Customer")}
              </h3>
              {customer?.phone_number && (
                <div className="text-sm font-bold text-muted-foreground">{customer.phone_number}</div>
              )}
              {customer?.email && <div className="text-sm font-bold text-muted-foreground">{customer.email}</div>}
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
            </div>
          </div>

          <div className="space-y-4">
            {!isIssued && (
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-primary">{t("invoicing.items", "Items")}</h3>
                <Button size="sm" variant="default" onClick={handleAddManualItem}>
                  <PlusCircle className="h-4 w-4 text-white" /> {t("invoicing.add_item", "Add Item")}
                </Button>
              </div>
            )}

            <Table className="print:table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("invoicing.item", "Item")}</TableHead>
                  <TableHead className="text-center w-[150px]">{t("invoicing.unit_price", "Unit Price")}</TableHead>
                  <TableHead className="text-center w-[120px]">{t("invoicing.quantity", "Qty")}</TableHead>
                  <TableHead className="text-end w-[150px]">{t("invoicing.total", "Total")}</TableHead>
                  {!isIssued && <TableHead className="w-[50px] no-print"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
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
                            onChange={(e) => updateManualItem(item.id, { price: parseFloat(e.target.value) || 0 })}
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
                            onChange={(e) => updateManualItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
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
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-bold text-gray-400 block">{t("invoicing.due_date", "Due Date")}</Label>
              <Input
                type="date"
                value={dueDate ? format(dueDate, "yyyy-MM-dd") : ""}
                onChange={(e) => setDueDate(e.target.value ? new Date(e.target.value) : null)}
                disabled={isIssued}
                className="no-print"
              />
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-gray-400 block">
                    {t("invoicing.shipping_fee", "Shipping")}
                  </Label>
                  <Input
                    value={shippingFeeInput}
                    onChange={(e) => setShippingFeeInput(e.target.value)}
                    disabled={isIssued}
                    className="no-print"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-gray-400 block">
                    {t("invoicing.installation_fee", "Installation")}
                  </Label>
                  <Input
                    value={installationFeeInput}
                    onChange={(e) => setInstallationFeeInput(e.target.value)}
                    disabled={isIssued}
                    className="no-print"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-gray-400 block">
                    {t("invoicing.discount_percent", "Discount %")}
                  </Label>
                  <Input
                    value={discountPercentInput}
                    onChange={(e) => setDiscountPercentInput(e.target.value)}
                    disabled={isIssued}
                    max={100}
                    className="no-print"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-8 rounded-2xl border border-primary-gray flex flex-col h-fit print:border-none print:bg-white print:p-0">
            <div className="space-y-4 mb-8 text-primary print:mb-0">
              <div className="flex justify-between text-base">
                <span className="font-medium">{t("invoicing.subtotal", "Subtotal")}</span>
                <span className="font-bold">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="font-medium">{t("invoicing.shipping_fee", "Shipping")}</span>
                <span className="font-bold">+ {formatCurrency(shippingFee)}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="font-medium">{t("invoicing.installation_fee", "Installation")}</span>
                <span className="font-bold">+ {formatCurrency(installationFee)}</span>
              </div>
              <div className="flex justify-between text-base text-red-600">
                <span className="font-medium">{t("invoicing.discount", "Discount")}</span>
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
                confirmationLabel={t("invoicing.issuing", "Issuing...")}
              >
                {t("invoicing.confirm_issue", "Confirm & Issue")}
              </HoldToConfirmButton>
            ) : (
              <div className="px-4 py-4 bg-green-100 text-green-800 border border-green-200 rounded-xl flex items-center gap-4 no-print">
                <FileText className="h-14 w-14" />
                <div>
                  <p className="font-black text-lg leading-none mb-1">{t("invoicing.issued", "Invoice Issued")}</p>
                  <p className="text-sm opacity-80">{currentInvoice?.issued_at ? format(new Date(currentInvoice.issued_at), "PPP") : ""}</p>
                </div>
              </div>
            )}

            {!currentInvoice?.issued_at && (
              <p className="text-[13px] text-muted-foreground mt-6 text-start flex flex-row no-print">
                <Info className="h-3 w-3 inline me-1 mt-0.5" />
                {t("invoicing.issue_disclaimer_independent", "Issuing an independent invoice will not deduct from inventory.")}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

