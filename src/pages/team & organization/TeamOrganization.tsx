import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useUserStore, User } from "@/store/useUserStore";
import { useBranchStore, Branch } from "@/store/useBranchStore";
import { useOrganizationStore } from "@/store/useOrganizationStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmployeesTab } from "./EmployeesTab";
import { BranchesTab } from "./BranchesTab";
import { AddEmployeeModal } from "./AddEmployeeModal";
import { AddBranchModal } from "./AddBranchModal";
import { EditBranchModal } from "./EditBranchModal";
import { HoldToConfirmButton } from "@/components/ui/HoldToConfirmButton";
import toast from "react-hot-toast";

export default function TeamOrganization() {
  const { t, i18n } = useTranslation();
  const { currentUser, users, fetchEmployees, deleteUser } = useUserStore();
  const { branches, fetchBranches, deleteBranch } = useBranchStore();
  const { currentOrganization, fetchOrganization } = useOrganizationStore();

  const [activeTab, setActiveTab] = useState("employees");
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false);
  const [isEditBranchOpen, setIsEditBranchOpen] = useState(false);
  const [branchToEdit, setBranchToEdit] = useState<Branch | null>(null);

  const [employeeToDelete, setEmployeeToDelete] = useState<User | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);

  if (currentUser?.role !== "admin") {
    return <Navigate to="/home/dashboard" replace />;
  }

  useEffect(() => {
    if (currentUser?.organization_uuid) {
      fetchEmployees(currentUser.organization_uuid);
      fetchBranches();
      fetchOrganization(currentUser.organization_uuid);
    }
  }, [currentUser, fetchEmployees, fetchBranches, fetchOrganization]);

  const maxEmployees = currentOrganization?.emp_count || 0;
  const isLimitReached = users.length >= maxEmployees;

  const handleDeactivateEmployee = async () => {
    if (!employeeToDelete) return;
    if (!navigator.onLine) {
        toast.error(t('team.internet_required', 'Active internet connection required for this action'));
        return;
    }
    try {
        await deleteUser(employeeToDelete.user_id);
        toast.success(t('team.deactivate_success', 'Employee deactivated successfully'));
        setEmployeeToDelete(null);
    } catch (e) {
        toast.error(t('team.deactivate_error', 'Failed to deactivate employee'));
    }
  };

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;
    if (!navigator.onLine) {
        toast.error(t('team.internet_required', 'Active internet connection required for this action'));
        return;
    }
    try {
        await deleteBranch(branchToDelete.branch_id);
        toast.success(t('team.branch_delete_success', 'Branch deleted successfully'));
        setBranchToDelete(null);
    } catch (e) {
        toast.error(t('team.branch_delete_error', 'Failed to delete branch'));
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold">{t('team.title', 'Team & Organization')}</h1>
            <p className="text-muted-foreground">{currentOrganization?.name || ''}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-white border mb-4">
                <TabsTrigger value="employees" className="data-[state=active]:bg-primary data-[state=active]:text-white">
                    {t('team.employees', 'Employees')}
                </TabsTrigger>
                <TabsTrigger value="branches" className="data-[state=active]:bg-primary data-[state=active]:text-white">
                    {t('team.branches', 'Branches')}
                </TabsTrigger>
            </TabsList>

            <TabsContent value="employees">
                <EmployeesTab
                    employees={users}
                    maxEmployees={maxEmployees}
                    onAddEmployee={() => setIsAddEmployeeOpen(true)}
                    onDeactivateEmployee={setEmployeeToDelete}
                />
            </TabsContent>

            <TabsContent value="branches">
                <BranchesTab
                    branches={branches.filter(b => b.organization_uuid === currentUser.organization_uuid)}
                    isLimitReached={isLimitReached}
                    onAddBranch={() => setIsAddBranchOpen(true)}
                    onEditBranch={(branch) => {
                        setBranchToEdit(branch);
                        setIsEditBranchOpen(true);
                    }}
                    onDeleteBranch={setBranchToDelete}
                />
            </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <Dialog open={isAddEmployeeOpen} onOpenChange={setIsAddEmployeeOpen}>
        <AddEmployeeModal
            onOpenChange={setIsAddEmployeeOpen}
            organizationUuid={currentUser.organization_uuid!}
        />
      </Dialog>

      <Dialog open={isAddBranchOpen} onOpenChange={setIsAddBranchOpen}>
        <AddBranchModal
            onOpenChange={setIsAddBranchOpen}
            organizationUuid={currentUser.organization_uuid!}
        />
      </Dialog>

      <Dialog open={isEditBranchOpen} onOpenChange={setIsEditBranchOpen}>
        {branchToEdit && (
            <EditBranchModal
                branch={branchToEdit}
                onOpenChange={setIsEditBranchOpen}
            />
        )}
      </Dialog>

      {/* Deletion Confirmations */}
      <AlertDialog open={!!employeeToDelete} onOpenChange={(open) => !open && setEmployeeToDelete(null)}>
        <AlertDialogContent className="bg-white">
            <AlertDialogHeader>
                <AlertDialogTitle>{t('team.confirm_deactivate_title', 'Deactivate Employee?')}</AlertDialogTitle>
                <AlertDialogDescription>
                    {t('team.confirm_deactivate_desc', 'This will disable access and cascade deactivation to all related data. This action is non-recoverable.')}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                <HoldToConfirmButton
                    onConfirm={handleDeactivateEmployee}
                    variant="destructive"
                    className="w-auto px-8"
                    confirmationLabel={t('common.confirming', 'Confirming...')}
                >
                    {t('team.hold_to_deactivate', 'Hold to Deactivate')}
                </HoldToConfirmButton>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!branchToDelete} onOpenChange={(open) => !open && setBranchToDelete(null)}>
        <AlertDialogContent className="bg-white">
            <AlertDialogHeader>
                <AlertDialogTitle>{t('team.confirm_delete_branch_title', 'Delete Branch?')}</AlertDialogTitle>
                <AlertDialogDescription>
                    {t('team.confirm_delete_branch_desc', 'This will deactivate the branch and all its employees, projects, and inventory. This action is non-recoverable.')}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                <HoldToConfirmButton
                    onConfirm={handleDeleteBranch}
                    variant="destructive"
                    className="w-auto px-8"
                    confirmationLabel={t('common.confirming', 'Confirming...')}
                >
                    {t('team.hold_to_delete', 'Hold to Delete')}
                </HoldToConfirmButton>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
