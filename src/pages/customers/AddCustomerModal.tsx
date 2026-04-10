import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomerStore, NewCustomerData } from '@/store/useCustomerStore';
import { useUserStore } from '@/store/useUserStore';
import toast from "react-hot-toast";

interface AddCustomerModalProps {
    onOpenChange: (isOpen: boolean) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddCustomerModal({ onOpenChange }: AddCustomerModalProps) {
    const { t, i18n } = useTranslation();
    const { createCustomer } = useCustomerStore();
    const { currentUser } = useUserStore();

    const [formData, setFormData] = useState<NewCustomerData>({
        full_name: '',
        email: '',
        phone_number: '',
        organization_uuid: currentUser?.organization_uuid || null,
        user_uuid: currentUser?.uuid || null,
    });

    const isEmailValid = !formData.email || EMAIL_REGEX.test(formData.email);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.full_name) return;

        setIsSubmitting(true);
        try {
            const result = await createCustomer(formData);
            if (result) {
                toast.success(t('customers.add_success', 'Customer added successfully'));
                onOpenChange(false);
            } else {
                toast.error(t('customers.add_error', 'Failed to add customer'));
            }
        } catch {
            toast.error(t('customers.add_error', 'Failed to add customer'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <form onSubmit={handleSubmit} noValidate>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('customers.add_customer_title', 'Add New Customer')}</DialogTitle>
                    <DialogDescription>
                        {t('customers.add_customer_desc', 'Fill in the details to register a new customer.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="full_name" className="font-semibold">
                            {t('customers.col.name', 'Customer Name')} *
                        </Label>
                        <Input
                            id="full_name"
                            value={formData.full_name}
                            onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                            placeholder={t('dashboard.customer_name_ph', 'e.g. John Doe')}
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email" className="font-semibold">
                            {t('customers.col.email', 'Email')}
                        </Label>
                        <input
                            id="email"
                            type="email"
                            value={formData.email || ''}
                            aria-invalid={!isEmailValid}
                            aria-describedby={!isEmailValid ? 'customer-email-error' : undefined}
                            className={`flex h-9 w-full rounded-base border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40
                          ${!isEmailValid ? 'ring-red-500 ring-1' : 'focus:shadow-md focus:ring-1 focus:ring-primary/20'}`}
                            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            placeholder={t('dashboard.customer_email_ph', 'e.g. johndoe@example.com')}
                        />
                        {!isEmailValid && (
                            <p id="customer-email-error" className="text-sm text-red-600">
                                {t('customers.invalid_email', 'Enter a valid email address')}
                            </p>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="phone_number" className="font-semibold">
                            {t('customers.col.phone', 'Phone Number')}
                        </Label>
                        <Input
                            id="phone_number"
                            value={formData.phone_number || ''}
                            onChange={e => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                            placeholder={t('dashboard.customer_phone_ph', 'e.g. +249...')}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting || !formData.full_name || !isEmailValid} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('customers.add_customer', 'Add Customer')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
