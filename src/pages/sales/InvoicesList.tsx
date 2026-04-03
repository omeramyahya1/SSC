import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Search,
    MoreVertical,
    Printer,
    Trash2,
    CheckCircle2,
    Clock,
    AlertCircle,
    Eye,
    DollarSign,
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
import { Badge } from "@/components/ui/badge";
import { useInvoiceStore, Invoice } from '@/store/useInvoiceStore';
import { useUserStore } from '@/store/useUserStore';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { InvoiceEditorModal } from './InvoiceEditorModal';
import { AddPaymentModal } from './AddPaymentModal';
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

interface InvoicesListProps {
    filterParams: {
        org_uuid?: string;
        branch_uuid?: string;
    };
}

export function InvoicesList({ filterParams }: InvoicesListProps) {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const { invoices, fetchInvoices, deleteInvoice, isLoading } = useInvoiceStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date-desc');
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
    const [invoiceForPayment, setInvoiceForPayment] = useState<Invoice | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    useEffect(() => {
        fetchInvoices(filterParams);
    }, [filterParams, fetchInvoices]);

    const filteredAndSortedInvoices = useMemo(() => {
        let filtered = invoices.filter(inv => {
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                inv.invoice_id?.toString().includes(q) ||
                (inv.customer_name || '').toLowerCase().includes(q);

            const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;

            return matchesSearch && matchesStatus;
        });

        const [key, dir] = sortBy.split('-');
        return filtered.sort((a, b) => {
            let valA: any, valB: any;
            if (key === 'date') {
                valA = new Date(a.issued_at || a.created_at).getTime();
                valB = new Date(b.issued_at || b.created_at).getTime();
            } else if (key === 'amount') {
                valA = a.amount || 0;
                valB = b.amount || 0;
            } else if (key === 'remainder') {
                valA = (a as any).remainder || 0;
                valB = (b as any).remainder || 0;
            } else {
                valA = a.invoice_id || 0;
                valB = b.invoice_id || 0;
            }
            return dir === 'asc' ? valA - valB : valB - valA;
        });
    }, [invoices, searchQuery, statusFilter, sortBy]);

    const handleConfirmDelete = async () => {
        if (!invoiceToDelete || !currentUser) return;
        try {
            await deleteInvoice(invoiceToDelete.uuid, currentUser.uuid);
            toast.success(t('invoicing.delete_success', 'Invoice deleted successfully.'));
            fetchInvoices(filterParams);
        } catch (error: any) {
            toast.error(error.message || t('invoicing.delete_error', 'Failed to delete invoice.'));
        } finally {
            setInvoiceToDelete(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid':
                return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none font-bold">
                    <CheckCircle2 className="w-3 h-3 me-1" /> {t('finances.paid', 'Paid')}
                </Badge>;
            case 'partial':
                return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none font-bold">
                    <Clock className="w-3 h-3 me-1" /> {t('finances.partial', 'Partial')}
                </Badge>;
            default:
                return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-none font-bold">
                    <AlertCircle className="w-3 h-3 me-1" /> {t('finances.pending', 'Pending')}
                </Badge>;
        }
    };

    if (isLoading && invoices.length === 0) return <div className="h-64 flex items-center justify-center"><Spinner className="w-12 h-12" /></div>;

    return (
        <div className="space-y-4" dir={i18n.dir()}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-grow max-w-4xl">
                    <div className="flex items-center gap-2 bg-white p-1 rounded-xl border shadow-sm flex-grow">
                        <div className="flex items-center px-3 text-muted-foreground">
                            <Search className="h-4 w-4" />
                        </div>
                        <Input
                            placeholder={t('invoicing.search_ph', 'Search by ID or Customer...')}
                            className="border-none shadow-none focus-visible:ring-0 bg-transparent"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                         <Select value={statusFilter} onValueChange={setStatusFilter} dir={i18n.dir()}>
                            <SelectTrigger className={`w-[140px] h-10 rounded-xl ${statusFilter === 'all'? 'bg-white' : 'bg-primary text-white'}`}>
                                <SelectValue placeholder={t('finances.filter_status', 'Status')} />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                <SelectItem value="all">{t('finances.all', 'All (status)')}</SelectItem>
                                <SelectItem value="pending">{t('finances.pending', 'Pending')}</SelectItem>
                                <SelectItem value="partial">{t('finances.partial', 'Partial')}</SelectItem>
                                <SelectItem value="paid">{t('finances.paid', 'Paid')}</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={setSortBy} dir={i18n.dir()}>
                            <SelectTrigger className={`w-[140px] h-10 rounded-xl ${sortBy === 'date-desc'? 'bg-white' : 'bg-primary text-white'}`}>
                                <ArrowUpDown className="h-4 w-4 me-2 opacity-60" />
                                <SelectValue placeholder={t('common.sort_by', 'Sort By')} />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                <SelectItem value="date-desc">{t('common.sort.date_new', 'Newest First')}</SelectItem>
                                <SelectItem value="date-asc">{t('common.sort.date_old', 'Oldest First')}</SelectItem>
                                <SelectItem value="amount-desc">{t('common.sort.amount_high', 'Amount: High-Low')}</SelectItem>
                                <SelectItem value="amount-asc">{t('common.sort.amount_low', 'Amount: Low-High')}</SelectItem>
                                <SelectItem value="remainder-desc">{t('common.sort.remainder_high', 'Remainder: High-Low')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white px-4 rounded-xl border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="text-start w-[80px] font-bold">{t('invoicing.id', 'ID')}</TableHead>
                            <TableHead className="text-start font-bold">{t('invoicing.customer', 'Customer')}</TableHead>
                            <TableHead className="text-start font-bold">{t('invoicing.due_date', 'Due Date')}</TableHead>
                            <TableHead className="text-start font-bold">{t('invoicing.amount', 'Amount')}</TableHead>
                            <TableHead className="text-start font-bold">{t('invoicing.paid', 'Paid')}</TableHead>
                            <TableHead className="text-start font-bold">{t('invoicing.remainder', 'Remainder')}</TableHead>
                            <TableHead className="text-center font-bold">{t('invoicing.status', 'Status')}</TableHead>
                            <TableHead className="text-end font-bold">{t('invoicing.actions', 'Actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAndSortedInvoices.map((invoice) => (
                            <TableRow key={invoice.uuid} className="text-start hover:bg-gray-50/50 transition-colors">
                                <TableCell className="font-mono font-bold text-primary text-start">
                                    #{String(invoice.invoice_id).padStart(5, '0')}
                                </TableCell>
                                <TableCell className="font-medium">
                                    {invoice.customer_name || 'N/A'}
                                </TableCell>
                                <TableCell className="text-sm">
                                    { (invoice as any).due_date ? format(new Date((invoice as any).due_date), 'dd/MM/yyyy') : '—'}
                                </TableCell>
                                <TableCell className="font-black text-gray-900">
                                    {invoice.amount?.toLocaleString('en-US')}
                                </TableCell>
                                <TableCell className="font-bold text-green-600">
                                    {(invoice as any).paid_amount?.toLocaleString('en-US') || '0'}
                                </TableCell>
                                <TableCell className={`font-black ${(invoice as any).remainder > 0 ? `text-red-500` : `text-green-600`}`}>
                                    {(invoice as any).remainder?.toLocaleString('en-US') || '0'}
                                </TableCell>
                                <TableCell className='text-center'>
                                    {getStatusBadge(invoice.status)}
                                </TableCell>
                                <TableCell className="text-end">
                                    <DropdownMenu dir={i18n.dir()}>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="rounded-full">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 bg-white p-2 rounded-xl">
                                            {invoice.status !== 'paid' && (
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        setInvoiceForPayment(invoice);
                                                        setIsPaymentModalOpen(true);
                                                    }}
                                                    className="cursor-pointer rounded-lg hover:bg-gray-100 font-bold gap-2"
                                                >
                                                    <DollarSign className="h-4 w-4 text-green-600" />
                                                    {t('invoicing.add_payment', 'Add Payment')}
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem onClick={() => {
                                                setSelectedInvoice(invoice);
                                                setIsEditorOpen(true);
                                            }} className="cursor-pointer rounded-lg hover:bg-gray-100 font-bold gap-2">
                                                <Eye className="h-4 w-4" />
                                                {t('invoicing.view', 'View Invoice')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => toast.success('Printing coming soon!')} className="cursor-pointer rounded-lg hover:bg-gray-100 font-bold gap-2">
                                                <Printer className="h-4 w-4 text-gray-500" />
                                                {t('invoicing.print', 'Print PDF')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setInvoiceToDelete(invoice)} className="cursor-pointer rounded-lg text-red-700 hover:text-white hover:bg-red-500 font-bold gap-2">
                                                <Trash2 className="h-4 w-4" />
                                                {t('invoicing.delete', 'Delete Invoice')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredAndSortedInvoices.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground font-medium">
                                    {t('invoicing.no_invoices', 'No invoices found.')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Modals & Dialogs */}
            {selectedInvoice && (
                <InvoiceEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => {
                        setIsEditorOpen(false);
                        setSelectedInvoice(null);
                        fetchInvoices(filterParams);
                    }}
                    invoiceUuid={selectedInvoice.uuid}
                />
            )}

            <AddPaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => {
                    setIsPaymentModalOpen(false);
                    setInvoiceForPayment(null);
                    fetchInvoices(filterParams);
                }}
                initialInvoiceUuid={invoiceForPayment?.uuid}
                initialAmount={(invoiceForPayment as any)?.remainder}
                orgUuid={currentUser?.organization_uuid}
            />

            <AlertDialog open={!!invoiceToDelete} onOpenChange={(isOpen) => !isOpen && setInvoiceToDelete(null)}>
                <AlertDialogContent className='bg-white border-2'>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('invoicing.confirm_delete.title', 'Are you sure you want to delete this invoice?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('invoicing.confirm_delete.description', 'This action will reverse inventory deductions for issued invoices. This cannot be undone.')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
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
