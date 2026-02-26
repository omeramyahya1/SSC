import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
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

const SidebarItem = ({ icon, text, children, to, onClick, isSelected }: { icon: string, text: string, to?: string, onClick?: () => void, children?: React.ReactNode, isSelected?: boolean }) => {
    const { i18n } = useTranslation();

    const content = (
        <>
            <img src={icon} alt="" className="w-6 h-6 opacity-40 group-hover:opacity-100" />
            <span className="truncate font-bold">{text}</span>
            {children}
        </>
    );

    if (to) {
        return (
            <NavLink
                to={to}
                className={({ isActive }) =>
                    `w-full group justify-start gap-4 px-4 h-12 text-md rounded-lg hover:bg-white hover:shadow-sm flex items-center ${isActive ? 'bg-white shadow-sm' : ''}`
                }
            >
                {content}
            </NavLink>
        );
    }

    return (
        <Button variant="ghost" dir={i18n.dir()} className={`w-full group justify-start gap-4 px-4 h-12 text-md rounded-lg hover:bg-white hover:shadow-sm ${isSelected ? 'bg-white shadow-sm' : ''}`} onClick={onClick}>
            {content}
        </Button>
    );
};

const SubscriptionDetails = () => {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const accountType = currentUser?.account_type;
    const userRole = currentUser?.role;

    if (accountType === 'enterprise' && userRole !== 'admin') {
        return null;
    }

    return (
        <PopoverContent className="w-80 bg-white" dir={i18n.dir()}>
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
    const { t, i18n } = useTranslation();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [nonNavSelected, setNonNavSelected] = useState<string | null>(null);
    const location = useLocation();

    useEffect(() => {
        setNonNavSelected(null);
    }, [location.pathname]);

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
                dir={i18n.dir()}
            >
                {/* Header */}
                <div className={`flex items-center p-4 h-20 ${showSidebarContent ? 'justify-between' : 'justify-center'}`}>
                   <img src="/ssc.svg"
                        alt="SSC Logo"
                        className="w-12 h-12 bg-white/90 p-2 rounded-base backdrop-blur-lg" />
                    {showSidebarContent &&
                        <Button variant="outline" size="icon" onClick={() => setIsCollapsed(!isCollapsed)} className={`group ${isCollapsed ? 'hover:bg-gray-700' : 'bg-gray-700'}`}>
                            <img src='/eva-icons (2)/outline/columns-vertical.png' alt={t('common.collapse_alt', 'collapse')} className={`w-full ${isCollapsed ? 'group-hover:invert' : 'invert'}`} />
                        </Button>
                    }
                </div>

                {/* Nav Items */}
                <nav className="flex-grow px-2 space-y-2 pt-4" >
                    <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/grid.png" text={t('dashboard.dashboard', 'Dashboard')} to="/home/dashboard" />
                        <SidebarItem icon="/eva-icons (2)/outline/people.png" text={t('dashboard.customers', 'Customers')} to="/home/customers" />
                    </div>
                    <Separator className="bg-gray-700 my-2" />
                    <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/archive.png" text={t('dashboard.inventory', 'Inventory')} to="/home/inventory" />
                        <SidebarItem icon="/eva-icons (2)/outline/file-text.png" text={t('dashboard.invoices', 'Invoices / Finance')} to="/home/invoices" />
                    </div>
                    <Separator className="bg-gray-700 my-2" />
                     <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/building.png" text={t('dashboard.team', 'Team / Organization')} to="/home/team"/>
                        <Popover>
                            <PopoverTrigger asChild>
                                <div onClick={() => setNonNavSelected('subscription')}>
                                    <SidebarItem icon="/eva-icons (2)/outline/credit-card.png" text={t('dashboard.subscription', 'My Plan')} isSelected={nonNavSelected === 'subscription'} />
                                </div>
                            </PopoverTrigger>
                            <SubscriptionDetails />
                        </Popover>
                    </div>
                     <Separator className="bg-gray-700 my-2" />
                     <div className="space-y-1">
                        <SidebarItem icon="/eva-icons (2)/outline/question-mark-circle.png" text={t('dashboard.support', 'Support')} isSelected={nonNavSelected === 'support'} onClick={() => setNonNavSelected('support')} />
                        <DialogTrigger asChild>
                            <div onClick={() => setNonNavSelected('settings')}>
                                <SidebarItem icon="/eva-icons (2)/outline/settings-2.png" text={t('dashboard.settings', 'Settings')} isSelected={nonNavSelected === 'settings'} />
                            </div>
                        </DialogTrigger>
                    </div>
                </nav>

                {/* Footer */}
                <div className="p-4">
                    <Button variant="ghost" className="w-full justify-start gap-4 px-2 h-12 rounded-lg hover:bg-white hover:shadow-sm group" onClick={handleSync}>
                        {isSyncing ? <Spinner className="w-6 h-6" /> : <img src="/eva-icons (2)/outline/sync.png" alt={t('common.synced_alt', 'synced')} className="w-6 h-6 opacity-40 group-hover:opacity-100" />}
                         {showSidebarContent && <span className="truncate">{isSyncing ? t('dashboard.syncing', 'Syncing...') : t('dashboard.synced', 'Synced')}</span>}
                    </Button>
                </div>
            </div>
            <SettingsModal />
        </Dialog>
    );
}
