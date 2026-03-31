import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { InvoiceEditor } from '@/pages/dashboard/invoicing/InvoiceEditor';
import { useInvoiceStore } from '@/store/useInvoiceStore';
import api from '@/api/client';
import { Spinner } from '@/components/ui/spinner';
import { Project } from '@/store/useProjectStore';

interface InvoiceEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceUuid: string;
}

export function InvoiceEditorModal({ isOpen, onClose, invoiceUuid }: InvoiceEditorModalProps) {
    const { t, i18n } = useTranslation();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchContext = async () => {
            if (!isOpen || !invoiceUuid) return;
            setIsLoading(true);
            try {
                // 1. Get the invoice details
                const { data: invoice } = await api.get(`/invoices/${invoiceUuid}`);
                // 2. Get the project details
                const { data: proj } = await api.get(`/projects/uuid/${invoice.project_uuid}`);
                setProject(proj);
            } catch (error) {
                console.error("Failed to load invoice context", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchContext();
    }, [isOpen, invoiceUuid]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 overflow-hidden bg-white border-none rounded-2xl shadow-2xl" dir={i18n.dir()}>
                {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                        <Spinner className="w-12 h-12" />
                    </div>
                ) : project ? (
                    <div className="h-full overflow-hidden flex flex-col">
                        <InvoiceEditor project={project} onBack={onClose} />
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground font-bold">
                        {t('invoicing.load_error', 'Failed to load project details.')}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
