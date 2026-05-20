import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Wallet, ShoppingCart, Search, Loader2, CalendarDays, X, Download,
  FileText, TrendingUp, BadgePercent, CircleHelp, Users, BookOpen,
  IndianRupee, BarChart3, Filter, Info, ChevronRight, Sparkles,
  CheckCircle2, ArrowRight, FileSpreadsheet, Table2, Eye, Clock,
  Phone, Mail, User, Tag, Receipt, PieChart, ArrowUpRight, Target
} from 'lucide-react';
import { useSEO } from '@/lib/seo';
import { formatPriceINR } from '@/lib/format';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

// @ts-ignore - PDF Library imports
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Enrollment = {
  id: string;
  user_id: string;
  amount_paid_inr: number;
  promocode: string | null;
  enrolled_at: string;
  course_id: string;
  courses: { title: string } | null;
};

type DateMode = 'all' | 'year' | 'month' | 'day';
type DateFilter = { mode: DateMode; year: number; month: number; day: number };

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const AdminRevenue = () => {
  useSEO({ title: 'Admin Revenue Analytics' });

  const [rows, setRows] = useState<Enrollment[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  const [calDate, setCalDate] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [df, setDf] = useState<DateFilter>({ mode: 'all', year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ensRes, profilesRes, fnRes] = await Promise.all([
        supabase.from('enrollments').select('id, user_id, amount_paid_inr, promocode, enrolled_at, course_id, courses(title)').order('enrolled_at', { ascending: false }),
        supabase.from('profiles').select('user_id, display_name, phone'),
        supabase.functions.invoke('admin-users'),
      ]);
      setRows((ensRes.data || []) as Enrollment[]);
      const nm: Record<string, string> = {};
      const ph: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => { nm[p.user_id] = p.display_name || ''; if (p.phone) ph[p.user_id] = p.phone; });
      setNames(nm);
      setPhones(ph);
      const em: Record<string, string> = {};
      (((fnRes.data as any)?.users) || []).forEach((u: any) => { em[u.id] = u.email; });
      setEmails(em);
    } catch { toast.error('Failed to load revenue data'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    rows.forEach(r => s.add(new Date(r.enrolled_at).getFullYear()));
    if (s.size === 0) s.add(new Date().getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [rows]);

  const maxDays = useMemo(() => new Date(df.year, df.month, 0).getDate(), [df.year, df.month]);

  const setMode = useCallback((mode: DateMode) => {
    setDf(p => ({ ...p, mode, day: Math.min(p.day, new Date(p.year, p.month, 0).getDate()) }));
    if (mode !== 'all') setCalOpen(false);
  }, []);
  const setYear = useCallback((y: number) => setDf(p => ({ ...p, year: y, day: Math.min(p.day, new Date(y, p.month, 0).getDate()) })), []);
  const setMonth = useCallback((m: number) => setDf(p => ({ ...p, month: m, day: Math.min(p.day, new Date(p.year, m, 0).getDate()) })), []);
  const setDay = useCallback((d: number) => setDf(p => ({ ...p, day: d })), []);
  const clearFilter = useCallback(() => { setDf(p => ({ ...p, mode: 'all' })); setCalDate(undefined); }, []);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setCalDate(date);
    setDf({ mode: 'day', year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
    setCalOpen(false);
  };

  const filterLabel = useMemo(() => {
    if (df.mode === 'all') return null;
    if (df.mode === 'year') return `Year ${df.year}`;
    if (df.mode === 'month') return `${MONTH_NAMES[df.month - 1]} ${df.year}`;
    return `${df.day} ${MONTH_SHORT[df.month - 1]} ${df.year}`;
  }, [df]);

  const filterLabelFull = useMemo(() => {
    if (df.mode === 'all') return 'All Time';
    if (df.mode === 'year') return `Calendar Year ${df.year}`;
    if (df.mode === 'month') return `${MONTH_NAMES[df.month - 1]} ${df.year}`;
    return `${df.day} ${MONTH_NAMES[df.month - 1]} ${df.year}`;
  }, [df]);

  const dateFiltered = useMemo(() => {
    if (df.mode === 'all') return rows;
    return rows.filter(r => {
      const d = new Date(r.enrolled_at);
      if (df.mode === 'year') return d.getFullYear() === df.year;
      if (df.mode === 'month') return d.getFullYear() === df.year && d.getMonth() + 1 === df.month;
      return d.getFullYear() === df.year && d.getMonth() + 1 === df.month && d.getDate() === df.day;
    });
  }, [rows, df]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dateFiltered;
    return dateFiltered.filter(r => {
      const hay = `${names[r.user_id] || ''} ${emails[r.user_id] || ''} ${phones[r.user_id] || ''} ${r.courses?.title || ''} ${(r.amount_paid_inr || 0)} ${r.promocode || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dateFiltered, search, names, emails, phones]);

  // Accurate classification logic
  const classifyEnrollment = useCallback((r: Enrollment) => {
    const isGranted = r.promocode === 'ADMIN_GRANT';
    const isFree = !isGranted && (r.amount_paid_inr || 0) === 0;
    const isPromo = !isGranted && !isFree && !!r.promocode;
    const isPaid = !isGranted && !isFree && !isPromo;
    return { isGranted, isFree, isPromo, isPaid };
  }, []);

  const totals = useMemo(() => {
    let total = 0, paid = 0, free = 0, promos = 0, granted = 0, paidRevenue = 0, promoRevenue = 0;
    for (const r of dateFiltered) {
      const c = classifyEnrollment(r);
      total += r.amount_paid_inr || 0;
      if (c.isPaid) { paid++; paidRevenue += r.amount_paid_inr || 0; }
      if (c.isFree) free++;
      if (c.isPromo) { promos++; promoRevenue += r.amount_paid_inr || 0; }
      if (c.isGranted) granted++;
    }
    const aov = paid > 0 ? paidRevenue / paid : 0;
    const conversionRate = (paid + promos) > 0 ? ((paid / (paid + promos)) * 100) : 0;
    return { total, paid, free, promos, granted, count: dateFiltered.length, aov, paidRevenue, promoRevenue, conversionRate };
  }, [dateFiltered, classifyEnrollment]);

  const byCourse = useMemo(() => {
    const m = new Map<string, { title: string; revenue: number; count: number; paid: number; free: number; promo: number; granted: number }>();
    for (const r of dateFiltered) {
      const c = classifyEnrollment(r);
      const e = m.get(r.course_id) || { title: r.courses?.title || '—', revenue: 0, count: 0, paid: 0, free: 0, promo: 0, granted: 0 };
      e.revenue += r.amount_paid_inr || 0;
      e.count += 1;
      if (c.isPaid) e.paid++;
      if (c.isFree) e.free++;
      if (c.isPromo) e.promo++;
      if (c.isGranted) e.granted++;
      m.set(r.course_id, e);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [dateFiltered, classifyEnrollment]);

  const bucket = useCallback((data: Enrollment[], fmt: (d: Date) => string) => {
    const m = new Map<string, { revenue: number; count: number; paid: number; free: number; promo: number; granted: number }>();
    for (const r of data) {
      const k = fmt(new Date(r.enrolled_at));
      const c = classifyEnrollment(r);
      const e = m.get(k) || { revenue: 0, count: 0, paid: 0, free: 0, promo: 0, granted: 0 };
      e.revenue += r.amount_paid_inr || 0;
      e.count += 1;
      if (c.isPaid) e.paid++;
      if (c.isFree) e.free++;
      if (c.isPromo) e.promo++;
      if (c.isGranted) e.granted++;
      m.set(k, e);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => a.key < b.key ? 1 : -1);
  }, [classifyEnrollment]);

  const byMonth = useMemo(() => bucket(dateFiltered, d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`), [bucket, dateFiltered]);
  const byDay = useMemo(() => bucket(dateFiltered, d => d.toISOString().slice(0, 10)), [bucket, dateFiltered]);

  // --- EXPORT DATA ---
  const getExportData = () => filteredRows.map((r, i) => ({
    '#': i + 1,
    Date: format(new Date(r.enrolled_at), 'dd-MMM-yyyy'),
    Time: format(new Date(r.enrolled_at), 'hh:mm a'),
    'Student Name': names[r.user_id] || 'Unknown',
    Email: emails[r.user_id] || 'Unknown',
    Phone: phones[r.user_id] || 'N/A',
    Course: r.courses?.title || 'Unknown',
    Type: classifyEnrollment(r).isGranted ? 'Granted' : (classifyEnrollment(r).isFree ? 'Free' : (classifyEnrollment(r).isPromo ? 'Promo' : 'Paid')),
    'Promo Code': r.promocode === 'ADMIN_GRANT' ? 'ADMIN' : (r.promocode || '—'),
    'Amount (₹)': r.amount_paid_inr || 0
  }));

  // --- EXCEL/CSV EXPORT (Properly Formatted) ---
  const downloadExcel = () => {
    const data = getExportData();
    if (data.length === 0) return toast.error("No data to export");

    // BOM for proper UTF-8 in Excel
    const BOM = '\uFEFF';
    const separator = ',';
    const newline = '\r\n';

    // Summary Section
    const summaryLines = [
      `LearnHub - Revenue Report`,
      `Filter: ${filterLabelFull}`,
      `Generated: ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}`,
      ``,
      `SUMMARY`,
      `Total Revenue,${totals.total}`,
      `Paid Revenue,${totals.paidRevenue}`,
      `Promo Revenue,${totals.promoRevenue}`,
      `Total Enrollments,${totals.count}`,
      `Paid Enrollments,${totals.paid}`,
      `Free Enrollments,${totals.free}`,
      `Promo Enrollments,${totals.promos}`,
      `Granted Enrollments,${totals.granted}`,
      `Avg Order Value (Paid),${Math.round(totals.aov)}`,
      `Conversion Rate,${totals.conversionRate.toFixed(1)}%`,
      ``,
      `DETAILED DATA`,
      ``,
    ];

    const headers = Object.keys(data[0]);
    const csvHeader = headers.join(separator);
    const csvBody = data.map(row =>
      headers.map(h => {
        const val = row[h as keyof typeof row];
        const str = String(val);
        // Escape quotes and wrap if contains comma/newline/quote
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(separator)
    );

    // Totals row
    const totalRow = headers.map((h, idx) => {
      if (idx === 0) return '';
      if (h === 'Amount (₹)') return String(totals.total);
      if (h === 'Type') return 'TOTAL';
      return '';
    }).join(separator);

    const csvContent = [
      ...summaryLines.map(l => l),
      csvHeader,
      ...csvBody,
      totalRow
    ].join(newline);

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeName = (filterLabel || 'All_Time').replace(/\s+/g, '_');
    link.download = `LearnHub_Revenue_${safeName}_${format(new Date(), 'dd_MMM_yyyy')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success("Excel/CSV downloaded with summary & formatted data");
  };

  // --- PDF EXPORT (Properly Formatted) ---
  const downloadPDF = () => {
    const data = getExportData();
    if (data.length === 0) return toast.error("No data to export");

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // --- PAGE 1: SUMMARY ---
    // Top accent bar
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 4, 'F');

    // Title
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('LearnHub', margin, 18);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Revenue Analytics Report', margin + 48, 18);

    // Filter & Date info
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Filter: ${filterLabelFull}`, margin, 26);
    doc.text(`Generated: ${format(new Date(), 'dd MMMM yyyy, hh:mm a')}`, margin + 60, 26);

    // Divider line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, 30, pageWidth - margin, 30);

    // Summary Cards (simulated with rectangles)
    const cardY = 36;
    const cardH = 22;
    const cardGap = 4;
    const cardW = (pageWidth - margin * 2 - cardGap * 5) / 6;
    const summaryCards = [
      { label: 'Total Revenue', value: formatPriceINR(totals.total), color: [37, 99, 235] },
      { label: 'Enrollments', value: String(totals.count), color: [59, 130, 246] },
      { label: 'Paid', value: String(totals.paid), color: [22, 163, 74] },
      { label: 'Avg Order Value', value: formatPriceINR(totals.aov), color: [16, 185, 129] },
      { label: 'Promo Used', value: String(totals.promos), color: [249, 115, 22] },
      { label: 'Free/Granted', value: `${totals.free}/${totals.granted}`, color: [100, 116, 139] },
    ];

    summaryCards.forEach((card, i) => {
      const x = margin + i * (cardW + cardGap);
      // Card background
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'F');
      // Left accent
      doc.setFillColor(card.color[0], card.color[1], card.color[2]);
      doc.rect(x, cardY, 1.5, cardH, 'F');
      // Label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(card.label, x + 4, cardY + 8);
      // Value
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(card.value, x + 4, cardY + 17, { maxWidth: cardW - 6 });
    });

    // Revenue Breakdown Section
    const breakY = cardY + cardH + 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Revenue Breakdown', margin, breakY);

    const breakData = [
      ['Paid Revenue', formatPriceINR(totals.paidRevenue), `${totals.paid} enrollments`, `${((totals.paidRevenue / Math.max(totals.total, 1)) * 100).toFixed(1)}%`],
      ['Promo Revenue', formatPriceINR(totals.promoRevenue), `${totals.promos} enrollments`, `${((totals.promoRevenue / Math.max(totals.total, 1)) * 100).toFixed(1)}%`],
      ['Free Enrollments', '₹0', `${totals.free} enrollments`, '0%'],
      ['Admin Granted', '₹0', `${totals.granted} enrollments`, '0%'],
    ];

    autoTable(doc, {
      startY: breakY + 3,
      margin: { left: margin, right: margin },
      head: [['Source', 'Revenue', 'Count', 'Share']],
      body: breakData,
      styles: { fontSize: 9, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.3 },
      headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right', fontStyle: 'bold' },
        2: { halign: 'center' },
        3: { halign: 'right' },
      },
    });

    // Course-wise breakdown
    const courseTableY = (doc as any).lastAutoTable.finalY + 10;
    if (courseTableY < pageHeight - 60) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Course-wise Performance', margin, courseTableY);

      autoTable(doc, {
        startY: courseTableY + 3,
        margin: { left: margin, right: margin },
        head: [['Course', 'Revenue', 'Enrollments', 'Paid', 'Free', 'Promo', 'Granted']],
        body: byCourse.map(c => [
          c.title,
          formatPriceINR(c.revenue),
          String(c.count),
          String(c.paid),
          String(c.free),
          String(c.promo),
          String(c.granted),
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.3 },
        headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 80, fontStyle: 'bold' },
          1: { halign: 'right', fontStyle: 'bold' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' },
        },
      });
    }

    // --- NEW PAGE: DETAILED TABLE ---
    doc.addPage('landscape');

    // Top accent bar on page 2
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 4, 'F');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Detailed Enrollment Ledger', margin, 16);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`${filteredRows.length} records | Filter: ${filterLabelFull}`, margin, 22);

    autoTable(doc, {
      startY: 26,
      margin: { left: margin, right: margin, bottom: 20 },
      head: [['#', 'Date', 'Time', 'Student Name', 'Email', 'Phone', 'Course', 'Type', 'Promo Code', 'Amount (₹)']],
      body: data.map(row => [
        String(row['#']),
        String(row.Date),
        String(row.Time),
        String(row['Student Name']),
        String(row.Email),
        String(row.Phone),
        String(row.Course),
        String(row.Type),
        String(row['Promo Code']),
        String(row['Amount (₹)']),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.2 },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 18 },
        3: { cellWidth: 32 },
        4: { cellWidth: 42 },
        5: { cellWidth: 22 },
        6: { cellWidth: 60 },
        7: { cellWidth: 16, halign: 'center' },
        8: { cellWidth: 18, halign: 'center' },
        9: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        // Color code the Type column
        if (data.section === 'body' && data.column.index === 7) {
          const val = String(data.cell.raw);
          if (val === 'Paid') data.cell.styles.textColor = [22, 163, 74];
          else if (val === 'Promo') data.cell.styles.textColor = [249, 115, 22];
          else if (val === 'Free') data.cell.styles.textColor = [37, 99, 235];
          else if (val === 'Granted') data.cell.styles.textColor = [148, 163, 184];
        }
      },
      didDrawPage: (data: any) => {
        // Footer on every page
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`LearnHub Revenue Report | Page ${doc.getNumberOfPages()}`, margin, pageHeight - 8);
        doc.text(`Confidential - Generated on ${format(new Date(), 'dd MMM yyyy')}`, pageWidth - margin - 60, pageHeight - 8);
        // Footer line
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      },
    });

    const safeName = (filterLabel || 'All_Time').replace(/\s+/g, '_');
    doc.save(`LearnHub_Revenue_${safeName}_${format(new Date(), 'dd_MMM_yyyy')}.pdf`);
    toast.success("Professional PDF downloaded with summary + detailed data");
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 h-full gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Loading revenue data…</span>
    </div>
  );

  const modeBtn = (m: DateMode, label: string, icon: React.ReactNode) => (
    <Button size="sm" variant={df.mode === m ? 'default' : 'outline'} className="h-8 text-xs px-3 gap-1.5" onClick={() => setMode(m)}>
      {icon} {label}
    </Button>
  );

  const getStatusBadge = (r: Enrollment) => {
    const c = classifyEnrollment(r);
    if (c.isGranted) return <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-slate-100 text-slate-500 hover:bg-slate-100 border-0 font-semibold"><Users className="w-2.5 h-2.5 mr-1" />Granted</Badge>;
    if (c.isFree) return <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-blue-50 text-blue-600 hover:bg-blue-50 border-0 font-semibold"><Sparkles className="w-2.5 h-2.5 mr-1" />Free</Badge>;
    if (c.isPromo) return <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-orange-50 text-orange-600 hover:bg-orange-50 border-0 font-semibold"><Tag className="w-2.5 h-2.5 mr-1" />Promo</Badge>;
    return <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-green-50 text-green-600 hover:bg-green-50 border-0 font-semibold"><IndianRupee className="w-2.5 h-2.5 mr-1" />Paid</Badge>;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Revenue Analytics</h1>
            <p className="text-xs text-muted-foreground">Track enrollment revenue & student data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Guide Button */}
          <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
                <CircleHelp className="w-3.5 h-3.5 text-primary" /> How to Use
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] p-0 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
                <DialogHeader>
                  <DialogTitle className="text-lg flex items-center gap-2 text-white">
                    <BookOpen className="w-5 h-5" /> Complete Guide — Revenue Analytics
                  </DialogTitle>
                </DialogHeader>
                <p className="text-blue-100 text-xs mt-1">Everything you need to know, A to Z</p>
              </div>
              <ScrollArea className="max-h-[65vh] px-6 py-4">
                <div className="space-y-5">
                  {[
                    { step: 'A', title: 'Overview', desc: 'This page shows all enrollment revenue data. At the top you see summary stat cards — Total Revenue, Enrollments, Average Order Value, Promo Usage, and Free/Granted counts.', icon: <Eye className="w-4 h-4 text-blue-500" /> },
                    { step: 'B', title: 'Date Filtering', desc: 'Use the filter bar to narrow data by time. Click "Pick Date" to open a calendar, or use the mode buttons: All Time, Year, Month, or Day. Select specific values from the dropdowns that appear.', icon: <CalendarDays className="w-4 h-4 text-blue-500" /> },
                    { step: 'C', title: 'Calendar Picker', desc: 'Click "Pick Date" button → a calendar pops up → click any date → the filter automatically switches to "Day" mode with that date selected. This is the fastest way to check a specific day.', icon: <Clock className="w-4 h-4 text-blue-500" /> },
                    { step: 'D', title: 'Clearing Filters', desc: 'When a filter is active, a ✕ button appears. Click it to reset back to "All Time". The blue badge on the right shows what filter is currently active.', icon: <X className="w-4 h-4 text-blue-500" /> },
                    { step: 'E', title: 'Understanding Stats', desc: 'Total Revenue = sum of all amounts. Avg Order Value = total ÷ paid enrollments only (excludes free/granted). Conversion Rate = paid ÷ (paid + promo) × 100. These are mathematically accurate.', icon: <Target className="w-4 h-4 text-blue-500" /> },
                    { step: 'F', title: 'Enrollment Types', desc: 'Paid (green) = student paid full price. Promo (orange) = student used a discount code. Free (blue) = enrolled at ₹0 without code. Granted (gray) = admin manually granted access via ADMIN_GRANT code.', icon: <Receipt className="w-4 h-4 text-blue-500" /> },
                    { step: 'G', title: 'Breakdown Tabs', desc: 'Below stats, three tabs show data grouped By Course, By Month, or By Day. Each shows revenue and enrollment count for that group. Useful for spotting trends.', icon: <PieChart className="w-4 h-4 text-blue-500" /> },
                    { step: 'H', title: 'Search', desc: 'The search bar in the table section filters by student name, email, phone, course title, amount, or promo code. It works on the currently date-filtered data.', icon: <Search className="w-4 h-4 text-blue-500" /> },
                    { step: 'I', title: 'Enrollment Ledger Table', desc: 'The main table shows every enrollment with Date, Name, Email, Phone, Course, Status badge, and Amount. The footer shows the calculated total of visible rows.', icon: <Table2 className="w-4 h-4 text-blue-500" /> },
                    { step: 'J', title: 'Export to Excel/CSV', desc: 'Click "Excel / CSV" button. It downloads a .csv file that opens perfectly in Excel. Includes a summary section at the top, all columns with proper formatting, and a totals row at the bottom.', icon: <FileSpreadsheet className="w-4 h-4 text-blue-500" /> },
                    { step: 'K', title: 'Export to PDF', desc: 'Click "Download PDF" for a professional 2-page report. Page 1 has summary cards, revenue breakdown table, and course-wise performance. Page 2 has the full detailed enrollment ledger with color-coded types.', icon: <FileText className="w-4 h-4 text-blue-500" /> },
                    { step: 'L', title: 'PDF Formatting', desc: 'The PDF has a blue accent bar, proper headings, color-coded status types (green=paid, orange=promo, blue=free, gray=granted), alternating row colors, page numbers, and confidential footer. Print-ready.', icon: <Sparkles className="w-4 h-4 text-blue-500" /> },
                    { step: 'M', title: 'Data Accuracy', desc: 'All calculations use strict classification logic: ADMIN_GRANT → Granted, amount=0 & no code → Free, amount>0 & has code → Promo, amount>0 & no code → Paid. No overlaps. Every enrollment is counted exactly once.', icon: <CheckCircle2 className="w-4 h-4 text-blue-500" /> },
                    { step: 'N', title: 'Tips', desc: 'Use Month view to compare monthly performance. Use search to find a specific student\'s all enrollments. Export PDF for meetings. Export CSV if you need to do further analysis in Excel.', icon: <ArrowUpRight className="w-4 h-4 text-blue-500" /> },
                  ].map(item => (
                    <div key={item.step} className="flex gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-sm border border-blue-100">
                        {item.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {item.icon}
                          <span className="font-semibold text-sm">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" onClick={downloadExcel} className="h-9 text-xs gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Excel / CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPDF} className="h-9 text-xs gap-1.5">
            <FileText className="w-3.5 h-3.5 text-red-500" /> PDF Report
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 space-y-4 pr-1">

        {/* Filter Bar */}
        <Card className="p-3 bg-card border-border shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-primary shrink-0" />

            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Pick Date
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                <Calendar mode="single" selected={calDate} onSelect={handleDateSelect} className="p-3" />
              </PopoverContent>
            </Popover>

            <div className="w-px h-5 bg-border mx-1" />

            {modeBtn('all', 'All', <BarChart3 className="w-3 h-3" />)}
            {modeBtn('year', 'Year', <CalendarDays className="w-3 h-3" />)}
            {modeBtn('month', 'Month', <CalendarDays className="w-3 h-3" />)}
            {modeBtn('day', 'Day', <Clock className="w-3 h-3" />)}

            {df.mode !== 'all' && (
              <>
                <div className="w-px h-5 bg-border mx-1" />
                <Select value={String(df.year)} onValueChange={v => setYear(Number(v))}>
                  <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card">{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
                {(df.mode === 'month' || df.mode === 'day') && (
                  <Select value={String(df.month)} onValueChange={v => setMonth(Number(v))}>
                    <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card">{MONTH_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {df.mode === 'day' && (
                  <Select value={String(df.day)} onValueChange={v => setDay(Number(v))}>
                    <SelectTrigger className="h-8 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card max-h-52">{Array.from({ length: maxDays }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={clearFilter}><X className="w-4 h-4" /></Button>
              </>
            )}

            {filterLabel && (
              <Badge variant="secondary" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 px-2.5 py-0.5 ml-auto gap-1">
                <Eye className="w-3 h-3" /> {filterLabel}
              </Badge>
            )}
          </div>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Card className="p-4 bg-card border-border shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-full" />
            <Wallet className="w-5 h-5 text-blue-600 mb-2" />
            <div className="text-xl font-bold">{formatPriceINR(totals.total)}</div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Revenue</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full" />
            <Users className="w-5 h-5 text-indigo-600 mb-2" />
            <div className="text-xl font-bold">{totals.count}</div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Enrollments</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-green-500/10 to-transparent rounded-bl-full" />
            <TrendingUp className="w-5 h-5 text-green-600 mb-2" />
            <div className="text-xl font-bold">{formatPriceINR(totals.aov)}</div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Avg Order Value</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
            <IndianRupee className="w-5 h-5 text-emerald-600 mb-2" />
            <div className="text-xl font-bold">{formatPriceINR(totals.paidRevenue)}</div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Paid Revenue</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-500/10 to-transparent rounded-bl-full" />
            <BadgePercent className="w-5 h-5 text-orange-600 mb-2" />
            <div className="text-xl font-bold">{totals.promos}</div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Promo Used</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm relative overflow-hidden col-span-2 lg:col-span-1">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-slate-500/10 to-transparent rounded-bl-full" />
            <Sparkles className="w-5 h-5 text-slate-500 mb-2" />
            <div className="text-xl font-bold">{totals.free}<span className="text-sm text-muted-foreground font-normal"> / {totals.granted}</span></div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Free / Granted</div>
          </Card>
        </div>

        {/* Conversion Rate Banner */}
        <Card className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200/60 flex items-center gap-3">
          <Target className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-semibold text-blue-800">Conversion Rate (Paid vs Total Paying):</span>
            <span className="text-lg font-bold text-blue-700 ml-2">{totals.conversionRate.toFixed(1)}%</span>
          </div>
          {/* FIX: Wrapped Info icon in a div to apply the title attribute correctly */}
          <div className="shrink-0" title="Paid enrollments ÷ (Paid + Promo enrollments) × 100">
             <Info className="w-4 h-4 text-blue-400" />
          </div>
        </Card>

        {/* Breakdown Tabs */}
        <Tabs defaultValue="course">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="course" className="text-xs gap-1.5"><BookOpen className="w-3 h-3" /> By Course</TabsTrigger>
            <TabsTrigger value="month" className="text-xs gap-1.5"><CalendarDays className="w-3 h-3" /> By Month</TabsTrigger>
            <TabsTrigger value="day" className="text-xs gap-1.5"><Clock className="w-3 h-3" /> By Day</TabsTrigger>
          </TabsList>
          <TabsContent value="course">
            <Card className="bg-card border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left p-3 font-semibold">Course</th>
                      <th className="text-right p-3 font-semibold">Revenue</th>
                      <th className="text-center p-3 font-semibold">Total</th>
                      <th className="text-center p-3 font-semibold">Paid</th>
                      <th className="text-center p-3 font-semibold">Free</th>
                      <th className="text-center p-3 font-semibold">Promo</th>
                      <th className="text-center p-3 font-semibold">Granted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byCourse.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No data</td></tr>
                    ) : byCourse.map((c, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium max-w-[250px] truncate">{c.title}</td>
                        <td className="p-3 text-right font-bold text-primary">{formatPriceINR(c.revenue)}</td>
                        <td className="p-3 text-center font-semibold">{c.count}</td>
                        <td className="p-3 text-center"><span className="text-green-600">{c.paid}</span></td>
                        <td className="p-3 text-center"><span className="text-blue-500">{c.free}</span></td>
                        <td className="p-3 text-center"><span className="text-orange-500">{c.promo}</span></td>
                        <td className="p-3 text-center"><span className="text-slate-400">{c.granted}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
          <TabsContent value="month">
            <Card className="p-3 bg-card border-border shadow-sm">
              {byMonth.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No data</p> : (
                <div className="space-y-1.5">
                  {byMonth.map(b => (
                    <div key={b.key} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30">
                      <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{b.key}</span>
                      <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((b.revenue / Math.max(totals.total, 1)) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-primary w-24 text-right shrink-0">{formatPriceINR(b.revenue)}</span>
                      <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{b.count} enroll</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
          <TabsContent value="day">
            <Card className="p-3 bg-card border-border shadow-sm">
              {byDay.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No data</p> : (
                <div className="space-y-1.5">
                  {byDay.slice(0, 30).map(b => (
                    <div key={b.key} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30">
                      <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{b.key}</span>
                      <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((b.revenue / Math.max(totals.total, 1)) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-primary w-24 text-right shrink-0">{formatPriceINR(b.revenue)}</span>
                      <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{b.count} enroll</span>
                    </div>
                  ))}
                  {byDay.length > 30 && <p className="text-[10px] text-muted-foreground text-center pt-2">Showing top 30 days of {byDay.length}</p>}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Main Table */}
        <Card className="bg-card border-border shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-bold text-sm">Enrollment Ledger</h2>
              <Badge variant="secondary" className="text-[10px] font-semibold">{filteredRows.length} records</Badge>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone, course, amount…" className="pl-9 h-9 bg-background text-xs" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground bg-muted/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap"><CalendarDays className="w-3 h-3 inline mr-1" />Date</th>
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap"><User className="w-3 h-3 inline mr-1" />Student</th>
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap"><Mail className="w-3 h-3 inline mr-1" />Email</th>
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap"><Phone className="w-3 h-3 inline mr-1" />Phone</th>
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap"><BookOpen className="w-3 h-3 inline mr-1" />Course</th>
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap"><Receipt className="w-3 h-3 inline mr-1" />Status</th>
                  <th className="text-right p-2.5 font-semibold whitespace-nowrap"><IndianRupee className="w-3 h-3 inline mr-1" />Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map(r => {
                  const c = classifyEnrollment(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground font-mono">{format(new Date(r.enrolled_at), 'dd MMM yy')}</td>
                      <td className="p-2.5 font-medium whitespace-nowrap">{names[r.user_id] || '—'}</td>
                      <td className="p-2.5 text-muted-foreground whitespace-nowrap">{emails[r.user_id] || '—'}</td>
                      <td className="p-2.5 text-muted-foreground whitespace-nowrap">{phones[r.user_id] || '—'}</td>
                      <td className="p-2.5 max-w-[200px] truncate" title={r.courses?.title || ''}>{r.courses?.title || '—'}</td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          {getStatusBadge(r)}
                          {c.isPromo && <span className="text-[9px] text-orange-500 font-mono truncate max-w-[60px]" title={r.promocode || ''}>({r.promocode})</span>}
                        </div>
                      </td>
                      <td className="p-2.5 text-right font-bold whitespace-nowrap">
                        {c.isGranted || c.isFree ? <span className="text-muted-foreground font-normal">₹0</span> : formatPriceINR(r.amount_paid_inr || 0)}
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No enrollments found for this filter.</p>
                  </td></tr>
                )}
              </tbody>
              {filteredRows.length > 0 && (
                <tfoot className="border-t-2 border-primary/30 font-bold bg-primary/5">
                  <tr>
                    <td colSpan={6} className="p-3 text-right text-sm flex items-center justify-end gap-2">
                      <span className="text-muted-foreground font-normal">Total ({filteredRows.length} rows)</span>
                      <ChevronRight className="w-3 h-3 text-primary" />
                    </td>
                    <td className="p-3 text-right text-sm text-primary">{formatPriceINR(filteredRows.reduce((s, r) => s + (r.amount_paid_inr || 0), 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

      </div>
    </div>
  );
};

export default AdminRevenue;