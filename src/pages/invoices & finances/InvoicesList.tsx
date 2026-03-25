import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Search,
    MoreVertical,
    Printer,
    Trash2,
    Edit3,
    CheckCircle2,
    Clock,
    AlertCircle,
    Eye,
    DollarSign
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
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    useEffect(() => {
        fetchInvoices(filterParams);
    }, [filterParams, fetchInvoices]);

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            const matchesSearch =
                inv.invoice_id.toString().includes(searchQuery);

            const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [invoices, searchQuery, statusFilter]);

    const handleDelete = async (invoice: Invoice) => {
        if (!currentUser) return;
        if (window.confirm(t('invoicing.confirm_delete', 'Are you sure? Deleting an issued invoice will return items to inventory.'))) {
            try {
                // We pass user_uuid for the stock adjustment record
                await deleteInvoice(invoice.uuid, currentUser.uuid);
                toast.success(t('invoicing.delete_success', 'Invoice deleted successfully.'));
                fetchInvoices(filterParams);
            } catch (error: any) {
                toast.error(error.message || t('invoicing.delete_error', 'Failed to delete invoice.'));
            }
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
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border shadow-sm flex-grow max-w-md">
                    <div className="flex items-center px-3 text-muted-foreground">
                        <Search className="h-4 w-4" />
                    </div>
                    <Input
                        placeholder={t('invoicing.search_ph', 'Search by ID...')}
                        className="border-none shadow-none focus-visible:ring-0 bg-transparent"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant={statusFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter('all')}
                        className="font-bold"
                    >
                        {t('finances.all', 'All')}
                    </Button>
                    <Button
                        variant={statusFilter === 'pending' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter('pending')}
                        className="font-bold"
                    >
                        {t('finances.outstanding', 'Outstanding')}
                    </Button>
                    <Button
                        variant={statusFilter === 'paid' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter('paid')}
                        className="font-bold"
                    >
                        {t('finances.paid', 'Paid')}
                    </Button>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white px-4 rounded-xl border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[120px] font-bold">{t('invoicing.id', 'ID')}</TableHead>
                            <TableHead className="font-bold">{t('invoicing.date', 'Date')}</TableHead>
                            <TableHead className="font-bold">{t('invoicing.amount', 'Amount')}</TableHead>
                            <TableHead className="text-center font-bold">{t('invoicing.status', 'Status')}</TableHead>
                            <TableHead className="text-end font-bold">{t('invoicing.actions', 'Actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredInvoices.map((invoice) => (
                            <TableRow key={invoice.uuid} className="hover:bg-gray-50/50 transition-colors">
                                <TableCell className="font-mono font-bold text-primary">
                                    #{String(invoice.invoice_id).padStart(5, '0')}
                                </TableCell>
                                <TableCell className="text-sm font-medium">
                                    {invoice.issued_at ? format(new Date(invoice.issued_at), 'dd/MM/yyyy') : t('invoicing.draft', 'Draft')}
                                </TableCell>
                                <TableCell className="font-black">
                                    {invoice.amount?.toLocaleString()}
                                </TableCell>
                                <TableCell className='text-center'>
                                    {getStatusBadge(invoice.status)}
                                </TableCell>
                                <TableCell className="text-end">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="rounded-full">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 bg-white p-2 rounded-xl">
                                            <DropdownMenuItem onClick={() => toast.success('Printing coming soon!')} className="cursor-pointer rounded-lg hover:bg-gray-100 font-bold gap-2">
                                                <DollarSign className="h-4 w-4 text-gray-500" />
                                                {t('invoicing.add_payment', 'Add Payment')}
                                            </DropdownMenuItem>
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
                                            <DropdownMenuItem onClick={() => handleDelete(invoice)} className="rounded-lg text-red-700 border-red-200 hover:text-white hover:bg-red-500">
                                                <Trash2 className="h-4 w-4" />
                                                {t('invoicing.delete', 'Delete Invoice')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredInvoices.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground font-medium">
                                    {t('invoicing.no_invoices', 'No invoices found.')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Editor Modal */}
            {selectedInvoice && (
                <InvoiceEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => {
                        setIsEditorOpen(false);
                        setSelectedInvoice(null);
                        fetchInvoices(filterParams); // Refresh after edit
                    }}
                    invoiceUuid={selectedInvoice.uuid}
                />
            )}
        </div>
    );
}
