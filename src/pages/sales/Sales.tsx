import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    FileText,
    Receipt,
    Plus,
    Building2
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

export default function Sales() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const { branches, fetchBranches } = useBranchStore();

    const [activeTab, setActiveTab] = useState('reports');
    const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);

    // Filtering state for Admin/HQ views
    const [selectedBranch, setSelectedBranch] = useState<string>('all');

    const isAdmin = currentUser?.role === 'admin';

    useEffect(() => {
        if (isAdmin) {
            fetchBranches();
        }
    }, [isAdmin]);

    // We can assume branches are available from the user's organization if needed,
    // but for now let's keep it simple or fetch them if isAdmin.

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
            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">{t('sales.title', 'Sales')}</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
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
                        <Button onClick={() => setIsAddPaymentModalOpen(true)} className="text-white">
                            <Plus className="h-4 w-4" />
                            {t('finances.add_payment', 'Add Payment')}
                        </Button>
                    </div>
                </div>

                {/* Main Tabs */}
                <Tabs defaultValue="reports" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList className="bg-white border p-1 h-10 w-fit">
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
        </main>
    );
}
