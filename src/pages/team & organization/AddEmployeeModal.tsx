import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserStore } from '@/store/useUserStore';
import { useBranchStore } from '@/store/useBranchStore';
import toast from "react-hot-toast";

interface AddEmployeeModalProps {
    onOpenChange: (isOpen: boolean) => void;
    organizationUuid: string;
}

export function AddEmployeeModal({ onOpenChange, organizationUuid }: AddEmployeeModalProps) {
    const { t, i18n } = useTranslation();
    const { createEmployee } = useUserStore();
    const { branches } = useBranchStore();

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        role: 'employee',
        branch_uuid: '',
        organization_uuid: organizationUuid
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.username || !formData.email || !formData.password) return;

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
            <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('team.add_employee_title', 'Add New Employee')}</DialogTitle>
                    <DialogDescription>
                        {t('team.add_employee_desc', 'Enter credentials and assign to a branch.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
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
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="password" className="font-semibold">{t('common.password', 'Password')} *</Label>
                        <Input
                            id="password"
                            type="password"
                            value={formData.password}
                            onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                            required
                        />
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
                    <div className="grid gap-2">
                        <Label htmlFor="role" className="font-semibold">{t('team.role', 'Role')}</Label>
                        <Select
                            onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                            value={formData.role}
                        >
                            <SelectTrigger className="bg-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                <SelectItem value="employee">{t('team.role.employee', 'Employee')}</SelectItem>
                                <SelectItem value="admin">{t('team.role.admin', 'Admin')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('team.add_employee', 'Add Employee')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
