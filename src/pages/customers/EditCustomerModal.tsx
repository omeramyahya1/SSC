import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Customer, useCustomerStore } from '@/store/useCustomerStore';
import { toast } from "sonner";

interface EditCustomerModalProps {
    customer: Customer;
    onOpenChange: (isOpen: boolean) => void;
}

export function EditCustomerModal({ customer, onOpenChange }: EditCustomerModalProps) {
    const { t, i18n } = useTranslation();
    const { updateCustomer } = useCustomerStore();

    const [formData, setFormData] = useState({
        full_name: customer.full_name,
        email: customer.email || '',
        phone_number: customer.phone_number || '',
    });

    useEffect(() => {
        setFormData({
            full_name: customer.full_name,
            email: customer.email || '',
            phone_number: customer.phone_number || '',
        });
    }, [customer]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.full_name) return;

        setIsSubmitting(true);
        try {
            await updateCustomer(customer.customer_id, formData);
            toast.success(t('customers.update_success', 'Customer updated successfully'));
            onOpenChange(false);
        } catch (error: any) {
            toast.error(t('customers.update_error', 'Failed to update customer'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('customers.edit_customer_title', 'Edit Customer')}</DialogTitle>
                    <DialogDescription>
                        {t('customers.edit_customer_desc', 'Update the details for this customer.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit_full_name" className="font-semibold">
                            {t('customers.col.name', 'Customer Name')} *
                        </Label>
                        <Input
                            id="edit_full_name"
                            value={formData.full_name}
                            onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                            placeholder={t('dashboard.customer_name_ph', 'e.g. John Doe')}
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit_email" className="font-semibold">
                            {t('customers.col.email', 'Email')}
                        </Label>
                        <Input
                            id="edit_email"
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            placeholder={t('dashboard.customer_email_ph', 'e.g. johndoe@example.com')}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit_phone_number" className="font-semibold">
                            {t('customers.col.phone', 'Phone Number')}
                        </Label>
                        <Input
                            id="edit_phone_number"
                            value={formData.phone_number}
                            onChange={e => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                            placeholder={t('dashboard.customer_phone_ph', 'e.g. +249...')}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting || !formData.full_name} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('common.save_changes', 'Save Changes')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
