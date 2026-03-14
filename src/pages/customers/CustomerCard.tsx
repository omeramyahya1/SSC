import { useTranslation } from 'react-i18next';
import { Customer } from '@/store/useCustomerStore';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import toast from "react-hot-toast";

interface CustomerCardProps {
    customer: Customer;
    onEdit: (customer: Customer) => void;
    onDelete: (customer: Customer) => void;
}

export function CustomerCard({ customer, onEdit, onDelete }: CustomerCardProps) {
    const { t, i18n } = useTranslation();

    const stats = customer.project_stats || {};
    const totalProjects = Object.values(stats).reduce((a, b) => a + b, 0);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} ${t('project_modal.copy_success', 'copied to clipboard!')}`);
    };

    return (
        <Card className="overflow-hidden hover:shadow-md transition-shadow bg-white">
            <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-bold truncate max-w-[200px]" title={customer.full_name}>
                        {customer.full_name}
                    </h3>
                    <div className="flex flex-col text-sm text-muted-foreground gap-1">
                        {customer.email && (
                            <div 
                                className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                                onClick={() => copyToClipboard(customer.email!, t('customers.col.email', 'Email'))}
                            >
                                <img src="/eva-icons (2)/outline/email.png" alt="email" className="w-4 h-4 opacity-60" />
                                <span className="truncate max-w-[180px]">{customer.email}</span>
                            </div>
                        )}
                        {customer.phone_number && (
                            <div 
                                className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                                onClick={() => copyToClipboard(customer.phone_number!, t('customers.col.phone', 'Phone'))}
                            >
                                <img src="/eva-icons (2)/outline/phone.png" alt="phone" className="w-4 h-4 opacity-60" />
                                <span>{customer.phone_number}</span>
                            </div>
                        )}
                    </div>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                            <img src="/eva-icons (2)/outline/more-vertical.png" alt="options" className="w-5 h-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white">
                        <DropdownMenuItem
                            className="cursor-pointer rounded-lg hover:bg-gray-100"
                            onClick={() => onEdit(customer)}
                        >
                            <img src="/eva-icons (2)/outline/edit.png" alt="edit" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70" />
                            {t('common.edit', 'Edit Details')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="cursor-pointer group rounded-lg text-red-600 hover:bg-red-50 focus:bg-red-500 hover:text-white"
                            onClick={() => onDelete(customer)}
                        >
                            <img src="/eva-icons (2)/outline/trash-2.png" alt="delete" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70 group-hover:invert" />
                            {t('common.delete', 'Delete')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>

            <CardContent className="p-4 pt-0">
                <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {t('customers.project_overview', 'Project Overview')}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-bold">
                            {totalProjects} {t('customers.stats.total_projects', 'Projects')}
                        </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center justify-between p-2 rounded bg-blue-50/50 border border-blue-100">
                            <span className="text-[10px] font-medium text-blue-700">{t('dashboard.status.planning', 'Planning')}</span>
                            <span className="text-xs font-bold text-blue-800">{stats.planning || 0}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded bg-yellow-50/50 border border-yellow-100">
                            <span className="text-[10px] font-medium text-yellow-700">{t('dashboard.status.execution', 'Execution')}</span>
                            <span className="text-xs font-bold text-yellow-800">{stats.execution || 0}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded bg-green-50/50 border border-green-100">
                            <span className="text-[10px] font-medium text-green-700">{t('dashboard.status.done', 'Done')}</span>
                            <span className="text-xs font-bold text-green-800">{stats.done || 0}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded bg-gray-50/50 border border-gray-100">
                            <span className="text-[10px] font-medium text-gray-700">{t('dashboard.status.archived', 'Archived')}</span>
                            <span className="text-xs font-bold text-gray-800">{stats.archived || 0}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
