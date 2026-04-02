import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Search,
    MoreVertical,
    Trash2,
    ArrowUpDown
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";

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
    const [methodFilter, setMethodFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date-desc');
    const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

    useEffect(() => {
        fetchPayments(filterParams);
    }, [filterParams, fetchPayments]);

    const filteredAndSortedPayments = useMemo(() => {
        let filtered = payments.filter(p => {
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                (p.payment_reference ?? '').toLowerCase().includes(q) ||
                (p.project_name ?? '').toLowerCase().includes(q) ||
                p.invoice_id?.toString().includes(q);

            const matchesMethod = methodFilter === 'all' || p.method === methodFilter;

            return matchesSearch && matchesMethod;
        });

        const [key, dir] = sortBy.split('-');
        return filtered.sort((a, b) => {
            let valA: any, valB: any;
            if (key === 'date') {
                valA = new Date(a.created_at).getTime();
                valB = new Date(b.created_at).getTime();
            } else if (key === 'amount') {
                valA = a.amount;
                valB = b.amount;
            } else if (key === 'invoice') {
                valA = a.invoice_id || 0;
                valB = b.invoice_id || 0;
            }
            return dir === 'asc' ? valA - valB : valB - valA;
        });
    }, [payments, searchQuery, methodFilter, sortBy]);

    const handleConfirmDelete = async () => {
        if (!paymentToDelete) return;
        try {
            await deletePayment(paymentToDelete.uuid);
            toast.success(t('finances.payment_delete_success', 'Payment deleted successfully.'));
            fetchPayments(filterParams);
        } catch (error: any) {
            toast.error(error.message || t('finances.payment_delete_error', 'Failed to delete payment.'));
        } finally {
            setPaymentToDelete(null);
        }
    };

    if (isLoading && payments.length === 0) return <div className="h-64 flex items-center justify-center"><Spinner className="w-12 h-12" /></div>;

    return (
        <div className="space-y-4" dir={i18n.dir()}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-grow max-w-4xl">
                    <div className="flex items-center gap-2 bg-white p-1 rounded-xl border shadow-sm flex-grow">
                        <div className="flex items-center px-3 text-muted-foreground">
                            <Search className="h-4 w-4" />
                 ArrowUpDown       </div>
                        <Input
                            placeholder={t('finances.search_payments_ph', 'Search by reference, project, or Invoice ID...')}
                            className="border-none shadow-none focus-visible:ring-0 bg-transparent"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Select value={methodFilter} onValueChange={setMethodFilter}>
                            <SelectTrigger className="w-[160px] bg-white h-10 rounded-xl">
                                <SelectValue placeholder={t('finances.filter_method', 'Payment Method')} />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                <SelectItem value="all">{t('finances.all_methods', 'All Methods')}</SelectItem>
                                {['Cash', 'Bankak', 'Ocash', 'Fawry', 'MyCashi', 'BNMB', 'Other'].map(m => (
                                    <SelectItem key={m} value={m}>{t(`finances.methods.${m.toLowerCase()}`, m)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[160px] bg-white h-10 rounded-xl">
                                <ArrowUpDown className="h-4 w-4 me-2 opacity-60" />
                                <SelectValue placeholder={t('common.sort_by', 'Sort By')} />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                <SelectItem value="date-desc">{t('common.sort.date_new', 'Newest First')}</SelectItem>
                                <SelectItem value="date-asc">{t('common.sort.date_old', 'Oldest First')}</SelectItem>
                                <SelectItem value="amount-desc">{t('common.sort.amount_high', 'Amount: High-Low')}</SelectItem>
                                <SelectItem value="amount-asc">{t('common.sort.amount_low', 'Amount: Low-High')}</SelectItem>
                                <SelectItem value="invoice-desc">{t('common.sort.invoice_high', 'Invoice ID: High-Low')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Payments Table */}
            <div className="bg-white px-4 rounded-xl border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="font-bold">{t('finances.date', 'Date')}</TableHead>
                            <TableHead className="font-bold">{t('invoicing.id', 'Invoice ID')}</TableHead>
                            <TableHead className="font-bold">{t('invoicing.customer', 'Customer')}</TableHead>
                            <TableHead className="text-center font-bold">{t('finances.method', 'Method')}</TableHead>
                            <TableHead className="font-bold">{t('finances.reference', 'Reference')}</TableHead>
                            <TableHead className="font-bold">{t('finances.amount', 'Amount')}</TableHead>
                            <TableHead className="text-end font-bold">{t('finances.actions', 'Actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAndSortedPayments.map((payment) => (
                            <TableRow key={payment.uuid} className="hover:bg-gray-50/50 transition-colors">
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold">{format(new Date(String(payment.payment_date)), 'dd/MM/yyyy')}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="font-mono font-bold text-primary">#{String(payment.invoice_id || 0).padStart(5, '0')}</span>
                                </TableCell>
                                <TableCell className="font-medium">
                                    {payment.project_name || 'N/A'}
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm text-center font-bold text-gray-700 capitalize">
                                        {t(`finances.methods.${payment.method.toLowerCase()}`, payment.method)}
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
                                        <DropdownMenuContent align="end" className="w-48 bg-white p-2 rounded-xl">
                                            <DropdownMenuItem onClick={() => setPaymentToDelete(payment)} className="rounded-lg text-red-700 hover:text-white hover:bg-red-500 font-bold gap-2">
                                                <Trash2 className="h-4 w-4" />
                                                {t('finances.delete_payment', 'Delete Transaction')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredAndSortedPayments.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground font-medium">
                                    {t('finances.no_payments', 'No transactions found.')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={!!paymentToDelete} onOpenChange={(isOpen) => !isOpen && setPaymentToDelete(null)}>
                <AlertDialogContent className='bg-white border-2'>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('finances.confirm_delete_payment.title', 'Are you sure you want to delete this transaction?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('finances.confirm_delete_payment.description', 'The associated invoice status will be automatically re-evaluated. This cannot be undone.')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPaymentToDelete(null)}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-50 text-red-700 border-red-200 hover:text-white hover:bg-red-500"
                            onClick={handleConfirmDelete}
                        >
                            {t('common.delete', 'Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
