import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserStore } from '@/store/useUserStore';
import { useBranchStore } from '@/store/useBranchStore';
import api from '@/api/client';
import toast from "react-hot-toast";

interface AddEmployeeModalProps {
    onOpenChange: (isOpen: boolean) => void;
    organizationUuid: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddEmployeeModal({ onOpenChange, organizationUuid }: AddEmployeeModalProps) {
    const { t, i18n } = useTranslation();
    const { createEmployee } = useUserStore();
    const { branches } = useBranchStore();

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        role: 'employee',
        branch_uuid: '',
        organization_uuid: organizationUuid
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingEmail, setIsCheckingEmail] = useState(false);
    const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        if (!EMAIL_REGEX.test(formData.email)) {
            setEmailAvailable(null);
            return;
        }

        const checkEmail = async () => {
            setIsCheckingEmail(true);
            try {
                const response = await api.post<{ isUnique: boolean }>('/users/check-email-uniqueness', {
                    email: formData.email
                });
                setEmailAvailable(response.data.isUnique);
            } catch (error) {
                console.error("Error checking email uniqueness:", error);
                setEmailAvailable(null);
            } finally {
                setIsCheckingEmail(false);
            }
        };

        const timeoutId = setTimeout(checkEmail, 500);
        return () => clearTimeout(timeoutId);
    }, [formData.email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.username || !formData.email || emailAvailable === false) return;

        setIsSubmitting(true);
        try {
            const result = await createEmployee(formData);
            if (result) {
                toast.success(t('team.add_success', 'Employee added successfully'));
                onOpenChange(false);
            }
        } catch {
            // Error handled in store
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <form onSubmit={handleSubmit} noValidate>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('team.add_employee_title', 'Add New Employee')}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-6 space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="username" className="font-semibold">{t('common.username', 'Username')} *</Label>
                        <Input
                            id="username"
                            value={formData.username}
                            onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                            placeholder="e.g. john_doe"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email" className="font-semibold">{t('common.email', 'Email')} *</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="john@example.com"
                            required
                            className={`w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40 ${emailAvailable === false ? 'ring-red-500 ring-2' : 'focus:shadow-md focus:ring-2 focus:ring-primary/20'}`}
                        />
                        {isCheckingEmail && (
                            <p className="text-xs text-neutral/60 italic">{t('team.checking_email', 'Checking email availability...')}</p>
                        )}
                        {emailAvailable === false && (
                            <p className="text-xs text-red-500 font-medium">{t('team.email_exists', 'Email is already in use')}</p>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="branch" className="font-semibold">{t('team.branch', 'Branch')}</Label>
                        <Select
                            onValueChange={(value) => setFormData(prev => ({ ...prev, branch_uuid: value }))}
                            value={formData.branch_uuid}
                        >
                            <SelectTrigger className="bg-white">
                                <SelectValue placeholder={t('team.select_branch', 'Select a branch')} />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                {branches.map(branch => (
                                    <SelectItem key={branch.uuid} value={branch.uuid}>
                                        {branch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting || isCheckingEmail || emailAvailable === false} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('team.add_employee', 'Add Employee')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}

