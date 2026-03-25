import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useInvoiceStore } from '@/store/useInvoiceStore';
import { usePaymentStore } from '@/store/usePaymentStore';
import { toast } from 'react-hot-toast';

interface AddPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    orgUuid?: string;
}

export function AddPaymentModal({ isOpen, onClose, orgUuid }: AddPaymentModalProps) {
    const { t, i18n } = useTranslation();
    const { invoices, fetchInvoices } = useInvoiceStore();
    const { createPayment } = usePaymentStore();

    const [selectedInvoiceUuid, setSelectedInvoiceUuid] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('cash');
    const [reference, setReference] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Fetch only non-paid invoices for selection
            fetchInvoices();
        }
    }, [isOpen, orgUuid, fetchInvoices]);

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
                payment_reference: reference
            });
            toast.success(t('finances.payment_success', 'Payment recorded successfully!'));
            onClose();
            // Reset state
            setSelectedInvoiceUuid('');
            setAmount('');
            setMethod('cash');
            setReference('');
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

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] bg-white p-0 overflow-hidden rounded-2xl border-none shadow-2xl" dir={i18n.dir()}>
                <div className="p-6">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold">{t('finances.record_payment', 'Record Payment')}</DialogTitle>
                    </DialogHeader>
                </div>

                <div className="px-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="font-bold text-xs  text-muted-foreground">{t('finances.select_invoice', 'Select Invoice')}</Label>
                        <Select value={selectedInvoiceUuid} onValueChange={setSelectedInvoiceUuid}>
                            <SelectTrigger className="border-gray-200 rounded-xl focus:ring-primary">
                                <SelectValue placeholder={t('finances.select_invoice_ph', 'Choose an invoice')} />
                            </SelectTrigger>
                            <SelectContent className='bg-white'>
                                {invoices.filter(inv => inv.status !== 'paid').map(inv => (
                                    <SelectItem key={inv.uuid} value={inv.uuid}>
                                        <span className='font-bold'>#{String(inv.invoice_id).padStart(5, '0')}</span> - {inv.amount.toLocaleString()} ({inv.status})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="font-bold text-xs  text-muted-foreground">{t('finances.method', 'Payment Method')}</Label>
                            <Select value={method} onValueChange={setMethod}>
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
