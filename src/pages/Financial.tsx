import { useEffect, useState, useCallback, useMemo } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePrivacy } from '@/hooks/usePrivacy';
import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import PrivacyToggle from '@/components/PrivacyToggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format, isToday, isBefore, startOfDay, startOfMonth, endOfMonth, subMonths, subDays, addDays, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DollarSign, Clock, AlertTriangle, CheckCircle2, Search,
  FileBarChart, QrCode, CreditCard, Banknote, ArrowDownCircle,
  RefreshCw, CalendarDays, CircleDollarSign, Wallet, Users, List,
  MessageSquare, History, ShieldAlert, Handshake
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ActionMenu } from '@/components/ActionMenu';
import { Pencil, Trash2, ExternalLink } from 'lucide-react';

import FinancialSellerRanking from '@/components/financial/FinancialSellerRanking';
import FinancialActionsDoDia from '@/components/financial/FinancialActionsDoDia';
import FinancialForecast from '@/components/financial/FinancialForecast';
import FinancialAlerts from '@/components/financial/FinancialAlerts';
import FinancialConversion from '@/components/financial/FinancialConversion';
import FinancialQuickActions from '@/components/financial/FinancialQuickActions';

const db = supabase as any;

const financialStatusLabels: Record<string, { label: string; color: string }> = {
  aguardando_pagamento: { label: 'Aguardando', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  vence_hoje: { label: 'Vence Hoje', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  em_aberto: { label: 'Em Aberto', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  pago_parcial: { label: 'Pago Parcial', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  pago: { label: 'Pago', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800 border-red-200' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  em_renegociacao: { label: 'Renegociação', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  promessa_pagamento: { label: 'Promessa Pgto', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  atraso_critico: { label: 'Atraso Crítico', color: 'bg-rose-100 text-rose-800 border-rose-200' },
};

const paymentMethodConfig: Record<string, { label: string; icon: any; color: string }> = {
  pix: { label: 'PIX', icon: QrCode, color: 'text-teal-600' },
  cartao: { label: 'Cartão', icon: CreditCard, color: 'text-purple-600' },
  boleto: { label: 'Boleto', icon: FileBarChart, color: 'text-amber-600' },
};

function FinancialContent() {
  const { user, isFinanceiro, profile } = useAuth();
  const { maskValue, formatCurrency: privacyFormat } = usePrivacy();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [sellerOptions, setSellerOptions] = useState<{ uid: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'baixas' | 'pendencias' | 'relatorios'>('dashboard');

  // Sync tab from URL params
  useEffect(() => {
    const tab = searchParams.get('tab');
    const priority = searchParams.get('priority');
    if (tab && ['dashboard', 'baixas', 'pendencias', 'relatorios'].includes(tab)) {
      setActiveTab(tab as any);
    }
    if (priority) {
      setFilterPriority(priority);
    }
  }, [searchParams]);

  // Dialog states
  const [baixaRecord, setBaixaRecord] = useState<any>(null);
  const [baixaForm, setBaixaForm] = useState({ amount_paid: '', paid_date: '', financial_notes: '', financial_status: 'pago' });
  const [noteRecord, setNoteRecord] = useState<any>(null);
  const [noteText, setNoteText] = useState('');
  const [historyRecord, setHistoryRecord] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const canEdit = isFinanceiro;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsRes, profilesRes] = await Promise.all([
        db.from('financial_records').select('id, quote_id, client_id, client_name, created_by, due_date, external_order_id, financial_notes, financial_status, payment_method, total_amount, amount_paid, paid_date, baixa_at').order('due_date', { ascending: true }),
        db.from('profiles').select('user_id, full_name').eq('active', true),
      ]);

      if (recordsRes.error) {
        toast.error('Erro ao carregar registros financeiros');
        return;
      }

      const quoteIds = [...new Set((recordsRes.data || []).map((record: any) => record.quote_id).filter(Boolean))];
      const quotesRes = quoteIds.length > 0
        ? await db.from('quotes')
            .select('id, quote_number, client_name, salesperson, created_by, client_id, payment_status, clients(company_name, name)')
            .in('id', quoteIds)
        : { data: [], error: null };

      const profileMap: Record<string, string> = {};
      if (profilesRes.data) {
        (profilesRes.data as any[]).forEach((p: any) => { 
          profileMap[p.user_id] = p.full_name || 'Sem nome'; 
        });
        setProfiles(profileMap);
        
        setSellerOptions(
          (profilesRes.data as any[])
            .filter((p: any) => p.full_name)
            .map((p: any) => ({ uid: p.user_id, name: p.full_name }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
        );
      }

      const quotesMap: Record<string, any> = {};
      if (quotesRes.data) {
        (quotesRes.data as any[]).forEach((q: any) => { 
          quotesMap[q.id] = q; 
        });
      }

    if (quotesRes.error) {
      toast.error('Erro ao carregar dados dos orçamentos');
    } else {
      const today = startOfDay(new Date());
      const updated = (recordsRes.data || []).map((r: any) => {
        // Enrich with quote data
        const quote = r.quote_id ? quotesMap[r.quote_id] : null;
        let enriched = { ...r };
        
        // Fill client_name from quote/client if still blank
        if (!enriched.client_name || enriched.client_name === '') {
          if (quote) {
            enriched.client_name = quote.clients?.company_name || quote.clients?.name || quote.client_name || 'Sem cliente';
          }
        }
        
        // Add quote_number for display
        if (quote?.quote_number) {
          enriched.quote_number = quote.quote_number;
        }

        // If quote payment_status is liquidado but financial still pending, treat as pago
        if (quote?.payment_status === 'liquidado' && !['pago', 'cancelado'].includes(enriched.financial_status)) {
          enriched.financial_status = 'pago';
          enriched.amount_paid = enriched.total_amount;
        }

        // Compute dynamic status based on due_date (only for non-terminal statuses)
        if (['pago', 'cancelado', 'pago_parcial', 'em_renegociacao', 'promessa_pagamento'].includes(enriched.financial_status)) return enriched;
        if (enriched.due_date) {
          const due = startOfDay(new Date(enriched.due_date));
          if (isToday(due)) return { ...enriched, financial_status: 'vence_hoje' };
          if (isBefore(due, today)) {
            const daysOverdue = differenceInDays(today, due);
            if (daysOverdue > 30) return { ...enriched, financial_status: 'atraso_critico' };
            return { ...enriched, financial_status: 'vencido' };
          }
        }
        return enriched;
      });
      setRecords(updated);
    }
    } catch (err: any) {
      console.error('[Financial] Error loading data:', err);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // Log action to history
  const logAction = useCallback(async (recordId: string, actionType: string, prevStatus: string, newStatus: string, notes?: string) => {
    if (!user) return;
    await db.from('financial_action_history').insert({
      financial_record_id: recordId,
      action_type: actionType,
      performed_by: user.id,
      performed_by_name: profile?.full_name || 'Desconhecido',
      previous_status: prevStatus,
      new_status: newStatus,
      notes: notes || null,
    });
  }, [user, profile]);

  // Action handlers
  const handleStatusChange = async (record: any, newStatus: string, actionType: string, notes?: string) => {
    if (!user || !canEdit) return;
    setSaving(true);
    try {
      const updateData: any = {
        financial_status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'pago') {
        updateData.baixa_by = user.id;
        updateData.baixa_at = new Date().toISOString();
        updateData.paid_date = format(new Date(), 'yyyy-MM-dd');
        updateData.amount_paid = record.total_amount;
      }
      if (notes) updateData.financial_notes = notes;

      const { error } = await db.from('financial_records').update(updateData).eq('id', record.id);
      if (error) throw error;
      await logAction(record.id, actionType, record.financial_status, newStatus, notes);
      toast.success(`Status atualizado para ${financialStatusLabels[newStatus]?.label || newStatus}`);
      loadRecords();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenBaixa = (record: any) => {
    setBaixaForm({
      amount_paid: record.total_amount?.toString() || '',
      paid_date: format(new Date(), 'yyyy-MM-dd'),
      financial_notes: '',
      financial_status: 'pago',
    });
    setBaixaRecord(record);
  };

  const handleSaveBaixa = async () => {
    if (!baixaRecord || !user) return;
    setSaving(true);
    try {
      const { error } = await db.from('financial_records').update({
        amount_paid: parseFloat(baixaForm.amount_paid) || 0,
        paid_date: baixaForm.paid_date || null,
        financial_status: baixaForm.financial_status,
        financial_notes: baixaForm.financial_notes || null,
        baixa_by: user.id,
        baixa_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', baixaRecord.id);

      if (error) throw error;
      await logAction(baixaRecord.id, 'baixa', baixaRecord.financial_status, baixaForm.financial_status, baixaForm.financial_notes);
      toast.success('Baixa registrada com sucesso!');
      setBaixaRecord(null);
      loadRecords();
    } catch (err: any) {
      toast.error('Erro ao registrar baixa: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!noteRecord || !user || !noteText.trim()) return;
    setSaving(true);
    try {
      const existingNotes = noteRecord.financial_notes || '';
      const timestamp = format(new Date(), 'dd/MM/yyyy HH:mm');
      const newNote = `[${timestamp} - ${profile?.full_name || 'Financeiro'}] ${noteText}`;
      const updatedNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;

      const { error } = await db.from('financial_records').update({
        financial_notes: updatedNotes,
        updated_at: new Date().toISOString(),
      }).eq('id', noteRecord.id);

      if (error) throw error;
      await logAction(noteRecord.id, 'observacao', noteRecord.financial_status, noteRecord.financial_status, noteText);
      toast.success('Observação adicionada!');
      setNoteRecord(null);
      setNoteText('');
      loadRecords();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleViewHistory = async (record: any) => {
    setHistoryRecord(record);
    const { data } = await db.from('financial_action_history')
      .select('id, action_type, performed_by_name, previous_status, new_status, notes, created_at')
      .eq('financial_record_id', record.id)
      .order('created_at', { ascending: false });
    setHistoryData(data || []);
  };

  const getDateRange = useCallback((period: string) => {
    const now = new Date();
    switch (period) {
      case 'today': return { start: startOfDay(now), end: now };
      case '7days': return { start: subDays(now, 7), end: now };
      case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_month': {
        const lm = subMonths(now, 1);
        return { start: startOfMonth(lm), end: endOfMonth(lm) };
      }
      default: return null;
    }
  }, []);

  const filtered = useMemo(() => records.filter(r => {
    if (search) {
      const s = search.toLowerCase();
      if (!r.client_name?.toLowerCase().includes(s) && !r.external_order_id?.includes(search)) return false;
    }
    if (filterStatus !== 'all' && r.financial_status !== filterStatus) return false;
    if (filterMethod !== 'all' && r.payment_method !== filterMethod) return false;
    if (filterSeller !== 'all' && r.created_by !== filterSeller) return false;

    // Priority filter
    if (filterPriority === 'vencidos') {
      if (!['vencido', 'atraso_critico'].includes(r.financial_status)) return false;
    } else if (filterPriority === 'hoje') {
      if (r.financial_status !== 'vence_hoje') return false;
    } else if (filterPriority === 'proximos') {
      if (!r.due_date) return false;
      const due = new Date(r.due_date);
      const today = startOfDay(new Date());
      const in3days = addDays(today, 3);
      if (due < today || due > in3days) return false;
      if (['pago', 'cancelado'].includes(r.financial_status)) return false;
    }

    if (filterPeriod === 'overdue') {
      if (!r.due_date || !isBefore(new Date(r.due_date), startOfDay(new Date()))) return false;
      if (['pago', 'cancelado'].includes(r.financial_status)) return false;
    } else if (filterPeriod !== 'all') {
      const range = getDateRange(filterPeriod);
      if (range && r.due_date) {
        const due = new Date(r.due_date);
        if (due < range.start || due > range.end) return false;
      } else if (range && !r.due_date) return false;
    }

    // Tab-based filtering
    if (activeTab === 'baixas') {
      if (r.financial_status !== 'pago') return false;
    } else if (activeTab === 'pendencias') {
      if (['pago', 'cancelado'].includes(r.financial_status)) return false;
    }

    return true;
  }), [records, search, filterStatus, filterMethod, filterPeriod, filterSeller, filterPriority, getDateRange, activeTab]);

  // Grouped by seller with enhanced stats
  const groupedBySeller = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const uid = r.created_by || 'unknown';
      if (!groups[uid]) groups[uid] = [];
      groups[uid].push(r);
    });
    return Object.entries(groups)
      .map(([uid, recs]) => {
        const active = recs.filter(r => !['pago', 'cancelado'].includes(r.financial_status));
        const paid = recs.filter(r => r.financial_status === 'pago');
        const overdue = recs.filter(r => ['vencido', 'atraso_critico'].includes(r.financial_status));
        return {
          uid,
          name: profiles[uid] || 'Desconhecido',
          records: recs,
          openValue: active.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
          paidValue: paid.reduce((s, r) => s + (parseFloat(r.amount_paid || r.total_amount) || 0), 0),
          totalSold: recs.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
          overdueCount: overdue.length,
          overdueValue: overdue.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
        };
      })
      .sort((a, b) => b.openValue - a.openValue);
  }, [filtered, profiles]);

  // sellerOptions is now populated from loadRecords using ALL profiles

  // Stats
  const activeRecords = records.filter(r => !['pago', 'cancelado'].includes(r.financial_status));
  const paidRecords = records.filter(r => r.financial_status === 'pago');
  const totalReceivable = activeRecords.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
  const _totalPaid = paidRecords.reduce((s, r) => s + (parseFloat(r.amount_paid || r.total_amount) || 0), 0);
  const overdue = records.filter(r => r.financial_status === 'vencido').length;
  const criticalOverdue = records.filter(r => r.financial_status === 'atraso_critico').length;
  const dueToday = records.filter(r => r.financial_status === 'vence_hoje').length;
  const renegotiating = records.filter(r => r.financial_status === 'em_renegociacao').length;
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const paidThisMonth = paidRecords
    .filter(r => r.paid_date && new Date(r.paid_date) >= monthStart && new Date(r.paid_date) <= monthEnd)
    .reduce((s, r) => s + (parseFloat(r.amount_paid || r.total_amount) || 0), 0);
  const pendingCount = activeRecords.length;
  const baixasCount = paidRecords.filter(r => r.baixa_at).length;

  // Problem card stats
  const problemStats = useMemo(() => {
    const overdueRecs = records.filter(r => ['vencido', 'atraso_critico'].includes(r.financial_status));
    const criticalRecs = records.filter(r => r.financial_status === 'atraso_critico');
    const highValueRecs = activeRecords.filter(r => (parseFloat(r.total_amount) || 0) > 5000);
    return {
      overdueCount: overdueRecs.length,
      overdueValue: overdueRecs.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
      criticalCount: criticalRecs.length,
      criticalValue: criticalRecs.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
      highValueCount: highValueRecs.length,
      highValueTotal: highValueRecs.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
    };
  }, [records, activeRecords]);

  const methodStats = useMemo(() => {
    const methods = ['boleto', 'pix', 'cartao'];
    return methods.map(m => {
      const mr = records.filter(r => r.payment_method === m);
      return {
        method: m,
        total: mr.length,
        totalValue: mr.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
        pending: mr.filter(r => !['pago', 'cancelado'].includes(r.financial_status)).length,
        paid: mr.filter(r => r.financial_status === 'pago').length,
        overdue: mr.filter(r => ['vencido', 'atraso_critico'].includes(r.financial_status)).length,
      };
    });
  }, [records]);

  const statusStats = useMemo(() => {
    return Object.keys(financialStatusLabels).map(key => ({
      key,
      ...financialStatusLabels[key],
      count: records.filter(r => r.financial_status === key).length,
      value: records.filter(r => r.financial_status === key).reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
    }));
  }, [records]);

  const fmt = (v: number) => privacyFormat(v);

  // Inline action buttons for each record row
  const renderActions = (r: any) => {
    if (!canEdit) return null;
    const isPaidOrCancelled = ['pago', 'cancelado'].includes(r.financial_status);
    return (
      <ActionMenu 
        actions={[
          { 
            label: "Registrar Baixa", 
            icon: ArrowDownCircle, 
            onClick: () => handleOpenBaixa(r),
            isPrimary: true,
            disabled: isPaidOrCancelled
          },
          { 
            label: "Liquidar Agora", 
            icon: CheckCircle2, 
            onClick: () => handleStatusChange(r, 'pago', 'liquidacao'),
            disabled: isPaidOrCancelled
          },
          { 
            label: "Renegociar", 
            icon: Handshake, 
            onClick: () => handleStatusChange(r, 'em_renegociacao', 'renegociacao'),
            disabled: isPaidOrCancelled
          },
          { 
            label: "Adicionar Obs.", 
            icon: MessageSquare, 
            onClick: () => { setNoteRecord(r); setNoteText(''); },
            isSecondary: true
          },
          { 
            label: "Ver Histórico", 
            icon: History, 
            onClick: () => handleViewHistory(r)
          }
        ]}
      />
    );
  };


  // Need to import LayoutDashboard at top... it's already there? No.
  // Let's use Banknote for dashboard icon since LayoutDashboard is not imported... actually it's not. Let me use existing icons.

  return (
    <AppLayout>
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display flex items-center gap-2">
            <Banknote className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Financeiro
          </h1>
          <p className="text-muted-foreground text-sm">Contas a receber, baixas e pendências</p>
        </div>
        <div className="flex gap-2 self-start flex-wrap">
          {/* Tab navigation */}
          <div className="flex border rounded-md overflow-hidden">
            {[
              { key: 'dashboard' as const, label: 'Dashboard', icon: Wallet },
              { key: 'pendencias' as const, label: 'Pendências', icon: Clock },
              { key: 'baixas' as const, label: 'Baixas', icon: ArrowDownCircle },
              { key: 'relatorios' as const, label: 'Relatórios', icon: FileBarChart },
            ].map(tab => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none gap-1.5 h-8 text-xs"
                onClick={() => setActiveTab(tab.key)}
              >
                <tab.icon className="h-3.5 w-3.5" /> {!isMobile && tab.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <PrivacyToggle />
            <Button variant="outline" size="sm" onClick={loadRecords} className="gap-2 h-8">
              <RefreshCw className="h-4 w-4" /> {!isMobile && 'Atualizar'}
            </Button>
          </div>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* Dashboard Cards */}
          <div className={cn("grid gap-3 md:gap-4 mb-4 md:mb-6", isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
            <StatCard title="Total a Receber" value={totalReceivable} isCurrency icon={DollarSign} />
            <StatCard title="Recebido no Mês" value={paidThisMonth} isCurrency icon={CircleDollarSign} />
            <StatCard title="Pendentes" value={pendingCount} icon={Clock} />
            <StatCard title="Baixas Realizadas" value={baixasCount} icon={CheckCircle2} />
          </div>

          <div className={cn("grid gap-3 md:gap-4 mb-4 md:mb-6", isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
            <StatCard title="Vencendo Hoje" value={dueToday} icon={CalendarDays} className={dueToday > 0 ? "border-l-4 border-l-orange-500" : ""} />
            <StatCard title="Vencidos" value={overdue} icon={AlertTriangle} className={overdue > 0 ? "border-l-4 border-l-red-500" : ""} />
            <StatCard title="Atraso Crítico" value={criticalOverdue} icon={ShieldAlert} className={criticalOverdue > 0 ? "border-l-4 border-l-rose-600" : ""} />
            <StatCard title="Em Renegociação" value={renegotiating} icon={Handshake} className={renegotiating > 0 ? "border-l-4 border-l-purple-500" : ""} />
          </div>

          {/* Problem Card */}
          {(problemStats.overdueCount > 0 || problemStats.criticalCount > 0 || problemStats.highValueCount > 0) && (
            <Card className="shadow-card mb-4 md:mb-6 border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2 text-red-600">
                  <ShieldAlert className="h-4 w-4" /> Problemas Detectados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {problemStats.overdueCount > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200 cursor-pointer hover:bg-red-100 transition-colors"
                      onClick={() => { setFilterPriority('vencidos'); setActiveTab('pendencias'); }}>
                      <div>
                        <p className="text-xs font-medium text-red-800">Contas Vencidas</p>
                        <p className="text-lg font-bold text-red-600">{problemStats.overdueCount}</p>
                      </div>
                      <p className="text-xs text-red-600 font-semibold">{maskValue(problemStats.overdueValue)}</p>
                    </div>
                  )}
                  {problemStats.criticalCount > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 border border-rose-200 cursor-pointer hover:bg-rose-100 transition-colors"
                      onClick={() => { setFilterStatus('atraso_critico'); setActiveTab('pendencias'); }}>
                      <div>
                        <p className="text-xs font-medium text-rose-800">Atraso Crítico (+30d)</p>
                        <p className="text-lg font-bold text-rose-600">{problemStats.criticalCount}</p>
                      </div>
                      <p className="text-xs text-rose-600 font-semibold">{maskValue(problemStats.criticalValue)}</p>
                    </div>
                  )}
                  {problemStats.highValueCount > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div>
                        <p className="text-xs font-medium text-amber-800">Valores Altos em Aberto (&gt;R$5k)</p>
                        <p className="text-lg font-bold text-amber-600">{problemStats.highValueCount}</p>
                      </div>
                      <p className="text-xs text-amber-600 font-semibold">{fmt(problemStats.highValueTotal)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ações do Dia */}
          <FinancialActionsDoDia records={records} fmt={fmt} />

          {/* Previsão + Alertas + Conversão */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
            <FinancialForecast records={records} fmt={fmt} />
            <FinancialAlerts records={records} fmt={fmt} />
            <FinancialConversion records={records} fmt={fmt} />
          </div>

          {/* Enhanced Seller Ranking */}
          <FinancialSellerRanking records={records} profilesMap={profiles} fmt={fmt} />

          {/* Resumo por Método */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
            {methodStats.map(ms => {
              const conf = paymentMethodConfig[ms.method];
              if (!conf) return null;
              const Icon = conf.icon;
              return (
                <Card key={ms.method} className="shadow-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", conf.color)} /> {conf.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Quantidade:</span> <strong>{ms.total}</strong></div>
                      <div><span className="text-muted-foreground">Valor Total:</span> <strong>{maskValue(ms.totalValue)}</strong></div>
                      <div><span className="text-muted-foreground">Pendentes:</span> <strong className="text-yellow-600">{ms.pending}</strong></div>
                      <div><span className="text-muted-foreground">Pagos:</span> <strong className="text-emerald-600">{ms.paid}</strong></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Vencidos:</span> <strong className="text-red-600">{ms.overdue}</strong></div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Resumo por Status */}
          <Card className="shadow-card mb-4 md:mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Resumo por Status Financeiro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {statusStats.map(ss => (
                  <div key={ss.key} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer hover:opacity-80", ss.color)}
                    onClick={() => { setFilterStatus(ss.key); setActiveTab('pendencias'); }}>
                    <span className="font-medium">{ss.label}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5">{ss.count}</Badge>
                    <span className="text-[10px] opacity-75">{fmt(ss.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <FinancialQuickActions
            onFilterOverdue={() => { setFilterPriority('vencidos'); setActiveTab('pendencias'); }}
            onFilterPending={() => { setFilterStatus('aguardando_pagamento'); setActiveTab('pendencias'); }}
          />
        </>
      )}

      {activeTab === 'relatorios' && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Relatório por Vendedor</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Vendedor</TableHead>
                  <TableHead className="text-xs">Total Vendido</TableHead>
                  <TableHead className="text-xs">Recebido</TableHead>
                  <TableHead className="text-xs">Em Aberto</TableHead>
                  <TableHead className="text-xs">Inadimplência</TableHead>
                  <TableHead className="text-xs">Contas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedBySeller.map(g => (
                  <TableRow key={g.uid}>
                    <TableCell className="text-xs font-medium">{g.name}</TableCell>
                    <TableCell className="text-xs">{maskValue(g.totalSold)}</TableCell>
                    <TableCell className="text-xs text-emerald-600 font-semibold">{maskValue(g.paidValue)}</TableCell>
                    <TableCell className="text-xs text-blue-600 font-semibold">{maskValue(g.openValue)}</TableCell>
                    <TableCell className="text-xs">
                      {g.overdueCount > 0 ? (
                        <span className="text-red-600 font-semibold">{g.overdueCount} ({maskValue(g.overdueValue)})</span>
                      ) : (
                        <span className="text-emerald-600">Nenhuma</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{g.records.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Records list (pendencias, baixas, or dashboard sub-view) */}
      {(activeTab === 'pendencias' || activeTab === 'baixas') && (
        <>
          {/* View mode toggle */}
          <div className="flex gap-2 mb-4">
            <div className="flex border rounded-md overflow-hidden">
              <Button variant={viewMode === 'grouped' ? 'default' : 'ghost'} size="sm" className="rounded-none gap-1.5 h-8" onClick={() => setViewMode('grouped')}>
                <Users className="h-3.5 w-3.5" /> Por Vendedor
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" className="rounded-none gap-1.5 h-8" onClick={() => setViewMode('list')}>
                <List className="h-3.5 w-3.5" /> Lista Geral
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className={cn("flex gap-3 flex-wrap", isMobile && "flex-col")}>
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar cliente ou pedido..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="vencidos">🔴 Vencidos</SelectItem>
                    <SelectItem value="hoje">🟠 Vence Hoje</SelectItem>
                    <SelectItem value="proximos">🟡 Próximos 3 dias</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterSeller} onValueChange={setFilterSeller}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Vendedores</SelectItem>
                    {sellerOptions.map(s => (
                      <SelectItem key={s.uid} value={s.uid}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Status</SelectItem>
                    {Object.entries(financialStatusLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterMethod} onValueChange={setFilterMethod}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Método" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Período" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="7days">Últimos 7 dias</SelectItem>
                    <SelectItem value="month">Este Mês</SelectItem>
                    <SelectItem value="last_month">Mês Anterior</SelectItem>
                    <SelectItem value="overdue">Vencidos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Records */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">Nenhum registro financeiro encontrado</p>
              </CardContent>
            </Card>
          ) : viewMode === 'grouped' ? (
            <div className="space-y-4">
              {groupedBySeller.map(group => (
                <Card key={group.uid} className="shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-display flex items-center justify-between flex-wrap gap-2">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        {group.name}
                      </span>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <DollarSign className="h-3 w-3" /> Total: {fmt(group.totalSold)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Recebido: {fmt(group.paidValue)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-200">
                          <Clock className="h-3 w-3" /> Aberto: {fmt(group.openValue)}
                        </Badge>
                        {group.overdueCount > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-1 text-red-600 border-red-200">
                            <AlertTriangle className="h-3 w-3" /> {group.overdueCount} inadimpl.
                          </Badge>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {isMobile ? (
                      <div className="divide-y">
                        {group.records.map((r: any) => {
                          const st = financialStatusLabels[r.financial_status] || financialStatusLabels.aguardando_pagamento;
                          const pm = paymentMethodConfig[r.payment_method];
                          return (
                            <div key={r.id} className="p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-xs truncate">{r.client_name || 'Sem cliente'}</span>
                                <Badge className={cn('text-[10px]', st.color)}>{st.label}</Badge>
                              </div>
                              <div className="flex justify-between text-[11px] text-muted-foreground">
                                <span>{pm?.label || r.payment_method || '-'}</span>
                                <span>Venc: {r.due_date ? format(new Date(r.due_date), 'dd/MM/yyyy') : '-'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-sm">{fmt(parseFloat(r.total_amount) || 0)}</span>
                              </div>
                              {r.financial_notes && (
                                <p className="text-[10px] text-muted-foreground bg-muted/50 p-1.5 rounded">{r.financial_notes.split('\n').pop()}</p>
                              )}
                              {renderActions(r)}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Cliente</TableHead>
                            <TableHead className="text-xs">Método</TableHead>
                            <TableHead className="text-xs">Valor</TableHead>
                            <TableHead className="text-xs">Vencimento</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Pago</TableHead>
                            {canEdit && <TableHead className="text-xs">Ações</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.records.map((r: any) => {
                            const st = financialStatusLabels[r.financial_status] || financialStatusLabels.aguardando_pagamento;
                            const pm = paymentMethodConfig[r.payment_method];
                            return (
                              <TableRow key={r.id}>
                                <TableCell className="text-xs font-medium">{r.client_name || 'Sem cliente'}</TableCell>
                                <TableCell className="text-xs">{pm?.label || r.payment_method || '-'}</TableCell>
                                <TableCell className="text-xs font-semibold">{maskValue(parseFloat(r.total_amount) || 0)}</TableCell>
                                <TableCell className="text-xs">{r.due_date ? format(new Date(r.due_date), 'dd/MM/yyyy') : '-'}</TableCell>
                                <TableCell><Badge className={cn('text-[10px]', st.color)}>{st.label}</Badge></TableCell>
                                <TableCell className="text-xs">{r.amount_paid ? maskValue(parseFloat(r.amount_paid)) : '-'}</TableCell>
                                {canEdit && <TableCell>{renderActions(r)}</TableCell>}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Registros ({filtered.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isMobile ? (
                  <div className="divide-y">
                    {filtered.map(r => {
                      const st = financialStatusLabels[r.financial_status] || financialStatusLabels.aguardando_pagamento;
                      const pm = paymentMethodConfig[r.payment_method];
                      const PmIcon = pm?.icon;
                      return (
                        <div key={r.id} className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm truncate">{r.client_name || 'Sem cliente'}</span>
                            <Badge className={cn('text-xs', st.color)}>{st.label}</Badge>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              {PmIcon && <PmIcon className="h-3 w-3" />} {pm?.label || r.payment_method || '-'}
                            </span>
                            <span>Venc: {r.due_date ? format(new Date(r.due_date), 'dd/MM/yyyy') : '-'}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Vendedor: {profiles[r.created_by] || 'Desconhecido'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold">{fmt(parseFloat(r.total_amount) || 0)}</span>
                          </div>
                          {renderActions(r)}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pago</TableHead>
                        {canEdit && <TableHead>Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(r => {
                        const st = financialStatusLabels[r.financial_status] || financialStatusLabels.aguardando_pagamento;
                        const pm = paymentMethodConfig[r.payment_method];
                        const PmIcon = pm?.icon;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">{profiles[r.created_by] || 'Desconhecido'}</TableCell>
                            <TableCell className="font-medium">{r.client_name || 'Sem cliente'}</TableCell>
                            <TableCell>
                              {PmIcon ? (
                                <span className="flex items-center gap-1"><PmIcon className="h-3 w-3" /> {pm.label}</span>
                              ) : (r.payment_method || '-')}
                            </TableCell>
                            <TableCell className="font-semibold">{fmt(parseFloat(r.total_amount) || 0)}</TableCell>
                            <TableCell>{r.due_date ? format(new Date(r.due_date), 'dd/MM/yyyy') : '-'}</TableCell>
                            <TableCell><Badge className={cn('text-xs', st.color)}>{st.label}</Badge></TableCell>
                            <TableCell>{r.amount_paid ? fmt(parseFloat(r.amount_paid)) : '-'}</TableCell>
                            {canEdit && <TableCell>{renderActions(r)}</TableCell>}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Baixa Dialog */}
      <Dialog open={!!baixaRecord} onOpenChange={v => !v && setBaixaRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Baixa</DialogTitle>
          </DialogHeader>
          {baixaRecord && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Cliente: <strong>{baixaRecord.client_name}</strong></p>
                <p className="text-sm text-muted-foreground">Valor: <strong>{fmt(parseFloat(baixaRecord.total_amount) || 0)}</strong></p>
                <p className="text-sm text-muted-foreground">Vendedor: <strong>{profiles[baixaRecord.created_by] || 'Desconhecido'}</strong></p>
              </div>
              <div>
                <Label>Valor Recebido</Label>
                <Input type="number" step="0.01" value={baixaForm.amount_paid} onChange={e => setBaixaForm(f => ({ ...f, amount_paid: e.target.value }))} />
              </div>
              <div>
                <Label>Data do Pagamento</Label>
                <Input type="date" value={baixaForm.paid_date} onChange={e => setBaixaForm(f => ({ ...f, paid_date: e.target.value }))} />
              </div>
              <div>
                <Label>Status Financeiro</Label>
                <Select value={baixaForm.financial_status} onValueChange={v => setBaixaForm(f => ({ ...f, financial_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pago_parcial">Pago Parcial</SelectItem>
                    <SelectItem value="promessa_pagamento">Promessa de Pagamento</SelectItem>
                    <SelectItem value="em_renegociacao">Em Renegociação</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea value={baixaForm.financial_notes} onChange={e => setBaixaForm(f => ({ ...f, financial_notes: e.target.value }))} placeholder="Observações da baixa..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBaixaRecord(null)}>Cancelar</Button>
                <Button onClick={handleSaveBaixa} disabled={saving}>
                  {saving ? 'Salvando...' : 'Confirmar Baixa'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={!!noteRecord} onOpenChange={v => !v && setNoteRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Adicionar Observação</DialogTitle>
          </DialogHeader>
          {noteRecord && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Cliente: <strong>{noteRecord.client_name}</strong></p>
                <p className="text-sm text-muted-foreground">Valor: <strong>{fmt(parseFloat(noteRecord.total_amount) || 0)}</strong></p>
              </div>
              {noteRecord.financial_notes && (
                <div>
                  <Label className="text-xs">Observações anteriores</Label>
                  <div className="text-xs bg-muted/50 p-3 rounded-lg max-h-32 overflow-y-auto whitespace-pre-wrap mt-1">
                    {noteRecord.financial_notes}
                  </div>
                </div>
              )}
              <div>
                <Label>Nova Observação</Label>
                <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Digite sua observação..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNoteRecord(null)}>Cancelar</Button>
                <Button onClick={handleSaveNote} disabled={saving || !noteText.trim()}>
                  {saving ? 'Salvando...' : 'Salvar Observação'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={!!historyRecord} onOpenChange={v => !v && setHistoryRecord(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Histórico de Ações</DialogTitle>
          </DialogHeader>
          {historyRecord && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Cliente: <strong>{historyRecord.client_name}</strong></p>
                <p className="text-sm text-muted-foreground">Valor: <strong>{fmt(parseFloat(historyRecord.total_amount) || 0)}</strong></p>
              </div>
              {historyData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico registrado ainda</p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {historyData.map((h: any) => (
                    <div key={h.id} className="flex gap-3 p-3 rounded-lg bg-muted/30 border text-xs">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{h.performed_by_name || 'Desconhecido'}</span>
                          <span className="text-muted-foreground">{format(new Date(h.created_at), 'dd/MM/yyyy HH:mm')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{h.action_type}</Badge>
                          {h.previous_status && h.new_status && h.previous_status !== h.new_status && (
                            <span className="text-muted-foreground">
                              {financialStatusLabels[h.previous_status]?.label || h.previous_status} → {financialStatusLabels[h.new_status]?.label || h.new_status}
                            </span>
                          )}
                        </div>
                        {h.notes && <p className="mt-1 text-muted-foreground">{h.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export default function Financial() {
  return (
    <ErrorBoundary>
      <FinancialContent />
    </ErrorBoundary>
  );
}
