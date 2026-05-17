import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useUserStore } from "@/store/useUserStore";
import { useBranchStore } from "@/store/useBranchStore";
import api from "@/api/client";
import { toast } from "react-hot-toast";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import useLocalStorage from "@/hooks/useLocalStorage";

// Tauri APIs
const tauriDialog = (window as any).__TAURI__?.dialog;
const tauriFs = (window as any).__TAURI__?.fs;

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: "finance" | "inventory";
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  reportType,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useUserStore();
  const { branches } = useBranchStore();
  const isAdmin = currentUser?.role === "admin";

  const [selectedFormats, setSelectedFormats] = useState<string[]>(["excel"]);
  const [dateRangeType, setDateRangeType] = useState<string>("last_30_days");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);

  const dateLocale = i18n.language.startsWith("ar") ? arSA : enUS;

  const handleFormatToggle = (format: string) => {
    setSelectedFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format],
    );
  };

  const writeBinaryFileCompat = async (path: string, data: Uint8Array) => {
    if (!tauriFs) return;
    const fsApi: any = tauriFs;
    if (typeof fsApi.writeBinaryFile === "function") {
      await fsApi.writeBinaryFile(path, data);
    } else if (typeof fsApi.writeFile === "function") {
      await fsApi.writeFile(path, data);
    }
  };

  const handleExport = async () => {
    if (selectedFormats.length === 0) {
      toast.error(
        t("reporting.error.select_format", "Please select at least one format"),
      );
      return;
    }

    setIsExporting(true);
    try {
      let finalStart = startDate?.toISOString();
      let finalEnd = endDate?.toISOString();

      if (dateRangeType !== "custom") {
        const now = new Date();
        finalEnd = now.toISOString();
        let start = new Date();

        if (dateRangeType === "last_7_days") start.setDate(now.getDate() - 7);
        else if (dateRangeType === "last_30_days")
          start.setDate(now.getDate() - 30);
        else if (dateRangeType === "last_quarter")
          start.setMonth(now.getMonth() - 3);
        else if (dateRangeType === "last_year")
          start.setFullYear(now.getFullYear() - 1);
        else if (dateRangeType === "ytd")
          start = new Date(now.getFullYear(), 0, 1);

        finalStart = start.toISOString();
      }

      const payload = {
        report_type: reportType,
        formats: selectedFormats,
        lang: i18n.language,
        org_uuid: currentUser?.organization_uuid,
        branch_uuid: selectedBranch === "all" ? null : selectedBranch,
        user_uuid: !isAdmin ? currentUser?.uuid : null,
        start_date: finalStart,
        end_date: finalEnd,
      };

      const response = await api.post("/reporting/export", payload, {
        responseType: "blob",
      });

      const blob = new Blob([response.data]);
      const contentDisposition = response.headers["content-disposition"];
      const lastSavePath = localStorage.getItem("last_save");
      let fileName = `${reportType}_report_${format(new Date(), "yyyyMMdd")}`;
      if (selectedFormats.length > 1) {
        fileName += ".zip";
      } else {
        fileName += selectedFormats[0] === "excel" ? ".xlsx" : ".pdf";
      }

      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
        if (fileNameMatch && fileNameMatch[1]) fileName = fileNameMatch[1];
      }

      if (tauriDialog && tauriFs) {
        const savePath = await tauriDialog.save({
          defaultPath: lastSavePath + fileName,
          filters: [
            {
              name:
                selectedFormats.length > 1
                  ? "ZIP"
                  : selectedFormats[0].toUpperCase(),
              extensions:
                selectedFormats.length > 1
                  ? ["zip"]
                  : [selectedFormats[0] === "excel" ? "xlsx" : "pdf"],
            },
          ],
        });

        if (!savePath) {
          toast.error(t("invoicing.export_cancelled", "Export cancelled."));
          return;
        }

        const uint8Array = new Uint8Array(await blob.arrayBuffer());
        await writeBinaryFileCompat(savePath, uint8Array);
        toast.success(
          t("invoicing.export_success", "File saved successfully!"),
        );
        localStorage.setItem("last_save", savePath);
        onClose();
      } else {
        // Browser fallback
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success(
          t("reporting.success.exported", "Report exported successfully"),
        );
        onClose();
      }
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(
        t("reporting.error.export_failed", "Failed to generate report"),
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[425px] bg-white filter-none backdrop-blur-0"
        dir={i18n.dir()}
      >
        <DialogHeader>
          <DialogTitle className="text-primary text-xl">
            {reportType === "finance"
              ? t("reporting.finance_title", "Export Finance Report")
              : t("reporting.inventory_title", "Export Inventory Report")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "reporting.description",
              "Choose date range and formats for your report.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Date Range Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              {t("reporting.date_range", "Date Range")}
            </Label>
            <Select
              value={dateRangeType}
              onValueChange={setDateRangeType}
              dir={i18n.dir()}
            >
              <SelectTrigger className="w-full bg-gray-50 border-gray-200 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="last_7_days">
                  {t("reporting.ranges.last_7_days", "Last 7 Days")}
                </SelectItem>
                <SelectItem value="last_30_days">
                  {t("reporting.ranges.last_30_days", "Last 30 Days")}
                </SelectItem>
                <SelectItem value="last_quarter">
                  {t("reporting.ranges.last_quarter", "Last Quarter")}
                </SelectItem>
                <SelectItem value="ytd">
                  {t("reporting.ranges.ytd", "Year to Date")}
                </SelectItem>
                <SelectItem value="last_year">
                  {t("reporting.ranges.last_year", "Last Year")}
                </SelectItem>
                <SelectItem value="custom">
                  {t("reporting.ranges.custom", "Custom Range")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dateRangeType === "custom" && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t("reporting.start_date", "Start Date")}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal bg-gray-50 border-gray-200 h-10 px-3",
                        !startDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {startDate
                          ? format(startDate, "PP", { locale: dateLocale })
                          : t("invoicing.pick_date", "Pick a date")}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 bg-white shadow-xl border-gray-200"
                    align="start"
                  >
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      locale={dateLocale}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t("reporting.end_date", "End Date")}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal bg-gray-50 border-gray-200 h-10 px-3",
                        !endDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {endDate
                          ? format(endDate, "PP", { locale: dateLocale })
                          : t("invoicing.pick_date", "Pick a date")}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 bg-white shadow-xl border-gray-200"
                    align="start"
                  >
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      locale={dateLocale}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Branch Filter for Admin */}
          {isAdmin && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {t("reporting.branch", "Branch")}
              </Label>
              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                dir={i18n.dir()}
              >
                <SelectTrigger className="w-full bg-gray-50 border-gray-200 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">
                    {t("common.all_branches", "All Branches")}
                  </SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.uuid} value={b.uuid}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              {t("reporting.formats", "Export Formats")}
            </Label>
            <div className="flex gap-6">
              <div className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer group">
                <Checkbox
                  id="format-excel"
                  checked={selectedFormats.includes("excel")}
                  onCheckedChange={() => handleFormatToggle("excel")}
                  className="border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <Label
                  htmlFor="format-excel"
                  className="cursor-pointer font-medium group-hover:text-primary transition-colors"
                >
                  Excel (.xlsx)
                </Label>
              </div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer group">
                <Checkbox
                  id="format-pdf"
                  checked={selectedFormats.includes("pdf")}
                  onCheckedChange={() => handleFormatToggle("pdf")}
                  className="border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <Label
                  htmlFor="format-pdf"
                  className="cursor-pointer font-medium group-hover:text-primary transition-colors"
                >
                  PDF (.pdf)
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-4 sm:gap-0 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isExporting}
            className="hover:bg-gray-100 h-10 px-6"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="bg-primary text-white hover:shadow-md transition-all px-8 h-10 font-bold"
          >
            {isExporting
              ? t("common.exporting", "Exporting...")
              : t("common.export", "Export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
