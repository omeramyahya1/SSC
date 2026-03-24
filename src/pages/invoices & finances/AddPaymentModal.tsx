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
import { useInvoiceStore, Invoice } from '@/store/useInvoiceStore';
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
        if (isOpen && orgUuid) {
            // Fetch only non-paid invoices for selection
            fetchInvoices({ org_uuid: orgUuid });
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

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] bg-white p-0 overflow-hidden rounded-2xl border-none shadow-2xl" dir={i18n.dir()}>
                <div className="p-6 bg-primary text-white">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black text-white">{t('finances.record_payment', 'Record Payment')}</DialogTitle>
                    </DialogHeader>
                </div>
                
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="font-bold text-xs uppercase text-muted-foreground">{t('finances.select_invoice', 'Select Invoice')}</Label>
                        <Select value={selectedInvoiceUuid} onValueChange={setSelectedInvoiceUuid}>
                            <SelectTrigger className="h-12 border-gray-200 rounded-xl focus:ring-primary">
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
                        <Label className="font-bold text-xs uppercase text-muted-foreground">{t('finances.amount', 'Amount')}</Label>
                        <Input 
                            type="number" 
                            placeholder="0.00" 
                            className="h-12 border-gray-200 rounded-xl focus:ring-primary font-black text-lg"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="font-bold text-xs uppercase text-muted-foreground">{t('finances.method', 'Payment Method')}</Label>
                            <Select value={method} onValueChange={setMethod}>
                                <SelectTrigger className="h-12 border-gray-200 rounded-xl focus:ring-primary">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className='bg-white'>
                                    <SelectItem value="cash">{t('finances.methods.cash', 'Cash')}</SelectItem>
                                    <SelectItem value="bank">{t('finances.methods.bank', 'Bank Transfer')}</SelectItem>
                                    <SelectItem value="cheque">{t('finances.methods.cheque', 'Cheque')}</SelectItem>
                                    <SelectItem value="other">{t('finances.methods.other', 'Other')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold text-xs uppercase text-muted-foreground">{t('finances.reference', 'Reference No.')}</Label>
                            <Input 
                                placeholder="Ref #" 
                                className="h-12 border-gray-200 rounded-xl focus:ring-primary"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-8 pt-0 flex gap-3">
                    <Button variant="outline" onClick={onClose} className="h-12 rounded-xl flex-1 font-bold">
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={isSubmitting} className="h-12 rounded-xl flex-1 font-bold text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('finances.save_payment', 'Save Payment')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
