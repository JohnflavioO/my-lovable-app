import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCrmTool } from '@/hooks/useCrmTool';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  BarChart3, Trophy, Users as UsersIcon, TrendingUp, TrendingDown, AlertTriangle,
  DollarSign, ShoppingCart, Calendar, Download, FileSpreadsheet, FileText, Sparkles, Activity,
  Brain, SlidersHorizontal, ChevronDown, Lightbulb, Target, Wallet, Package, Crown, Repeat
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend, Area, AreaChart
} from 'recharts';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/lib/utils';

// ---------- Helpers ----------
const VALID_STATUSES = new Set(
  ['approved', 'aprovado'].map(s => s.toLowerCase())
);
const EXCLUDED_STATUSES = new Set(
  ['rejected', 'rejeitado', 'cancelled', 'cancelado', 'teste', 'arquivado', 'archived', 'draft', 'pending', 'pendente'].map(s => s.toLowerCase())
);

const fmtBRL = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtBRLfull = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompact = (v: number) => {
  if (!v) return 'R$ 0';
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace('.', ',')}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`;
  return fmtBRL(v);
};
const daysBetween = (d: Date, ref = new Date()) =>
  Math.floor((ref.getTime() - d.getTime()) / 86400000);

interface QuoteRow {
  id: string;
  quote_number: string;
  client_id: string | null;
  client_name: string | null;
  salesperson: string | null;
  salesperson_id: string | null;
  created_by: string | null;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
  total: number | null;
  approved_at: string | null;
  created_at: string;
  is_demonstration: boolean | null;
}
interface ClientRow {
  id: string;
  name: string | null;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  contact_phone: string | null;
  city: string | null;
  state: string | null;
  cpf_cnpj: string | null;
  created_by: string | null;
}
interface ItemRow {
  quote_id: string;
  code: string | null;
  product_code: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  line_total: number | null;
  unit_total: number | null;
}
interface ProductRow {
  id: string;
  name: string | null;
  brand: string | null;
  code: string | null;
  sku: string | null;
}

type IntelligenceTab = 'dashboard' | 'ranking' | 'top' | 'products' | 'evolution' | 'alerts' | 'diag';
type IntelligenceViewState = {
  period: '30' | '90' | '180' | '365' | 'all';
  sellerFilter: string;
  cityFilter: string;
  stateFilter: string;
  brandFilter: string;
  activeFilter: 'all' | 'active' | 'inactive';
  search: string;
  activeTab: IntelligenceTab;
};
type CommercialData = {
  quotes: QuoteRow[];
  clients: Record<string, ClientRow>;
  items: ItemRow[];
  products: ProductRow[];
  sellerProfiles: { user_id: string; full_name: string }[];
  loadedAt: number;
};

const INTELLIGENCE_VIEW_STATE_KEY = 'mci:inteligencia-comercial:view-state:v1';
const INTELLIGENCE_DATA_CACHE_PREFIX = 'mci:inteligencia-comercial:data-cache:v1:';
const INTELLIGENCE_STALE_TIME = 5 * 60 * 1000;
const INTELLIGENCE_GC_TIME = 30 * 60 * 1000;
const defaultViewState: IntelligenceViewState = {
  period: 'all',
  sellerFilter: 'all',
  cityFilter: 'all',
  stateFilter: 'all',
  brandFilter: 'all',
  activeFilter: 'all',
  search: '',
  activeTab: 'dashboard',
};
const emptyCommercialData: CommercialData = {
  quotes: [],
  clients: {},
  items: [],
  products: [],
  sellerProfiles: [],
  loadedAt: 0,
};

const isValidTab = (value: unknown): value is IntelligenceTab =>
  ['dashboard', 'ranking', 'top', 'products', 'evolution', 'alerts', 'diag'].includes(String(value));

const readSavedViewState = (): IntelligenceViewState => {
  if (typeof window === 'undefined') return defaultViewState;
  try {
    const raw = window.sessionStorage.getItem(INTELLIGENCE_VIEW_STATE_KEY);
    if (!raw) return defaultViewState;
    const parsed = JSON.parse(raw) as Partial<IntelligenceViewState>;
    return {
      period: ['30', '90', '180', '365', 'all'].includes(String(parsed.period)) ? parsed.period as IntelligenceViewState['period'] : defaultViewState.period,
      sellerFilter: typeof parsed.sellerFilter === 'string' ? parsed.sellerFilter : defaultViewState.sellerFilter,
      cityFilter: typeof parsed.cityFilter === 'string' ? parsed.cityFilter : defaultViewState.cityFilter,
      stateFilter: typeof parsed.stateFilter === 'string' ? parsed.stateFilter : defaultViewState.stateFilter,
      brandFilter: typeof parsed.brandFilter === 'string' ? parsed.brandFilter : defaultViewState.brandFilter,
      activeFilter: ['all', 'active', 'inactive'].includes(String(parsed.activeFilter)) ? parsed.activeFilter as IntelligenceViewState['activeFilter'] : defaultViewState.activeFilter,
      search: typeof parsed.search === 'string' ? parsed.search : defaultViewState.search,
      activeTab: isValidTab(parsed.activeTab) ? parsed.activeTab : defaultViewState.activeTab,
    };
  } catch {
    return defaultViewState;
  }
};

const readCachedCommercialData = (cacheKey: string | undefined): CommercialData | undefined => {
  if (!cacheKey || typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(`${INTELLIGENCE_DATA_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CommercialData;
    return parsed?.loadedAt ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const writeCachedCommercialData = (cacheKey: string | undefined, data: CommercialData | undefined) => {
  if (!cacheKey || !data?.loadedAt || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${INTELLIGENCE_DATA_CACHE_PREFIX}${cacheKey}`, JSON.stringify(data));
  } catch {
    // Se o cache local ficar grande demais, o cache em memória do React Query continua ativo.
  }
};

const loadCommercialData = async (userId: string | undefined, canSeeAll: boolean): Promise<CommercialData> => {
  if (!userId) return emptyCommercialData;
  const { data, error } = await supabase.functions.invoke('crm-tools', {
    body: { tool: 'get_commercial_overview', args: { scope: canSeeAll ? 'team' : 'own' } },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Falha ao carregar overview comercial');
  const payload = (data.data ?? {}) as Partial<CommercialData>;
  const quotes = ((payload.quotes ?? []) as QuoteRow[]).filter(isCountable);
  return {
    quotes,
    clients: (payload.clients ?? {}) as Record<string, ClientRow>,
    items: (payload.items ?? []) as ItemRow[],
    products: (payload.products ?? []) as ProductRow[],
    sellerProfiles: (payload.sellerProfiles ?? []) as { user_id: string; full_name: string }[],
    loadedAt: payload.loadedAt || Date.now(),
  };
};

const itemValue = (it: ItemRow): number => {
  const tp = Number(it.total_price || 0);
  if (tp > 0) return tp;
  const lt = Number(it.line_total || 0);
  if (lt > 0) return lt;
  const ut = Number(it.unit_total || 0);
  if (ut > 0) return ut;
  const up = Number(it.unit_price || 0);
  const qty = Number(it.quantity || 0) || 1;
  return up * qty;
};

const formatCnpj = (v?: string | null) => {
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v;
};
const clientLocation = (c?: ClientRow | null) => {
  if (!c) return 'Cidade/UF não informado';
  const cu = [c.city, c.state].filter(Boolean).join('/');
  return cu || 'Cidade/UF não informado';
};
const clientCnpjLabel = (c?: ClientRow | null) => c?.cpf_cnpj ? `CNPJ ${formatCnpj(c.cpf_cnpj)}` : 'CNPJ não informado';

interface Aggregated {
  clientId: string;
  client: ClientRow | null;
  clientName: string;
  city: string;
  state: string;
  cnpj: string;
  salesperson: string;
  quotesCount: number;
  totalValue: number;
  receivedValue: number;
  ticketMedio: number;
  firstPurchase: Date | null;
  lastPurchase: Date | null;
  daysSinceLast: number | null;
  intervalAvgDays: number | null;
  monthly: Record<string, number>;
  brands: Record<string, number>;
  products: Record<string, { qty: number; value: number; desc: string; brand: string }>;
  quoteIds: string[];
  isActive: boolean;
  isRecurrent: boolean;
  status: 'verde' | 'amarelo' | 'vermelho';
}

function getValue(q: QuoteRow): number {
  return Number(q.total_amount ?? q.total ?? 0);
}
function isCountable(q: QuoteRow): boolean {
  if (q.is_demonstration) return false;
  const s = (q.status || '').toLowerCase().trim();
  if (EXCLUDED_STATUSES.has(s)) return false;
  return VALID_STATUSES.has(s);
}
function isReceived(q: QuoteRow): boolean {
  return (q.payment_status || '').toLowerCase() === 'liquidado';
}

export default function InteligenciaComercial() {
  const { user, isAdmin, isGestor } = useAuth();
  const canSeeAll = isAdmin || isGestor;

  const savedViewState = useMemo(readSavedViewState, []);
  const [activeTab, setActiveTab] = useState<IntelligenceTab>(savedViewState.activeTab);
  const [drill, setDrill] = useState<{ title: string; subtitle?: string; quotes: QuoteRow[] } | null>(null);

  // Filters
  const [period, setPeriod] = useState<'30' | '90' | '180' | '365' | 'all'>(savedViewState.period);
  const [sellerFilter, setSellerFilter] = useState<string>(savedViewState.sellerFilter);
  const [cityFilter, setCityFilter] = useState<string>(savedViewState.cityFilter);
  const [stateFilter, setStateFilter] = useState<string>(savedViewState.stateFilter);
  const [brandFilter, setBrandFilter] = useState<string>(savedViewState.brandFilter);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>(savedViewState.activeFilter);
  const [search, setSearch] = useState(savedViewState.search);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const dataScopeKey = canSeeAll ? 'all-company' : 'own-quotes';
  const dataCacheKey = user?.id ? `${user.id}:${dataScopeKey}` : undefined;
  const commercialQuery = useQuery({
    queryKey: ['inteligencia-comercial', user?.id || 'anonymous', dataScopeKey],
    queryFn: () => loadCommercialData(user?.id, canSeeAll),
    enabled: !!user?.id,
    staleTime: INTELLIGENCE_STALE_TIME,
    gcTime: INTELLIGENCE_GC_TIME,
    refetchOnWindowFocus: false,
    initialData: () => readCachedCommercialData(dataCacheKey),
    initialDataUpdatedAt: () => readCachedCommercialData(dataCacheKey)?.loadedAt,
    placeholderData: previousData => previousData,
  });

  const data = commercialQuery.data || emptyCommercialData;
  const quotes = data.quotes;
  const clients = data.clients;
  const items = data.items;
  const products = data.products;
  const sellerProfiles = data.sellerProfiles;
  const isInitialLoading = commercialQuery.isLoading && !commercialQuery.data;
  const isBackgroundUpdating = commercialQuery.isFetching && !!commercialQuery.data;

  useEffect(() => {
    if (!commercialQuery.error) return;
    const message = commercialQuery.error instanceof Error ? commercialQuery.error.message : String(commercialQuery.error);
    console.error(commercialQuery.error);
    toast.error('Erro ao carregar dados: ' + message);
  }, [commercialQuery.error]);

  useEffect(() => {
    writeCachedCommercialData(dataCacheKey, commercialQuery.data);
  }, [dataCacheKey, commercialQuery.data]);

  useEffect(() => {
    if (!canSeeAll && sellerFilter !== 'all') setSellerFilter('all');
  }, [canSeeAll, sellerFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const viewState: IntelligenceViewState = {
      period,
      sellerFilter,
      cityFilter,
      stateFilter,
      brandFilter,
      activeFilter,
      search,
      activeTab,
    };
    window.sessionStorage.setItem(INTELLIGENCE_VIEW_STATE_KEY, JSON.stringify(viewState));
  }, [period, sellerFilter, cityFilter, stateFilter, brandFilter, activeFilter, search, activeTab]);

  // ---------- Period windows ----------
  const periodDays = period === 'all' ? Infinity : parseInt(period, 10);

  const filteredQuotes = useMemo(() => {
    const now = Date.now();
    return quotes.filter(q => {
      const d = new Date(q.approved_at || q.created_at).getTime();
      if (periodDays !== Infinity && now - d > periodDays * 86400000) return false;
      if (canSeeAll && sellerFilter !== 'all' && q.created_by !== sellerFilter) return false;
      const c = q.client_id ? clients[q.client_id] : null;
      if (cityFilter !== 'all' && (c?.city || '') !== cityFilter) return false;
      if (stateFilter !== 'all' && (c?.state || '') !== stateFilter) return false;
      return true;
    });
  }, [quotes, clients, periodDays, canSeeAll, sellerFilter, cityFilter, stateFilter]);

  // Previous period for growth comparison
  const previousQuotes = useMemo(() => {
    if (periodDays === Infinity) return [] as QuoteRow[];
    const now = Date.now();
    const startCurr = now - periodDays * 86400000;
    const startPrev = startCurr - periodDays * 86400000;
    return quotes.filter(q => {
      const d = new Date(q.approved_at || q.created_at).getTime();
      if (d < startPrev || d >= startCurr) return false;
      if (canSeeAll && sellerFilter !== 'all' && q.created_by !== sellerFilter) return false;
      const c = q.client_id ? clients[q.client_id] : null;
      if (cityFilter !== 'all' && (c?.city || '') !== cityFilter) return false;
      if (stateFilter !== 'all' && (c?.state || '') !== stateFilter) return false;
      return true;
    });
  }, [quotes, clients, periodDays, canSeeAll, sellerFilter, cityFilter, stateFilter]);

  const itemsByQuote = useMemo(() => {
    const m = new Map<string, ItemRow[]>();
    items.forEach(it => {
      if (!m.has(it.quote_id)) m.set(it.quote_id, []);
      m.get(it.quote_id)!.push(it);
    });
    return m;
  }, [items]);

  // Product lookup by code or sku (normalized)
  const productByCode = useMemo(() => {
    const m = new Map<string, ProductRow>();
    products.forEach(p => {
      if (p.code) m.set(String(p.code).trim().toLowerCase(), p);
      if (p.sku) m.set(String(p.sku).trim().toLowerCase(), p);
    });
    return m;
  }, [products]);

  const resolveItem = (it: ItemRow): { key: string; name: string; brand: string; code: string } => {
    const rawCode = (it.product_code || it.code || '').trim();
    const k = rawCode.toLowerCase();
    const prod = k ? productByCode.get(k) : undefined;
    const desc = (it.description || '').trim();
    const name = prod?.name?.trim() || desc || rawCode || 'Item sem nome';
    const brand = (prod?.brand?.trim() || it.brand || 'Sem marca');
    const code = rawCode || prod?.code || prod?.sku || '';
    const key = (rawCode || desc || name).toLowerCase();
    return { key, name, brand, code };
  };

  const aggregated: Aggregated[] = useMemo(() => {
    const map = new Map<string, Aggregated>();
    filteredQuotes.forEach(q => {
      const cid = q.client_id || `__${q.client_name || 'sem'}`;
      const c = q.client_id ? clients[q.client_id] || null : null;
      if (!map.has(cid)) {
        map.set(cid, {
          clientId: cid,
          client: c,
          clientName: c?.company_name || c?.name || q.client_name || 'Sem cliente',
          city: c?.city || '',
          state: c?.state || '',
          cnpj: c?.cpf_cnpj || '',
          salesperson: q.salesperson || '',
          quotesCount: 0,
          totalValue: 0,
          receivedValue: 0,
          ticketMedio: 0,
          firstPurchase: null,
          lastPurchase: null,
          daysSinceLast: null,
          intervalAvgDays: null,
          monthly: {},
          brands: {},
          products: {},
          quoteIds: [],
          isActive: false,
          isRecurrent: false,
          status: 'vermelho',
        });
      }
      const a = map.get(cid)!;
      const val = getValue(q);
      const d = new Date(q.approved_at || q.created_at);
      a.quotesCount += 1;
      a.totalValue += val;
      a.quoteIds.push(q.id);
      if (isReceived(q)) a.receivedValue += val;
      if (!a.firstPurchase || d < a.firstPurchase) a.firstPurchase = d;
      if (!a.lastPurchase || d > a.lastPurchase) a.lastPurchase = d;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      a.monthly[key] = (a.monthly[key] || 0) + val;
      (itemsByQuote.get(q.id) || []).forEach(it => {
        const r = resolveItem(it);
        const v = itemValue(it);
        a.brands[r.brand] = (a.brands[r.brand] || 0) + v;
        if (!a.products[r.key]) a.products[r.key] = { qty: 0, value: 0, desc: r.name, brand: r.brand };
        a.products[r.key].qty += Number(it.quantity || 0);
        a.products[r.key].value += v;
      });
    });
    const arr = Array.from(map.values()).map(a => {
      a.ticketMedio = a.quotesCount ? a.totalValue / a.quotesCount : 0;
      if (a.lastPurchase) a.daysSinceLast = daysBetween(a.lastPurchase);
      if (a.firstPurchase && a.lastPurchase && a.quotesCount > 1) {
        a.intervalAvgDays = Math.round(daysBetween(a.firstPurchase, a.lastPurchase) / (a.quotesCount - 1));
      }
      a.isActive = (a.daysSinceLast ?? 9999) <= 90;
      a.isRecurrent = a.quotesCount >= 2;
      const d = a.daysSinceLast ?? 9999;
      a.status = d <= 30 ? 'verde' : d <= 90 ? 'amarelo' : 'vermelho';
      return a;
    });
    return arr.sort((a, b) => b.totalValue - a.totalValue);
  }, [filteredQuotes, clients, itemsByQuote, productByCode]);

  const filteredAggregated = useMemo(() => {
    return aggregated.filter(a => {
      if (activeFilter === 'active' && !a.isActive) return false;
      if (activeFilter === 'inactive' && a.isActive) return false;
      if (brandFilter !== 'all' && !a.brands[brandFilter]) return false;
      if (search && !a.clientName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [aggregated, activeFilter, brandFilter, search]);

  // ---------- Dashboard KPIs ----------
  const kpis = useMemo(() => {
    const totalRevenue = filteredQuotes.reduce((s, q) => s + getValue(q), 0);
    const totalReceived = filteredQuotes.filter(isReceived).reduce((s, q) => s + getValue(q), 0);
    const totalClients = aggregated.length;
    const activeClients = aggregated.filter(a => a.isActive).length;
    const inactiveClients = totalClients - activeClients;
    const recurrent = aggregated.filter(a => a.isRecurrent).length;
    const avgPerClient = totalClients ? filteredQuotes.length / totalClients : 0;
    const avgQuote = filteredQuotes.length ? totalRevenue / filteredQuotes.length : 0;
    const ticketMedio = totalClients ? totalRevenue / totalClients : 0;
    return {
      totalRevenue, totalReceived, totalClients, activeClients, inactiveClients,
      recurrent, avgPerClient, avgQuote, ticketMedio,
    };
  }, [filteredQuotes, aggregated]);

  const prevKpis = useMemo(() => {
    const totalRevenue = previousQuotes.reduce((s, q) => s + getValue(q), 0);
    const totalReceived = previousQuotes.filter(isReceived).reduce((s, q) => s + getValue(q), 0);
    const cids = new Set(previousQuotes.map(q => q.client_id || `__${q.client_name}`));
    const totalClients = cids.size;
    const avgQuote = previousQuotes.length ? totalRevenue / previousQuotes.length : 0;
    const ticketMedio = totalClients ? totalRevenue / totalClients : 0;
    return { totalRevenue, totalReceived, totalClients, avgQuote, ticketMedio };
  }, [previousQuotes]);

  const growth = (curr: number, prev: number): number | null => {
    if (periodDays === Infinity) return null;
    if (!prev) return curr > 0 ? 100 : null;
    return ((curr - prev) / prev) * 100;
  };

  // ---------- Top products ----------
  const topProducts = useMemo(() => {
    const map = new Map<string, { desc: string; brand: string; code: string; qty: number; value: number; clients: Set<string>; lastDate: Date | null; lastQuoteId: string | null; lastQuoteNumber: string | null }>();
    filteredQuotes.forEach(q => {
      const qd = new Date(q.approved_at || q.created_at);
      (itemsByQuote.get(q.id) || []).forEach(it => {
        const r = resolveItem(it);
        const k = r.key || 'item';
        if (!map.has(k)) map.set(k, {
          desc: r.name,
          brand: r.brand,
          code: r.code,
          qty: 0, value: 0,
          clients: new Set(),
          lastDate: null, lastQuoteId: null, lastQuoteNumber: null,
        });
        const e = map.get(k)!;
        if (r.brand && r.brand !== 'Sem marca' && (!e.brand || e.brand === 'Sem marca')) e.brand = r.brand;
        if (r.name && (!e.desc || e.desc === r.code)) e.desc = r.name;
        e.qty += Number(it.quantity || 0);
        e.value += itemValue(it);
        if (q.client_id) e.clients.add(q.client_id);
        if (!e.lastDate || qd > e.lastDate) {
          e.lastDate = qd;
          e.lastQuoteId = q.id;
          e.lastQuoteNumber = q.quote_number;
        }
      });
    });
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, clientsCount: v.clients.size }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50);
  }, [filteredQuotes, itemsByQuote, productByCode]);

  // Produto Campeão (líder em faturamento)
  const productChampion = useMemo(() => {
    if (!topProducts.length) return null;
    const byValue = topProducts[0];
    const byQty = [...topProducts].sort((a, b) => b.qty - a.qty)[0];
    return { byValue, byQty };
  }, [topProducts]);

  // ---------- Evolution chart ----------
  const monthlySeries = useMemo(() => {
    const m: Record<string, number> = {};
    filteredQuotes.forEach(q => {
      const d = new Date(q.approved_at || q.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      m[k] = (m[k] || 0) + getValue(q);
    });
    return Object.entries(m).sort().map(([month, value]) => ({ month, value }));
  }, [filteredQuotes]);

  // ---------- Filter options ----------
  const sellers = useMemo(() => {
    const m = new Map<string, string>();
    // Profiles take precedence when available (managers/admins)
    sellerProfiles.forEach(p => m.set(p.user_id, p.full_name));
    // Fallback to whatever appears on quotes
    quotes.forEach(q => {
      if (q.created_by && !m.has(q.created_by)) m.set(q.created_by, q.salesperson || 'Vendedor');
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [quotes, sellerProfiles]);
  const cities = useMemo(() => Array.from(new Set(Object.values(clients).map(c => c.city).filter(Boolean) as string[])).sort(), [clients]);
  const states = useMemo(() => Array.from(new Set(Object.values(clients).map(c => c.state).filter(Boolean) as string[])).sort(), [clients]);
  const brands = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.brand) s.add(i.brand); });
    return Array.from(s).sort();
  }, [items]);

  // ---------- Alerts ----------
  const alerts = useMemo(() => {
    const out: { type: string; severity: 'high' | 'med' | 'low'; message: string; client: string }[] = [];
    aggregated.forEach(a => {
      if ((a.daysSinceLast ?? 0) >= 120) {
        out.push({ type: 'parado', severity: 'high', client: a.clientName,
          message: `Há ${a.daysSinceLast} dias sem comprar.` });
      }
      const months = Object.entries(a.monthly).sort();
      if (months.length >= 2) {
        const [, prev] = months[months.length - 2];
        const [, curr] = months[months.length - 1];
        if (curr > prev * 1.5 && prev > 0) {
          out.push({ type: 'crescimento', severity: 'low', client: a.clientName,
            message: `Aumentou compras em ${Math.round((curr / prev - 1) * 100)}%.` });
        } else if (curr < prev * 0.5 && curr > 0) {
          out.push({ type: 'reducao', severity: 'med', client: a.clientName,
            message: `Reduziu compras em ${Math.round((1 - curr / prev) * 100)}%.` });
        }
      }
      if ((a.daysSinceLast ?? 9999) <= 30 && a.quotesCount >= 2 && (a.intervalAvgDays ?? 0) > 60) {
        out.push({ type: 'retorno', severity: 'low', client: a.clientName,
          message: 'Voltou a comprar recentemente.' });
      }
    });
    return out.slice(0, 50);
  }, [aggregated]);

  // ---------- Insights Inteligentes — via handlers compartilhados (crm-tools) ----------
  type Insight = { icon: any; tone: string; title: string; desc: string; onClick?: () => void; diagnostics?: any };

  // days_back derivado do filtro atual de período (Infinity → sem filtro)
  const daysBackArg = periodDays === Infinity ? undefined : Number(periodDays);
  const canSeeTeam = canSeeAll; // admin/gestor
  const toolScope = canSeeTeam ? 'team' : undefined;

  const topProductsQuery = useCrmTool('get_top_products',
    { days_back: daysBackArg, metric: 'revenue', limit: 5, scope: toolScope },
    { enabled: !!user?.id });
  const topBrandsQuery = useCrmTool('get_top_brands',
    { days_back: daysBackArg, limit: 5, scope: toolScope },
    { enabled: !!user?.id });
  const inactiveClientsQuery = useCrmTool('get_inactive_clients',
    { inactive_days: 90, limit: 10, scope: toolScope },
    { enabled: !!user?.id });
  const repurchaseQuery = useCrmTool('get_repurchase_window',
    { min_purchases: 2, tolerance_pct: 0.3, limit: 10, scope: toolScope },
    { enabled: !!user?.id });
  const clientRankingQuery = useCrmTool('get_client_ranking',
    {
      scope: toolScope,
      period_days: periodDays === Infinity ? 'all' : Number(periodDays),
      seller_id: sellerFilter !== 'all' ? sellerFilter : undefined,
      state: stateFilter !== 'all' ? stateFilter : undefined,
      city: cityFilter !== 'all' ? cityFilter : undefined,
      active_filter: activeFilter,
      limit: 300,
    },
    { enabled: !!user?.id && canSeeAll });

  const insights = useMemo<Insight[]>(() => {
    const items: Insight[] = [];

    // Recompra — handler compartilhado
    const repRows: any[] = repurchaseQuery.data?.rows ?? [];
    if (repRows.length) {
      items.push({
        icon: Repeat, tone: 'emerald',
        title: `${repRows.length} cliente(s) em janela de recompra`,
        desc: repRows.slice(0, 3).map(r => r.client_name).join(', ') + ' — abordagem comercial recomendada.',
        diagnostics: repurchaseQuery.data?.diagnostics,
        onClick: () => {
          const ids = new Set(repRows.map(r => r.client_id));
          openDrill('Janela de recompra',
            `Baseado em intervalo médio entre compras (mín. ${repurchaseQuery.data?.summary?.min_purchases ?? 2} compras).`,
            filteredQuotes.filter(q => q.client_id && ids.has(q.client_id)));
        },
      });
    }

    // Inativos — handler compartilhado
    const inaRows: any[] = inactiveClientsQuery.data?.rows ?? [];
    if (inaRows.length) {
      const top3 = inaRows.slice(0, 3);
      items.push({
        icon: AlertTriangle, tone: 'red',
        title: `${inaRows.length} cliente(s) de alto valor inativo(s)`,
        desc: top3.map(r => `${r.client_name} (${fmtBRL(r.total_revenue)})`).join(' • '),
        diagnostics: inactiveClientsQuery.data?.diagnostics,
        onClick: () => {
          const ids = new Set(inaRows.map(r => r.client_id));
          openDrill('Inativos de alto valor',
            `Sem compras aprovadas há ${inactiveClientsQuery.data?.summary?.inactive_days ?? 90}+ dias.`,
            filteredQuotes.filter(q => q.client_id && ids.has(q.client_id)));
        },
      });
    }

    // Crescimento de receita (KPIs locais permanecem — Fase B migra para get_sales_metrics)
    const g = growth(kpis.totalRevenue, prevKpis.totalRevenue);
    if (g != null && g >= 10) {
      items.push({ icon: TrendingUp, tone: 'emerald',
        title: `Receita cresceu ${g.toFixed(1)}% vs período anterior`,
        desc: `De ${fmtCompact(prevKpis.totalRevenue)} para ${fmtCompact(kpis.totalRevenue)}.`,
        onClick: () => drillRevenue() });
    } else if (g != null && g <= -10) {
      items.push({ icon: TrendingDown, tone: 'red',
        title: `Receita caiu ${Math.abs(g).toFixed(1)}% vs período anterior`,
        desc: `Atenção: queda de ${fmtCompact(prevKpis.totalRevenue - kpis.totalRevenue)} no período.`,
        onClick: () => drillRevenue() });
    }

    // Marca em destaque — handler compartilhado
    const brandRow: any = topBrandsQuery.data?.rows?.[0];
    if (brandRow && brandRow.brand) {
      items.push({
        icon: Crown, tone: 'amber',
        title: `Marca em destaque: ${brandRow.brand}`,
        desc: `${brandRow.quantity_sold} unidades • ${brandRow.customer_count} cliente(s) • ${fmtBRL(brandRow.revenue)} (${brandRow.participation_percentage}% do faturamento).`,
        diagnostics: topBrandsQuery.data?.diagnostics,
        onClick: () => drillBrand(brandRow.brand),
      });
    }

    // Produto líder — handler compartilhado (nome oficial, nunca "Item sem nome")
    const prodRow: any = topProductsQuery.data?.rows?.[0];
    if (prodRow && prodRow.product_name) {
      items.push({
        icon: Package, tone: 'indigo',
        title: `Produto líder: ${prodRow.product_name}`,
        desc: `${prodRow.brand ?? 'Sem marca'}${prodRow.sku ? ` • SKU ${prodRow.sku}` : (prodRow.product_code ? ` • Código ${prodRow.product_code}` : '')} • ${prodRow.quantity_sold} un. • ${fmtBRL(prodRow.revenue)} (${prodRow.share_pct}%).`,
        diagnostics: topProductsQuery.data?.diagnostics,
        onClick: () => drillProduct(prodRow),
      });
    }

    return items;
  }, [
    repurchaseQuery.data, inactiveClientsQuery.data, topBrandsQuery.data, topProductsQuery.data,
    kpis, prevKpis, filteredQuotes,
  ]);



  // ---------- Export ----------
  const exportRows = () => filteredAggregated.map((a, i) => ({
    'Posição': i + 1,
    'Empresa': a.clientName,
    'Responsável': a.client?.contact_name || '',
    'Cidade': a.city,
    'Estado': a.state,
    'Compras': a.quotesCount,
    'Valor Total': a.totalValue,
    'Recebido': a.receivedValue,
    'Ticket Médio': a.ticketMedio,
    'Última Compra': a.lastPurchase?.toLocaleDateString('pt-BR') || '',
    'Dias sem Comprar': a.daysSinceLast ?? '',
    'Status': a.status,
  }));

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
    XLSX.writeFile(wb, 'inteligencia-comercial.xlsx');
  };
  const exportCSV = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inteligencia-comercial.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('Ranking de Clientes — Inteligência Comercial', 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [['#', 'Empresa', 'Cidade', 'Compras', 'Valor', 'Última', 'Status']],
      body: filteredAggregated.slice(0, 100).map((a, i) => [
        i + 1, a.clientName, a.city, a.quotesCount, fmtBRL(a.totalValue),
        a.lastPurchase?.toLocaleDateString('pt-BR') || '-', a.status,
      ]),
      styles: { fontSize: 8 },
    });
    doc.save('inteligencia-comercial.pdf');
  };

  // ---------- Selected client detail ----------
  const detail = useMemo(() => aggregated.find(a => a.clientId === selectedClient) || null, [aggregated, selectedClient]);
  const detailQuotes = useMemo(() => detail ? quotes.filter(q => detail.quoteIds.includes(q.id)).sort((a, b) => new Date(b.approved_at || b.created_at).getTime() - new Date(a.approved_at || a.created_at).getTime()) : [], [detail, quotes]);
  const top5 = filteredAggregated.slice(0, 5);
  const top5Max = top5[0]?.totalValue || 1;

  // ---------- Drill-down helpers ----------
  const openDrill = (title: string, subtitle: string, qs: QuoteRow[]) => {
    setDrill({ title, subtitle, quotes: qs.sort((a, b) => new Date(b.approved_at || b.created_at).getTime() - new Date(a.approved_at || a.created_at).getTime()) });
  };
  const drillRevenue = () => openDrill('Receita Comercial', 'Orçamentos aprovados no período', filteredQuotes);
  const drillReceived = () => openDrill('Receita Recebida', 'Orçamentos liquidados no período', filteredQuotes.filter(isReceived));
  const drillActive = () => {
    const ids = new Set(aggregated.filter(a => a.isActive).flatMap(a => a.quoteIds));
    openDrill('Clientes Ativos', 'Clientes com compras nos últimos 90 dias', filteredQuotes.filter(q => ids.has(q.id)));
  };
  const drillInactive = () => {
    const ids = new Set(aggregated.filter(a => !a.isActive).flatMap(a => a.quoteIds));
    openDrill('Clientes Inativos', 'Clientes sem comprar há mais de 90 dias', filteredQuotes.filter(q => ids.has(q.id)));
  };
  const drillRecurrent = () => {
    const ids = new Set(aggregated.filter(a => a.isRecurrent).flatMap(a => a.quoteIds));
    openDrill('Clientes Recorrentes', 'Clientes com 2 ou mais compras', filteredQuotes.filter(q => ids.has(q.id)));
  };
  const drillChampion = () => {
    if (!productChampion) return;
    const key = productChampion.byValue.key;
    const ids = new Set<string>();
    filteredQuotes.forEach(q => {
      (itemsByQuote.get(q.id) || []).forEach(it => {
        if (resolveItem(it).key === key) ids.add(q.id);
      });
    });
    openDrill(`Produto Campeão: ${productChampion.byValue.desc}`, `${productChampion.byValue.brand}${productChampion.byValue.code ? ` • Código ${productChampion.byValue.code}` : ''} • ${productChampion.byValue.qty} un. • ${fmtBRL(productChampion.byValue.value)}`, filteredQuotes.filter(q => ids.has(q.id)));
  };
  const drillTopClient = () => {
    if (!top5[0]) return;
    openDrill(`Top Cliente: ${top5[0].clientName}`, `${clientLocation(top5[0].client)} • ${clientCnpjLabel(top5[0].client)}`, filteredQuotes.filter(q => top5[0].quoteIds.includes(q.id)));
  };
  const drillBrand = (brand: string) => {
    const norm = (brand || '').trim().toLowerCase();
    if (!norm) return;
    const ids = new Set<string>();
    filteredQuotes.forEach(q => {
      (itemsByQuote.get(q.id) || []).forEach(it => {
        if ((resolveItem(it).brand || '').trim().toLowerCase() === norm) ids.add(q.id);
      });
    });
    openDrill(`Marca em destaque: ${brand}`, `Orçamentos aprovados contendo itens da marca ${brand}`, filteredQuotes.filter(q => ids.has(q.id)));
  };
  const drillProduct = (prodRow: any) => {
    const name = (prodRow?.product_name || '').trim().toLowerCase();
    const code = (prodRow?.sku || prodRow?.product_code || '').trim().toLowerCase();
    const ids = new Set<string>();
    filteredQuotes.forEach(q => {
      (itemsByQuote.get(q.id) || []).forEach(it => {
        const r = resolveItem(it);
        const matchCode = code && (r.code || '').trim().toLowerCase() === code;
        const matchName = !code && name && (r.name || '').trim().toLowerCase() === name;
        if (matchCode || matchName) ids.add(q.id);
      });
    });
    openDrill(`Produto líder: ${prodRow?.product_name ?? ''}`, `${prodRow?.brand ?? ''}${code ? ` • ${prodRow?.sku ? 'SKU' : 'Código'} ${prodRow?.sku ?? prodRow?.product_code}` : ''}`, filteredQuotes.filter(q => ids.has(q.id)));
  };

  if (isInitialLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }


  const statusBadge = (s: 'verde' | 'amarelo' | 'vermelho') => {
    const map = {
      verde: { c: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', l: '🟢 Frequente' },
      amarelo: { c: 'bg-amber-500/15 text-amber-700 border-amber-500/30', l: '🟡 Atenção' },
      vermelho: { c: 'bg-red-500/15 text-red-700 border-red-500/30', l: '🔴 Parado' },
    }[s];
    return <Badge variant="outline" className={map.c}>{map.l}</Badge>;
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        {/* HERO */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-lg">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,white,transparent_40%),radial-gradient(circle_at_80%_60%,white,transparent_45%)]" />
          <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 ring-1 ring-white/20">
                <Brain className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-white/15 text-white border-white/20 hover:bg-white/20">BI Executivo</Badge>
                  <Badge variant="secondary" className="bg-white/15 text-white border-white/20 hover:bg-white/20">Tempo real</Badge>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold font-display mt-2 tracking-tight">
                  Inteligência Comercial
                </h1>
                <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
                  Plataforma analítica de decisão — rankings, recompra, oportunidades e indicadores estratégicos do MCI CRM, baseados no histórico real de vendas.
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="bg-white text-indigo-700 hover:bg-white/90 shadow-md">
                  <Download className="h-4 w-4 mr-2" /> Exportar <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCSV}><Download className="h-4 w-4 mr-2 text-sky-600" />CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF}><FileText className="h-4 w-4 mr-2 text-red-600" />PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* FILTROS INTELIGENTES */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Filtros Inteligentes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="180">Últimos 6 meses</SelectItem>
                <SelectItem value="365">Último ano</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
              </SelectContent>
            </Select>
            {canSeeAll && (
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {sellers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas cidades</SelectItem>
                {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos estados</SelectItem>
                {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas marcas</SelectItem>
                {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={(v: any) => setActiveFilter(v)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ativos e inativos</SelectItem>
                <SelectItem value="active">Apenas ativos</SelectItem>
                <SelectItem value="inactive">Apenas inativos</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} />
          </CardContent>
        </Card>

        {isBackgroundUpdating && (
          <div className="fixed right-4 top-4 z-50 rounded-full border bg-background/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            Atualizando dados...
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as IntelligenceTab)} className="space-y-4">
          <TabsList className={cn("grid w-full h-auto", canSeeAll ? "grid-cols-4 md:grid-cols-7" : "grid-cols-3 md:grid-cols-6")}>
            <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="h-4 w-4" /><span className="hidden sm:inline">Dashboard</span></TabsTrigger>
            <TabsTrigger value="ranking" className="gap-1.5"><Trophy className="h-4 w-4" /><span className="hidden sm:inline">Rankings</span></TabsTrigger>
            <TabsTrigger value="top" className="gap-1.5"><UsersIcon className="h-4 w-4" /><span className="hidden sm:inline">Clientes</span></TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5"><ShoppingCart className="h-4 w-4" /><span className="hidden sm:inline">Produtos</span></TabsTrigger>
            <TabsTrigger value="evolution" className="gap-1.5"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Evolução</span></TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">Alertas IA</span></TabsTrigger>
            {canSeeAll && (
              <TabsTrigger value="diag" className="gap-1.5"><Brain className="h-4 w-4" /><span className="hidden sm:inline">Diagnóstico</span></TabsTrigger>
            )}
          </TabsList>

          {/* DASHBOARD */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* GRUPO FINANCEIRO */}
            <KpiGroup title="Financeiro" icon={Wallet} accent="emerald">
              <KpiCard icon={DollarSign} label="Receita Comercial" value={fmtCompact(kpis.totalRevenue)} hint="Apenas Aprovados" growth={growth(kpis.totalRevenue, prevKpis.totalRevenue)} accent="emerald" onClick={drillRevenue} />
              <KpiCard icon={Wallet} label="Receita Recebida" value={fmtCompact(kpis.totalReceived)} hint="Apenas liquidados" growth={growth(kpis.totalReceived, prevKpis.totalReceived)} accent="emerald" onClick={drillReceived} />
              <KpiCard icon={ShoppingCart} label="Ticket Médio Cliente" value={fmtCompact(kpis.ticketMedio)} growth={growth(kpis.ticketMedio, prevKpis.ticketMedio)} accent="emerald" onClick={drillRevenue} />
              <KpiCard icon={ShoppingCart} label="Valor Médio / Orçamento" value={fmtCompact(kpis.avgQuote)} growth={growth(kpis.avgQuote, prevKpis.avgQuote)} accent="emerald" onClick={drillRevenue} />
            </KpiGroup>

            {/* GRUPO CLIENTES */}
            <KpiGroup title="Clientes" icon={UsersIcon} accent="sky">
              <KpiCard icon={UsersIcon} label="Total de Clientes" value={String(kpis.totalClients)} growth={growth(kpis.totalClients, prevKpis.totalClients)} accent="sky" onClick={drillRevenue} />
              <KpiCard icon={UsersIcon} label="Clientes Ativos" value={String(kpis.activeClients)} hint="Compraram ≤90 dias" accent="sky" onClick={drillActive} />
              <KpiCard icon={AlertTriangle} label="Clientes Inativos" value={String(kpis.inactiveClients)} hint=">90 dias sem comprar" accent="amber" onClick={drillInactive} />
              <KpiCard icon={Repeat} label="Clientes Recorrentes" value={String(kpis.recurrent)} hint="2+ compras" accent="sky" onClick={drillRecurrent} />
            </KpiGroup>

            {/* GRUPO PERFORMANCE */}
            <KpiGroup title="Performance" icon={Target} accent="violet">
              <KpiCard icon={TrendingUp} label="Compras / Cliente" value={kpis.avgPerClient.toFixed(1)} accent="violet" />
              <KpiCard icon={Activity} label="Orçamentos no Período" value={String(filteredQuotes.length)} accent="violet" onClick={drillRevenue} />
              <KpiCard icon={Trophy} label="Top Cliente" value={top5[0] ? fmtCompact(top5[0].totalValue) : '—'} hint={top5[0]?.clientName} accent="violet" onClick={drillTopClient} />
              <KpiCard
                icon={Crown}
                label="Produto Campeão"
                value={productChampion ? productChampion.byValue.desc.slice(0, 22) + (productChampion.byValue.desc.length > 22 ? '…' : '') : 'Sem dados suficientes'}
                hint={productChampion ? `${productChampion.byValue.brand} • ${productChampion.byValue.qty} un. • ${fmtCompact(productChampion.byValue.value)}` : undefined}
                accent="amber"
                onClick={productChampion ? drillChampion : undefined}
              />
            </KpiGroup>


            {/* CHART + TOP 5 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Evolução de Receita</CardTitle>
                  <Badge variant="outline" className="text-xs">{monthlySeries.length} meses</Badge>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlySeries}>
                      <defs>
                        <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis tickFormatter={fmtCompact} width={80} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip formatter={(v: any) => fmtBRLfull(v)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#gradReceita)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Top 5 Clientes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {top5.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
                  {top5.map((a, i) => {
                    const pct = (a.totalValue / top5Max) * 100;
                    const colors = ['bg-amber-500', 'bg-slate-400', 'bg-orange-400', 'bg-indigo-400', 'bg-emerald-400'];
                    return (
                      <button
                        key={a.clientId}
                        onClick={() => setSelectedClient(a.clientId)}
                        className="w-full text-left group"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0', colors[i])}>{i + 1}</span>
                            <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">{a.clientName}</span>
                          </div>
                          <span className="text-xs font-bold tabular-nums shrink-0">{fmtCompact(a.totalValue)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', colors[i])} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 truncate">{clientLocation(a.client)} • {a.cnpj ? formatCnpj(a.cnpj) : 'CNPJ —'} • {a.quotesCount} compras</div>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* INSIGHTS INTELIGENTES */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" /> Insights Inteligentes
                  <Badge variant="outline" className="ml-2 text-[10px]">IA</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {insights.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem recomendações automáticas no momento.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insights.map((it, i) => {
                      const Icon = it.icon;
                      const tone: Record<string, string> = {
                        emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
                        red: 'bg-red-500/10 text-red-700 border-red-500/20',
                        amber: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
                        indigo: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
                      };
                      const clickable = !!it.onClick;
                      return (
                        <button
                          type="button"
                          key={i}
                          onClick={it.onClick}
                          disabled={!clickable}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border text-left w-full transition-all',
                            tone[it.tone],
                            clickable && 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40'
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg bg-background/60 flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{it.title}</p>
                            <p className="text-xs opacity-80 mt-0.5">{it.desc}</p>
                            {clickable && <p className="text-[10px] opacity-70 mt-1 font-medium">Ver detalhes →</p>}
                            {canSeeAll && it.diagnostics && (
                              <p className="text-[10px] opacity-60 mt-1 font-mono">
                                tool: {it.diagnostics.tool} • {it.diagnostics.duration_ms}ms • {it.diagnostics.row_count ?? 0} reg.
                              </p>
                            )}

                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ranking */}
          <TabsContent value="ranking">
            <Card>
              <CardHeader><CardTitle className="text-base">Ranking de Clientes ({filteredAggregated.length})</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Compras</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                      <TableHead>Última compra</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAggregated.slice(0, 300).map((a, i) => (
                      <TableRow key={a.clientId} className="cursor-pointer" onClick={() => setSelectedClient(a.clientId)}>
                        <TableCell className="font-bold">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          <div className="leading-tight">
                            <div>{a.clientName}</div>
                            <div className="text-[10px] text-muted-foreground">{a.client?.contact_name || ''}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{clientLocation(a.client)}</TableCell>
                        <TableCell className="text-xs font-mono">{a.cnpj ? formatCnpj(a.cnpj) : '—'}</TableCell>
                        <TableCell className="text-xs">{a.salesperson || '—'}</TableCell>
                        <TableCell className="text-right">{a.quotesCount}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtBRL(a.totalValue)}</TableCell>
                        <TableCell className="text-right">{fmtBRL(a.ticketMedio)}</TableCell>
                        <TableCell>
                          {a.lastPurchase ? (
                            <div className="leading-tight">
                              <div className="text-sm">{a.lastPurchase.toLocaleDateString('pt-BR')}</div>
                              <div className="text-[10px] text-muted-foreground">Há {a.daysSinceLast} dias</div>
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{statusBadge(a.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clientes (top) */}
          <TabsContent value="top" className="grid md:grid-cols-2 gap-4">
            <TopList title="Top 10 — Faturamento" items={[...filteredAggregated].slice(0, 10).map(a => ({ name: a.clientName, sub: `${clientLocation(a.client)} • ${a.cnpj ? formatCnpj(a.cnpj) : 'CNPJ —'}`, value: fmtBRL(a.totalValue), id: a.clientId }))} onClick={id => setSelectedClient(id)} />
            <TopList title="Top 10 — Quantidade de Compras" items={[...filteredAggregated].sort((a, b) => b.quotesCount - a.quotesCount).slice(0, 10).map(a => ({ name: a.clientName, sub: `${clientLocation(a.client)} • ${a.cnpj ? formatCnpj(a.cnpj) : 'CNPJ —'}`, value: `${a.quotesCount} compras`, id: a.clientId }))} onClick={id => setSelectedClient(id)} />
            <TopList title="Top 10 — Maior Ticket Médio" items={[...filteredAggregated].sort((a, b) => b.ticketMedio - a.ticketMedio).slice(0, 10).map(a => ({ name: a.clientName, sub: `${clientLocation(a.client)} • ${a.cnpj ? formatCnpj(a.cnpj) : 'CNPJ —'}`, value: fmtBRL(a.ticketMedio), id: a.clientId }))} onClick={id => setSelectedClient(id)} />
            <TopList title="Top 10 — Recorrentes" items={[...filteredAggregated].filter(a => a.isRecurrent).sort((a, b) => b.quotesCount - a.quotesCount).slice(0, 10).map(a => ({ name: a.clientName, sub: `${clientLocation(a.client)} • ${a.cnpj ? formatCnpj(a.cnpj) : 'CNPJ —'}`, value: `${a.quotesCount}x — ${fmtBRL(a.totalValue)}`, id: a.clientId }))} onClick={id => setSelectedClient(id)} />
          </TabsContent>

          {/* Products */}
          <TabsContent value="products">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Produtos Mais Vendidos</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6">Sem dados suficientes.</p>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead className="text-right">Qtd Vendida</TableHead>
                      <TableHead className="text-right">Valor Vendido</TableHead>
                      <TableHead className="text-right">Clientes</TableHead>
                      <TableHead>Último orçamento</TableHead>
                      <TableHead>Última venda</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((p, i) => (
                      <TableRow key={p.code + i}>
                        <TableCell className="font-bold">{i + 1}</TableCell>
                        <TableCell className="font-medium max-w-md truncate">{p.desc}</TableCell>
                        <TableCell className="text-xs"><Badge variant="secondary">{p.brand}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{p.code || '—'}</TableCell>
                        <TableCell className="text-right">{p.qty}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtBRL(p.value)}</TableCell>
                        <TableCell className="text-right">{p.clientsCount}</TableCell>
                        <TableCell className="font-mono text-xs">{p.lastQuoteNumber || '—'}</TableCell>
                        <TableCell className="text-xs">{p.lastDate?.toLocaleDateString('pt-BR') || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          {/* Evolution */}
          <TabsContent value="evolution">
            <Card>
              <CardHeader><CardTitle className="text-base">Compras por Mês</CardTitle></CardHeader>
              <CardContent className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={fmtCompact} width={80} />
                    <Tooltip formatter={(v: any) => fmtBRLfull(v)} />
                    <Legend />
                    <Bar dataKey="value" name="Receita" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alerts IA */}
          <TabsContent value="alerts">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Alertas IA</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {alerts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>}
                {alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
                    {a.type === 'parado' && <TrendingDown className="h-5 w-5 text-red-500 mt-0.5" />}
                    {a.type === 'reducao' && <TrendingDown className="h-5 w-5 text-amber-500 mt-0.5" />}
                    {a.type === 'crescimento' && <TrendingUp className="h-5 w-5 text-emerald-500 mt-0.5" />}
                    {a.type === 'retorno' && <Sparkles className="h-5 w-5 text-blue-500 mt-0.5" />}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.client}</p>
                      <p className="text-xs text-muted-foreground">{a.message}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {canSeeAll && (
            <TabsContent value="diag">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" /> Diagnóstico técnico (admin/gestor)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Todas as chamadas à camada compartilhada <span className="font-mono">/crm-tools</span> executadas por esta página.
                    Fonte única de verdade — mesmos handlers usados pelo Assistente Comercial e pelo MCP.
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tool</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Latência</TableHead>
                          <TableHead className="text-right">Registros</TableHead>
                          <TableHead>Request ID</TableHead>
                          <TableHead>Gerado em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { label: 'get_commercial_overview', q: commercialQuery, diag: null as any, rows: quotes.length, err: commercialQuery.error?.message },
                          { label: 'get_top_products', q: topProductsQuery, diag: topProductsQuery.data?.diagnostics, rows: topProductsQuery.data?.count, err: topProductsQuery.data?.error },
                          { label: 'get_top_brands', q: topBrandsQuery, diag: topBrandsQuery.data?.diagnostics, rows: topBrandsQuery.data?.count, err: topBrandsQuery.data?.error },
                          { label: 'get_inactive_clients', q: inactiveClientsQuery, diag: inactiveClientsQuery.data?.diagnostics, rows: inactiveClientsQuery.data?.count, err: inactiveClientsQuery.data?.error },
                          { label: 'get_repurchase_window', q: repurchaseQuery, diag: repurchaseQuery.data?.diagnostics, rows: repurchaseQuery.data?.count, err: repurchaseQuery.data?.error },
                          { label: 'get_client_ranking', q: clientRankingQuery, diag: clientRankingQuery.data?.diagnostics, rows: clientRankingQuery.data?.count, err: clientRankingQuery.data?.error },
                        ].map((row, i) => {
                          const loading = row.q.isFetching;
                          const ok = !row.err && !row.q.isError;
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{row.label}</TableCell>
                              <TableCell>
                                {loading ? (
                                  <Badge variant="outline" className="text-xs">carregando</Badge>
                                ) : ok ? (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-xs">ok</Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">erro</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">{row.diag?.duration_ms != null ? `${row.diag.duration_ms}ms` : '—'}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{row.rows ?? '—'}</TableCell>
                              <TableCell className="font-mono text-[10px] text-muted-foreground">{row.diag?.request_id?.slice(0, 8) ?? '—'}</TableCell>
                              <TableCell className="font-mono text-[10px] text-muted-foreground">
                                {row.diag?.generated_at ? new Date(row.diag.generated_at).toLocaleTimeString('pt-BR') : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {clientRankingQuery.data?.summary && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs font-semibold mb-1">Preview: get_client_ranking</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {JSON.stringify(clientRankingQuery.data.summary)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Client detail */}
      <Sheet open={!!selectedClient} onOpenChange={o => !o && setSelectedClient(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.clientName}</SheetTitle>
                <p className="text-xs text-muted-foreground">{clientLocation(detail.client)} • {detail.cnpj ? formatCnpj(detail.cnpj) : 'CNPJ não informado'}</p>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Responsável" value={detail.client?.contact_name || '-'} />
                  <Info label="Telefone" value={detail.client?.contact_phone || detail.client?.phone || '-'} />
                  <Info label="Email" value={detail.client?.email || '-'} />
                  <Info label="Cidade/UF" value={clientLocation(detail.client)} />
                  <Info label="CNPJ" value={detail.cnpj ? formatCnpj(detail.cnpj) : '—'} />
                  <Info label="Vendedor" value={detail.salesperson || '-'} />
                  <Info label="Primeira Compra" value={detail.firstPurchase?.toLocaleDateString('pt-BR') || '-'} />
                  <Info label="Última Compra" value={detail.lastPurchase?.toLocaleDateString('pt-BR') || '-'} />
                  <Info label="Total de Compras" value={String(detail.quotesCount)} />
                  <Info label="Valor Total" value={fmtBRLfull(detail.totalValue)} />
                  <Info label="Recebido" value={fmtBRLfull(detail.receivedValue)} />
                  <Info label="Ticket Médio" value={fmtBRLfull(detail.ticketMedio)} />
                </div>

                <div>
                  <p className="font-semibold mb-2 flex items-center gap-1"><FileText className="h-4 w-4" />Orçamentos ({detailQuotes.length})</p>
                  <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                    {detailQuotes.map(q => (
                      <a key={q.id} href={`/quotes?open=${q.id}`} className="flex justify-between gap-2 text-xs border rounded px-2 py-1.5 hover:bg-muted">
                        <span className="font-mono">{q.quote_number}</span>
                        <span className="text-muted-foreground">{new Date(q.approved_at || q.created_at).toLocaleDateString('pt-BR')}</span>
                        <span className="font-semibold">{fmtBRL(getValue(q))}</span>
                      </a>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-semibold mb-2 flex items-center gap-1"><ShoppingCart className="h-4 w-4" />Produtos mais comprados</p>
                  <div className="space-y-1">
                    {Object.entries(detail.products).sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs border-b py-1">
                        <span className="truncate flex-1 pr-2">{v.desc} {v.brand && v.brand !== 'Sem marca' ? `• ${v.brand}` : ''}</span>
                        <span className="font-medium">{v.qty}x — {fmtBRL(v.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-semibold mb-2">Marcas mais compradas</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(detail.brands).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b, v]) => (
                      <Badge key={b} variant="secondary">{b}: {fmtBRL(v)}</Badge>
                    ))}
                  </div>
                </div>

                {detail.intervalAvgDays != null && (
                  <div className="p-3 rounded-lg bg-muted/50 text-xs">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    Intervalo médio entre compras: <strong>{detail.intervalAvgDays} dias</strong>.
                    {detail.lastPurchase && (
                      <> Próxima compra estimada: <strong>
                        {new Date(detail.lastPurchase.getTime() + detail.intervalAvgDays * 86400000).toLocaleDateString('pt-BR')}
                      </strong>.</>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {detail.client?.id && (
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <a href={`/clients?open=${detail.client.id}`}><UsersIcon className="h-4 w-4 mr-1" /> Abrir cliente</a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Drill-down drawer (KPI cards) */}
      <Sheet open={!!drill} onOpenChange={o => !o && setDrill(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-2xl">
          {drill && (
            <>
              <SheetHeader>
                <SheetTitle>{drill.title}</SheetTitle>
                {drill.subtitle && <p className="text-xs text-muted-foreground">{drill.subtitle}</p>}
              </SheetHeader>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>{drill.quotes.length} orçamento(s)</span>
                  <span>Total: {fmtBRLfull(drill.quotes.reduce((s, q) => s + getValue(q), 0))}</span>
                </div>
                {drill.quotes.length === 0 && <p className="text-muted-foreground py-6 text-center">Sem dados.</p>}
                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                  {drill.quotes.slice(0, 300).map(q => {
                    const c = q.client_id ? clients[q.client_id] : null;
                    return (
                      <div key={q.id} className="border rounded-lg p-3 hover:bg-muted/40 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold">{q.quote_number}</span>
                              <Badge variant="outline" className="text-[10px]">{q.status}</Badge>
                              {q.payment_status && <Badge variant="secondary" className="text-[10px]">{q.payment_status}</Badge>}
                            </div>
                            <p className="text-sm font-medium truncate mt-1">{c?.company_name || c?.name || q.client_name || 'Sem cliente'}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {clientLocation(c)} • {c?.cpf_cnpj ? formatCnpj(c.cpf_cnpj) : 'CNPJ —'} • {q.salesperson || 'Vendedor —'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(q.approved_at || q.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold tabular-nums">{fmtBRL(getValue(q))}</p>
                            <div className="flex gap-1 mt-1">
                              <Button asChild size="sm" variant="outline" className="h-7 text-[10px] px-2">
                                <a href={`/quotes?open=${q.id}`}>Orçamento</a>
                              </Button>
                              {c?.id && (
                                <Button asChild size="sm" variant="outline" className="h-7 text-[10px] px-2">
                                  <a href={`/clients?open=${c.id}`}>Cliente</a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

const ACCENT_MAP: Record<string, { bar: string; icon: string; chip: string; ring: string }> = {
  emerald: { bar: 'bg-emerald-500', icon: 'text-emerald-600 bg-emerald-500/10', chip: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', ring: 'ring-emerald-500/20' },
  sky:     { bar: 'bg-sky-500',     icon: 'text-sky-600 bg-sky-500/10',         chip: 'bg-sky-500/10 text-sky-700 border-sky-500/20',         ring: 'ring-sky-500/20' },
  violet:  { bar: 'bg-violet-500',  icon: 'text-violet-600 bg-violet-500/10',   chip: 'bg-violet-500/10 text-violet-700 border-violet-500/20', ring: 'ring-violet-500/20' },
  amber:   { bar: 'bg-amber-500',   icon: 'text-amber-600 bg-amber-500/10',     chip: 'bg-amber-500/10 text-amber-700 border-amber-500/20',   ring: 'ring-amber-500/20' },
};

function KpiGroup({ title, icon: Icon, accent, children }: { title: string; icon: any; accent: string; children: React.ReactNode }) {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.emerald;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', a.icon)}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <div className={cn('flex-1 h-px', a.bar, 'opacity-20')} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint, growth, accent = 'emerald', onClick }: { icon: any; label: string; value: string; hint?: string; growth?: number | null; accent?: string; onClick?: () => void }) {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.emerald;
  const showGrowth = growth != null && isFinite(growth);
  const up = (growth ?? 0) >= 0;
  const clickable = !!onClick;
  return (
    <Card
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn('relative overflow-hidden shadow-sm transition-all ring-1', a.ring, clickable && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40')}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', a.bar)} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className="text-lg md:text-xl font-bold font-display truncate mt-1">{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
            {showGrowth && (
              <div className={cn(
                'inline-flex items-center gap-0.5 mt-2 px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                up ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                   : 'bg-red-500/10 text-red-700 border-red-500/20'
              )}>
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {up ? '+' : ''}{growth!.toFixed(1)}%
              </div>
            )}
          </div>
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', a.icon)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TopList({ title, items, onClick }: { title: string; items: { name: string; sub?: string; value: string; id?: string }[]; onClick?: (idOrName: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        {items.map((it, i) => (
          <button key={i} onClick={() => onClick?.(it.id ?? it.name)}
            className="w-full flex items-center justify-between gap-2 p-2 rounded hover:bg-muted text-left">
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <Badge variant={i < 3 ? 'default' : 'secondary'} className="shrink-0">{i + 1}</Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{it.name}</span>
                {it.sub && <span className="block truncate text-[10px] text-muted-foreground">{it.sub}</span>}
              </span>
            </span>
            <span className="text-sm font-semibold shrink-0">{it.value}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}
