import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Branch } from '@/store/useBranchStore';

interface BranchesTabProps {
    branches: Branch[];
    isLimitReached: boolean;
    onAddBranch: () => void;
    onEditBranch: (branch: Branch) => void;
    onDeleteBranch: (branch: Branch) => void;
}

export function BranchesTab({ branches, onAddBranch, onEditBranch, onDeleteBranch }: BranchesTabProps) {
    const { t, i18n } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredBranches = useMemo(() => {
        return branches.filter(branch => {
            const q = searchQuery.toLowerCase();
            return (
                branch.name.toLowerCase().includes(q) ||
                (branch.location || '').toLowerCase().includes(q)
            );
        });
    }, [branches, searchQuery]);

    return (
        <div className="space-y-4" dir={i18n.dir()}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="relative flex-grow max-w-md w-full">
                    <img
                        src="/eva-icons (2)/outline/search.png"
                        alt="search"
                        className="w-5 h-5 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-60"
                    />
                    <Input
                        placeholder={t('team.search_branches_ph', 'Search by name or location...')}
                        className="bg-white ltr:pl-10 rtl:pr-10 border-gray-200"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <Button
                    onClick={onAddBranch}
                    // disabled={isLimitReached}
                    className="text-white w-full md:w-auto"
                >
                    <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert" />
                    {t('team.add_branch', 'Add Branch')}
                </Button>
            </div>

            {filteredBranches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
                    <h3 className="text-lg font-bold text-gray-400">
                        {searchQuery ? t('common.no_results', 'No results match your search') : t('team.no_branches', 'No branches found')}
                    </h3>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBranches.map(branch => (
                        <Card key={branch.uuid} className="overflow-hidden hover:shadow-md transition-shadow bg-white">
                            <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-lg font-bold truncate max-w-[200px]" title={branch.name}>
                                        {branch.name}
                                    </h3>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <img src="/eva-icons (2)/outline/pin.png" alt="location" className="w-4 h-4 opacity-60" />
                                        <span>{branch.location || t('common.no_location', 'No location')}</span>
                                    </div>
                                </div>

                                <DropdownMenu dir={i18n.dir()}>
                                    {
                                        branch.name === 'HQ' || branch.name === 'الفرع الرئيسي' || (
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <img src="/eva-icons (2)/outline/more-vertical.png" alt="options" className="w-5 h-5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                        )
                                    }

                                    <DropdownMenuContent align="end" className="bg-white">
                                        <DropdownMenuItem
                                            className="cursor-pointer rounded-lg hover:bg-gray-100"
                                            onClick={() => onEditBranch(branch)}
                                        >
                                            <img src="/eva-icons (2)/outline/edit.png" alt="edit" className="w-4 h-4 me-2 opacity-70" />
                                            {t('common.edit', 'Edit Details')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="group rounded-lg text-red-700 cursor-pointer hover:text-white  hover:bg-red-500"
                                            onClick={() => onDeleteBranch(branch)}
                                        >
                                            <img src="/eva-icons (2)/outline/trash-2.png" alt="delete" className="w-4 h-4 me-2 opacity-70 group-hover:invert" />
                                            {t('common.delete', 'Delete')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
