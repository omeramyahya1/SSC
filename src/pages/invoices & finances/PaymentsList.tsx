import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Search, 
    MoreVertical, 
    Trash2, 
    Download, 
    CreditCard,
    Calendar,
    Hash,
    User
} from 'lucide-react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePaymentStore, Payment } from '@/store/usePaymentStore';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

interface PaymentsListProps {
    filterParams: {
        org_uuid?: string;
        branch_uuid?: string;
    };
}

export function PaymentsList({ filterParams }: PaymentsListProps) {
    const { t, i18n } = useTranslation();
    const { payments, fetchPayments, deletePayment, isLoading } = usePaymentStore();
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchPayments(filterParams);
    }, [filterParams, fetchPayments]);

    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            const matchesSearch = 
                (p.payment_reference ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.project_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.invoice_id?.toString() ?? '').includes(searchQuery);
            return matchesSearch;
        });
    }, [payments, searchQuery]);

    const handleDelete = async (payment: Payment) => {
        if (window.confirm(t('finances.confirm_delete_payment', 'Are you sure you want to delete this payment? The invoice status will be updated.'))) {
            try {
                await deletePayment(payment.uuid);
                toast.success(t('finances.payment_delete_success', 'Payment deleted successfully.'));
                fetchPayments(filterParams);
            } catch (error: any) {
                toast.error(error.message || t('finances.payment_delete_error', 'Failed to delete payment.'));
            }
        }
    };

    if (isLoading && payments.length === 0) return <div className="h-64 flex items-center justify-center"><Spinner className="w-12 h-12" /></div>;

    return (
        <div className="space-y-4" dir={i18n.dir()}>
            {/* Toolbar */}
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border shadow-sm max-w-md">
                <div className="flex items-center px-3 text-muted-foreground">
                    <Search className="h-4 w-4" />
                </div>
                <Input 
                    placeholder={t('finances.search_payments_ph', 'Search by reference, project...')}
                    className="border-none shadow-none focus-visible:ring-0 bg-transparent"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Payments Table */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="font-bold">{t('finances.date', 'Date')}</TableHead>
                            <TableHead className="font-bold">{t('finances.project_invoice', 'Project / Invoice')}</TableHead>
                            <TableHead className="font-bold">{t('finances.method', 'Method')}</TableHead>
                            <TableHead className="font-bold">{t('finances.reference', 'Reference')}</TableHead>
                            <TableHead className="font-bold">{t('finances.amount', 'Amount')}</TableHead>
                            <TableHead className="text-end font-bold">{t('finances.actions', 'Actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredPayments.map((payment) => (
                            <TableRow key={payment.uuid} className="hover:bg-gray-50/50 transition-colors">
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold">{format(new Date(payment.created_at), 'dd MMM yyyy')}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">{format(new Date(payment.created_at), 'HH:mm')}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold">{payment.project_name || 'N/A'}</span>
                                        <span className="text-xs text-primary font-mono">#{String(payment.invoice_id).padStart(5, '0')}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium capitalize">{payment.method}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono text-sm">
                                    {payment.payment_reference || '—'}
                                </TableCell>
                                <TableCell className="font-black text-green-600">
                                    + {payment.amount.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-end">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="rounded-full">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 bg-white p-2 rounded-xl shadow-xl border-none">
                                            <DropdownMenuItem onClick={() => toast.success('PDF Receipt coming soon!')} className="rounded-lg font-bold gap-2">
                                                <Download className="h-4 w-4 text-blue-500" />
                                                {t('finances.download_receipt', 'Download Receipt')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDelete(payment)} className="rounded-lg font-bold gap-2 text-red-600 focus:text-red-600 focus:bg-red-50">
                                                <Trash2 className="h-4 w-4" />
                                                {t('finances.delete_payment', 'Delete Transaction')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredPayments.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-medium">
                                    {t('finances.no_payments', 'No transactions found.')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
