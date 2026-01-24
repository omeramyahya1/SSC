import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { SettingsModal } from './SettingsModal';
import { useUserStore } from '@/store/useUserStore';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const SidebarItem = ({ icon, text, onClick, children }: { icon: string, text: string, onClick?: () => void, children?: React.ReactNode }) => (
    <Button variant="ghost" className="w-full justify-start gap-4 px-4 h-12 text-md rounded-lg hover:bg-white hover:shadow-sm" onClick={onClick}>
        <img src={icon} alt="" className="w-6 h-6 opacity-40" />
        <span className="truncate font-bold">{text}</span>
        {children}
    </Button>
);

const SubscriptionDetails = () => {
    const { t } = useTranslation();
    const { currentUser } = useUserStore();
    const accountType = currentUser?.account_type;
    const userRole = currentUser?.role;

    if (accountType === 'enterprise' && userRole !== 'admin') {
        return null;
    }

    return (
        <PopoverContent className="w-80 bg-white">
            <div className="grid gap-4">
                <div className="space-y-2">
                    <h4 className="font-medium leading-none">{t('dashboard.subscription', 'My Plan')}</h4>
                    <p className="text-sm text-muted-foreground">
                        {t('dashboard.sub_details_desc', 'Your current subscription details.')}
                    </p>
                </div>
                {accountType === 'standard' && (
                    <div className="grid gap-2">
                        <div className="grid grid-cols-2 items-center gap-4">
                            <span>{t('dashboard.status', 'Status')}:</span>
                            <span className="font-semibold text-green-600">{currentUser?.status === 'grace' ? t('dashboard.grace', 'Grace Period') : t('dashboard.active', 'Active')}</span>
                        </div>
                         <div className="grid grid-cols-2 items-center gap-4">
                            <span>{t('dashboard.end_date', 'End Date')}:</span>
                            <span>Dec 31, 2024</span>
                        </div>
                        <Button className="mt-2 w-full">{t('dashboard.renew_upgrade', 'Renew / Upgrade')}</Button>
                    </div>
                )}
                 {accountType === 'enterprise' && (
                    <div className="grid gap-2">
                         <p>{t('dashboard.enterprise_desc', 'Manage your enterprise subscription in the organization settings.')}</p>
                    </div>
                )}
                 {(accountType as any) === 'lifetime' && (
                    <div className="grid gap-2 text-center p-4 bg-gray-100 rounded-md">
                        <span className="font-bold">{t('dashboard.lifetime_license', 'Lifetime License')}</span>
                    </div>
                )}
            </div>
        </PopoverContent>
    );
};

export function Sidebar() {
    const { t } = useTranslation();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = () => {
        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 2000);
    };

    const showSidebarContent = !isCollapsed || isHovering;

    return (
        <Dialog>
            <div
                className={`flex flex-col bg-primary-gray transition-all duration-300 ease-in-out ${isCollapsed && !isHovering ? 'w-20' : 'w-64'}`}
                onMouseEnter={() => { if(isCollapsed) setIsHovering(true) }}
                onMouseLeave={() => { if(isCollapsed) setIsHovering(false) }}
            >
                {/* Header */}
                <div className={`flex items-center p-4 h-20 ${showSidebarContent ? 'justify-between' : 'justify-center'}`}>
                   <img src="/ssc.svg" alt="SSC Logo" className="w-10 h-10" />
                    {showSidebarContent &&
                        <Button variant="outline" size="icon" onClick={() => setIsCollapsed(!isCollapsed)} className="hover:bg-gray-700">
                            <img src={`/eva-icons (2)/outline/${isCollapsed ? 'chevron-right.png' : 'chevron-left.png'}`} alt="collapse" className="w-full hover:invert" />
                        </Button>
                    }
                </div>

                {/* Nav Items */}
                <nav className="flex-grow px-2 space-y-2 pt-4">
                    <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/grid.png" text={t('dashboard.dashboard', 'Dashboard')} />
                        <SidebarItem icon="/eva-icons (2)/outline/flash.png" text={t('dashboard.quick_calc', 'Quick Calc')} />
                    </div>
                    <Separator className="bg-gray-700 my-2" />
                    <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/archive.png" text={t('dashboard.inventory', 'Inventory')} />
                        <SidebarItem icon="/eva-icons (2)/outline/file-text.png" text={t('dashboard.invoices', 'Invoices / Finance')} />
                    </div>
                    <Separator className="bg-gray-700 my-2" />
                     <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/people.png" text={t('dashboard.team', 'Team / Organization')} />
                        <Popover>
                            <PopoverTrigger asChild>
                                <div>
                                    <SidebarItem icon="/eva-icons (2)/outline/credit-card.png" text={t('dashboard.subscription', 'My Plan / Subscription')}>
                                        {!showSidebarContent && <div className="absolute left-1/2 -translate-x-1/2 bottom-0 h-1 w-8 rounded-full bg-blue-500"></div>}
                                    </SidebarItem>
                                </div>
                            </PopoverTrigger>
                            <SubscriptionDetails />
                        </Popover>
                    </div>
                     <Separator className="bg-gray-700 my-2" />
                     <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/question-mark-circle.png" text={t('dashboard.support', 'Support')} />
                        <DialogTrigger asChild>
                            <div>
                                <SidebarItem icon="/eva-icons (2)/outline/settings-2.png" text={t('dashboard.settings', 'Settings')} />
                            </div>
                        </DialogTrigger>
                    </div>
                </nav>

                {/* Footer */}
                <div className="p-4">
                    <Button variant="ghost" className="w-full justify-start gap-4 px-2 h-12 rounded-lg hover:bg-white hover:shadow-sm" onClick={handleSync}>
                        {isSyncing ? <Spinner className="w-6 h-6" /> : <img src="/eva-icons (2)/outline/sync.png" alt="synced" className="w-6 h-6 opacity-40" />}
                         {showSidebarContent && <span className="truncate">{isSyncing ? t('dashboard.syncing', 'Syncing...') : t('dashboard.synced', 'Synced')}</span>}
                    </Button>
                </div>
            </div>
            <SettingsModal />
        </Dialog>
    );
}
