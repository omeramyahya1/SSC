import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    LayoutDashboard, 
    FileText, 
    Receipt, 
    Plus,
    Building2,
    Filter
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
import { FinancesDashboard } from './FinancesDashboard';
import { InvoicesList } from './InvoicesList';
import { PaymentsList } from './PaymentsList';
import { AddPaymentModal } from './AddPaymentModal';

export default function InvoicesFinance() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    
    const [activeTab, setActiveTab] = useState('finances');
    const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
    
    // Filtering state for Admin/HQ views
    const [selectedBranch, setSelectedBranch] = useState<string>('all');
    
    const isAdmin = currentUser?.role === 'admin';
    
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
                        <h1 className="text-3xl font-bold">{t('invoicing.title', 'Invoicing & Finances')}</h1>
                        <p className="text-muted-foreground">{t('invoicing.subtitle', 'Manage your revenue, invoices, and payments in one place.')}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                                <SelectTrigger className="w-[200px] bg-white">
                                    <Building2 className="h-4 w-4 me-2 opacity-60" />
                                    <SelectValue placeholder={t('finances.all_branches', 'All Branches')} />
                                </SelectTrigger>
                                <SelectContent className='bg-white'>
                                    <SelectItem value="all">{t('finances.all_branches', 'All Branches')}</SelectItem>
                                    {/* Map actual branches here if available in store */}
                                </SelectContent>
                            </Select>
                        )}
                        <Button onClick={() => setIsAddPaymentModalOpen(true)} className="text-white">
                            <Plus className="h-4 w-4 me-2" />
                            {t('finances.add_payment', 'Add Payment')}
                        </Button>
                    </div>
                </div>

                {/* Main Tabs */}
                <Tabs defaultValue="finances" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="bg-white border p-1 h-auto w-fit">
                        <TabsTrigger value="finances" className="font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-white">
                            <LayoutDashboard className="h-4 w-4 me-2" />
                            {t('finances.tabs.dashboard', 'Finances')}
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

                    <TabsContent value="finances" className="mt-0">
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
