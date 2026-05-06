import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    FileText,
    Receipt,
    Building2,
    DollarSign,
    FilePlus
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { useUserStore } from '@/store/useUserStore';
import { useBranchStore } from '@/store/useBranchStore';
import { useEffect } from 'react';
import { FinancesDashboard } from './FinancesDashboard';
import { InvoicesList } from './InvoicesList';
import { PaymentsList } from './PaymentsList';
import { AddPaymentModal } from './AddPaymentModal';
import { InvoiceEditorModal } from './InvoiceEditorModal';
import { CreateIndependentInvoiceModal } from './CreateIndependentInvoiceModal';
import { SubscriptionBanner } from '../dashboard/SubscriptionBanner';
import { Dialog } from '@/components/ui/dialog';
import { useInvoiceStore } from '@/store/useInvoiceStore';
import { useCustomerStore } from '@/store/useCustomerStore';
import { toast } from 'react-hot-toast';

export default function Sales() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const { branches, fetchBranches } = useBranchStore();
    const { createInvoice } = useInvoiceStore();
    const { createCustomer } = useCustomerStore();

    const [activeTab, setActiveTab] = useState('reports');
    const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
    const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);
    const [selectedInvoiceUuid, setSelectedInvoiceUuid] = useState<string | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    // Filtering state for Admin/HQ views
    const [selectedBranch, setSelectedBranch] = useState<string>('all');

    const isAdmin = currentUser?.role === 'admin';

    useEffect(() => {
        if (isAdmin && currentUser?.organization_uuid) {
            fetchBranches({ org_uuid: currentUser.organization_uuid });
        }
    }, [isAdmin, currentUser?.organization_uuid, fetchBranches]);

    const handleCreateIndependentInvoice = async (data: any) => {
        try {
            let customerUuid = data.customer_uuid;

            // 1. Create Customer if it doesn't exist
            if (!customerUuid) {
                const newCustomer = await createCustomer({
                    full_name: data.customer_name,
                    email: data.email,
                    phone_number: data.phone_number,
                    organization_uuid: currentUser?.organization_uuid,
                });
                if (!newCustomer) throw new Error("Failed to create customer");
                customerUuid = newCustomer.uuid;
            }

            // 2. Create the Independent Invoice (no project association).
            const newInvoice = await createInvoice({
                user_uuid: currentUser?.uuid,
                status: 'pending',
                invoice_details: {
                    customer_uuid: customerUuid,
                    project_location: data.project_location,
                    shipping_fee: 0,
                    installation_fee: 0,
                    discount_percent: 0,
                    due_date: new Date().toISOString()
                },
                invoice_items: { manual: [], inventory: [] },
                amount: 0
            });

            if (!newInvoice) throw new Error("Failed to create invoice");

            // 3. Open the Editor
            setSelectedInvoiceUuid(newInvoice.uuid);
            setIsEditorOpen(true);
            setIsCreateInvoiceModalOpen(false);

            // Switch to invoices tab to see the new entry if they close the editor
            setActiveTab('invoices');

        } catch (error: any) {
            toast.error(error.message || "Failed to create invoice");
        }
    };

    const filterParams = useMemo(() => {
        const params: any = {
            org_uuid: currentUser?.organization_uuid
        };
        if (selectedBranch !== 'all') {
            params.branch_uuid = selectedBranch;
        } else if (!isAdmin && currentUser?.branch_uuid) {
            params.branch_uuid = currentUser.branch_uuid;
        }
        return params;
    }, [currentUser, selectedBranch, isAdmin]);

    return (
        <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
            <SubscriptionBanner />
            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-primary text-3xl font-bold">{t('sales.title', 'Sales')}</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <Select value={selectedBranch} onValueChange={setSelectedBranch} dir={i18n.dir()}>
                                <SelectTrigger className={`h-auto 8 w-fit gap-2 ${selectedBranch !== "all" ? "bg-primary text-white": "bg-white"} `}>
                                    <Building2 className="h-4 w-4 opacity-60" />
                                    <SelectValue placeholder={t('finances.all_branches', 'All Branches')} />
                                </SelectTrigger>
                                <SelectContent className='bg-white'>
                                    <SelectItem value="all">{t('finances.all_branches', 'All Branches')}</SelectItem>
                                    {branches.map((branch) => (
                                        <SelectItem key={branch.uuid} value={branch.uuid}>
                                            {branch.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Button onClick={() => setIsAddPaymentModalOpen(true)} className="text-white bg-green-600">
                            <DollarSign className="h-4 w-4" />
                            {t('finances.add_payment', 'Add Payment')}
                        </Button>
                        <Button onClick={() => setIsCreateInvoiceModalOpen(true)} variant="default" className="text-white hover:bg-primary/5">
                            <FilePlus className="h-4 w-4" />
                            {t('finances.create_invoice', 'Create Invoice')}
                        </Button>
                    </div>
                </div>

                {/* Main Tabs */}
                <Tabs defaultValue="reports" value={activeTab} onValueChange={setActiveTab} className="space-y-4" dir={i18n.dir()}>
                    <TabsList className="bg-white border p-1 h-auto w-fit">
                        <TabsTrigger value="reports" className="font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-white">
                            <LayoutDashboard className="h-4 w-4 me-2" />
                            {t('finances.tabs.reports', 'Reports')}
                        </TabsTrigger>
                        <TabsTrigger value="invoices" className="font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-white">
                            <FileText className="h-4 w-4 me-2" />
                            {t('finances.tabs.invoices', 'Invoices')}
                        </TabsTrigger>
                        <TabsTrigger value="payments" className="font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-white">
                            <Receipt className="h-4 w-4 me-2" />
                            {t('finances.tabs.payments', 'Payments')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="reports" className="mt-0">
                        <FinancesDashboard filterParams={filterParams} />
                    </TabsContent>

                    <TabsContent value="invoices" className="mt-0">
                        <InvoicesList filterParams={filterParams} />
                    </TabsContent>

                    <TabsContent value="payments" className="mt-0">
                        <PaymentsList filterParams={filterParams} />
                    </TabsContent>
                </Tabs>
            </div>

            <AddPaymentModal
                isOpen={isAddPaymentModalOpen}
                onClose={() => setIsAddPaymentModalOpen(false)}
                orgUuid={currentUser?.organization_uuid}
            />

            <Dialog open={isCreateInvoiceModalOpen} onOpenChange={setIsCreateInvoiceModalOpen}>
                <CreateIndependentInvoiceModal
                    onOpenChange={setIsCreateInvoiceModalOpen}
                    onSubmit={handleCreateIndependentInvoice}
                />
            </Dialog>

            {selectedInvoiceUuid && (
                <InvoiceEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => {
                        setIsEditorOpen(false);
                        setSelectedInvoiceUuid(null);
                    }}
                    invoiceUuid={selectedInvoiceUuid}
                />
            )}
        </main>
    );
}
