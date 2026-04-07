import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
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
import { useCustomerStore, Customer } from '@/store/useCustomerStore';
import { useUserStore } from '@/store/useUserStore';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CustomerCard } from './CustomerCard';
import { AddCustomerModal } from './AddCustomerModal';
import { EditCustomerModal } from './EditCustomerModal';
import toast from "react-hot-toast";

export default function CustomersPage() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const isExpired = currentUser?.status === 'expired';

    const {
        customers,
        isLoading,
        error,
        fetchCustomers,
        deleteCustomer
    } = useCustomerStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    const filteredCustomers = useMemo(() => {
        return customers.filter(customer => {
            const q = searchQuery.toLowerCase();
            return (
                customer.full_name.toLowerCase().includes(q) ||
                (customer.email || '').toLowerCase().includes(q) ||
                (customer.phone_number || '').toLowerCase().includes(q)
            );
        });
    }, [customers, searchQuery]);

    const handleEdit = (customer: Customer) => {
        setCustomerToEdit(customer);
        setIsEditModalOpen(true);
    };

    const handleDelete = (customer: Customer) => {
        setCustomerToDelete(customer);
    };

    const confirmDelete = async () => {
        if (!customerToDelete) return;
        try {
            await deleteCustomer(customerToDelete.customer_id);
            toast.success(t('customers.delete_success', 'Customer deleted successfully'));
        } catch (e) {
            toast.error(t('customers.delete_error', 'Failed to delete customer'));
        } finally {
            setCustomerToDelete(null);
        }
    };

    const renderContent = () => {
        if (isLoading && customers.length === 0) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Spinner className="w-12 h-12" />
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Alert variant="destructive" className="max-w-md">
                        <AlertTitle>{t('customers.error_title', 'Failed to Load Customers')}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                </div>
            );
        }

        if (filteredCustomers.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
                    <img src="/illustrations/no-projects.png" alt="no customers" className="w-32 h-32 opacity-20 mb-4" />
                    <h3 className="text-lg font-bold text-gray-400">
                        {searchQuery ? t('dashboard.no_search_results', 'No results match your search') : t('customers.no_customers_found', 'No customers found')}
                    </h3>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCustomers.map(customer => (
                    <CustomerCard
                        key={customer.uuid}
                        customer={customer}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                    />
                ))}
            </div>
        );
    };

    return (
        <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
            <div className="p-6 space-y-6">
                {/* Header & Toolbar */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-primary text-3xl font-bold">{t('customers.title', 'Customers')}</h1>
                    </div>

                    <div className="flex flex-row justify-between items-center gap-4">
                        <div className="relative flex-grow max-w-md">
                            <img
                                src="/eva-icons (2)/outline/search.png"
                                alt="search"
                                className="w-5 h-5 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-60"
                            />
                            <Input
                                placeholder={t('customers.search_ph', 'Search by name, email, phone...')}
                                className="bg-white ltr:pl-10 rtl:pr-10 border-gray-200"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    onClick={() => setSearchQuery('')}
                                >
                                    <img src="/eva-icons (2)/outline/close.png" alt="clear" className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <Button
                            type="button"
                            onClick={() => setIsAddModalOpen(true)}
                            disabled={isExpired}
                            className="text-white rounded-lg hover:shadow-lg"
                        >
                            <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert me-2" />
                            <span className="me-2">{t('customers.add_customer', 'Add New Customer')}</span>
                        </Button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="mt-4">
                    {renderContent()}
                </div>
            </div>

            {/* Modals */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <AddCustomerModal onOpenChange={setIsAddModalOpen} />
            </Dialog>

            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                {customerToEdit && (
                    <EditCustomerModal
                        customer={customerToEdit}
                        onOpenChange={setIsEditModalOpen}
                    />
                )}
            </Dialog>

            <AlertDialog open={!!customerToDelete} onOpenChange={(isOpen) => !isOpen && setCustomerToDelete(null)}>
                <AlertDialogContent className="bg-white border-2 border-gray">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('customers.confirm_delete.title', 'Are you sure you want to delete this customer?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('customers.confirm_delete.description', 'This action cannot be undone.')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setCustomerToDelete(null)}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-50 text-red-700 border-red-200 hover:text-white hover:bg-red-500"
                            onClick={confirmDelete}
                        >
                            {t('common.delete', 'Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
