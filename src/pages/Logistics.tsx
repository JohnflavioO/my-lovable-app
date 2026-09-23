import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
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
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Truck, PackageCheck, FileText, Search, Eye, Download, ClipboardList,
  AlertTriangle, MapPin, RefreshCw, Clock, CheckCircle2,
  TriangleAlert, History, ArrowRight, Upload, FileDown, X,
  Copy, ExternalLink, Calendar as CalendarIcon, Link as LinkIcon,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { generateQuotePdf } from '@/lib/generateQuotePdf';
import LogisticsWorkQueue from '@/components/logistics/LogisticsWorkQueue';
import LogisticsSmartAlerts from '@/components/logistics/LogisticsSmartAlerts';
import LogisticsEfficiency from '@/components/logistics/LogisticsEfficiency';
import LogisticsSellerView from '@/components/logistics/LogisticsSellerView';
import LogisticsShippingIndicators from '@/components/logistics/LogisticsShippingIndicators';

const db = supabase as any;

const logisticsStatusLabels: Record<string, { label: string; color: string }> = {
  aguardando_entrada: { label: 'Aguardando Entrada', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  entrada_realizada: { label: 'Entrada Realizada', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  emitindo_nf: { label: 'Emitindo NF', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  nf_emitida: { label: 'NF Emitida', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  em_separacao: { label: 'Em Separação', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  pronto_envio: { label: 'Pronto p/ Envio', color: 'bg-teal-100 text-teal-800 border-teal-200' },
  enviado: { label: 'Enviado', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  em_transporte: { label: 'Em Transporte', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  entregue: { label: 'Entregue', color: 'bg-green-100 text-green-800 border-green-200' },
  problema_logistico: { label: 'Problema', color: 'bg-red-100 text-red-800 border-red-200' },
};

const allStatuses = Object.keys(logisticsStatusLabels);

// Estágios operacionais consolidados (apenas agrupamento visual — não altera regras)
// Pré-venda NÃO é um logistics_status: vem da proposta (status pre_venda) ou de itens marcados como pré-venda.
const STAGE_GROUPS: { key: string; label: string; statuses: string[]; color: string }[] = [
  { key: 'prevenda', label: 'Pré-venda', statuses: [], color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { key: 'aguardando_nf', label: 'Aguardando NF', statuses: ['aguardando_entrada', 'entrada_realizada', 'emitindo_nf'], color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { key: 'nf_emitida', label: 'NF emitida', statuses: ['nf_emitida'], color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { key: 'aguardando_envio', label: 'Aguardando envio', statuses: ['em_separacao', 'pronto_envio'], color: 'bg-teal-100 text-teal-800 border-teal-200' },
  { key: 'enviado', label: 'Enviado', statuses: ['enviado', 'em_transporte'], color: 'bg-sky-100 text-sky-800 border-sky-200' },
  { key: 'concluido', label: 'Concluído', statuses: ['entregue'], color: 'bg-green-100 text-green-800 border-green-200' },
  { key: 'problema', label: 'Problema', statuses: ['problema_logistico'], color: 'bg-red-100 text-red-800 border-red-200' },
];

const PRESALE_QUOTE_STATUSES = ['pre_venda', 'pre-venda', 'pre_sale'];

function isPresaleRecord(r: { quote_status?: string; is_presale?: boolean }) {
  return !!r.is_presale || PRESALE_QUOTE_STATUSES.includes(r.quote_status || '');
}

function getStage(status: string, presale = false) {
  if (presale) return STAGE_GROUPS[0];
  return STAGE_GROUPS.find(g => g.statuses.includes(status)) || STAGE_GROUPS[1];
}


const paymentMethodLabels: Record<string, string> = {
  pix: 'PIX',
  cartao: 'Cartão',
  cartao_credito: 'Cartão',
  boleto: 'Boleto',
  parceria: 'Parceria',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
};


interface LogisticsRecord {
  id: string;
  quote_id: string;
  logistics_status: string;
  nf_numero: string | null;
  nf_data: string | null;
  nf_pdf_url: string | null;
  codigo_rastreio: string | null;
  transportadora: string | null;
  observacao_logistica: string | null;
  data_envio: string | null;
  data_entrega: string | null;
  entrada_by: string | null;
  entrada_at: string | null;
  created_at: string;
  updated_at: string;
  tracking_url?: string | null;
  public_token?: string | null;
  is_incompleto?: boolean | null;
  quote_number?: string;
  client_name?: string;
  salesperson?: string;
  total_amount?: number;
  total?: number;
  approved_at?: string;
  created_by?: string;
  client_id?: string;
  quote_status?: string;
  payment_method?: string | null;
  is_presale?: boolean;
  is_virtual?: boolean;
  presale_items?: QuoteItem[];
}

interface QuoteItem {
  id: string;
  item_number: number | null;
  product_code: string | null;
  description: string | null;
  quantity: number | null;
  code?: string | null;
  brand?: string | null;
  model?: string | null;
  is_presale?: boolean | null;
}

function quoteItemLabel(item: QuoteItem) {
  return item.description?.trim() || [item.brand, item.model].filter(Boolean).join(' ').trim() || 'Produto sem descrição';
}

const STATUS_PROGRESS: Record<string, number> = {
  aguardando_entrada: 10,
  entrada_realizada: 20,
  emitindo_nf: 30,
  nf_emitida: 40,
  em_separacao: 60,
  pronto_envio: 70,
  enviado: 80,
  em_transporte: 90,
  entregue: 100,
  problema_logistico: 10,
};

const FLOW_STEPS: { key: string; label: string; matches: string[] }[] = [
  { key: 'aprovado', label: 'Aprovado', matches: ['aguardando_entrada'] },
  { key: 'recebido', label: 'Recebido', matches: ['entrada_realizada', 'emitindo_nf'] },
  { key: 'nf', label: 'NF Emitida', matches: ['nf_emitida'] },
  { key: 'separacao', label: 'Separação', matches: ['em_separacao', 'pronto_envio'] },
  { key: 'despachado', label: 'Despachado', matches: ['enviado'] },
  { key: 'transporte', label: 'Em Transporte', matches: ['em_transporte'] },
  { key: 'entregue', label: 'Entregue', matches: ['entregue'] },
];

function getCurrentStepIndex(status: string): number {
  const i = FLOW_STEPS.findIndex(s => s.matches.includes(status));
  return i < 0 ? 0 : i;
}

function getStaleDays(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function getPriorityClass(r: { logistics_status: string; updated_at: string }): string {
  if (['entregue', 'problema_logistico'].includes(r.logistics_status)) return '';
  const d = getStaleDays(r.updated_at);
  if (d >= 14) return 'border-l-4 border-l-red-600 bg-red-50/40';
  if (d >= 7) return 'border-l-4 border-l-red-400 bg-red-50/20';
  if (d >= 3) return 'border-l-4 border-l-yellow-400 bg-yellow-50/30';
  return '';
}

type DateFilter = 'all' | 'today' | '7d' | 'month' | 'custom';

export default function Logistics() {
  const { user, isLogistica, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'prevendas';
  const isMobile = useIsMobile();

  const [records, setRecords] = useState<LogisticsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingQuoteIds, setStartingQuoteIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);

  // Dialog states
  const [detailRecord, setDetailRecord] = useState<LogisticsRecord | null>(null);
  const [detailItems, setDetailItems] = useState<QuoteItem[]>([]);
  const [detailItemStatus, setDetailItemStatus] = useState<Record<string, string>>({});
  const [editRecord, setEditRecord] = useState<LogisticsRecord | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNfNumero, setEditNfNumero] = useState('');
  const [editNfData, setEditNfData] = useState('');
  const [editRastreio, setEditRastreio] = useState('');
  const [editTrackingUrl, setEditTrackingUrl] = useState('');
  const [editTransportadora, setEditTransportadora] = useState('');
  const [editObs, setEditObs] = useState('');
  const [editDataEnvio, setEditDataEnvio] = useState('');
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  // NF Registration dialog
  const [nfRecord, setNfRecord] = useState<LogisticsRecord | null>(null);
  const [nfNumero, setNfNumero] = useState('');
  const [nfData, setNfData] = useState('');
  const [nfObs, setNfObs] = useState('');
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [nfUploading, setNfUploading] = useState(false);
  const nfFileRef = useRef<HTMLInputElement>(null);

  // Date filter (additive)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const canOperate = isLogistica;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: logData, error: logErr } = await db
        .from('logistics_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (logErr) throw logErr;

      const quoteIds = (logData || []).map((r: any) => r.quote_id);
      let quotesMap: Record<string, any> = {};
      if (quoteIds.length > 0) {
        const { data: quotes } = await db
          .from('quotes')
          .select('id, quote_number, client_name, salesperson, total_amount, total, approved_at, created_by, client_id, status, payment_method')
          .in('id', quoteIds);
        (quotes || []).forEach((q: any) => {
          quotesMap[q.id] = q;
        });
      }

      // Itens marcados como pré-venda na proposta (regra de item)
      const presaleQuoteIds = new Set<string>();
      const presaleItemsMap: Record<string, QuoteItem[]> = {};
      const { data: presaleItemsAll } = await db
        .from('quote_items')
        .select('id, quote_id, item_number, code, product_code, description, brand, model, quantity, is_presale')
        .eq('is_presale', true);
      (presaleItemsAll || []).forEach((i: any) => {
        presaleQuoteIds.add(i.quote_id);
        (presaleItemsMap[i.quote_id] ||= []).push(i as QuoteItem);
      });

      // Pré-vendas que ainda NÃO possuem registro de logística (não entraram no fluxo)
      const existingQuoteIds = new Set(quoteIds);
      const candidateIds = [...presaleQuoteIds].filter(id => !existingQuoteIds.has(id));
      let extraPresaleQuotes: any[] = [];
      const quoteCols = 'id, quote_number, client_name, salesperson, total_amount, total, approved_at, created_by, client_id, status, payment_method, created_at, updated_at';

      const { data: statusPresaleQuotes } = await db
        .from('quotes')
        .select(quoteCols)
        .in('status', PRESALE_QUOTE_STATUSES);
      extraPresaleQuotes = (statusPresaleQuotes || []).filter((q: any) => !existingQuoteIds.has(q.id));

      if (candidateIds.length > 0) {
        const { data: itemPresaleQuotes } = await db
          .from('quotes')
          .select(quoteCols)
          .in('id', candidateIds);
        const seen = new Set(extraPresaleQuotes.map((q: any) => q.id));
        (itemPresaleQuotes || [])
          .filter((q: any) => !seen.has(q.id) && !['rejeitado', 'rejected', 'cancelado', 'cancelled'].includes(q.status || ''))
          .forEach((q: any) => extraPresaleQuotes.push(q));
      }


      // Quando a proposta inteira está em Pré-venda, todos os itens precisam ficar visíveis.
      const wholePresaleIds = extraPresaleQuotes
        .filter((q: any) => PRESALE_QUOTE_STATUSES.includes(q.status || ''))
        .map((q: any) => q.id);
      if (wholePresaleIds.length > 0) {
        const { data: wholePresaleItems } = await db
          .from('quote_items')
          .select('id, quote_id, item_number, code, product_code, description, brand, model, quantity, is_presale')
          .in('quote_id', wholePresaleIds)
          .order('item_number');
        (wholePresaleItems || []).forEach((i: any) => {
          (presaleItemsMap[i.quote_id] ||= []);
          if (!presaleItemsMap[i.quote_id].some(item => item.id === i.id)) presaleItemsMap[i.quote_id].push(i as QuoteItem);
        });
      }

      const sellerIds = [...new Set([
        ...(Object.values(quotesMap) as any[]).map((q: any) => q.created_by),
        ...extraPresaleQuotes.map((q: any) => q.created_by),
      ].filter(Boolean))];
      let profilesMap: Record<string, string> = {};
      if (sellerIds.length > 0) {
        const { data: profiles } = await db
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', sellerIds);
        (profiles || []).forEach((p: any) => {
          profilesMap[p.user_id] = p.full_name;
        });
      }


      const merged = (logData || []).map((r: any) => {
        const q = quotesMap[r.quote_id] || {};
        return {
          ...r,
          quote_number: q.quote_number || '',
          client_name: q.client_name || '',
          salesperson: q.salesperson || profilesMap[q.created_by] || '',
          total_amount: q.total_amount || q.total || 0,
          total: q.total || 0,
          approved_at: q.approved_at || '',
          created_by: q.created_by || '',
          client_id: q.client_id || '',
          quote_status: q.status || '',
          payment_method: q.payment_method || null,
          is_presale: presaleQuoteIds.has(r.quote_id) || PRESALE_QUOTE_STATUSES.includes(q.status || ''),
          presale_items: presaleItemsMap[r.quote_id] || [],
        };
      });

      // Registros virtuais (somente leitura) das pré-vendas sem logística
      const virtuals: LogisticsRecord[] = extraPresaleQuotes.map((q: any) => ({
        id: `presale-${q.id}`,
        quote_id: q.id,
        logistics_status: 'aguardando_entrada',
        nf_numero: null,
        nf_data: null,
        nf_pdf_url: null,
        codigo_rastreio: null,
        transportadora: null,
        observacao_logistica: null,
        data_envio: null,
        data_entrega: null,
        entrada_by: null,
        entrada_at: null,
        created_at: q.created_at,
        updated_at: q.updated_at || q.created_at,
        quote_number: q.quote_number || '',
        client_name: q.client_name || '',
        salesperson: q.salesperson || profilesMap[q.created_by] || '',
        total_amount: q.total_amount || q.total || 0,
        total: q.total || 0,
        approved_at: q.approved_at || '',
        created_by: q.created_by || '',
        client_id: q.client_id || '',
        quote_status: q.status || '',
        payment_method: q.payment_method || null,
        is_presale: true,
        is_virtual: true,
        presale_items: presaleItemsMap[q.id] || [],
      }));

      // Show all logistics records + pré-vendas ainda fora do fluxo
      setRecords([...merged, ...virtuals].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));


      // Fetch active sellers (comercial, gestor, admin) excluding test accounts
      const { data: activeSellers } = await db
        .from('profiles')
        .select('user_id, full_name')
        .eq('active', true)
        .in('role', ['comercial', 'gestor', 'admin'])
        .neq('full_name', '')
        .order('full_name');
      const filteredSellers = (activeSellers || []).filter((p: any) =>
        !p.full_name.toLowerCase().includes('teste')
      );
      setSellers(filteredSellers.map((p: any) => ({ id: p.user_id, name: p.full_name })));

    } catch (e: any) {
      console.error('Logistics fetch error:', e);
      toast.error('Erro ao carregar dados logísticos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startPresaleLogistics = async (record: LogisticsRecord) => {
    if (!record.is_virtual || startingQuoteIds.has(record.quote_id)) return;

    setStartingQuoteIds(current => new Set(current).add(record.quote_id));
    try {
      const { error } = await db.rpc('start_presale_logistics', { p_quote_id: record.quote_id });
      if (error) throw error;

      toast.success(`${record.quote_number} baixado para a Logística`);
      await fetchData();
    } catch (e: any) {
      toast.error('Erro ao baixar pedido: ' + (e.message || ''));
    } finally {
      setStartingQuoteIds(current => {
        const next = new Set(current);
        next.delete(record.quote_id);
        return next;
      });
    }
  };

  const filtered = useMemo(() => {
    let list = records;
    if (statusFilter.startsWith('stage:')) {
      const key = statusFilter.slice(6);
      if (key === 'prevenda') {
        list = list.filter(r => isPresaleRecord(r));
      } else {
        const stage = STAGE_GROUPS.find(g => g.key === key);
        if (stage) list = list.filter(r => !isPresaleRecord(r) && stage.statuses.includes(r.logistics_status));
      }
    } else if (statusFilter !== 'all') {
      list = list.filter(r => r.logistics_status === statusFilter);
    }


    if (sellerFilter !== 'all') list = list.filter(r => r.created_by === sellerFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        (r.quote_number || '').toLowerCase().includes(s) ||
        (r.client_name || '').toLowerCase().includes(s) ||
        (r.salesperson || '').toLowerCase().includes(s) ||
        (r.presale_items || []).some(item => `${item.product_code || item.code || ''} ${quoteItemLabel(item)}`.toLowerCase().includes(s)) ||
        (r.nf_numero || '').toLowerCase().includes(s) ||
        (r.codigo_rastreio || '').toLowerCase().includes(s)
      );
    }

    // Date filter (additive) — uses created_at
    if (dateFilter !== 'all') {
      const now = new Date();
      let from: Date | null = null;
      let to: Date | null = null;
      if (dateFilter === 'today') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === '7d') {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateFilter === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateFilter === 'custom') {
        if (dateFrom) from = new Date(dateFrom + 'T00:00:00');
        if (dateTo) to = new Date(dateTo + 'T23:59:59');
      }
      list = list.filter(r => {
        const d = new Date(r.created_at);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }

    // Pré-vendas: apenas propostas com status Pré-venda ou com pelo menos um item marcado como pré-venda
    if (tab === 'prevendas') list = list.filter(r => isPresaleRecord(r));
    if (tab === 'nf') list = list.filter(r => ['aguardando_entrada', 'entrada_realizada', 'emitindo_nf'].includes(r.logistics_status) || (!r.nf_numero && !['nf_emitida', 'pronto_envio', 'enviado', 'em_transporte', 'entregue'].includes(r.logistics_status)));

    if (tab === 'envios') list = list.filter(r => ['pronto_envio', 'enviado', 'em_transporte'].includes(r.logistics_status));
    if (tab === 'rastreamento') list = list.filter(r => r.logistics_status === 'enviado' || r.logistics_status === 'em_transporte' || r.codigo_rastreio);
    if (tab === 'problemas') list = list.filter(r => r.logistics_status === 'problema_logistico');

    return list;
  }, [records, statusFilter, sellerFilter, search, tab, dateFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const s = { aguardando: 0, emitindoNf: 0, prontoEnvio: 0, enviados: 0, transporte: 0, entregues: 0, problemas: 0, semRastreio: 0, entreguesHoje: 0, entreguesMes: 0, pendencias: 0 };
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    records.forEach(r => {
      if (r.logistics_status === 'aguardando_entrada') s.aguardando++;
      if (r.logistics_status === 'emitindo_nf') s.emitindoNf++;
      if (r.logistics_status === 'pronto_envio') s.prontoEnvio++;
      if (r.logistics_status === 'enviado') s.enviados++;
      if (r.logistics_status === 'em_transporte') s.transporte++;
      if (r.logistics_status === 'entregue') s.entregues++;
      if (r.logistics_status === 'problema_logistico') s.problemas++;
      if (['enviado', 'em_transporte'].includes(r.logistics_status) && !r.codigo_rastreio) s.semRastreio++;
      if (r.logistics_status === 'entregue' && r.data_entrega) {
        const d = new Date(r.data_entrega);
        if (d >= startToday) s.entreguesHoje++;
        if (d >= startMonth) s.entreguesMes++;
      }
      if (!['entregue'].includes(r.logistics_status) && getStaleDays(r.updated_at) >= 3) s.pendencias++;
    });
    return s;
  }, [records]);

  const openEdit = (r: LogisticsRecord) => {
    setEditRecord(r);
    setEditStatus(r.logistics_status);
    setEditNfNumero(r.nf_numero || '');
    setEditNfData(r.nf_data || '');
    setEditRastreio(r.codigo_rastreio || '');
    setEditTrackingUrl(r.tracking_url || '');
    setEditTransportadora(r.transportadora || '');
    setEditObs(r.observacao_logistica || '');
    setEditDataEnvio(r.data_envio || '');
  };

  // Open detail with items + item-statuses + timeline
  const [detailTimeline, setDetailTimeline] = useState<any[]>([]);
  const openDetail = async (r: LogisticsRecord) => {
    setDetailRecord(r);
    setDetailItems([]);
    setDetailItemStatus({});
    setDetailTimeline([]);
    try {
      const { data: items } = await db.from('quote_items').select('id, item_number, code, product_code, description, brand, model, quantity, is_presale').eq('quote_id', r.quote_id).order('item_number');
      setDetailItems((items || []) as QuoteItem[]);
      if (r.is_virtual) return;
      const { data: statuses } = await db.from('logistics_item_status').select('quote_item_id, item_status').eq('logistics_record_id', r.id);
      const map: Record<string, string> = {};
      (statuses || []).forEach((s: any) => { map[s.quote_item_id] = s.item_status; });
      setDetailItemStatus(map);
      const { data: tl } = await db.from('logistics_action_history').select('*').eq('logistics_record_id', r.id).order('created_at', { ascending: false });
      setDetailTimeline(tl || []);
    } catch (e) {
      console.error('openDetail error', e);
    }
  };

  const setItemStatus = async (quoteItemId: string, newStatus: string) => {
    if (!detailRecord) return;
    try {
      const existing = detailItemStatus[quoteItemId];
      if (existing) {
        const { error } = await db.from('logistics_item_status')
          .update({ item_status: newStatus, updated_by: user?.id, updated_by_name: profile?.full_name || '' })
          .eq('logistics_record_id', detailRecord.id).eq('quote_item_id', quoteItemId);
        if (error) throw error;
      } else {
        const { error } = await db.from('logistics_item_status').insert({
          logistics_record_id: detailRecord.id,
          quote_item_id: quoteItemId,
          item_status: newStatus,
          updated_by: user?.id,
          updated_by_name: profile?.full_name || '',
        });
        if (error) throw error;
      }
      setDetailItemStatus(prev => ({ ...prev, [quoteItemId]: newStatus }));
      toast.success('Status do item atualizado');
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || ''));
    }
  };

  const copyTrackingLink = (r: LogisticsRecord) => {
    if (!r.public_token) {
      toast.error('Token não disponível ainda. Atualize a página.');
      return;
    }
    const url = `${window.location.origin}/rastreio/pedido/${r.public_token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link do cliente copiado');
  };

  // Open NF registration modal
  const openNfRegistration = (r: LogisticsRecord) => {
    setNfRecord(r);
    setNfNumero(r.nf_numero || '');
    setNfData(r.nf_data || new Date().toISOString().split('T')[0]);
    setNfObs(r.observacao_logistica || '');
    setNfFile(null);
    if (nfFileRef.current) nfFileRef.current.value = '';
  };

  // Handle NF file selection
  const handleNfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Apenas arquivos PDF são aceitos');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo: 10MB');
      e.target.value = '';
      return;
    }
    setNfFile(file);
  };

  // Save NF registration
  const saveNfRegistration = async () => {
    if (!nfRecord) return;
    if (!nfNumero.trim()) {
      toast.error('Informe o número da NF');
      return;
    }
    if (!nfFile && !nfRecord.nf_pdf_url) {
      toast.error('Anexe o PDF da NF para concluir esta etapa');
      return;
    }

    setNfUploading(true);
    try {
      let pdfUrl = nfRecord.nf_pdf_url;

      // Upload PDF if new file selected
      if (nfFile) {
        const filePath = `${nfRecord.quote_id}/${Date.now()}_${nfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        // Remove old file if replacing
        if (nfRecord.nf_pdf_url) {
          await supabase.storage.from('nf-pdfs').remove([nfRecord.nf_pdf_url]);
        }

        const { error: uploadErr } = await supabase.storage
          .from('nf-pdfs')
          .upload(filePath, nfFile, { contentType: 'application/pdf', upsert: false });

        if (uploadErr) throw uploadErr;
        pdfUrl = filePath;
      }

      const previousStatus = nfRecord.logistics_status;
      const updates: any = {
        nf_numero: nfNumero.trim(),
        nf_data: nfData || null,
        nf_pdf_url: pdfUrl,
        observacao_logistica: nfObs || null,
        logistics_status: 'nf_emitida',
        updated_at: new Date().toISOString(),
      };

      const { error } = await db.from('logistics_records').update(updates).eq('id', nfRecord.id);
      if (error) throw error;

      // Log action
      if (previousStatus !== 'nf_emitida') {
        await db.from('logistics_action_history').insert({
          logistics_record_id: nfRecord.id,
          action_type: 'nf_emitida',
          previous_status: previousStatus,
          new_status: 'nf_emitida',
          notes: `NF ${nfNumero.trim()} registrada${nfFile ? ' com PDF anexado' : ''}`,
          performed_by: user?.id,
          performed_by_name: profile?.full_name || '',
        });
      }

      toast.success('NF registrada com sucesso!');
      setNfRecord(null);
      setNfFile(null);
      fetchData();
    } catch (e: any) {
      toast.error('Erro ao registrar NF: ' + (e.message || ''));
    } finally {
      setNfUploading(false);
    }
  };

  // Download NF PDF
  const downloadNfPdf = async (record: LogisticsRecord) => {
    if (!record.nf_pdf_url) {
      toast.error('Nenhum PDF de NF anexado');
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from('nf-pdfs')
        .createSignedUrl(record.nf_pdf_url, 300);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e: any) {
      toast.error('Erro ao abrir PDF da NF: ' + (e.message || ''));
    }
  };

  // Save edit (updated to validate NF status)
  const saveEdit = async () => {
    if (!editRecord) return;

    // Validate: nf_emitida requires nf_numero and nf_pdf_url
    if (editStatus === 'nf_emitida' && !editNfNumero.trim()) {
      toast.error('Informe o número da NF e anexe o PDF para marcar como NF Emitida. Use o botão "Registrar NF" para isso.');
      return;
    }
    if (editStatus === 'nf_emitida' && !editRecord.nf_pdf_url) {
      toast.error('Anexe o PDF da NF antes de marcar como NF Emitida. Use o botão "Registrar NF".');
      return;
    }

    if (editStatus === 'entregue' && editRecord.is_incompleto) {
      toast.error('Pedido marcado como Incompleto (há itens pendentes). Conclua os itens antes de finalizar.');
      return;
    }

    try {
      const previousStatus = editRecord.logistics_status;
      const previousRastreio = editRecord.codigo_rastreio || '';
      const previousTrackingUrl = editRecord.tracking_url || '';
      const updates: any = {
        logistics_status: editStatus,
        nf_numero: editNfNumero || null,
        nf_data: editNfData || null,
        codigo_rastreio: editRastreio || null,
        tracking_url: editTrackingUrl || null,
        transportadora: editTransportadora || null,
        observacao_logistica: editObs || null,
        data_envio: editDataEnvio || null,
        updated_at: new Date().toISOString(),
      };

      if (editStatus === 'entrada_realizada' && !editRecord.entrada_by) {
        updates.entrada_by = user?.id;
        updates.entrada_at = new Date().toISOString();
      }
      if (editStatus === 'entregue' && !editRecord.data_entrega) {
        updates.data_entrega = new Date().toISOString().split('T')[0];
      }


      const { error } = await db.from('logistics_records').update(updates).eq('id', editRecord.id);
      if (error) throw error;

      if (previousStatus !== editStatus) {
        await db.from('logistics_action_history').insert({
          logistics_record_id: editRecord.id,
          action_type: 'status_change',
          previous_status: previousStatus,
          new_status: editStatus,
          notes: editObs || null,
          performed_by: user?.id,
          performed_by_name: profile?.full_name || '',
        });
      }

      // History entry for tracking changes
      const rastreioChanged = (editRastreio || '') !== previousRastreio;
      const trackingUrlChanged = (editTrackingUrl || '') !== previousTrackingUrl;
      if (rastreioChanged || trackingUrlChanged) {
        await db.from('logistics_action_history').insert({
          logistics_record_id: editRecord.id,
          action_type: 'tracking_update',
          previous_status: previousStatus,
          new_status: editStatus,
          notes: `Rastreio atualizado${editRastreio ? `: ${editRastreio}` : ''}${editTrackingUrl ? ` (link: ${editTrackingUrl})` : ''}`,
          performed_by: user?.id,
          performed_by_name: profile?.full_name || '',
        });
      }

      toast.success('Registro logístico atualizado');
      setEditRecord(null);
      fetchData();
    } catch (e: any) {
      toast.error('Erro ao atualizar: ' + (e.message || ''));
    }
  };

  // Quick status change (block nf_emitida without NF data)
  const quickStatusChange = async (record: LogisticsRecord, newStatus: string) => {
    if (newStatus === 'nf_emitida') {
      if (!record.nf_numero || !record.nf_pdf_url) {
        openNfRegistration(record);
        return;
      }
    }
    try {
      const updates: any = {
        logistics_status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'entrada_realizada' && !record.entrada_by) {
        updates.entrada_by = user?.id;
        updates.entrada_at = new Date().toISOString();
      }

      const { error } = await db.from('logistics_records').update(updates).eq('id', record.id);
      if (error) throw error;

      await db.from('logistics_action_history').insert({
        logistics_record_id: record.id,
        action_type: 'status_change',
        previous_status: record.logistics_status,
        new_status: newStatus,
        performed_by: user?.id,
        performed_by_name: profile?.full_name || '',
      });

      toast.success(`Status atualizado para ${logisticsStatusLabels[newStatus]?.label || newStatus}`);
      fetchData();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || ''));
    }
  };

  const downloadPdf = async (record: LogisticsRecord) => {
    try {
      const { data: quote } = await db.from('quotes').select('*').eq('id', record.quote_id).maybeSingle();
      const { data: items } = await db.from('quote_items').select('*').eq('quote_id', record.quote_id).order('item_number');
      let client = null;
      if (quote?.client_id) {
        const { data: c } = await db.from('clients').select('*').eq('id', quote.client_id).maybeSingle();
        client = c;
      }
      await generateQuotePdf(quote, items || [], client);
      toast.success('PDF gerado');
    } catch (e: any) {
      toast.error('Erro ao gerar PDF: ' + (e.message || ''));
    }
  };

  const viewHistory = async (recordId: string) => {
    setHistoryRecordId(recordId);
    const { data } = await db
      .from('logistics_action_history')
      .select('*')
      .eq('logistics_record_id', recordId)
      .order('created_at', { ascending: false });
    setHistory(data || []);
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const setTab = (t: string) => setSearchParams({ tab: t });

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = logisticsStatusLabels[status] || { label: status, color: 'bg-muted text-muted-foreground' };
    return <Badge variant="outline" className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</Badge>;
  };

  const getNextStatus = (current: string): string | null => {
    const flow = ['aguardando_entrada', 'entrada_realizada', 'emitindo_nf', 'nf_emitida', 'em_separacao', 'pronto_envio', 'enviado', 'em_transporte', 'entregue'];
    const idx = flow.indexOf(current);
    if (idx >= 0 && idx < flow.length - 1) return flow[idx + 1];
    return null;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Logística</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {canOperate ? 'Gestão operacional de pedidos' : 'Acompanhamento dos seus pedidos'}
              <span className="text-xs px-2 py-0.5 rounded bg-muted">{format(new Date(), 'dd/MM/yyyy')}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-[160px] h-9">
                <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o período</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === 'custom' && (
              <>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-[150px]" />
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-[150px]" />
              </>
            )}
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} /> Atualizar
            </Button>
          </div>
        </div>

        {/* ===== Filtro Master de Pré-vendas ===== */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Pré-vendas</span>
                <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant={tab === 'prevendas' ? 'default' : 'ghost'} className="h-8 text-xs" onClick={() => setTab('prevendas')}>Visão operacional</Button>
                <Button size="sm" variant={tab === 'dashboard' ? 'default' : 'ghost'} className="h-8 text-xs" onClick={() => setTab('dashboard')}>Dashboard</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar pedido, cliente, vendedor, NF ou rastreio..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Vendedor</Label>
                <Select value={sellerFilter} onValueChange={setSellerFilter}>
                  <SelectTrigger className="w-[190px] h-9"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os vendedores</SelectItem>
                    {sellers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[190px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {STAGE_GROUPS.map(g => (
                      <SelectItem key={g.key} value={`stage:${g.key}`}>{g.label}</SelectItem>
                    ))}
                    {allStatuses.map(s => (
                      <SelectItem key={s} value={s}>· {logisticsStatusLabels[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(search || sellerFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all') && (
                <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground"
                  onClick={() => { setSearch(''); setSellerFilter('all'); setStatusFilter('all'); setDateFilter('all'); setDateFrom(''); setDateTo(''); }}>
                  <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
                </Button>
              )}
            </div>
            {/* Atalhos por estágio */}
            <div className="flex flex-wrap gap-1.5">
              {STAGE_GROUPS.map(g => {
                const count = g.key === 'prevenda'
                  ? records.filter(r => isPresaleRecord(r)).length
                  : records.filter(r => !isPresaleRecord(r) && g.statuses.includes(r.logistics_status)).length;

                const active = statusFilter === `stage:${g.key}`;
                return (
                  <button key={g.key}
                    onClick={() => { setStatusFilter(active ? 'all' : `stage:${g.key}`); setTab('prevendas'); }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted text-muted-foreground'
                    )}>
                    {g.label} <span className="font-semibold">{count}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ===== Visão operacional (lista simplificada) ===== */}
        {tab === 'prevendas' && (
          <Card>
            <CardContent className="p-0 sm:p-2">
              <OperationalList
                records={filtered}
                loading={loading}
                isMobile={isMobile}
                canOperate={canOperate}
                fmt={fmt}
                onViewDetail={openDetail}
                onEdit={openEdit}
                onStart={startPresaleLogistics}
                onDownloadPdf={downloadPdf}
                startingQuoteIds={startingQuoteIds}
              />
            </CardContent>
          </Card>
        )}

        {/* Dashboard Tab */}
        {tab === 'dashboard' && (
          <>

            {/* Alertas Inteligentes */}
            <LogisticsSmartAlerts records={records} onSelectRecord={(r) => {
              const full = records.find(rec => rec.id === r.id);
              if (full) openEdit(full);
            }} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Aguardando Entrada" value={stats.aguardando} icon={Clock} onClick={() => { setStatusFilter('aguardando_entrada'); setTab('pedidos'); }} />
              <StatCard title="NF Emitida" value={records.filter(r => r.logistics_status === 'nf_emitida').length} icon={FileText} onClick={() => { setStatusFilter('nf_emitida'); setTab('pedidos'); }} />
              <StatCard title="Em Transporte" value={stats.transporte} icon={MapPin} onClick={() => { setStatusFilter('em_transporte'); setTab('pedidos'); }} />
              <StatCard title="Entregues Hoje" value={stats.entreguesHoje} icon={CheckCircle2} onClick={() => { setStatusFilter('entregue'); setDateFilter('today'); setTab('pedidos'); }} />
              <StatCard title="Entregues no Mês" value={stats.entreguesMes} icon={CheckCircle2} onClick={() => { setStatusFilter('entregue'); setDateFilter('month'); setTab('pedidos'); }} />
              <StatCard title="Pronto p/ Envio" value={stats.prontoEnvio} icon={PackageCheck} onClick={() => { setStatusFilter('pronto_envio'); setTab('pedidos'); }} />
              <StatCard title="Pendências Logísticas" value={stats.pendencias} icon={AlertTriangle} onClick={() => setTab('pedidos')} />
              <StatCard title="Problemas" value={stats.problemas} icon={TriangleAlert} onClick={() => setTab('problemas')} />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ações do Dia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.aguardando > 0 && (
                  <button onClick={() => { setStatusFilter('aguardando_entrada'); setTab('pedidos'); }}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors text-sm">
                    <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-yellow-600" /> {stats.aguardando} pedido(s) aguardando entrada</span>
                    <ArrowRight className="h-4 w-4 text-yellow-600" />
                  </button>
                )}
                {stats.emitindoNf > 0 && (
                  <button onClick={() => setTab('nf')}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors text-sm">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /> {stats.emitindoNf} pedido(s) com NF pendente</span>
                    <ArrowRight className="h-4 w-4 text-indigo-600" />
                  </button>
                )}
                {stats.semRastreio > 0 && (
                  <button onClick={() => setTab('rastreamento')}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors text-sm">
                    <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-600" /> {stats.semRastreio} enviado(s) sem rastreio</span>
                    <ArrowRight className="h-4 w-4 text-orange-600" />
                  </button>
                )}
                {stats.problemas > 0 && (
                  <button onClick={() => setTab('problemas')}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors text-sm">
                    <span className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-red-600" /> {stats.problemas} pedido(s) com problema</span>
                    <ArrowRight className="h-4 w-4 text-red-600" />
                  </button>
                )}
                {stats.aguardando === 0 && stats.emitindoNf === 0 && stats.semRastreio === 0 && stats.problemas === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma ação pendente 🎉</p>
                )}
              </CardContent>
            </Card>

            {/* Fila de Trabalho */}
            <LogisticsWorkQueue
              stats={stats}
              onNavigate={(filter, targetTab) => {
                if (filter) setStatusFilter(filter);
                setTab(targetTab);
              }}
            />

            {/* Eficiência Logística */}
            <LogisticsEfficiency records={records} />

            {/* Indicadores de Envio */}
            <LogisticsShippingIndicators records={records} />

            {/* Visão por Vendedor */}
            <LogisticsSellerView records={records} />

            {/* Pedidos em Andamento */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pedidos em Andamento</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordsList
                  records={records.filter(r => !['entregue', 'problema_logistico'].includes(r.logistics_status))}
                  canOperate={canOperate}
                  isMobile={isMobile}
                  onEdit={openEdit}
                  onDownloadPdf={downloadPdf}
                  onViewDetail={openDetail}
                  onViewHistory={viewHistory}
                  onQuickStatus={quickStatusChange}
                  onRegisterNf={openNfRegistration}
                  onDownloadNfPdf={downloadNfPdf}
                  getNextStatus={getNextStatus}
                  fmt={fmt}
                  StatusBadge={StatusBadge}
                />
              </CardContent>
            </Card>

          </>
        )}

        {/* Pedidos / NF / Envios / Rastreamento / Problemas tabs */}
        {tab !== 'dashboard' && tab !== 'prevendas' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base capitalize">
                {tab === 'pedidos' ? 'Todos os Pedidos' :
                 tab === 'nf' ? 'NF / Emissão' :
                 tab === 'envios' ? 'Envios' :
                 tab === 'rastreamento' ? 'Rastreamento' :
                 tab === 'problemas' ? 'Problemas Logísticos' : 'Pedidos'}
              </CardTitle>
            </CardHeader>
            <CardContent>


              <RecordsList
                records={filtered}
                canOperate={canOperate}
                isMobile={isMobile}
                onEdit={openEdit}
                onDownloadPdf={downloadPdf}
                onViewDetail={openDetail}
                onViewHistory={viewHistory}
                onQuickStatus={quickStatusChange}
                onRegisterNf={openNfRegistration}
                onDownloadNfPdf={downloadNfPdf}
                getNextStatus={getNextStatus}
                fmt={fmt}
                StatusBadge={StatusBadge}
              />
            </CardContent>
          </Card>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!detailRecord} onOpenChange={() => setDetailRecord(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                Detalhes do Pedido
                {detailRecord?.is_incompleto && <Badge variant="destructive" className="text-xs">Incompleto</Badge>}
              </DialogTitle>
            </DialogHeader>
            {detailRecord && (
              <div className="space-y-4 text-sm">
                {/* Progress stepper */}
                <ProgressStepper status={detailRecord.logistics_status} />

                {/* Rastrear Pedido CTA */}
                {detailRecord.tracking_url && (
                  <a href={detailRecord.tracking_url} target="_blank" rel="noreferrer" className="block">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                      <LinkIcon className="h-4 w-4 mr-2" /> 🔗 Rastrear Pedido
                      {detailRecord.transportadora && <span className="ml-2 text-xs opacity-90">({detailRecord.transportadora})</span>}
                    </Button>
                  </a>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Orçamento:</span> <strong>{detailRecord.quote_number}</strong></div>
                  <div><span className="text-muted-foreground">Cliente:</span> <strong>{detailRecord.client_name}</strong></div>
                  <div><span className="text-muted-foreground">Vendedor:</span> <strong>{detailRecord.salesperson}</strong></div>
                  <div><span className="text-muted-foreground">Valor:</span> <strong>{fmt(detailRecord.total_amount || 0)}</strong></div>
                  <div><span className="text-muted-foreground">Aprovado em:</span> <strong>{detailRecord.approved_at ? format(new Date(detailRecord.approved_at), 'dd/MM/yyyy') : '-'}</strong></div>
                  <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={detailRecord.logistics_status} /></div>
                </div>

                <Button size="sm" variant="outline" onClick={() => downloadPdf(detailRecord)}>
                  <Download className="h-4 w-4 mr-1.5" /> Baixar proposta PDF
                </Button>
                <hr />
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">NF:</span> <strong>{detailRecord.nf_numero || '-'}</strong></div>
                  <div><span className="text-muted-foreground">Data NF:</span> <strong>{detailRecord.nf_data ? format(new Date(detailRecord.nf_data), 'dd/MM/yyyy') : '-'}</strong></div>
                  <div><span className="text-muted-foreground">Rastreio:</span> <strong>{detailRecord.codigo_rastreio || '-'}</strong></div>
                  <div><span className="text-muted-foreground">Transportadora:</span> <strong>{detailRecord.transportadora || '-'}</strong></div>
                  <div><span className="text-muted-foreground">Data Envio:</span> <strong>{detailRecord.data_envio ? format(new Date(detailRecord.data_envio), 'dd/MM/yyyy') : '-'}</strong></div>
                  <div><span className="text-muted-foreground">Entrega:</span> <strong>{detailRecord.data_entrega ? format(new Date(detailRecord.data_entrega), 'dd/MM/yyyy') : '-'}</strong></div>
                </div>

                {/* Tracking URL */}
                {detailRecord.tracking_url && (
                  <div className="p-2 rounded border bg-muted/30 flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs truncate flex-1" title={detailRecord.tracking_url}>{detailRecord.tracking_url}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(detailRecord.tracking_url || ''); toast.success('Link copiado'); }} title="Copiar">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <a href={detailRecord.tracking_url} target="_blank" rel="noreferrer">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Abrir">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </div>
                )}

                {/* Public client portal link */}
                <div className="p-2 rounded border bg-primary/5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex-1">Link público para o cliente acompanhar o pedido</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyTrackingLink(detailRecord)}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar link
                  </Button>
                  {detailRecord.public_token && (
                    <a href={`/rastreio/pedido/${detailRecord.public_token}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" /> Abrir
                      </Button>
                    </a>
                  )}
                </div>

                {/* Timeline */}
                {detailTimeline.length > 0 && (
                  <div>
                    <strong className="text-sm flex items-center gap-1.5 mb-2"><History className="h-4 w-4" /> Linha do Tempo</strong>
                    <div className="relative pl-4 border-l-2 border-muted space-y-3">
                      {detailTimeline.map((h: any) => (
                        <div key={h.id} className="relative">
                          <div className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                          <div className="text-xs text-muted-foreground">{format(new Date(h.created_at), 'dd/MM/yyyy HH:mm')}</div>
                          <div className="text-sm flex items-center gap-2 flex-wrap mt-0.5">
                            {h.new_status && <StatusBadge status={h.new_status} />}
                            <span className="text-xs text-muted-foreground">por {h.performed_by_name || 'Sistema'}</span>
                          </div>
                          {h.notes && <div className="text-xs text-muted-foreground mt-0.5">{h.notes}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Itens do Pedido (faturamento parcial) */}
                {detailItems.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <strong className="text-sm">Itens do Pedido</strong>
                      {detailRecord.is_incompleto && <Badge variant="destructive" className="text-xs">Incompleto</Badge>}
                    </div>
                    <div className="space-y-2">
                      {detailItems.map(it => {
                        const st = detailItemStatus[it.id] || 'pendente';
                        return (
                          <div key={it.id} className="flex items-center gap-2 p-2 rounded border">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{it.product_code || `Item ${it.item_number || ''}`}</p>
                              <p className="text-xs text-muted-foreground truncate">{it.description || ''} {it.quantity ? `· Qtd: ${it.quantity}` : ''}</p>
                            </div>
                            {canOperate ? (
                              <Select value={st} onValueChange={(v) => setItemStatus(it.id, v)}>
                                <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="faturado">Faturado</SelectItem>
                                  <SelectItem value="enviado">Enviado</SelectItem>
                                  <SelectItem value="entregue">Entregue</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className="text-xs">{st}</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detailRecord.nf_pdf_url && (
                  <div className="pt-1">
                    <Button size="sm" variant="outline" onClick={() => downloadNfPdf(detailRecord)}>
                      <FileDown className="h-4 w-4 mr-1" /> Baixar PDF da NF
                    </Button>
                  </div>
                )}
                {detailRecord.observacao_logistica && (
                  <div><span className="text-muted-foreground">Obs:</span> <p className="mt-1">{detailRecord.observacao_logistica}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>


        {/* Edit Dialog */}
        <Dialog open={!!editRecord} onOpenChange={() => setEditRecord(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Atualizar Pedido - {editRecord?.quote_number}</DialogTitle></DialogHeader>
            {editRecord && (
              <div className="space-y-4">
                <div>
                  <Label>Status Logístico</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allStatuses.map(s => (
                        <SelectItem key={s} value={s}>{logisticsStatusLabels[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editStatus === 'nf_emitida' && !editRecord.nf_pdf_url && (
                    <p className="text-xs text-destructive mt-1">Use "Registrar NF" para anexar o PDF antes de marcar como NF Emitida.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nº NF</Label>
                    <Input value={editNfNumero} onChange={e => setEditNfNumero(e.target.value)} placeholder="Número da NF" />
                  </div>
                  <div>
                    <Label>Data NF</Label>
                    <Input type="date" value={editNfData} onChange={e => setEditNfData(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Código Rastreio</Label>
                    <Input value={editRastreio} onChange={e => setEditRastreio(e.target.value)} placeholder="Rastreio" />
                  </div>
                  <div>
                    <Label>Transportadora</Label>
                    <Input value={editTransportadora} onChange={e => setEditTransportadora(e.target.value)} placeholder="Transportadora" />
                  </div>
                </div>
                <div>
                  <Label>Link de Rastreamento (transportadora)</Label>
                  <div className="flex gap-2">
                    <Input value={editTrackingUrl} onChange={e => setEditTrackingUrl(e.target.value)} placeholder="https://..." />
                    {editTrackingUrl && (
                      <>
                        <Button type="button" size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(editTrackingUrl); toast.success('Link copiado'); }} title="Copiar">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <a href={editTrackingUrl} target="_blank" rel="noreferrer">
                          <Button type="button" size="icon" variant="outline" title="Abrir">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Data Envio</Label>
                  <Input type="date" value={editDataEnvio} onChange={e => setEditDataEnvio(e.target.value)} />
                </div>
                <div>
                  <Label>Observação Logística</Label>
                  <Textarea value={editObs} onChange={e => setEditObs(e.target.value)} placeholder="Observações..." />
                </div>
                <Button onClick={saveEdit} className="w-full">Salvar Alterações</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* NF Registration Dialog */}
        <Dialog open={!!nfRecord} onOpenChange={() => { setNfRecord(null); setNfFile(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar NF - {nfRecord?.quote_number}</DialogTitle></DialogHeader>
            {nfRecord && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <div className="grid grid-cols-2 gap-1">
                    <div><span className="text-muted-foreground">Cliente:</span> <strong>{nfRecord.client_name}</strong></div>
                    <div><span className="text-muted-foreground">Valor:</span> <strong>{fmt(nfRecord.total_amount || 0)}</strong></div>
                  </div>
                </div>

                <div>
                  <Label>Número da NF <span className="text-destructive">*</span></Label>
                  <Input
                    value={nfNumero}
                    onChange={e => setNfNumero(e.target.value)}
                    placeholder="Ex: 001234"
                    maxLength={50}
                  />
                </div>

                <div>
                  <Label>PDF da Nota Fiscal <span className="text-destructive">*</span></Label>
                  <div className="mt-1">
                    {nfRecord.nf_pdf_url && !nfFile && (
                      <div className="flex items-center gap-2 p-2 rounded border bg-muted/30 mb-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm flex-1">PDF já anexado</span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => downloadNfPdf(nfRecord)}>
                          <FileDown className="h-3 w-3 mr-1" /> Ver
                        </Button>
                      </div>
                    )}
                    {nfFile && (
                      <div className="flex items-center gap-2 p-2 rounded border bg-green-50 mb-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <span className="text-sm flex-1 truncate">{nfFile.name}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setNfFile(null); if (nfFileRef.current) nfFileRef.current.value = ''; }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <input
                      ref={nfFileRef}
                      type="file"
                      accept="application/pdf"
                      onChange={handleNfFileChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => nfFileRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {nfFile ? 'Trocar arquivo' : nfRecord.nf_pdf_url ? 'Substituir PDF' : 'Selecionar PDF da NF'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">Apenas PDF, máximo 10MB</p>
                  </div>
                </div>

                <div>
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={nfData} onChange={e => setNfData(e.target.value)} />
                </div>

                <div>
                  <Label>Observação</Label>
                  <Textarea value={nfObs} onChange={e => setNfObs(e.target.value)} placeholder="Observação opcional..." maxLength={500} />
                </div>

                <Button onClick={saveNfRegistration} className="w-full" disabled={nfUploading}>
                  {nfUploading ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> Registrar NF e Marcar como Emitida</>
                  )}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={!!historyRecordId} onOpenChange={() => setHistoryRecordId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Histórico de Ações</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {history.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico</p>}
              {history.map((h: any) => (
                <div key={h.id} className="p-3 rounded-lg border text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{h.performed_by_name || 'Sistema'}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(h.created_at), 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={h.previous_status || ''} />
                    <ArrowRight className="h-3 w-3" />
                    <StatusBadge status={h.new_status || ''} />
                  </div>
                  {h.notes && <p className="mt-1 text-muted-foreground">{h.notes}</p>}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}


// Records list component
function RecordsList({
  records, canOperate, isMobile, onEdit, onDownloadPdf, onViewDetail, onViewHistory, onQuickStatus, onRegisterNf, onDownloadNfPdf, getNextStatus, fmt, StatusBadge,
}: {
  records: LogisticsRecord[];
  canOperate: boolean;
  isMobile: boolean;
  onEdit: (r: LogisticsRecord) => void;
  onDownloadPdf: (r: LogisticsRecord) => void;
  onViewDetail: (r: LogisticsRecord) => void;
  onViewHistory: (id: string) => void;
  onQuickStatus: (r: LogisticsRecord, status: string) => void;
  onRegisterNf: (r: LogisticsRecord) => void;
  onDownloadNfPdf: (r: LogisticsRecord) => void;
  getNextStatus: (status: string) => string | null;
  fmt: (v: number) => string;
  StatusBadge: React.FC<{ status: string }>;
}) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro encontrado</p>;
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {records.map(r => {
          const next = getNextStatus(r.logistics_status);
          const showNfAction = canOperate && !r.nf_numero && !['nf_emitida', 'pronto_envio', 'enviado', 'em_transporte', 'entregue'].includes(r.logistics_status);
          return (
            <Card key={r.id} className={cn('p-3', getPriorityClass(r))}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-sm">{r.quote_number}</p>
                  <p className="text-xs text-muted-foreground">{r.client_name}</p>
                </div>
                <StatusBadge status={r.logistics_status} />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Vendedor: {r.salesperson}</p>
                <p>Valor: {fmt(r.total_amount || 0)}</p>
                {r.nf_numero && <p>NF: {r.nf_numero}</p>}
                {r.codigo_rastreio && <p>Rastreio: {r.codigo_rastreio}</p>}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onViewDetail(r)}>
                  <Eye className="h-3 w-3 mr-1" /> Ver
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onDownloadPdf(r)}>
                  <Download className="h-3 w-3 mr-1" /> PDF
                </Button>
                {r.nf_pdf_url && (
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onDownloadNfPdf(r)}>
                    <FileDown className="h-3 w-3 mr-1" /> NF
                  </Button>
                )}
                {showNfAction && (
                  <Button size="sm" variant="default" className="text-xs h-7 bg-purple-600 hover:bg-purple-700" onClick={() => onRegisterNf(r)}>
                    <FileText className="h-3 w-3 mr-1" /> Emitir NF
                  </Button>
                )}
                {canOperate && (
                  <>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onEdit(r)}>
                      <ClipboardList className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    {next && next !== 'nf_emitida' && (
                      <Button size="sm" variant="default" className="text-xs h-7" onClick={() => onQuickStatus(r, next)}>
                        <ArrowRight className="h-3 w-3 mr-1" /> {logisticsStatusLabels[next]?.label}
                      </Button>
                    )}
                    {next === 'nf_emitida' && (
                      <Button size="sm" variant="default" className="text-xs h-7 bg-purple-600 hover:bg-purple-700" onClick={() => onQuickStatus(r, next)}>
                        <ArrowRight className="h-3 w-3 mr-1" /> {logisticsStatusLabels[next]?.label}
                      </Button>
                    )}
                  </>
                )}
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => onViewHistory(r.id)}>
                  <History className="h-3 w-3 mr-1" /> Histórico
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Orçamento</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>NF</TableHead>
            <TableHead>Rastreio</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map(r => {
            const next = getNextStatus(r.logistics_status);
            const showNfAction = canOperate && !r.nf_numero && !['nf_emitida', 'pronto_envio', 'enviado', 'em_transporte', 'entregue'].includes(r.logistics_status);
            return (
              <TableRow key={r.id} className={cn(getPriorityClass(r))}>
                <TableCell className="font-medium">{r.quote_number}</TableCell>
                <TableCell>{r.client_name}</TableCell>
                <TableCell>{r.salesperson}</TableCell>
                <TableCell>{fmt(r.total_amount || 0)}</TableCell>
                <TableCell><StatusBadge status={r.logistics_status} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span>{r.nf_numero || '-'}</span>
                    {r.nf_pdf_url && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDownloadNfPdf(r)} title="Baixar PDF da NF">
                        <FileDown className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>{r.codigo_rastreio || '-'}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onViewDetail(r)} title="Ver detalhes">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDownloadPdf(r)} title="Baixar PDF orçamento">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {showNfAction && (
                      <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => onRegisterNf(r)} title="Emitir NF">
                        <FileText className="h-3.5 w-3.5 mr-1" /> Emitir NF
                      </Button>
                    )}
                    {canOperate && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(r)} title="Editar">
                        <ClipboardList className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canOperate && next && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onQuickStatus(r, next)} title="Avançar status">
                        <ArrowRight className="h-3.5 w-3.5 mr-1" /> {logisticsStatusLabels[next]?.label}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onViewHistory(r.id)} title="Histórico">
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ProgressStepper({ status }: { status: string }) {
  const currentIdx = getCurrentStepIndex(status);
  const pct = STATUS_PROGRESS[status] ?? 0;
  const isProblem = status === 'problema_logistico';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Progresso do Pedido</span>
        <span className="font-semibold">{pct}% · {FLOW_STEPS[currentIdx]?.label || status}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full transition-all', isProblem ? 'bg-red-500' : pct === 100 ? 'bg-green-500' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-1">
        {FLOW_STEPS.map((step, i) => {
          const done = i < currentIdx || (i === currentIdx && pct === 100);
          const active = i === currentIdx;
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 shrink-0',
                done && 'bg-green-500 border-green-500 text-white',
                active && !done && 'bg-primary border-primary text-primary-foreground ring-2 ring-primary/30',
                !active && !done && 'bg-background border-muted-foreground/30 text-muted-foreground',
              )}>
                {done ? '✓' : i + 1}
              </div>
              <span className={cn('text-[9px] text-center leading-tight truncate w-full', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Visão operacional simplificada (lista/tabela) =====
function StageBadge({ status, presale }: { status: string; presale?: boolean }) {
  const g = getStage(status, presale);
  return <Badge variant="outline" className={cn('text-xs font-medium', g.color)}>{g.label}</Badge>;
}


function OperationalList({
  records, loading, isMobile, canOperate, fmt, onViewDetail, onEdit, onStart, onDownloadPdf, startingQuoteIds,
}: {
  records: LogisticsRecord[];
  loading: boolean;
  isMobile: boolean;
  canOperate: boolean;
  fmt: (v: number) => string;
  onViewDetail: (r: LogisticsRecord) => void;
  onEdit: (r: LogisticsRecord) => void;
  onStart: (r: LogisticsRecord) => void;
  onDownloadPdf: (r: LogisticsRecord) => void;
  startingQuoteIds: Set<string>;
}) {
  if (loading) return <p className="text-sm text-muted-foreground text-center py-10">Carregando pré-vendas...</p>;
  if (records.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">Nenhuma pré-venda encontrada com os filtros atuais</p>;

  const pay = (r: LogisticsRecord) => (r.payment_method ? (paymentMethodLabels[r.payment_method] || r.payment_method) : '-');

  if (isMobile) {
    return (
      <div className="space-y-2 p-2">
        {records.map(r => (
          <div key={r.id} className="w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <button onClick={() => onViewDetail(r)} className="w-full text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{r.quote_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.client_name}</p>
                </div>
                <StageBadge status={r.logistics_status} presale={r.is_presale} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>Vendedor: {r.salesperson || '-'}</span>
                <span>Valor: {fmt(r.total_amount || 0)}</span>
                <span>Pgto: {pay(r)}</span>
                <span>NF: {r.nf_numero || '-'}</span>
                <span>Transp.: {r.transportadora || '-'}</span>
                <span>Rastreio: {r.codigo_rastreio || '-'}</span>
                <span>Data: {format(new Date(r.created_at), 'dd/MM/yyyy')}</span>
              </div>
            </button>
            <div className="mt-3 border-t pt-2">
              <p className="mb-1 text-xs font-medium text-foreground">Produtos da pré-venda</p>
              {(r.presale_items || []).length > 0 ? (
                <div className="space-y-1">
                  {(r.presale_items || []).map(item => (
                    <div key={item.id} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0 font-semibold text-foreground">{item.quantity || 0}×</span>
                      <span>{item.product_code || item.code ? `${item.product_code || item.code} — ` : ''}{quoteItemLabel(item)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">Nenhum item cadastrado na ORC.</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onDownloadPdf(r)}>
                <Download className="h-4 w-4" /> Baixar proposta
              </Button>
              {canOperate && r.is_virtual && (
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={startingQuoteIds.has(r.quote_id)}
                  onClick={() => onStart(r)}
                >
                  <PackageCheck className="h-4 w-4" />
                  {startingQuoteIds.has(r.quote_id) ? 'Baixando...' : 'Baixar pedido'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="min-w-[280px]">Produtos da pré-venda</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>NF</TableHead>
            <TableHead>Transportadora</TableHead>
            <TableHead>Rastreio</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map(r => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => onViewDetail(r)}>
              <TableCell className="font-medium whitespace-nowrap">{r.quote_number}</TableCell>
              <TableCell className="max-w-[200px] truncate">{r.client_name}</TableCell>
              <TableCell className="min-w-[280px] max-w-[360px]">
                {(r.presale_items || []).length > 0 ? (
                  <div className="space-y-1">
                    {(r.presale_items || []).map(item => (
                      <div key={item.id} className="text-xs leading-4">
                        <span className="font-semibold">{item.quantity || 0}×</span>{' '}
                        <span className="text-muted-foreground">{item.product_code || item.code ? `${item.product_code || item.code} — ` : ''}{quoteItemLabel(item)}</span>
                      </div>
                    ))}
                  </div>
                ) : <span className="text-xs text-muted-foreground">Nenhum item cadastrado</span>}
              </TableCell>
              <TableCell className="max-w-[140px] truncate">{r.salesperson || '-'}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{fmt(r.total_amount || 0)}</TableCell>
              <TableCell><StageBadge status={r.logistics_status} presale={r.is_presale} /></TableCell>
              <TableCell className="text-xs">{pay(r)}</TableCell>
              <TableCell className="text-xs">{r.nf_numero || '-'}</TableCell>
              <TableCell className="text-xs max-w-[130px] truncate">{r.transportadora || '-'}</TableCell>
              <TableCell className="text-xs max-w-[130px] truncate">{r.codigo_rastreio || '-'}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), 'dd/MM/yyyy')}</TableCell>
              <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver detalhes" onClick={() => onViewDetail(r)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Baixar proposta PDF" onClick={() => onDownloadPdf(r)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canOperate && !r.is_virtual && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => onEdit(r)}>
                      <ClipboardList className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canOperate && r.is_virtual && (
                    <Button
                      size="sm"
                      className="h-8 whitespace-nowrap"
                      disabled={startingQuoteIds.has(r.quote_id)}
                      onClick={() => onStart(r)}
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      {startingQuoteIds.has(r.quote_id) ? 'Baixando...' : 'Baixar pedido'}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
