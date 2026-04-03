import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from '@/lib/utils';
import { useInvoiceStore } from '@/store/useInvoiceStore';
import { usePaymentStore } from '@/store/usePaymentStore';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

interface AddPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    orgUuid?: string;
    initialInvoiceUuid?: string;
    initialAmount?: number;
}

export function AddPaymentModal({ isOpen, onClose, initialInvoiceUuid, initialAmount }: AddPaymentModalProps) {
    const { t, i18n } = useTranslation();
    const { invoices, fetchInvoices } = useInvoiceStore();
    const { createPayment } = usePaymentStore();

    const [selectedInvoiceUuid, setSelectedInvoiceUuid] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('Cash');
    const [reference, setReference] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());

    useEffect(() => {
        if (isOpen) {
            fetchInvoices();
        }
    }, [isOpen, fetchInvoices]);

    useEffect(() => {
        if (isOpen) {
            if (initialInvoiceUuid) {
                setSelectedInvoiceUuid(initialInvoiceUuid);
            } else {
                setSelectedInvoiceUuid('');
            }

            if (initialAmount !== undefined) {
                setAmount(String(initialAmount));
            } else {
                setAmount('');
            }

            setMethod('Cash');
            setReference('');
            setPaymentDate(new Date());
        }
    }, [isOpen, initialInvoiceUuid, initialAmount]);

    const handleSave = async () => {
        if (!selectedInvoiceUuid || !amount) {
            toast.error(t('finances.error_required', 'Please fill in all required fields.'));
            return;
        }

        setIsSubmitting(true);
        try {
            await createPayment({
                invoice_uuid: selectedInvoiceUuid,
                amount: parseFloat(amount),
                method: method,
                payment_reference: reference,
                payment_date: paymentDate ? format(paymentDate, 'yyyy-MM-dd') : undefined,
            });
            toast.success(t('finances.payment_success', 'Payment recorded successfully!'));
            onClose();
            // Reset state
            setSelectedInvoiceUuid('');
            setAmount('');
            setMethod('Cash');
            setReference('');
            setPaymentDate(new Date());
        } catch (error) {
            toast.error(t('finances.payment_error', 'Failed to record payment.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNumberInputChange = (
        setter: (value: string) => void,
        rawValue: string
    ) => {
        if (!/^\d*\.?\d*$/.test(rawValue)) return;
        setter(rawValue);
    };

    const invoiceItems = useMemo(() => {
        return invoices
            .filter((inv) => inv.status !== 'paid' || inv.uuid === initialInvoiceUuid)
            .map((inv) => ({
                value: inv.uuid,
                label: `#${String(inv.invoice_id).padStart(5, '0')} - ${inv.amount?.toLocaleString()} (${inv.status})`,
            }));
    }, [invoices, initialInvoiceUuid]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] bg-white p-0 overflow-hidden rounded-2xl border-none shadow-2xl filter-none backdrop-blur-0" dir={i18n.dir()}>
                <div className="p-6">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold">{t('finances.add_payment', 'Add a Payment')}</DialogTitle>
                    </DialogHeader>
                </div>

                <div className="px-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="font-bold text-xs  text-muted-foreground">{t('finances.select_invoice', 'Select Invoice')}</Label>
                        <SearchableSelect
                            value={selectedInvoiceUuid}
                            onValueChange={setSelectedInvoiceUuid}
                            disabled={!!initialInvoiceUuid}
                            placeholder={t('finances.select_invoice_ph', 'Choose an invoice')}
                            items={invoiceItems}

                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="font-bold text-xs  text-muted-foreground">{t('finances.amount', 'Amount')}</Label>
                        <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            className=" border-gray-200 rounded-xl focus:ring-primary font-black text-lg"
                            value={amount}
                            onChange={(e) => handleNumberInputChange(setAmount, e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="font-bold text-xs  text-muted-foreground">{t('finances.payment_date', 'Payment Date')}</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-between text-start font-bold h-10 px-4 rounded-xl border-gray-200",
                                        !paymentDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className=" h-4 w-4" />
                                    {paymentDate ? (
                                        format(paymentDate, "dd/MM/yyyy")
                                    ) : (
                                        <span>{t('finances.pick_date', 'Pick a date')}</span>
                                    )}
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-white" align="end">
                                <Calendar
                                    autoFocus
                                    mode="single"
                                    selected={paymentDate}
                                    onSelect={setPaymentDate}
                                    numberOfMonths={1}
                                    disabled={
                                                (date) => {
                                                    const min = new Date();
                                                    min.setHours(0, 0, 0, 0);
                                                    const d = new Date(date);
                                                    d.setHours(0, 0, 0, 0);
                                                    return d > min;
                                                }
                                            }
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="font-bold text-xs  text-muted-foreground">{t('finances.method', 'Payment Method')}</Label>
                            <Select value={method} onValueChange={setMethod} dir={i18n.dir()}>
                                <SelectTrigger className="border-gray-200 rounded-xl focus:ring-primary">
                                    <SelectValue placeholder={t('finances.choose_method', 'Choose a Payment Method')}/>
                                </SelectTrigger>
                                <SelectContent className='bg-white'>
                                    {
                                    ['Cash','Bankak', 'Ocash', 'Fawry', 'MyCashi', 'BNMB', 'Other'].map((m) => (
                                        <SelectItem value={m}>{t('finances.methods.'+m.toLowerCase(), m)}</SelectItem>
                                    ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold text-xs  text-muted-foreground">{t('finances.reference', 'Reference No.')}</Label>
                            <Input
                                placeholder="Ref #"
                                className="border-gray-200 rounded-xl focus:ring-primary"
                                value={method ==="Cash"? "N/A" :reference}
                                onChange={(e) => setReference(e.target.value)}
                                disabled={method==="Cash"}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-8 flex items-end gap-3">
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={isSubmitting} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('finances.save_payment', 'Save Payment')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
