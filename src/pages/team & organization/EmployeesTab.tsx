import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User } from '@/store/useUserStore';
import { useBranchStore } from '@/store/useBranchStore';
import { Circle, MinusCircle } from 'lucide-react';

interface EmployeesTabProps {
    employees: User[];
    maxEmployees: number;
    onAddEmployee: () => void;
    onDeactivateEmployee: (employee: User) => void;
}

export function EmployeesTab({ employees, maxEmployees, onAddEmployee, onDeactivateEmployee }: EmployeesTabProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const { branches } = useBranchStore();

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const q = searchQuery.toLowerCase();
            return (
                emp.username.toLowerCase().includes(q) ||
                emp.email.toLowerCase().includes(q)
            );
        });
    }, [employees, searchQuery]);

    const getBranchName = (branchUuid?: string) => {
        if (!branchUuid) return t('common.n_a', 'N/A');
        const branch = branches.find(b => b.uuid === branchUuid);
        return branch ? branch.name : t('common.unknown', 'Unknown');
    };

    const isLimitReached = employees.length >= maxEmployees;

    return (
        <div className="space-y-4">
            <div className="flex flex-col align-top md:flex-row justify-between items-start md:items-center gap-4">
                <div className="relative flex-grow max-w-md w-full">
                    <img
                        src="/eva-icons (2)/outline/search.png"
                        alt="search"
                        className="w-5 h-5 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-60"
                    />
                    <Input
                        placeholder={t('team.search_employees_ph', 'Search by name or email...')}
                        className="bg-white ltr:pl-10 rtl:pr-10 border-gray-200"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className='flex flex-row gap-4'>
                        <div className="font-bold">
                            <span className={`text-4xl ${isLimitReached ? "text-red-500 font-bold" : "text-primary"}`}>
                                {employees.length}
                            </span>
                            <span className="text-muted-foreground mx-1">/</span>
                            <span className="text-muted-foreground">{maxEmployees}</span>
                            <span className="ms-2 text-muted-foreground">({t('team.employees', 'Employees')})</span>
                        </div>
                            <Button
                                onClick={onAddEmployee}
                                disabled={false}
                                className="text-white"
                            >
                                <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert" />
                                {t('team.add_employee', 'Add Employee')}
                            </Button>
                    </div>
                </div>
            </div>

            {filteredEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
                    <h3 className="text-lg font-bold text-gray-400">
                        {searchQuery ? t('common.no_results', 'No results match your search') : t('team.no_employees', 'No employees found')}
                    </h3>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredEmployees.map(emp => (
                        <Card key={emp.uuid} className="overflow-hidden hover:shadow-md transition-shadow bg-white">
                            <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-lg font-bold max-w-[180px]" title={emp.username}>
                                        {emp.username}
                                    </h3>
                                    <div className="flex items-center  text-sm text-muted-foreground">
                                        <Circle className={`h-4 w-4 text-white rounded-full ${emp.status === 'active' ? 'bg-semantic-success' : (emp.status === 'trial' ? 'bg-semantic-info' : (emp.status === 'grace'? 'bg-semantic-warning' : 'bg-semantic-error'))}`}/>
                                        <Badge variant="secondary" className="text-[10px] uppercase">
                                            {t(`team.role.${emp.role}`, emp.role)}
                                        </Badge>
                                    </div>
                                </div>

                                {
                                    emp?.role !== 'admin' && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <img src="/eva-icons (2)/outline/more-vertical.png" alt="options" className="w-5 h-5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-white">
                                                <DropdownMenuItem
                                                    className="group rounded-lg text-red-700 cursor-pointer hover:text-white  hover:bg-red-500"
                                                    onClick={() => onDeactivateEmployee(emp)}
                                                >
                                                    <MinusCircle className='className="w-4 h-4 opacity-70 group-hover:text-white"'/>
                                                    {t('team.deactivate', 'Deactivate')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )
                                }

                            </CardHeader>
                            <CardContent className="p-4 pt-0 space-y-3">
                                <div className="text-sm space-y-2">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <img src="/eva-icons (2)/outline/email.png" alt="email" className="w-4 h-4 opacity-60" />
                                        <span className="truncate">{emp.email}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <img src="/eva-icons (2)/outline/pin.png" alt="branch" className="w-4 h-4 opacity-60" />
                                        <span>{getBranchName(emp.branch_uuid)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <img src="/eva-icons (2)/outline/clock.png" alt="last login" className="w-4 h-4 opacity-60" />
                                        <span>{t('team.last_login', 'Last Login')}: {emp.updated_at ? new Date(emp.updated_at).toLocaleDateString() : t('common.never', 'Never')}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
