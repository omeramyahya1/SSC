import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserStore, User } from "@/store/useUserStore";
import { useBranchStore } from "@/store/useBranchStore";
import { SearchableSelect } from "@/components/ui/searchable-select";
import toast from "react-hot-toast";
import { useSync } from "@/hooks/useSync";

interface EditEmployeeProps {
  employee: User;
  onOpenChange: (isOpen: boolean) => void;
}

export function EditEmployeeModal({
  employee,
  onOpenChange,
}: EditEmployeeProps) {
  const { t, i18n } = useTranslation();
  const { updateUser } = useUserStore();
  const { branches } = useBranchStore();
  const { sync } = useSync();

  const [selectedBranchUuid, setSelectedBranchUuid] = useState(employee.branch_uuid || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedBranchUuid(employee.branch_uuid || "");
  }, [employee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchUuid) return;

    if (!navigator.onLine) {
      toast.error(t("team.internet_required", "Active internet connection required for this action"));
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUser(employee.uuid, {
        branch_uuid: selectedBranchUuid,
      });
      toast.success(t("team.branch_changed_success", "Branch changed successfully"));
      sync();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(t("team.branch_update_error", "Failed to update branch"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = selectedBranchUuid !== "" && selectedBranchUuid !== employee.branch_uuid;

  return (
    <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {t("team.change_branch_title", "Change Employee Branch")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4 space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="employee_name" className="font-semibold">
              {t("team.employee_name", "Employee Name")}
            </Label>
            <Input
              id="employee_name"
              value={employee.username}
              disabled
              className="bg-gray-50"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="branch" className="font-semibold">
              {t("team.branch", "Branch")} <span className="text-red-500">*</span>
            </Label>
            <SearchableSelect
              items={branches.map((b) => ({ value: b.uuid, label: b.name }))}
              value={selectedBranchUuid}
              onValueChange={setSelectedBranchUuid}
              placeholder={t("team.select_branch", "Select a branch")}
            />
          </div>
        </div>

        <DialogFooter className="gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !isFormValid}
            className="text-white"
          >
            {isSubmitting
              ? t("common.saving", "Saving...")
              : t("common.save_changes", "Save Changes")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
