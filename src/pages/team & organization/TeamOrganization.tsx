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
import { SubscriptionBanner } from "../dashboard/SubscriptionBanner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/api/client";
import { useSync } from "@/hooks/useSync";

export default function TeamOrganization() {
  const { t, i18n } = useTranslation();
  const { currentUser, users, fetchEmployees, deleteUser } = useUserStore();
  const { branches, fetchBranches, deleteBranch } = useBranchStore();
  const { currentOrganization, fetchOrganization } = useOrganizationStore();
  const { sync } = useSync();

  const [activeTab, setActiveTab] = useState("employees");
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false);
  const [isEditBranchOpen, setIsEditBranchOpen] = useState(false);
  const [branchToEdit, setBranchToEdit] = useState<Branch | null>(null);

  const [employeeToDelete, setEmployeeToDelete] = useState<User | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [deactivatePassword, setDeactivatePassword] = useState("");
  const [isDeactivatePasswordVerified, setIsDeactivatePasswordVerified] = useState(false);
  const [isVerifyingDeactivatePassword, setIsVerifyingDeactivatePassword] = useState(false);

  useEffect(() => {
    if (!employeeToDelete) return;
    setDeactivatePassword("");
    setIsDeactivatePasswordVerified(false);
    setIsVerifyingDeactivatePassword(false);
  }, [employeeToDelete]);

  useEffect(() => {
    if (currentUser?.organization_uuid) {
      fetchEmployees(currentUser.organization_uuid);
      fetchBranches();
      fetchOrganization(currentUser.organization_uuid);
    }
  }, [currentUser, fetchEmployees, fetchBranches, fetchOrganization]);


  if (currentUser?.role !== "admin") {
    return <Navigate to="/home/dashboard" replace />;
  }

  const isStatusRestricted = currentUser?.status === 'grace' || currentUser?.status === 'expired' || currentUser?.status === 'trial';
  const maxEmployees = currentOrganization?.emp_count || 0;
  const isLimitReached = users.length >= maxEmployees;

  const handleDeactivateEmployee = async () => {
    if (!employeeToDelete) return;
    if (!navigator.onLine) {
        toast.error(t('team.internet_required', 'Active internet connection required for this action'));
        return;
    }
    try {
        await deleteUser(employeeToDelete.uuid, deactivatePassword);
        toast.success(t('team.deactivate_success', 'Employee deactivated successfully'));
        sync();
        setEmployeeToDelete(null);
    } catch (e) {
        toast.error(t('team.deactivate_error', 'Failed to deactivate employee'));
    }
  };

  const handleVerifyDeactivatePassword = async () => {
    if (!deactivatePassword.trim()) return;
    setIsVerifyingDeactivatePassword(true);
    try {
      await api.post("/authentications/verify-password", { password: deactivatePassword });
      setIsDeactivatePasswordVerified(true);
      toast.success(t('settings.password_verified', 'Password verified'));
    } catch (e: any) {
      setIsDeactivatePasswordVerified(false);
      const msg = e?.response?.data?.error || t('settings.invalid_password', 'Invalid password');
      toast.error(msg);
    } finally {
      setIsVerifyingDeactivatePassword(false);
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
        sync();
        setBranchToDelete(null);
    } catch (e) {
        toast.error(t('team.branch_delete_error', 'Failed to delete branch'));
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
        <SubscriptionBanner />
      <div className="p-6 space-y-6" dir={i18n.dir()}>
        <div className="flex flex-row gap-2 align-middle items-center">
            <h1 className="text-primary text-3xl font-bold">{t('team.title', 'Team & Organization')}</h1>
            <span className="text-muted-foreground">({currentOrganization?.name || ''})</span>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir={i18n.dir()}>
            <TabsList className="bg-white border">
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
                    isStatusRestricted={isStatusRestricted}
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
                    isStatusRestricted={isStatusRestricted}
                />
            </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <Dialog open={isAddEmployeeOpen} onOpenChange={setIsAddEmployeeOpen}>
        {currentUser.organization_uuid && (
        <AddEmployeeModal
            onOpenChange={setIsAddEmployeeOpen}
            organizationUuid={currentUser.organization_uuid}
        />
        )}
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
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-neutral/40 uppercase">
                  {t('auth.current_password', 'Current Password')}
                </Label>
                <Input
                  type="password"
                  value={deactivatePassword}
                  onChange={(e) => {
                    setDeactivatePassword(e.target.value);
                    setIsDeactivatePasswordVerified(false);
                  }}
                  className="bg-gray-50 border-none rounded-xl h-12 font-medium"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleVerifyDeactivatePassword}
                  disabled={isVerifyingDeactivatePassword || !deactivatePassword.trim()}
                  className="h-10 rounded-xl font-bold"
                >
                  {t('common.verify', 'Verify')}
                </Button>
                {isDeactivatePasswordVerified && (
                  <p className="text-[10px] font-bold uppercase text-green-600">
                    {t('settings.verified', 'Verified')}
                  </p>
                )}
              </div>
            </div>
            <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                <HoldToConfirmButton
                    onConfirm={handleDeactivateEmployee}
                    variant="destructive"
                    className="w-auto px-8"
                    confirmationLabel={t('common.confirming', 'Confirming...')}
                    disabled={!isDeactivatePasswordVerified || isVerifyingDeactivatePassword}
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
    </div>
  );
}
