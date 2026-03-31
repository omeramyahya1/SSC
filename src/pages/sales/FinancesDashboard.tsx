import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    TrendingUp,
    DollarSign,
    FileText,
    ArrowUpRight,
    Archive,
    Calendar as CalendarIcon,
    ChevronDown
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import api from '@/api/client';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

interface FinancesDashboardProps {
    filterParams: {
        org_uuid?: string;
        branch_uuid?: string;
    };
}

interface Stats {
    total_revenue: number;
    outstanding_invoices: number;
    inventory_value: number;
}

export function FinancesDashboard({ filterParams }: FinancesDashboardProps) {
    const { t, i18n } = useTranslation();
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Date Range State
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const params = {
                    ...filterParams,
                    start_date: date?.from ? format(date.from, 'yyyy-MM-dd') : undefined,
                    end_date: date?.to ? format(date.to, 'yyyy-MM-dd') : undefined,
                };
                const { data } = await api.get('/finances/stats', { params });
                setStats(data);
            } catch (error) {
                console.error("Failed to fetch finance stats", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, [filterParams, date]);

    const presets = [
        { label: t('finances.presets.today', 'Today'), from: new Date(), to: new Date() },
        { label: t('finances.presets.last_7_days', 'Last 7 Days'), from: subDays(new Date(), 7), to: new Date() },
        { label: t('finances.presets.this_month', 'This Month'), from: startOfMonth(new Date()), to: endOfMonth(new Date()) },
        { label: t('finances.presets.last_month', 'Last Month'), from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) },
    ];

    // Mock trend data for now as the backend doesn't provide time-series yet
    const trendData = [
        { name: 'Jan', revenue: 4000 },
        { name: 'Feb', revenue: 3000 },
        { name: 'Mar', revenue: 5000 },
        { name: 'Apr', revenue: 4500 },
        { name: 'May', revenue: 6000 },
        { name: 'Jun', revenue: stats?.total_revenue || 0 },
    ];

    const pieData = [
        { name: t('finances.paid', 'Paid'), value: stats?.total_revenue || 0, color: '#10b981' },
        { name: t('finances.outstanding', 'Outstanding'), value: stats?.outstanding_invoices || 0, color: '#f59e0b' },
    ];

    if (isLoading && !stats) return <div className="h-96 flex items-center justify-center"><Spinner className="w-12 h-12" /></div>;

    return (
        <div className="space-y-6" dir={i18n.dir()}>
            {/* Filters Bar */}
            <div className="w-fit flex flex-col justify-between bg-white px-4 py-2 rounded-2xl border shadow-sm">

                <div className="flex flex-row items-center justify-between">
                    {/* Presets */}
                    <div className="hidden md:flex items-center gap-1 ">
                        {presets.map((preset) => (
                            <Button
                                key={preset.label}
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "text-xs font-bold rounded-full h-8",
                                    preset.label === "This Month" && "bg-primary text-white"
                                )}
                                onClick={() => setDate({ from: preset.from, to: preset.to })}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </div>

                    {/* Date Range Picker */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "justify-end text-start font-bold h-10 px-4 rounded-xl border-gray-200",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className=" h-4 w-4" />
                                {date?.from ? (
                                    date.to ? (
                                        <>
                                            {format(date.from, "dd/MM/yyyy")} -{" "}
                                            {format(date.to, "dd/MM/yyyy")}
                                        </>
                                    ) : (
                                        format(date.from, "dd/MM/yyyy")
                                    )
                                ) : (
                                    <span>{t('finances.pick_date', 'Pick a date')}</span>
                                )}
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-white" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={date?.from}
                                selected={date}
                                onSelect={setDate}
                                numberOfMonths={1}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="p-2 bg-green-50 rounded-lg">
                            <DollarSign className="h-6 w-6 text-green-600" />
                        </div>
                        <span className="text-xs font-bold text-green-600 flex items-center bg-green-50 px-2 py-0.5 rounded-full">
                            <TrendingUp className="h-3 w-3 me-1" />
                            +12%
                        </span>
                    </div>
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{t('finances.total_revenue', 'Total Revenue')}</p>
                    <h3 className="text-3xl font-black">{stats?.total_revenue.toLocaleString()}</h3>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="p-2 bg-amber-50 rounded-lg">
                            <FileText className="h-6 w-6 text-amber-600" />
                        </div>
                    </div>
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{t('finances.outstanding', 'Outstanding Invoices')}</p>
                    <h3 className="text-3xl font-black">{stats?.outstanding_invoices.toLocaleString()}</h3>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Archive className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{t('finances.inventory_value', 'Inventory Asset Value')}</p>
                    <h3 className="text-3xl font-black">{stats?.inventory_value.toLocaleString()}</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Trend Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold">{t('finances.revenue_trend', 'Revenue Trend')}</h3>
                        <Button variant="ghost" size="sm" className="text-primary font-bold">
                            {t('finances.view_report', 'View Detailed Report')}
                            <ArrowUpRight className="h-4 w-4 ms-1" />
                        </Button>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                                    dx={-10}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorRev)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-6 flex flex-col">
                    <h3 className="text-xl font-bold">{t('finances.invoice_distribution', 'Invoice Distribution')}</h3>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="space-y-3 mt-auto">
                        {pieData.map((item) => (
                            <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-sm font-bold text-muted-foreground">{item.name}</span>
                                </div>
                                <span className="text-sm font-black">{item.value.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
