import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  validateQuotePaymentTerms,
  paymentRequiredForStatus,
  describeQuotePayment,
  MAX_CARD_INSTALLMENTS,
  type PaymentValidationResult,
} from '@/lib/quotePaymentValidation';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateQuotePdf } from '@/lib/generateQuotePdf';
import AppLayout from '@/components/AppLayout';
import QuoteHeader from '@/components/QuoteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, FileText, X, Download, MessageCircle, CreditCard, QrCode, FileBarChart, CheckCircle2, Clock, CircleDot, Copy, Loader2, Link2, Gift, Store, CalendarIcon, SplitSquareVertical, ShoppingBag, Truck, RefreshCw, ChevronsUpDown, ChevronUp, ChevronDown, Check, Handshake } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import FreightQuoteDrawer from '@/components/FreightQuoteDrawer';
import { buildFreightData, type FreightData } from '@/lib/freight';
import { MessageSquare, MoreHorizontal } from 'lucide-react';
import QuoteChat from '@/components/QuoteChat';
import { Checkbox } from '@/components/ui/checkbox';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ActionMenu } from '@/components/ActionMenu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePrivacy } from '@/hooks/usePrivacy';
import PrivacyToggle from '@/components/PrivacyToggle';

const db = supabase as any;

const renderDemoBadge = (q: any, size: 'sm' | 'xs' = 'xs') => {
  if (!q?.is_demonstration) return null;
  const end = q.demonstration_end_date ? new Date(q.demonstration_end_date + 'T00:00:00') : null;
  let detail = '';
  // Default: violet/indigo elegante
  let dotCls = 'bg-violet-500';
  let textCls = 'text-violet-700 dark:text-violet-300';
  let bgCls = 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800/60';
  let pulse = false;

  if (end) {
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
    if (diff < 0) {
      detail = `vencida há ${Math.abs(diff)}d`;
      dotCls = 'bg-red-500';
      textCls = 'text-red-700 dark:text-red-300';
      bgCls = 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60';
      pulse = true;
    } else if (diff === 0) {
      detail = 'vence hoje';
      dotCls = 'bg-red-500';
      textCls = 'text-red-700 dark:text-red-300';
      bgCls = 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60';
    } else if (diff <= 3) {
      detail = `${diff}d restantes`;
      dotCls = 'bg-orange-500';
      textCls = 'text-orange-700 dark:text-orange-300';
      bgCls = 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800/60';
    } else if (diff <= 7) {
      detail = `${diff}d restantes`;
      dotCls = 'bg-amber-500';
      textCls = 'text-amber-700 dark:text-amber-300';
      bgCls = 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60';
    } else {
      detail = `${diff}d`;
    }
  }
  const sizeCls = size === 'sm' ? 'h-6 px-2 text-[11px] gap-1.5' : 'h-5 px-1.5 text-[10px] gap-1';
  return (
    <span
      title={end ? `Demonstração até ${end.toLocaleDateString('pt-BR')}` : 'Demonstração'}
      className={`inline-flex items-center whitespace-nowrap rounded-md border font-medium ${sizeCls} ${bgCls} ${textCls}`}
    >
      <span className={`relative flex h-1.5 w-1.5 rounded-full ${dotCls}`}>
        {pulse && <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${dotCls}`} />}
      </span>
      <span className="uppercase tracking-wider font-semibold">Demo</span>
      {detail && <span className="opacity-75 font-normal normal-case tracking-normal">· {detail}</span>}
    </span>
  );
};

const sumFlaggedUnits = (items: any[] | undefined, predicate: (item: any) => boolean) =>
  (items || [])
    .filter(predicate)
    .reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0);

const renderQuoteItemFlowBadge = (q: any, size: 'sm' | 'xs' = 'xs') => {
  const transferUnits = sumFlaggedUnits(q.quote_items, (item) => !!item.transfer_status);
  const presaleUnits = sumFlaggedUnits(q.quote_items, (item) => !!item.is_presale);

  if (!transferUnits && !presaleUnits) return null;

  const compact = size === 'xs';
  const unitLabel = (value: number) => `${value} ${value === 1 ? 'unid.' : 'unids.'}`;
  const parts = [
    transferUnits ? `${unitLabel(transferUnits)} em transferência` : null,
    presaleUnits ? `${unitLabel(presaleUnits)} em pré-venda` : null,
  ].filter(Boolean);

  return (
    <span
      title={parts.join(' • ')}
      className={cn(
        'inline-flex max-w-full items-center rounded-md border border-border bg-card text-foreground shadow-sm',
        compact ? 'gap-1 px-1.5 py-0.5 text-[10px]' : 'gap-1.5 px-2 py-1 text-[11px]',
      )}
    >
      <span className={cn(
        'inline-flex shrink-0 items-center justify-center rounded bg-primary/10 text-primary',
        compact ? 'h-4 w-4' : 'h-5 w-5',
      )}>
        <SplitSquareVertical className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      </span>
      <span className="min-w-0 truncate font-semibold">
        {transferUnits ? `${unitLabel(transferUnits)} transferência` : null}
        {transferUnits && presaleUnits ? ' + ' : null}
        {presaleUnits ? `${unitLabel(presaleUnits)} pré-venda` : null}
      </span>
    </span>
  );
};

const normalizeProductText = (value: any): string =>
  (value ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeProductSearch = (value: string): string[] =>
  normalizeProductText(value).split(' ').filter(token => token.length > 0);

// Match por início de palavra (evita casar "titan" dentro de palavras aleatórias
// e evita ruído vindo da descrição do produto).
const wordStartsWith = (haystack: string, token: string): boolean =>
  haystack === token ||
  haystack.startsWith(`${token} `) ||
  haystack.includes(` ${token}`);

const wordEquals = (haystack: string, token: string): boolean =>
  haystack.split(' ').includes(token);

/**
 * Ranking preciso: um produto só é considerado resultado quando TODOS os termos
 * digitados aparecem em campos fortes (nome, código, sku ou marca), sempre no
 * início de uma palavra. A descrição e a categoria nunca criam um resultado —
 * servem apenas como desempate.
 */
const rankProductMatch = (product: any, query: string, tokens: string[]): number => {
  const name = normalizeProductText(product.name);
  const brand = normalizeProductText(product.brand);
  const code = normalizeProductText(product.code);
  const sku = normalizeProductText(product.sku);
  const category = normalizeProductText(product.category_principal);

  if (tokens.length === 0) return 0;

  let score = 0;
  let nameHits = 0;

  for (const token of tokens) {
    const inName = wordStartsWith(name, token);
    const inCode = wordStartsWith(code, token) || wordStartsWith(sku, token);
    const inBrand = wordStartsWith(brand, token);

    if (!inName && !inCode && !inBrand) return 0; // termo não encontrado => descarta

    if (inName) {
      nameHits += 1;
      score += wordEquals(name, token) ? 60 : 40;
    }
    if (inCode) score += 45;
    if (inBrand) score += 15;
    if (wordStartsWith(category, token)) score += 5;
  }

  // Bônus de proximidade com a frase completa
  if (query) {
    if (name === query) score += 1200;
    else if (name.startsWith(`${query} `)) score += 800;
    else if (name.includes(query)) score += 400;
    if (code === query || sku === query) score += 900;
    else if (code.startsWith(query) || sku.startsWith(query)) score += 300;
  }

  // Prioriza quem casa no nome em vez de só na marca
  if (nameHits === tokens.length) score += 250;
  // Nomes mais curtos (mais específicos) primeiro em empates
  score += Math.max(0, 40 - name.length / 4);

  return score;
};


// Helper seguro para validar e formatar datas
const safeFormatDate = (value: any, formatStr: string = 'dd/MM/yyyy') => {
  if (!value) return '';
  // Se já for uma string no formato yyyy-MM-dd, adicionamos o T12:00:00 para evitar problemas de fuso
  const dateStr = typeof value === 'string' && value.includes('-') && !value.includes('T') 
    ? `${value}T12:00:00` 
    : value;
    
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.warn('[Quotes] Data inválida detectada:', value);
    return '';
  }
  return format(date, formatStr, { locale: ptBR });
};

const safeDateValue = (value: any) => {
  if (!value) return '';
  const date = new Date(value.includes('-') && !value.includes('T') ? `${value}T12:00:00` : value);
  if (isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', pre_venda: 'Pré-venda', contato_feito: 'Contato Feito',
  sent: 'Proposta Enviada', negociacao: 'Negociação', approved: 'Aprovado', rejected: 'Rejeitado',
};

const paymentMethodLabels: Record<string, { label: string; icon: any }> = {
  pix: { label: 'PIX', icon: QrCode },
  cartao: { label: 'Cartão', icon: CreditCard },
  boleto: { label: 'Boleto', icon: FileBarChart },
  parceria: { label: 'Parceria', icon: Handshake },
};

const paymentStatusLabels: Record<string, { label: string; icon: any; className: string }> = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  em_andamento: { label: 'Em andamento', icon: CircleDot, className: 'bg-blue-100 text-blue-800 border-blue-200' },
  liquidado: { label: 'Liquidado', icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  faturado: { label: 'Faturado', icon: CheckCircle2, className: 'bg-purple-100 text-purple-800 border-purple-200' },
};

const installmentOptions = Array.from({ length: 24 }, (_, i) => i + 1);

interface QuoteItem {
  id?: string;
  item_number: number;
  product_code: string;
  quantity: number | string;
  model: string;
  brand: string;
  specifications: string;
  unit_price: number | string;
  discount_percent: number | string;
  unit_total: number;
  line_total: number;
  image_url: string;
  is_gift: boolean;
  description_layout?: 'compact' | 'expanded';
  transfer_status?: string | null;
  is_presale?: boolean;
}

const TRANSFER_OPTIONS = [
  { value: 'sc_sp', label: 'SC → SP' },
  { value: 'sc_ce', label: 'SC → CE' },
];

const emptyItem = (): QuoteItem => ({
  item_number: 1, product_code: '', quantity: 1, model: '', brand: '',
  specifications: '', unit_price: 0, discount_percent: 0, unit_total: 0, line_total: 0, image_url: '', is_gift: false,
  description_layout: 'compact',
  transfer_status: null,
  is_presale: false,
});

const shippingMethods = [
  { value: 'correios', label: 'Correios' },
  { value: 'mao_propria', label: 'Mão Própria' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'transportadora', label: 'Transportadora' },
];

const defaultForm = {
  client_id: '', salesperson: '', status: 'draft', notes: '',
  payment_terms: '', shipping_deadline: '', shipping_method: '',
  shipping_cost: 0 as number | string, proposal_validity: '15 dias',
  payment_method: '', payment_status: 'pendente',
  is_reseller: false,
  payment_date: '' as string,
  installments: 1,
  is_split_payment: false,
  split_method_1: '',
  split_value_1: 0 as number | string,
  split_date_1: '' as string,
  split_installments_1: 1,
  split_method_2: '',
  split_value_2: 0 as number | string,
  split_date_2: '' as string,
  split_installments_2: 1,
  manual_total: 0 as number | string,
  use_alt_shipping_address: false,
  shipping_recipient: '',
  shipping_cep: '',
  shipping_address: '',
  shipping_address_number: '',
  shipping_complement: '',
  shipping_neighborhood: '',
  shipping_city: '',
  shipping_state: '',
  shipping_phone: '',
  shipping_notes: '',
  followup_date: '' as string,
  is_demonstration: false,
  demonstration_start_date: '' as string,
  demonstration_end_date: '' as string,
};

const QUICK_ENTRY_STATUSES = ['contato_feito', 'sent', 'negociacao'];

function PaymentDateField({ date, onDateChange, label }: { date: string; onDateChange: (v: string) => void; label: string }) {
  const displayDate = date ? safeFormatDate(date) : 'Selecionar data';
  const selectedDate = date ? new Date(date + 'T12:00:00') : undefined;
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label} <span className="text-destructive">*</span></Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground border-destructive/50")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayDate}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate : undefined}
            onSelect={(d) => onDateChange(d ? format(d, 'yyyy-MM-dd') : '')}
            locale={ptBR}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PaymentMethodFields({ method, date, onDateChange, installments, onInstallmentsChange, label }: {
  method: string;
  date: string;
  onDateChange: (v: string) => void;
  installments: number;
  onInstallmentsChange: (v: number) => void;
  label?: string;
}) {
  if (method === 'pix' || method === 'boleto') {
    return <PaymentDateField date={date} onDateChange={onDateChange} label={method === 'pix' ? (label || 'Data do Pagamento') : 'Vencimento inicial'} />;
  }
  if (method === 'cartao') {
    const max = MAX_CARD_INSTALLMENTS;
    return (
      <div className="space-y-2">
        <Label className="text-xs">Parcelas <span className="text-destructive">*</span></Label>
        <Select value={String(installments)} onValueChange={v => onInstallmentsChange(parseInt(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {installmentOptions.filter(n => n <= max).map(n => (
              <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return null;
}

function SummaryStat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-md border bg-background/60 px-2.5 py-1.5 ${className}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums truncate">{value}</p>
    </div>
  );
}



export default function Quotes() {
  const { user, profile, isGestor, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { isHidden: privacyHidden } = usePrivacy();
  const canViewTeamQuotes = isGestor;
  const [quotes, setQuotes] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [viewClientOpen, setViewClientOpen] = useState(false);
  const [viewClient, setViewClient] = useState<any>(null);
  const [viewClientLoading, setViewClientLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'commercial' | 'demonstration'>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>(() => 'all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sellerProfiles, setSellerProfiles] = useState<{ user_id: string; full_name: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [freightDrawerOpen, setFreightDrawerOpen] = useState(false);
  const [saving, setSavingFlag] = useState(false);
  const [editingQuote, setEditingQuote] = useState<any | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [paymentErrorFields, setPaymentErrorFields] = useState<string[]>([]);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [salespeople, setSalespeople] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [externalLinks, setExternalLinks] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productSearchResults, setProductSearchResults] = useState<Record<number, any[]>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<number | null>(null);
  const [chatQuote, setChatQuote] = useState<{ id: string; number: string } | null>(null);
  const [recycleQuote, setRecycleQuote] = useState<any | null>(null);
  const [recycleDate, setRecycleDate] = useState<Date | undefined>(undefined);
  const [recycleTargetStatus, setRecycleTargetStatus] = useState<string>('pre_venda');
  const [recycling, setRecycling] = useState(false);
  const [recycleReason, setRecycleReason] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepOrigem, setCepOrigem] = useState<string>(() => {
    try { return localStorage.getItem('mci_cep_origem') || ''; } catch { return ''; }
  });
  // Carrega o CEP padrão de expedição salvo em Configurações do Sistema
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('get_default_origin_cep');
        const cep = String(data || '').replace(/\D/g, '');
        if (cep && cep.length === 8) {
          setCepOrigem((prev) => {
            const clean = (prev || '').replace(/\D/g, '');
            if (!clean || clean === '00000000') {
              try { localStorage.setItem('mci_cep_origem', cep); } catch { /* ignore */ }
              return cep;
            }
            return prev;
          });
        }
      } catch { /* ignore */ }
    })();
  }, []);
  const [freightContext, setFreightContext] = useState<{ quoteNumber?: string } | undefined>(undefined);

  // Multi-key lookup: por code, sku, external_product_id, external_sku, external_code, nome normalizado
  const normalize = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const productLookup = useMemo(() => {
    const map = new Map<string, any>();
    const add = (key: any, prod: any) => {
      const k = normalize(key);
      if (k && !map.has(k)) map.set(k, prod);
    };
    const byId = new Map<string, any>();
    for (const p of products) {
      byId.set(p.id, p);
      add(p.code, p);
      add(p.sku, p);
      add(p.name, p);
    }
    for (const link of externalLinks) {
      const prod = byId.get(link.product_id);
      if (!prod) continue;
      add(link.external_product_id, prod);
      add(link.external_sku, prod);
      add(link.external_code, prod);
      add(link.external_name, prod);
    }
    return map;
  }, [products, externalLinks]);

  const findProductForItem = useCallback((it: any) => {
    // 1) Snapshot em runtime — preenchido quando o usuário seleciona um produto
    //    pelo dropdown de busca. Garante que peso/dimensões sejam usados
    //    mesmo quando o produto não estiver no lookup local ou tiver código vazio.
    const snap = (it as any).__product;
    if (snap && (snap.peso_kg || snap.altura_cm)) {
      return { product: snap, matched_by: 'runtime_snapshot' };
    }
    const candidates = [it.product_code, it.code, it.model, it.description];
    for (const c of candidates) {
      const k = normalize(c);
      if (!k) continue;
      const p = productLookup.get(k);
      if (p) return { product: p, matched_by: c };
    }
    return { product: null, matched_by: null };
  }, [productLookup]);

  // Dados consolidados de frete a partir dos itens do orçamento
  const freightData: FreightData = useMemo(() => {
    const totalAmountVal = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
    const diag: any[] = [];
    const built = buildFreightData({
      items: items.map(it => {
        const { product: prod, matched_by } = findProductForItem(it);
        diag.push({
          item_code: it.product_code, model: it.model, matched_by,
          product_id: prod?.id, product_name: prod?.name,
          peso_kg: prod?.peso_kg, altura_cm: prod?.altura_cm,
          largura_cm: prod?.largura_cm, comprimento_cm: prod?.comprimento_cm,
          motivo_sem_dados: !prod
            ? 'produto não localizado no catálogo (verifique vínculo em Mapeamento de Produtos)'
            : (!prod.peso_kg || !prod.altura_cm || !prod.largura_cm || !prod.comprimento_cm)
              ? 'produto encontrado, mas sem peso/dimensões cadastrados'
              : null,
        });
        const hasDims = !!(prod && prod.peso_kg && prod.altura_cm && prod.largura_cm && prod.comprimento_cm);
        return {
          product_code: it.product_code,
          model: it.model,
          description: it.specifications,
          quantity: it.quantity,
          unit_price: it.unit_price,
          vinculado_sem_dados: !!prod && !hasDims,
          product: prod
            ? {
                peso_kg: prod.peso_kg,
                altura_cm: prod.altura_cm,
                largura_cm: prod.largura_cm,
                comprimento_cm: prod.comprimento_cm,
                peso_cubado: prod.peso_cubado,
                volume_m3: prod.volume_m3,
                origem_cep: prod.origem_cep,
                embalagem_tipo: prod.embalagem_tipo,
              }
            : null,
        };
      }),
      cep_origem: cepOrigem,
      cep_destino: form.use_alt_shipping_address ? form.shipping_cep : (clients.find((c: any) => c.id === form.client_id)?.cep || ''),
      valor_mercadoria: totalAmountVal,
    });
    if (items.some(i => i.product_code || i.model)) {
      // eslint-disable-next-line no-console
      console.log('[Frete] Diagnóstico por item:', diag, '→ totais:', {
        peso_total_kg: built.peso_total_kg,
        volume_total_m3: built.volume_total_m3,
        volumes_qtd: built.volumes_qtd,
        cep_origem: built.cep_origem,
        cep_destino: built.cep_destino,
      });
    }
    return built;
  }, [items, findProductForItem, cepOrigem, form.use_alt_shipping_address, form.shipping_cep, form.client_id, clients]);

  // IDs dos produtos do orçamento sem dados logísticos completos
  const productIdsSemDados = useMemo(() => {
    const ids: string[] = [];
    for (const it of items) {
      const { product: prod } = findProductForItem(it);
      if (prod && (!prod.peso_kg || !prod.altura_cm || !prod.largura_cm || !prod.comprimento_cm)) {
        if (!ids.includes(prod.id)) ids.push(prod.id);
      }
    }
    return ids;
  }, [items, findProductForItem]);

  const [syncingFreightLI, setSyncingFreightLI] = useState(false);
  const handleFetchFreightFromLI = async () => {
    if (productIdsSemDados.length === 0) return;
    setSyncingFreightLI(true);
    try {
      const { data, error } = await supabase.functions.invoke('loja-integrada', {
        body: { action: 'sync_product_dimensions', product_ids: productIdsSemDados },
      });
      if (error) throw new Error(error.message);
      if (data?.ok === false) throw new Error(data?.error || 'Falha');
      // Reload just those products' logistics fields
      const { data: fresh } = await db.from('products')
        .select('id, name, brand, code, sku, category_principal, price, description, image_url, peso_kg, altura_cm, largura_cm, comprimento_cm, peso_cubado, volume_m3, origem_cep, embalagem_tipo')
        .in('id', productIdsSemDados);
      if (fresh) {
        setProducts(prev => prev.map(p => fresh.find((f: any) => f.id === p.id) || p));
      }
      const updated = data?.updated ?? 0;
      const notFound = data?.not_found ?? 0;
      if (updated > 0) {
        toast.success(`${updated} produto(s) atualizado(s). Dados de frete recalculados.`);
      } else if (notFound > 0) {
        toast.warning(`Nenhum produto encontrado na Loja Integrada (${notFound} não localizados).`);
      } else {
        toast.info('Nenhum dado logístico disponível na Loja Integrada para estes produtos.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao buscar dados na Loja Integrada');
    } finally {
      setSyncingFreightLI(false);
    }
  };

  const openFreightDrawer = (quoteNumber?: string) => {
    setFreightContext({ quoteNumber });
    setFreightDrawerOpen(true);
  };

  const handleShippingCepChange = async (value: string) => {
    const cleanCep = value.replace(/\D/g, '');
    setForm(p => ({ ...p, shipping_cep: value }));
    
    if (cleanCep.length === 8) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        if (!res.ok) throw new Error('Falha na resposta da API');
        const data = await res.json();
        if (!data.erro) {
          setForm(prev => ({
            ...prev,
            shipping_address: data.logradouro || prev.shipping_address,
            shipping_neighborhood: data.bairro || prev.shipping_neighborhood,
            shipping_city: data.localidade || prev.shipping_city,
            shipping_state: data.uf || prev.shipping_state,
          }));
          toast.success('Endereço de entrega preenchido!');
        }
      } catch (err) {
        console.error('CEP lookup error:', err);
      } finally {
        setCepLoading(false);
      }
    }
  };

  const handleFollowupDateChange = (date: Date | undefined) => {
    setForm(prev => ({ ...prev, followup_date: date ? format(date, 'yyyy-MM-dd') : '' }));
  };

  const loadData = useCallback(async () => {
    try {
      if (!user?.id) {
        setQuotes([]);
        setClients([]);
        setSalespeople([]);
        setProducts([]);
        setSellerProfiles([]);
        return;
      }

      let quotesQuery = db.from('quotes')
        .select('*, clients(company_name, name, phone, is_revenda), quote_items(transfer_status, quantity, is_presale)')
        .order('quote_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1000);
      
      const params = new URLSearchParams(window.location.search);
      const statusFilter = params.get('status');
      
      if (canViewTeamQuotes) {
        if (responsibleFilter === 'me') {
          quotesQuery = quotesQuery.eq('created_by', user.id);
        } else if (responsibleFilter !== 'all') {
          quotesQuery = quotesQuery.eq('created_by', responsibleFilter);
        }
      } else {
        quotesQuery = quotesQuery.eq('created_by', user.id);
      }

      if (statusFilter === 'approved') {
        quotesQuery = quotesQuery.eq('status', 'approved');
      } else if (statusFilter === 'pending') {
        quotesQuery = quotesQuery.in('status', ['draft', 'sent', 'pre_venda', 'pre_sale', 'contato_feito', 'contact_made', 'negociacao', 'negotiation']);
      } else if (statusFilter === 'rejected') {
        quotesQuery = quotesQuery.eq('status', 'rejected');
      }

      const [q, c, s, p, pel] = await Promise.all([
        quotesQuery,
        db.from('clients').select('id, company_name, name, is_revenda, contrib_icms, cep, address, city, state').eq('created_by', user.id).order('company_name'),
        db.from('salespeople').select('id, name, code, active').eq('active', true).order('name'),
        db.from('products').select('id, name, brand, code, sku, category_principal, price, description, image_url, peso_kg, altura_cm, largura_cm, comprimento_cm, peso_cubado, volume_m3, origem_cep, embalagem_tipo').order('name').limit(5000),
        db.from('product_external_links').select('product_id, external_product_id, external_sku, external_code, external_name'),
      ]);
      setQuotes(q.data || []);
      setClients(c.data || []);
      setSalespeople(s.data || []);
      setProducts(p.data || []);
      setExternalLinks(pel.data || []);

      if (canViewTeamQuotes) {
        // Obter perfis comerciais ativos para o filtro
        const { data: profiles } = await db.from('profiles')
          .select('user_id, full_name, role, commercial_visible')
          .eq('active', true);
        
        const filteredProfiles = (profiles || []).filter((p: any) => {
          const role = (p.role || '').toLowerCase();
          // Admin aparece se commercial_visible for true ou se tiver role admin (conforme regra)
          // Mas regra diz: "Admin deve aparecer se também atuar como vendedor" -> commercial_visible serve pra isso
          const isCommercial = ['vendedor', 'comercial', 'gestor', 'admin'].includes(role);
          const isHidden = ['financeiro', 'logistica'].includes(role);
          return p.full_name && isCommercial && !isHidden;
        });
        setSellerProfiles(filteredProfiles);
      }
    } catch (err) {
      console.error('loadData error:', err);
    }
  }, [canViewTeamQuotes, responsibleFilter, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const calcItem = (item: QuoteItem): QuoteItem => {
    if (item.is_gift) {
      return { ...item, unit_total: 0, line_total: 0 };
    }
    const unitPrice = parseFloat(String(item.unit_price)) || 0;
    const discountPercent = parseFloat(String(item.discount_percent)) || 0;
    const quantity = parseFloat(String(item.quantity)) || 0;

    const unitTotal = unitPrice * (1 - discountPercent / 100);
    const lineTotal = unitTotal * quantity;
    return { ...item, unit_total: Math.round(unitTotal * 100) / 100, line_total: Math.round(lineTotal * 100) / 100 };
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = calcItem({ ...updated[index], [field]: value });
      return updated;
    });
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= items.length) return;

    setItems(prev => {
      const reordered = [...prev];
      [reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]];
      return reordered.map((item, index) => ({ ...item, item_number: index + 1 }));
    });

    const swapIndexedValues = <T,>(values: Record<number, T>) => {
      const reordered = { ...values };
      const fromValue = reordered[fromIndex];
      const toValue = reordered[toIndex];
      if (toValue === undefined) delete reordered[fromIndex];
      else reordered[fromIndex] = toValue;
      if (fromValue === undefined) delete reordered[toIndex];
      else reordered[toIndex] = fromValue;
      return reordered;
    };

    setProductSearch(swapIndexedValues);
    setProductSearchResults(swapIndexedValues);
    setShowProductDropdown(current => current === fromIndex ? toIndex : current === toIndex ? fromIndex : current);
  };

  const selectProduct = (idx: number, product: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = calcItem({
        ...updated[idx],
        model: product.name,
        brand: product.brand || '',
        product_code: product.code || '',
        specifications: product.description || '',
        unit_price: parseFloat(product.price) || 0,
        image_url: product.image_url || '',
        // Snapshot logístico em runtime — usado direto no cálculo do frete,
        // sem depender de lookup por código/nome. Não é persistido no DB.
        __product: {
          id: product.id,
          peso_kg: product.peso_kg,
          altura_cm: product.altura_cm,
          largura_cm: product.largura_cm,
          comprimento_cm: product.comprimento_cm,
          peso_cubado: product.peso_cubado,
          volume_m3: product.volume_m3,
          origem_cep: product.origem_cep,
          embalagem_tipo: product.embalagem_tipo,
        },
      } as any);
      return updated;
    });
    setProductSearch(prev => ({ ...prev, [idx]: '' }));
    setProductSearchResults(prev => ({ ...prev, [idx]: [] }));
    setShowProductDropdown(null);
  };

  const searchProductsInDatabase = useCallback(async (idx: number, rawSearch: string) => {
    const tokens = tokenizeProductSearch(rawSearch);
    if (tokens.length === 0) {
      setProductSearchResults(prev => ({ ...prev, [idx]: [] }));
      return;
    }

    const sanitize = (s: string) => s.replace(/[%,()]/g, '');
    const selectCols = 'id, name, brand, code, sku, category_principal, price, description, image_url, peso_kg, altura_cm, largura_cm, comprimento_cm, peso_cubado, volume_m3, origem_cep, embalagem_tipo';
    const normalizedQuery = normalizeProductText(rawSearch);
    const phrase = sanitize(normalizedQuery);

    try {
      const merged = new Map<string, any>();

      // 1) Busca pela frase completa (prioritária)
      if (phrase) {
        const phraseFilters = [
          `name.ilike.%${phrase}%`,
          `brand.ilike.%${phrase}%`,
          `code.ilike.%${phrase}%`,
          `sku.ilike.%${phrase}%`,
        ].join(',');

        const { data: phraseData } = await db.from('products')
          .select(selectCols).or(phraseFilters).limit(100);
        (phraseData || []).forEach((p: any) => merged.set(p.id, p));
      }

      // 2) Para cada token, busca AND-intersected nos resultados (garante todos os termos)
      if (tokens.length > 0) {
        const perTokenResults: any[][] = [];
        for (const t of tokens.slice(0, 5)) {
          const token = sanitize(t);
          if (!token) continue;
          const orF = [
            `name.ilike.%${token}%`,
            `brand.ilike.%${token}%`,
            `code.ilike.%${token}%`,
            `sku.ilike.%${token}%`,

          ].join(',');
          const { data } = await db.from('products')
            .select(selectCols).or(orF).limit(300);
          perTokenResults.push(data || []);
        }
        if (perTokenResults.length > 0) {
          // intersecção: produtos presentes em TODOS os tokens
          const idSets = perTokenResults.map(arr => new Set(arr.map((p: any) => p.id)));
          const base = perTokenResults[0];
          base.forEach((p: any) => {
            if (idSets.every(s => s.has(p.id))) merged.set(p.id, p);
          });
        }
      }

      const ranked = Array.from(merged.values())
        .map((product: any) => ({ product, score: rankProductMatch(product, normalizedQuery, tokens) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ product }) => product)
        .slice(0, 25);

      setProductSearchResults(prev => ({ ...prev, [idx]: ranked }));
    } catch (error: any) {
      console.error('product search error:', error);
    }
  }, []);

  useEffect(() => {
    const timers = Object.entries(productSearch).map(([idxStr, value]) => {
      const idx = Number(idxStr);
      const raw = value || '';
      if (tokenizeProductSearch(raw).length === 0) {
        setProductSearchResults(prev => ({ ...prev, [idx]: [] }));
        return null;
      }
      return window.setTimeout(() => {
        void searchProductsInDatabase(idx, raw);
      }, 250);
    });

    return () => timers.forEach(timer => {
      if (timer) window.clearTimeout(timer);
    });
  }, [productSearch, searchProductsInDatabase]);

  const filteredProductsBySearch = useMemo(() => {
    const searchMap: Record<number, any[]> = {};
    Object.keys(productSearch).forEach(idxStr => {
      const idx = parseInt(idxStr);
      const q = normalizeProductText(productSearch[idx] || '');
      const tokens = tokenizeProductSearch(productSearch[idx] || '');
      if (!q || tokens.length === 0) {
        searchMap[idx] = [];
        return;
      }
      searchMap[idx] = products
        .map((product: any) => ({ product, score: rankProductMatch(product, q, tokens) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ product }) => product)
        .slice(0, 20);
    });
    return searchMap;
  }, [products, productSearch]);

  const getFilteredProducts = (idx: number) => {
    const dbResults = productSearchResults[idx] || [];
    const localResults = filteredProductsBySearch[idx] || [];
    const tokens = tokenizeProductSearch(productSearch[idx] || '');
    const merged = [...dbResults, ...localResults].filter((product, index, list) =>
      list.findIndex(item => item.id === product.id) === index
    );

    // Se existirem produtos cujo NOME contém todos os termos, mostra somente eles
    // (evita listar itens que só casaram por marca/código).
    const nameMatches = merged.filter((p: any) => {
      const name = normalizeProductText(p.name);
      return tokens.every(t => wordStartsWith(name, t));
    });
    const finalList = nameMatches.length > 0 ? nameMatches : merged;

    return finalList
      .map((product: any) => ({
        product,
        score: rankProductMatch(product, normalizeProductText(productSearch[idx] || ''), tokens),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product)
      .slice(0, 20);
  };


  const hasItems = items.some(i => !!i.model);
  
  const totalAmount = hasItems 
    ? items.reduce((sum, item) => sum + (parseFloat(String(item.line_total)) || 0), 0) 
    : (parseFloat(String(form.manual_total)) || 0);
  const grandTotal = totalAmount + (parseFloat(String(form.shipping_cost)) || 0);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // ---- Validação central de pagamento (única fonte de verdade) ----
  const paymentCheck: PaymentValidationResult = useMemo(
    () => validateQuotePaymentTerms(form as any, grandTotal),
    [form, grandTotal],
  );

  const logPaymentBlock = async (quoteId: string | null, action: string, attemptedStatus: string, result: PaymentValidationResult) => {
    try {
      await db.rpc('log_quote_payment_block', {
        _quote_id: quoteId,
        _action: action,
        _attempted_status: attemptedStatus,
        _error_code: result.code || null,
        _missing_fields: result.fields,
      });
    } catch { /* auditoria não bloqueia o fluxo */ }
  };

  const focusPaymentSection = (result: PaymentValidationResult) => {
    setPaymentErrorFields(result.fields);
    paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /** Bloqueia a ação quando o pagamento estiver incompleto. Retorna true se pode prosseguir. */
  const ensurePaymentValid = async (action: string, targetStatus: string): Promise<boolean> => {
    if (!paymentRequiredForStatus(targetStatus)) return true;
    if (paymentCheck.valid) {
      setPaymentErrorFields([]);
      return true;
    }
    focusPaymentSection(paymentCheck);
    toast.error(paymentCheck.message!, { description: paymentCheck.detail });
    await logPaymentBlock(editingQuote?.id || null, action, targetStatus, paymentCheck);
    return false;
  };


  const handleSave = async () => {
    if (saving) {
      console.log('[Quotes.handleSave] Blocked: already saving');
      return;
    }

    const watchdog = setTimeout(() => {
      console.warn('[Quotes.handleSave] Watchdog fired — forcing saving=false (network likely stalled)');
      setSavingFlag(false);
      toast.error('Tempo excedido ao salvar.', {
        description: 'A operação demorou mais que o esperado. Verifique sua conexão e tente novamente.',
      });
    }, 15000); // Reduzido para 15s para ser mais responsivo em falhas de rede

    try {
      // ---- Validações de pré-requisito (sempre com toast) ----
      if (!form.client_id) {
        toast.error('Selecione um cliente');
        return;
      }

      const selectedClient = clients.find((c: any) => c.id === form.client_id);

      // Validate reseller IE
      if (form.is_reseller) {
        const ie = selectedClient?.contrib_icms?.replace(/[.\-/\s]/g, '') || '';
        if (!ie || ie.length < 8 || ie.length > 14) {
          toast.error('Clientes do tipo revenda precisam ter Inscrição Estadual válida cadastrada antes de continuar.', {
            description: 'Edite o cadastro do cliente e preencha a Inscrição Estadual.',
          });
          return;
        }
      }

      const hasAnyItem = items.some(i => !!i.model);
      const canQuickEntry = Number(form.manual_total) > 0 && QUICK_ENTRY_STATUSES.includes(form.status);
      if (!hasAnyItem && !canQuickEntry) {
        toast.error('Adicione pelo menos um item ou informe o valor total da negociação (para status Contato Feito, Proposta Enviada ou Negociação)');
        return;
      }

      // Validação central: obrigatória para qualquer status que não seja rascunho
      if (!(await ensurePaymentValid('save', form.status))) return;
      if (form.status === 'draft' && !paymentCheck.valid) {
        toast.warning('Orçamento salvo como rascunho.', {
          description: 'Informe a forma de pagamento antes de enviar ou avançar esta proposta.',
        });
      }


      setSavingFlag(true);

      let quoteId: string;
      const matchedSeller = salespeople.find((s: any) => s.name === form.salesperson);

      const quoteData: any = {
        client_id: form.client_id, salesperson: form.salesperson, status: form.status,
        salesperson_id: matchedSeller?.id || user?.id || null,
        notes: form.notes, total_amount: grandTotal,
        payment_terms: form.payment_terms, shipping_deadline: form.shipping_deadline,
        shipping_method: form.shipping_method, shipping_cost: Number(form.shipping_cost) || 0,
        proposal_validity: form.proposal_validity,
        followup_date: form.followup_date || null,
        payment_method: form.is_split_payment ? null : (form.payment_method || null),
        payment_status: form.payment_status,
        is_reseller: form.is_reseller,
        payment_date: (!form.is_split_payment && (form.payment_method === 'pix' || form.payment_method === 'boleto') && form.payment_date) ? form.payment_date : null,
        installments: (!form.is_split_payment && (form.payment_method === 'boleto' || form.payment_method === 'cartao')) ? form.installments : 1,
        is_split_payment: form.is_split_payment,
        split_method_1: form.is_split_payment ? (form.split_method_1 || null) : null,
        split_value_1: form.is_split_payment ? (Number(form.split_value_1) || 0) : 0,
        split_date_1: form.is_split_payment && (form.split_method_1 === 'pix' || form.split_method_1 === 'boleto') && form.split_date_1 ? form.split_date_1 : null,
        split_installments_1: form.is_split_payment && (form.split_method_1 === 'boleto' || form.split_method_1 === 'cartao') ? form.split_installments_1 : 1,
        split_method_2: form.is_split_payment ? (form.split_method_2 || null) : null,
        split_value_2: form.is_split_payment ? (Number(form.split_value_2) || 0) : 0,
        split_date_2: form.is_split_payment && (form.split_method_2 === 'pix' || form.split_method_2 === 'boleto') && form.split_date_2 ? form.split_date_2 : null,
        split_installments_2: form.is_split_payment && (form.split_method_2 === 'boleto' || form.split_method_2 === 'cartao') ? form.split_installments_2 : 1,
        use_alt_shipping_address: form.use_alt_shipping_address,
        shipping_recipient: form.use_alt_shipping_address ? (form.shipping_recipient || null) : null,
        shipping_cep: form.use_alt_shipping_address ? (form.shipping_cep || null) : null,
        shipping_address: form.use_alt_shipping_address ? (form.shipping_address || null) : null,
        shipping_address_number: form.use_alt_shipping_address ? (form.shipping_address_number || null) : null,
        shipping_complement: form.use_alt_shipping_address ? (form.shipping_complement || null) : null,
        shipping_neighborhood: form.use_alt_shipping_address ? (form.shipping_neighborhood || null) : null,
        shipping_city: form.use_alt_shipping_address ? (form.shipping_city || null) : null,
        shipping_state: form.use_alt_shipping_address ? (form.shipping_state || null) : null,
        shipping_phone: form.use_alt_shipping_address ? (form.shipping_phone || null) : null,
        shipping_notes: form.use_alt_shipping_address ? (form.shipping_notes || null) : null,
        is_demonstration: !!form.is_demonstration,
        demonstration_start_date: form.is_demonstration ? (form.demonstration_start_date || null) : null,
        demonstration_end_date: form.is_demonstration ? (form.demonstration_end_date || null) : null,
      };

      // Garantir que campos de data nulos ou vazios sejam salvos como null e não strings inválidas
      ['followup_date', 'payment_date', 'split_date_1', 'split_date_2'].forEach(key => {
        if (quoteData[key] === '' || quoteData[key] === undefined) {
          quoteData[key] = null;
        }
      });

      console.log('[Quotes.handleSave] Payload:', { editing: !!editingQuote, quoteData, itemsCount: items.filter(i => i.model).length });

      if (editingQuote) {
        const { error } = await db.from('quotes').update(quoteData).eq('id', editingQuote.id);
        if (error) {
          console.error('[Quotes.handleSave] Update error:', error);
          throw error;
        }
        quoteId = editingQuote.id;
        const { error: delErr } = await db.from('quote_items').delete().eq('quote_id', quoteId);
        if (delErr) console.warn('[Quotes.handleSave] delete items warning:', delErr);
      } else {
        const { data: numData, error: numErr } = await db.rpc('generate_quote_number');
        if (numErr) console.warn('[Quotes.handleSave] generate_quote_number warning:', numErr);
        const { data, error } = await db.from('quotes').insert({
          ...quoteData,
          quote_number: numData || `ORC-${Date.now()}`,
          created_by: user?.id,
          quote_date: format(new Date(), 'yyyy-MM-dd'),
        }).select('id').single();
        if (error) {
          console.error('[Quotes.handleSave] Insert error:', error);
          throw error;
        }
        quoteId = data.id;
      }

      const validItems = items.filter(i => i.model).map((item, idx) => ({
        quote_id: quoteId, item_number: idx + 1, product_code: item.product_code,
        quantity: Number(item.quantity) || 1, model: item.model, brand: item.brand,
        specifications: item.specifications, unit_price: Number(item.unit_price) || 0,
        discount_percent: Number(item.discount_percent) || 0, unit_total: item.unit_total,
        line_total: item.line_total, image_url: item.image_url, is_gift: item.is_gift,
        description_layout: item.description_layout || 'compact',
        transfer_status: item.transfer_status || null,
        is_presale: !!item.is_presale,
      }));

      if (validItems.length > 0) {
        const { error } = await db.from('quote_items').insert(validItems);
        if (error) {
          console.error('[Quotes.handleSave] Insert items error:', error);
          throw error;
        }
      }

      toast.success(editingQuote ? 'Orçamento atualizado!' : 'Orçamento criado!');
      setDialogOpen(false);
      resetForm();
      // Delay reload slightly to allow DB consistency
      setTimeout(() => loadData(), 500);
    } catch (err: any) {
      console.error('[Quotes.handleSave] Unhandled error:', err);
      const msg = err?.message || err?.error_description || err?.hint || 'Erro inesperado ao salvar o orçamento.';
      const code = err?.code ? ` (código: ${err.code})` : '';
      toast.error('Não foi possível salvar o orçamento.', {
        description: msg + code,
      });
    } finally {
      clearTimeout(watchdog);
      setSavingFlag(false);
    }
  };

  const handleEdit = async (quote: any) => {
    try {
      console.log('[Quotes.handleEdit] Iniciando carregamento do orçamento:', { 
        id: quote.id, 
        number: quote.quote_number,
        timestamp: new Date().toISOString() 
      });
      
      const { data: qItems, error: itemsError } = await db.from('quote_items')
        .select('*')
        .eq('quote_id', quote.id)
        .order('item_number');
      
      if (itemsError) {
        console.error('[Quotes.handleEdit] Erro detalhado ao buscar itens:', {
          code: itemsError.code,
          message: itemsError.message,
          details: itemsError.details,
          hint: itemsError.hint
        });
        toast.error('Erro ao carregar itens do banco de dados', {
          description: `Causa: ${itemsError.message} (Código: ${itemsError.code})`
        });
      }

      // Log dos campos de data recebidos para depuração
      console.log('[Quotes.handleEdit] Payload recebido para edição:', {
        id: quote.id,
        quote_date: quote.quote_date,
        payment_date: quote.payment_date,
        split_date_1: quote.split_date_1,
        split_date_2: quote.split_date_2,
        followup_date: quote.followup_date,
        created_at: quote.created_at
      });

      // Preparação dos dados do formulário com validação de tipos e datas seguras
      const formData = {
        client_id: quote.client_id || '', 
        salesperson: quote.salesperson || '',
        status: quote.status, 
        notes: quote.notes || '',
        payment_terms: quote.payment_terms || '', 
        shipping_deadline: quote.shipping_deadline || '',
        shipping_method: quote.shipping_method || '',
        shipping_cost: parseFloat(quote.shipping_cost) || 0,
        proposal_validity: quote.proposal_validity || '15 dias',
        payment_method: quote.payment_method || '', 
        payment_status: quote.payment_status || 'pendente',
        is_reseller: quote.is_reseller || quote.clients?.is_revenda || clients.find((c: any) => c.id === quote.client_id)?.is_revenda || false,
        payment_date: quote.payment_date || '',
        installments: quote.installments || 1,
        is_split_payment: quote.is_split_payment || false,
        split_method_1: quote.split_method_1 || '',
        split_value_1: parseFloat(quote.split_value_1) || 0,
        split_date_1: quote.split_date_1 || '',
        split_installments_1: quote.split_installments_1 || 1,
        split_method_2: quote.split_method_2 || '',
        split_value_2: parseFloat(quote.split_value_2) || 0,
        split_date_2: quote.split_date_2 || '',
        split_installments_2: quote.split_installments_2 || 1,
        manual_total: (!qItems || qItems.length === 0) ? (parseFloat(quote.total_amount) || 0) : 0,
        use_alt_shipping_address: quote.use_alt_shipping_address || false,
        shipping_recipient: quote.shipping_recipient || '',
        shipping_cep: quote.shipping_cep || '',
        shipping_address: quote.shipping_address || '',
        shipping_address_number: quote.shipping_address_number || '',
        shipping_complement: quote.shipping_complement || '',
        shipping_neighborhood: quote.shipping_neighborhood || '',
        shipping_city: quote.shipping_city || '',
        shipping_state: quote.shipping_state || '',
        shipping_phone: quote.shipping_phone || '',
        shipping_notes: quote.shipping_notes || '',
        followup_date: safeDateValue(quote.followup_date),
        is_demonstration: quote.is_demonstration || false,
        demonstration_start_date: safeDateValue(quote.demonstration_start_date),
        demonstration_end_date: safeDateValue(quote.demonstration_end_date),
      };

      console.log('[Quotes.handleEdit] Sucesso no processamento dos dados:', {
        itemsCount: qItems?.length || 0,
        quoteId: quote.id,
        parsedFollowup: formData.followup_date
      });

      setEditingQuote(quote);
      setItems(qItems && qItems.length > 0 ? qItems : [emptyItem()]);
      setForm(formData);
      setSearchParams({ edit: 'true' });
      setDialogOpen(true);
      
    } catch (err: any) {
      console.error('[Quotes.handleEdit] Erro crítico não tratado:', err);
      toast.error('Não foi possível abrir o editor', {
        description: `Erro: ${err.message || 'Falha na renderização dos dados do orçamento'}`
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este orçamento?')) return;
    const { error } = await db.rpc('delete_quote_cascade', { p_quote_id: id });
    if (error) toast.error(error.message);
    else { toast.success('Orçamento excluído'); loadData(); }
  };

  const handleDuplicate = async (quote: any) => {
    try {
      const { data: qItems } = await db.from('quote_items').select('*').eq('quote_id', quote.id).order('item_number');
      const { data: numData } = await db.rpc('generate_quote_number');
      const { data: newQuote, error } = await db.from('quotes').insert({
        client_id: quote.client_id, client_name: quote.client_name,
        salesperson: quote.salesperson, salesperson_id: quote.salesperson_id,
        status: 'draft', notes: quote.notes,
        payment_terms: quote.payment_terms, shipping_deadline: quote.shipping_deadline,
        shipping_method: quote.shipping_method, shipping_cost: quote.shipping_cost,
        proposal_validity: quote.proposal_validity, payment_method: quote.payment_method,
        payment_status: 'pendente', total_amount: quote.total_amount, total: quote.total,
        discount: quote.discount, quote_number: numData || `ORC-${Date.now()}`,
        created_by: user?.id, is_reseller: quote.is_reseller || false,
        payment_date: quote.payment_date || null,
        installments: quote.installments || 1,
        is_split_payment: quote.is_split_payment || false,
        split_method_1: quote.split_method_1 || null,
        split_value_1: quote.split_value_1 || 0,
        split_date_1: quote.split_date_1 || null,
        split_installments_1: quote.split_installments_1 || 1,
        split_method_2: quote.split_method_2 || null,
        split_value_2: quote.split_value_2 || 0,
        split_date_2: quote.split_date_2 || null,
        split_installments_2: quote.split_installments_2 || 1,
        is_demonstration: quote.is_demonstration || false,
      }).select('id').single();
      if (error) throw error;
      if (qItems?.length > 0) {
        const dupItems = qItems.map((item: any, idx: number) => ({
          quote_id: newQuote.id, item_number: idx + 1, product_code: item.product_code,
          quantity: item.quantity, model: item.model, brand: item.brand, description: item.description || '',
          specifications: item.specifications, unit_price: item.unit_price,
          discount_percent: item.discount_percent, unit_total: item.unit_total,
          line_total: item.line_total, image_url: item.image_url, is_gift: item.is_gift || false,
          transfer_status: item.transfer_status || null,
          is_presale: !!item.is_presale,
        }));
        await db.from('quote_items').insert(dupItems);
      }
      toast.success('Orçamento duplicado com sucesso!');
      loadData();
    } catch (err: any) {
      toast.error('Erro ao duplicar: ' + err.message);
    }
  };

  const isQuoteEligibleForRecycle = (q: any) => {
    // Permite reciclar qualquer orçamento que não esteja em fase final de entrega.
    // (Antes exigia source='loja_integrada' + pagamento liquidado, o que bloqueava
    // propostas antigas/manuais.)
    const st = String(q?.status || '').toLowerCase();
    if (st === 'faturado' || st === 'entregue') return false;
    return true;
  };

  const canRecycle = (q: any) => (isAdmin || isGestor) && isQuoteEligibleForRecycle(q);

  const canRequestRecycle = (q: any) => {
    if (isAdmin || isGestor) return false;
    if (!isQuoteEligibleForRecycle(q)) return false;
    return q?.created_by === user?.id || q?.salesperson_id === user?.id;
  };

  const openRecycleDialog = (q: any) => {
    setRecycleQuote(q);
    setRecycleDate(new Date());
    setRecycleTargetStatus('pre_venda');
  };

  const handleConfirmRecycle = async () => {
    if (!recycleQuote || !recycleDate || !user?.id) return;
    const isApprover = isAdmin || isGestor;
    try {
      setRecycling(true);
      const iso = format(recycleDate, 'yyyy-MM-dd');
      if (isApprover) {
        const { error } = await supabase.from('quotes').update({
          quote_date: iso,
          status: recycleTargetStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', recycleQuote.id);
        if (error) throw error;
        // Registrar no histórico de aprovações como já aprovada
        await supabase.from('quote_recycle_requests').insert({
          quote_id: recycleQuote.id,
          requested_by: user.id,
          target_date: iso,
          target_status: recycleTargetStatus,
          reason: recycleReason || 'Reciclagem direta por admin/gestor',
          status: 'aprovada',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: 'Aprovação automática (admin/gestor reciclou diretamente)',
        });
        toast.success(`Orçamento ${recycleQuote.quote_number} reciclado para ${format(recycleDate, 'dd/MM/yyyy')}`);
      } else {
        const { error } = await supabase.from('quote_recycle_requests').insert({
          quote_id: recycleQuote.id,
          requested_by: user.id,
          target_date: iso,
          target_status: recycleTargetStatus,
          reason: recycleReason || null,
        });
        if (error) throw error;
        toast.success('Solicitação enviada. Aguarde aprovação do admin/gestor.');
      }
      setRecycleQuote(null);
      setRecycleReason('');
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + (err.message || 'desconhecido'));
    } finally {
      setRecycling(false);
    }
  };


  const handleCopyPublicLink = async (quote: any) => {
    if (!(await guardQuoteAction(quote, 'copy_public_link'))) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/quote/${quote.public_token}`;
    navigator.clipboard.writeText(link);
    toast.success('Link público copiado!');
  };

  /** Bloqueio central para ações sobre um orçamento já salvo (PDF, envio, status). */
  const guardQuoteAction = async (quote: any, action: string, targetStatus?: string): Promise<boolean> => {
    const status = targetStatus || quote.status;
    if (!paymentRequiredForStatus(status)) return true;
    const result = validateQuotePaymentTerms(quote, parseFloat(String(quote.total_amount)) || 0);
    if (result.valid) return true;
    toast.error(result.message!, { description: result.detail });
    try {
      await db.rpc('log_quote_payment_block', {
        _quote_id: quote.id, _action: action, _attempted_status: status,
        _error_code: result.code || null, _missing_fields: result.fields,
      });
    } catch { /* auditoria não bloqueia o fluxo */ }
    return false;
  };

  const handleExportPdf = async (quote: any) => {
    if (!(await guardQuoteAction(quote, 'generate_pdf'))) return;
    try {
      const [{ data: qItems }, { data: clientData }] = await Promise.all([
        db.from('quote_items').select('*').eq('quote_id', quote.id).order('item_number'),
        db.from('clients').select('*').eq('id', quote.client_id).maybeSingle(),
      ]);
      const mergedQuote = { ...quote, is_reseller: quote.is_reseller || clientData?.is_revenda || false };
      await generateQuotePdf(mergedQuote, qItems || [], clientData);
      toast.success('PDF gerado!');
    } catch (err: any) {
      toast.error('Erro ao gerar PDF: ' + err.message);
    }
  };

  const [whatsappLoading, setWhatsappLoading] = useState<string | null>(null);

  const handleWhatsAppWithPdf = async (quote: any) => {
    if (!quote.clients?.phone) return;
    if (!(await guardQuoteAction(quote, 'send_to_client'))) return;
    setWhatsappLoading(quote.id);
    try {
      const phone = quote.clients.phone.replace(/\D/g, '');
      const clientName = quote.clients?.company_name || quote.clients?.name || quote.client_name || 'Cliente';
      const total = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(quote.total_amount) || 0);
      const publicLink = `${window.location.origin}/quote/${quote.public_token}`;
      const sellerName = profile?.full_name || '';
      let message = `Olá ${clientName}! 👋\n\nPreparei seu orçamento:\n\n📋 *${quote.quote_number}*\n💰 Valor: *${total}*\n\n📄 Ver proposta: ${publicLink}\n\nSe precisar de ajustes ou tiver dúvidas, estou à disposição 🙂`;
      if (sellerName) message += `\n\nAtenciosamente,\n*${sellerName}*`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    } catch (err: any) {
      toast.error('Erro ao preparar WhatsApp: ' + err.message);
    } finally {
      setWhatsappLoading(null);
    }
  };

  const getDefaultSalesperson = useCallback(() => {
    if (!profile?.full_name) return '';
    if (salespeople.length > 0) {
      const exact = salespeople.find((s: any) => s.name === profile.full_name);
      if (exact) return exact.name;
      const match = salespeople.find((s: any) => s.name?.toLowerCase().trim() === profile.full_name.toLowerCase().trim());
      if (match) return match.name;
      const partial = salespeople.find((s: any) =>
        s.name?.toLowerCase().includes(profile.full_name.toLowerCase()) ||
        profile.full_name.toLowerCase().includes(s.name?.toLowerCase())
      );
      if (partial) return partial.name;
    }
    return profile.full_name;
  }, [profile?.full_name, salespeople]);

  useEffect(() => {
    if (!editingQuote) {
      const defaultSp = getDefaultSalesperson();
      if (defaultSp) {
        setForm(prev => {
          if (prev.salesperson && prev.salesperson !== '') return prev;
          return { ...prev, salesperson: defaultSp };
        });
      }
    }
  }, [getDefaultSalesperson, editingQuote]);

  const resetForm = () => {
    setEditingQuote(null);
    const defaultSp = getDefaultSalesperson();
    setForm({ ...defaultForm, salesperson: defaultSp });
    setItems([emptyItem()]);
  };

  useEffect(() => {
    const cid = searchParams.get('client_id');
    const isNew = searchParams.get('new') || searchParams.get('create') === 'true';
    if (isNew && cid && clients.length > 0) {
      const exists = clients.some((c: any) => c.id === cid);
      if (exists) {
        setEditingQuote(null);
        const defaultSp = getDefaultSalesperson();
        setForm({ ...defaultForm, salesperson: defaultSp, client_id: cid });
        setItems([emptyItem()]);
        setDialogOpen(true);
      } else {
        toast.error('Cliente não encontrado ou sem acesso');
      }
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('new');
      newParams.delete('create');
      newParams.delete('client_id');
      setSearchParams(newParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const baseFiltered = quotes.filter((q: any) => {
    if (canViewTeamQuotes) {
      if (responsibleFilter === 'me') {
        if (q.created_by !== user?.id) return false;
      } else if (responsibleFilter !== 'all') {
        if (q.created_by !== responsibleFilter) return false;
      }
    } else {
      if (q.created_by !== user?.id) return false;
    }
    const s = search.toLowerCase();
    if (!s) return true;
    return q.quote_number?.toLowerCase().includes(s) ||
      q.client_name?.toLowerCase()?.includes(s) ||
      q.clients?.name?.toLowerCase()?.includes(s) ||
      q.clients?.company_name?.toLowerCase()?.includes(s);
  });

  const matchesStatusChip = (q: any, key: string) => {
    switch (key) {
      case 'all': return true;
      case 'approved': return q.status === 'approved';
      case 'pre_venda': return q.status === 'pre_venda' || q.status === 'pre_sale';
      case 'contato_feito': return q.status === 'contato_feito' || q.status === 'contact_made';
      case 'sent': return q.status === 'sent';
      case 'negociacao': return q.status === 'negociacao' || q.status === 'negotiation';
      case 'rejected': return q.status === 'rejected';
      case 'imported': return q.source && q.source !== 'manual';
      default: return true;
    }
  };

  const statusChips: { key: string; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'approved', label: 'Aprovados' },
    { key: 'pre_venda', label: 'Pré-venda' },
    { key: 'contato_feito', label: 'Contato Feito' },
    { key: 'sent', label: 'Proposta Enviada' },
    { key: 'negociacao', label: 'Negociação' },
    { key: 'rejected', label: 'Rejeitados' },
    { key: 'imported', label: 'Importados' },
  ];

  const dateFilteredBase = baseFiltered.filter((q: any) => {
    if (!dateFrom && !dateTo) return true;
    const raw = q.quote_date || q.created_at;
    if (!raw) return false;
    const d = new Date(typeof raw === 'string' && raw.includes('-') && !raw.includes('T') ? `${raw}T12:00:00` : raw);
    if (isNaN(d.getTime())) return false;
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0,0,0,0);
      if (d < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23,59,59,999);
      if (d > to) return false;
    }
    return true;
  });

  const statusCounts = statusChips.reduce((acc, c) => {
    acc[c.key] = dateFilteredBase.filter(q => matchesStatusChip(q, c.key)).length;
    return acc;
  }, {} as Record<string, number>);

  const statusTotals = statusChips.reduce((acc, c) => {
    acc[c.key] = dateFilteredBase
      .filter(q => matchesStatusChip(q, c.key))
      .reduce((s, q: any) => s + (parseFloat(q.total_amount) || 0), 0);
    return acc;
  }, {} as Record<string, number>);

  const typeFiltered = dateFilteredBase.filter((q: any) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'demonstration') return !!q.is_demonstration;
    return !q.is_demonstration;
  });
  const filtered = typeFiltered.filter(q => matchesStatusChip(q, statusFilter));
  const filteredTotal = statusTotals[statusFilter] ?? 0;

  // Pagination (20 per page, client-side over already-permission-filtered data)
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, responsibleFilter, dateFrom, dateTo]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const showingFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + PAGE_SIZE, filtered.length);

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safePage > 3) pages.push('ellipsis');
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (safePage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  // Helper to render split payment summary for listings
  const renderPaymentInfo = (q: any) => {
    if (q.is_split_payment) {
      const m1 = paymentMethodLabels[q.split_method_1];
      const m2 = paymentMethodLabels[q.split_method_2];
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <SplitSquareVertical className="h-3 w-3 text-primary" />
          {m1?.label || '?'} + {m2?.label || '?'}
        </span>
      );
    }
    const pm = paymentMethodLabels[q.payment_method];
    if (!pm) return <span className="text-muted-foreground text-xs">—</span>;
    const PmIcon = pm.icon;
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted border border-border">
        <PmIcon className="h-3 w-3" /> {pm.label}
        {q.installments > 1 && ` ${q.installments}x`}
      </span>
    );
  };

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">Orçamentos</h1>
          <p className="text-muted-foreground text-sm">Crie e gerencie seus orçamentos</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="gap-2 w-full sm:w-auto min-h-[44px]"
            onClick={() => window.open('/comparador', '_blank')}
          >
            <Search className="h-4 w-4" /> Encontrar equivalente
          </Button>
          <Button
            variant="outline"
            className="gap-2 w-full sm:w-auto min-h-[44px]"
            onClick={() => setFreightDrawerOpen(true)}
          >
            <Truck className="h-4 w-4" /> Calcular Frete
          </Button>
        <Dialog open={dialogOpen} onOpenChange={(o) => {
          if (o && !editingQuote) {
            setForm(prev => ({ ...prev, salesperson: prev.salesperson || getDefaultSalesperson() }));
          }
          setDialogOpen(o);
          if (!o) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full sm:w-auto min-h-[44px]"><Plus className="h-4 w-4" /> Novo Orçamento</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">
                {editingQuote ? `Editar ${editingQuote.quote_number}` : 'Novo Orçamento'}
              </DialogTitle>
            </DialogHeader>

            <QuoteHeader />

            <div className="space-y-6 mt-4">
              {/* Client, Salesperson, Status */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="space-y-2 md:col-span-12 lg:col-span-8">
                  <Label className="text-sm font-semibold mb-1 block">
                    Cliente <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className="h-11 text-sm border-2 focus:ring-primary/20 transition-all bg-white shadow-sm px-4 flex-1 justify-between font-normal"
                        >
                          <span className="truncate text-left">
                            {form.client_id
                              ? (() => {
                                  const c: any = clients.find((c: any) => c.id === form.client_id);
                                  if (!c) return 'Selecione um cliente...';
                                  const label = c.company_name || c.name;
                                  return c.cpf_cnpj ? `${label} — ${c.cpf_cnpj}` : label;
                                })()
                              : <span className="text-muted-foreground">Selecione um cliente...</span>}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                        <Command
                          filter={(value, search) => {
                            if (!search) return 1;
                            const s = search.toLowerCase().replace(/[^a-z0-9]/gi, '');
                            const v = value.toLowerCase().replace(/[^a-z0-9]/gi, '');
                            return v.includes(s) ? 1 : 0;
                          }}
                        >
                          <CommandInput placeholder="Buscar por nome, CNPJ ou CPF..." className="h-10" />
                          <CommandList className="max-h-[320px]">
                            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                            <CommandGroup>
                              {clients.map((c: any) => {
                                const label = c.company_name || c.name || '';
                                const doc = c.cpf_cnpj || '';
                                const email = c.email || '';
                                return (
                                  <CommandItem
                                    key={c.id}
                                    value={`${label} ${doc} ${email}`}
                                    onSelect={() => {
                                      setForm(p => ({
                                        ...p,
                                        client_id: c.id,
                                        is_reseller: c.is_revenda || false,
                                      }));
                                      (document.activeElement as HTMLElement)?.blur();
                                    }}
                                    className="py-2.5"
                                  >
                                    <Check className={cn('mr-2 h-4 w-4', form.client_id === c.id ? 'opacity-100' : 'opacity-0')} />
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-medium text-sm truncate">{label}</span>
                                      {doc && <span className="text-xs text-muted-foreground">{doc}</span>}
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      disabled={!form.client_id}
                      title="Visualizar dados do cliente"
                      onClick={async () => {
                        if (!form.client_id) return;
                        setViewClientOpen(true);
                        setViewClientLoading(true);
                        setViewClient(null);
                        const { data } = await db.from('clients').select('*').eq('id', form.client_id).maybeSingle();
                        setViewClient(data);
                        setViewClientLoading(false);
                      }}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 md:col-span-12 lg:col-span-4">
                  <Label className="text-sm font-semibold">Vendedor</Label>
                  {!isAdmin && !isGestor ? (
                    <Input value={form.salesperson || profile?.full_name || ''} readOnly className="bg-muted cursor-not-allowed" />
                  ) : (
                    <Select value={form.salesperson} onValueChange={v => setForm(p => ({ ...p, salesperson: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                      <SelectContent>
                        {salespeople.map((s: any) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 md:col-span-12 lg:col-span-12 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Status</Label>
                    <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="pre_venda">Pré-venda</SelectItem>
                        <SelectItem value="contato_feito">Contato Feito</SelectItem>
                        <SelectItem value="sent">Proposta Enviada</SelectItem>
                        <SelectItem value="negociacao">Negociação</SelectItem>
                        <SelectItem value="approved">Aprovado</SelectItem>
                        <SelectItem value="rejected">Rejeitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Validade da Proposta</Label>
                    <Input className="h-10" value={form.proposal_validity} onChange={e => setForm(p => ({ ...p, proposal_validity: e.target.value }))} placeholder="Ex: 15 dias" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Data de Follow-up</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full h-10 justify-start text-left font-normal",
                            !form.followup_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.followup_date ? safeFormatDate(form.followup_date) : <span>Selecionar data</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.followup_date ? new Date(form.followup_date + 'T12:00:00') : undefined}
                          onSelect={handleFollowupDateChange}
                          initialFocus
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Tipo da Proposta */}
              <div className="space-y-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="is-demonstration" className="text-sm font-semibold cursor-pointer">
                      Marcar como Demonstração
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Quando ativado, a proposta exibirá o selo <strong>DEMONSTRAÇÃO</strong> e o sistema enviará lembretes automáticos antes do fim do prazo (7d / 3d / no dia / vencido).
                    </p>
                  </div>
                  <Switch
                    id="is-demonstration"
                    checked={!!form.is_demonstration}
                    onCheckedChange={(checked) => setForm(p => {
                      if (!checked) {
                        return { ...p, is_demonstration: false, demonstration_start_date: '', demonstration_end_date: '' };
                      }
                      const today = new Date();
                      const end = new Date();
                      end.setDate(end.getDate() + 30);
                      return {
                        ...p,
                        is_demonstration: true,
                        is_reseller: false,
                        demonstration_start_date: p.demonstration_start_date || today.toISOString().slice(0, 10),
                        demonstration_end_date: p.demonstration_end_date || end.toISOString().slice(0, 10),
                      };
                    })}
                  />
                </div>
                {form.is_demonstration && (() => {
                  const canExtend = isAdmin || isGestor;
                  const startStr = form.demonstration_start_date || new Date().toISOString().slice(0, 10);
                  const startDate = new Date(startStr + 'T00:00:00');
                  const maxEndDate = new Date(startDate);
                  maxEndDate.setDate(maxEndDate.getDate() + 30);
                  const maxEndStr = maxEndDate.toISOString().slice(0, 10);
                  return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200">
                    <div>
                      <Label className="text-xs">Início da demonstração</Label>
                      <Input
                        type="date"
                        value={form.demonstration_start_date}
                        onChange={e => {
                          const newStart = e.target.value;
                          setForm(p => {
                            let newEnd = p.demonstration_end_date;
                            if (!canExtend && newStart && newEnd) {
                              const s = new Date(newStart + 'T00:00:00');
                              const max = new Date(s);
                              max.setDate(max.getDate() + 30);
                              const maxStr = max.toISOString().slice(0, 10);
                              if (newEnd > maxStr) newEnd = maxStr;
                            }
                            return { ...p, demonstration_start_date: newStart, demonstration_end_date: newEnd };
                          });
                        }}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Fim da demonstração (prazo)</Label>
                      <Input
                        type="date"
                        value={form.demonstration_end_date}
                        min={form.demonstration_start_date || undefined}
                        max={canExtend ? undefined : maxEndStr}
                        onChange={e => {
                          const val = e.target.value;
                          if (!canExtend && val && val > maxEndStr) {
                            toast.error('Prazo máximo: 30 dias', {
                              description: 'Vendedores só podem definir até 30 dias de demonstração. Solicite ao gestor para estender.',
                            });
                            setForm(p => ({ ...p, demonstration_end_date: maxEndStr }));
                            return;
                          }
                          setForm(p => ({ ...p, demonstration_end_date: val }));
                        }}
                        className="mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {canExtend
                          ? 'Padrão: 30 dias após o início. Admin/Gestor pode ajustar livremente.'
                          : 'Máximo de 30 dias após o início. Apenas Admin/Gestor pode estender.'}
                      </p>
                    </div>
                  </div>
                  );
                })()}
              </div>


              {/* Quick entry - manual total */}
              {QUICK_ENTRY_STATUSES.includes(form.status) && (
                <div className="p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-semibold">Lançamento rápido</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use este campo para registrar rapidamente o valor da negociação sem adicionar itens neste momento.
                  </p>
                  <div className="max-w-xs">
                    <Label className="text-xs">Valor total da negociação (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={form.manual_total === 0 ? '' : form.manual_total}
                      onChange={e => setForm(p => ({ ...p, manual_total: e.target.value }))}
                      onFocus={e => e.target.select()}
                      placeholder="0,00"
                      className="mt-1"
                    />
                  </div>
                  {Number(form.manual_total) > 0 && !hasItems && (
                    <p className="text-xs text-emerald-600 font-medium">✓ Você pode salvar sem adicionar itens/produtos</p>
                  )}
                </div>
              )}

              {/* Payment Block - reorganized */}
              <div
                ref={paymentSectionRef}
                className={cn(
                  'space-y-4 p-4 rounded-lg border bg-muted/20',
                  paymentErrorFields.length > 0 && 'border-destructive ring-1 ring-destructive/40',
                )}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Pagamento <span className="text-destructive">*</span></Label>
                    <span className={cn(
                      'text-[11px] px-2 py-0.5 rounded-full border font-medium',
                      paymentCheck.valid
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200',
                    )}>
                      {paymentCheck.valid ? 'Pagamento completo' : 'Pagamento pendente'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="split-payment" className="text-xs text-muted-foreground cursor-pointer">Pagamento em dois métodos</Label>
                    <Switch
                      id="split-payment"
                      checked={form.is_split_payment}
                      onCheckedChange={(checked) => setForm(p => ({
                        ...p,
                        is_split_payment: checked,
                        // Reset single payment when enabling split
                        ...(checked ? { payment_method: '', payment_date: '', installments: 1 } : { split_method_1: '', split_method_2: '', split_value_1: 0, split_value_2: 0, split_date_1: '', split_date_2: '', split_installments_1: 1, split_installments_2: 1 }),
                      }))}
                    />
                  </div>
                </div>

                {paymentCheck.valid ? (
                  <p className="text-xs text-muted-foreground">
                    Revisão — Forma de pagamento: <span className="font-medium text-foreground">{describeQuotePayment(form as any)}</span>
                  </p>
                ) : (
                  <p className="text-xs text-destructive font-medium">
                    {paymentCheck.message} {paymentCheck.detail}
                  </p>
                )}


                {!form.is_split_payment ? (
                  /* Single payment mode */
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Método de Pagamento <span className="text-destructive">*</span></Label>
                      <Select value={form.payment_method} onValueChange={v => setForm(p => ({ ...p, payment_method: v, payment_date: '', installments: 1 }))}>
                        <SelectTrigger className={cn(paymentErrorFields.includes('payment_method') && 'border-destructive')}><SelectValue placeholder="Selecionar método" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="cartao">Cartão</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="parceria">Parceria (sem financeiro)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {form.payment_method && (
                      <PaymentMethodFields
                        method={form.payment_method}
                        date={form.payment_date}
                        onDateChange={v => setForm(p => ({ ...p, payment_date: v }))}
                        installments={form.installments}
                        onInstallmentsChange={v => setForm(p => ({ ...p, installments: v }))}
                      />
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs">Observações de pagamento</Label>
                      <Input
                        value={form.payment_terms}
                        onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))}
                        placeholder="Ex: combinar entrega antes do pagamento, etc. (opcional)"
                      />
                    </div>
                  </div>
                ) : (
                  /* Split payment mode */
                  <div className="space-y-4">
                    {/* Method 1 */}
                    <div className="p-3 rounded-md border bg-background space-y-3">
                      <Label className="text-xs font-semibold text-primary">Método 1 — Entrada</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Método</Label>
                          <Select value={form.split_method_1} onValueChange={v => setForm(p => ({ ...p, split_method_1: v, split_date_1: '', split_installments_1: 1 }))}>
                            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pix">PIX</SelectItem>
                              <SelectItem value="cartao">Cartão</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Valor (R$)</Label>
                          <Input type="number" step="0.01" min={0}
                            value={form.split_value_1 === 0 ? '' : form.split_value_1}
                            onChange={e => {
                              const v = e.target.value;
                              const numV = parseFloat(v) || 0;
                              setForm(p => ({ ...p, split_value_1: v, split_value_2: Math.max(0, Math.round((grandTotal - numV) * 100) / 100) }));
                            }}
                            onFocus={e => e.target.select()}
                            placeholder="0,00"
                          />
                        </div>
                        {form.split_method_1 && (
                          <PaymentMethodFields
                            method={form.split_method_1}
                            date={form.split_date_1}
                            onDateChange={v => setForm(p => ({ ...p, split_date_1: v }))}
                            installments={form.split_installments_1}
                            onInstallmentsChange={v => setForm(p => ({ ...p, split_installments_1: v }))}
                          />
                        )}
                      </div>
                    </div>

                    {/* Method 2 */}
                    <div className="p-3 rounded-md border bg-background space-y-3">
                      <Label className="text-xs font-semibold text-primary">Método 2 — Restante</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Método</Label>
                          <Select value={form.split_method_2} onValueChange={v => setForm(p => ({ ...p, split_method_2: v, split_date_2: '', split_installments_2: 1 }))}>
                            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pix">PIX</SelectItem>
                              <SelectItem value="cartao">Cartão</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Valor (R$)</Label>
                          <Input type="number" step="0.01" min={0}
                            value={form.split_value_2 === 0 ? '' : form.split_value_2}
                            onChange={e => {
                              setForm(p => ({ ...p, split_value_2: e.target.value }));
                            }}
                            onFocus={e => e.target.select()}
                            placeholder="0,00"
                          />
                        </div>
                        {form.split_method_2 && (
                          <PaymentMethodFields
                            method={form.split_method_2}
                            date={form.split_date_2}
                            onDateChange={v => setForm(p => ({ ...p, split_date_2: v }))}
                            installments={form.split_installments_2}
                            onInstallmentsChange={v => setForm(p => ({ ...p, split_installments_2: v }))}
                          />
                        )}
                      </div>
                    </div>

                    {/* Split summary */}
                    {Number(form.split_value_1) > 0 || Number(form.split_value_2) > 0 ? (
                      <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                        Método 1: {formatCurrency(Number(form.split_value_1))} + Método 2: {formatCurrency(Number(form.split_value_2))} = {formatCurrency(Number(form.split_value_1) + Number(form.split_value_2))}
                        {Math.abs((Number(form.split_value_1) + Number(form.split_value_2)) - grandTotal) > 0.01 && (
                          <span className="text-destructive ml-2 font-medium">
                            (Diferença de {formatCurrency(Math.abs((Number(form.split_value_1) + Number(form.split_value_2)) - grandTotal))} em relação ao total)
                          </span>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label className="text-xs">Observações de pagamento</Label>
                      <Input
                        value={form.payment_terms}
                        onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))}
                        placeholder="Ex: observações adicionais sobre pagamento (opcional)"
                      />
                    </div>
                  </div>
                )}

                {/* Payment Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                  <div className="space-y-2">
                    <Label className="text-xs">Status do Pagamento</Label>
                    <Select value={form.payment_status} onValueChange={v => setForm(p => ({ ...p, payment_status: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecionar status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_andamento">Em andamento</SelectItem>
                        <SelectItem value="faturado">Faturado</SelectItem>
                        <SelectItem value="liquidado">Liquidado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Aviso de rascunho incompleto */}
                {form.status === 'draft' && !paymentCheck.valid && (
                  <p className="text-xs text-amber-700 font-medium">
                    Rascunho pode ser salvo sem pagamento. Informe a forma de pagamento antes de enviar ou avançar esta proposta.
                  </p>
                )}
              </div>


              {/* Shipping */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border bg-muted/20">
                <div className="space-y-2">
                  <Label>Prazo de Envio</Label>
                  <Input
                    value={form.shipping_deadline}
                    onChange={e => setForm(p => ({ ...p, shipping_deadline: e.target.value }))}
                    placeholder="Ex: 5 dias úteis"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forma de Envio</Label>
                  <Select value={form.shipping_method} onValueChange={v => setForm(p => ({ ...p, shipping_method: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {shippingMethods.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor do Frete (R$)</Label>
                  <Input type="number" step="0.01" min={0}
                    value={form.shipping_cost === 0 ? '' : form.shipping_cost}
                    onChange={e => setForm(p => ({ ...p, shipping_cost: e.target.value }))}
                    onFocus={e => e.target.select()}
                    placeholder="0,00"
                  />
                </div>
              </div>

              {/* Endereço de Entrega Alternativo */}
              <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="use_alt_shipping"
                    checked={form.use_alt_shipping_address}
                    onCheckedChange={(checked) => setForm(p => ({ ...p, use_alt_shipping_address: !!checked }))}
                  />
                  <label htmlFor="use_alt_shipping" className="text-sm font-medium cursor-pointer select-none">
                    Enviar para endereço diferente do cadastro
                  </label>
                </div>

                {form.use_alt_shipping_address && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
                    <div className="space-y-1 md:col-span-6">
                      <Label className="text-xs">Destinatário</Label>
                      <Input value={form.shipping_recipient} maxLength={150}
                        onChange={e => setForm(p => ({ ...p, shipping_recipient: e.target.value }))}
                        placeholder="Nome de quem vai receber" />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs">Telefone</Label>
                      <Input value={form.shipping_phone} maxLength={20}
                        onChange={e => setForm(p => ({ ...p, shipping_phone: e.target.value }))}
                        placeholder="(00) 00000-0000" />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs">CEP</Label>
                      <Input value={form.shipping_cep} maxLength={10}
                        onChange={e => handleShippingCepChange(e.target.value)}
                        placeholder="00000-000" />
                    </div>
                    <div className="space-y-1 md:col-span-7">
                      <Label className="text-xs">Logradouro</Label>
                      <Input value={form.shipping_address} maxLength={200}
                        onChange={e => setForm(p => ({ ...p, shipping_address: e.target.value }))}
                        placeholder="Rua / Avenida" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Número</Label>
                      <Input value={form.shipping_address_number} maxLength={20}
                        onChange={e => setForm(p => ({ ...p, shipping_address_number: e.target.value }))}
                        placeholder="123" />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs">Complemento</Label>
                      <Input value={form.shipping_complement} maxLength={100}
                        onChange={e => setForm(p => ({ ...p, shipping_complement: e.target.value }))}
                        placeholder="Sala, andar..." />
                    </div>
                    <div className="space-y-1 md:col-span-5">
                      <Label className="text-xs">Bairro</Label>
                      <Input value={form.shipping_neighborhood} maxLength={100}
                        onChange={e => setForm(p => ({ ...p, shipping_neighborhood: e.target.value }))} />
                    </div>
                    <div className="space-y-1 md:col-span-5">
                      <Label className="text-xs">Cidade</Label>
                      <Input value={form.shipping_city} maxLength={100}
                        onChange={e => setForm(p => ({ ...p, shipping_city: e.target.value }))} />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">UF</Label>
                      <Input value={form.shipping_state} maxLength={2}
                        onChange={e => setForm(p => ({ ...p, shipping_state: e.target.value.toUpperCase() }))}
                        placeholder="SP" />
                    </div>
                    <div className="space-y-1 md:col-span-12">
                      <Label className="text-xs">Observações de Entrega</Label>
                      <Input value={form.shipping_notes} maxLength={500}
                        onChange={e => setForm(p => ({ ...p, shipping_notes: e.target.value }))}
                        placeholder="Ex: entregar no horário comercial, falar com portaria..." />
                    </div>
                  </div>
                )}
              </div>


              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <Checkbox
                  id="is_reseller"
                  checked={form.is_reseller}
                  onCheckedChange={(checked) => setForm(p => ({ ...p, is_reseller: !!checked }))}
                />
                <label htmlFor="is_reseller" className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                  <Store className="h-4 w-4 text-orange-500" />
                  Cliente Revenda
                </label>
                {form.is_reseller && (() => {
                  const sc = clients.find((c: any) => c.id === form.client_id);
                  const ie = sc?.contrib_icms;
                  return ie ? (
                    <span className="text-xs text-muted-foreground ml-auto">IE: {ie}</span>
                  ) : (
                    <span className="text-xs text-destructive ml-auto">⚠ IE não cadastrada</span>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea rows={4} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observações gerais do orçamento..." />
              </div>

              {/* Follow-up Date */}
              <div className="space-y-2 p-4 rounded-lg border bg-amber-50/30 border-amber-100">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarIcon className="h-4 w-4 text-amber-600" />
                  <Label className="font-semibold text-amber-900">Data do Próximo Follow-up</Label>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full sm:w-[240px] justify-start text-left font-normal bg-white", !form.followup_date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {form.followup_date ? safeFormatDate(form.followup_date) : 'Selecionar data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={form.followup_date ? (new Date(form.followup_date + 'T12:00:00')) : undefined}
                        onSelect={handleFollowupDateChange}
                        locale={ptBR}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-amber-700/70">
                    Defina uma data para ser lembrado de retomar o contato com este cliente.
                  </p>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">Itens do Orçamento</Label>
                  <Button type="button" size="sm" onClick={addItem} className="gap-1 bg-green-600 hover:bg-green-700 text-white">
                    <Plus className="h-3 w-3" /> Adicionar Item
                  </Button>
                </div>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className={cn(
                      "p-4 rounded-lg border bg-muted/30 space-y-3 transition-all",
                      item.transfer_status && "border-2 border-orange-500 bg-orange-50/60 ring-2 ring-orange-200"
                    )}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.model} className="w-12 h-12 object-contain rounded border" onError={e => (e.currentTarget.style.display = 'none')} />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center">
                              <FileText className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          )}
                          <span className="text-sm font-medium break-words flex-1">Item {idx + 1}{item.model ? ` — ${item.model}` : ''}</span>
                          {item.transfer_status && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wide animate-pulse">
                              ⇄ Em Transferência {TRANSFER_OPTIONS.find(o => o.value === item.transfer_status)?.label || ''}
                            </span>
                          )}
                          {item.is_presale && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wide">
                              🏷️ Pré-venda
                            </span>
                          )}
                        </div>
                        {items.length > 1 && (
                          <TooltipProvider delayDuration={300}>
                            <div className="flex shrink-0 items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={idx === 0} onClick={() => moveItem(idx, idx - 1)} aria-label={`Mover item ${idx + 1} para cima`}>
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Mover para cima</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={idx === items.length - 1} onClick={() => moveItem(idx, idx + 1)} aria-label={`Mover item ${idx + 1} para baixo`}>
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Mover para baixo</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeItem(idx)} aria-label={`Remover item ${idx + 1}`}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remover item</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        )}
                      </div>
                      {/* Product Search */}
                      <div className="space-y-1 relative col-span-full">
                        <Label className="text-xs">Buscar Produto (digite para pesquisar)</Label>
                        <Input
                          placeholder="Digite nome, marca ou código do produto..."
                          value={productSearch[idx] || ''}
                          onChange={e => {
                            setProductSearch(prev => ({ ...prev, [idx]: e.target.value }));
                            setShowProductDropdown(idx);
                          }}
                          onFocus={() => setShowProductDropdown(idx)}
                          onBlur={() => setTimeout(() => setShowProductDropdown(null), 200)}
                        />
                        {showProductDropdown === idx && (productSearch[idx] || '').trim() && getFilteredProducts(idx).length === 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                            Nenhum produto encontrado para “{productSearch[idx]}”.
                          </div>
                        )}
                        {showProductDropdown === idx && getFilteredProducts(idx).length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {getFilteredProducts(idx).map((p: any) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-3"
                                onMouseDown={() => selectProduct(idx, p)}
                              >
                                {p.image_url ? (
                                  <img src={p.image_url} alt={p.name} className="w-8 h-8 object-contain rounded border shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 bg-muted rounded border flex items-center justify-center shrink-0">
                                    <FileText className="h-3 w-3 text-muted-foreground/40" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium block whitespace-normal">{p.name}</span>
                                  <span className="text-muted-foreground text-xs">
                                    {[p.brand, p.code || p.sku].filter(Boolean).join(' • ')}{(p.brand || p.code || p.sku) ? ' • ' : ''}{formatCurrency(parseFloat(p.price) || 0)}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {(() => { const lockFields = !isAdmin && !isGestor; return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Modelo *</Label>
                          <Input value={item.model} onChange={e => updateItem(idx, 'model', e.target.value)} readOnly={lockFields} disabled={lockFields} title={lockFields ? 'Selecione um produto da busca acima' : undefined} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Marca</Label>
                          <Input value={item.brand} onChange={e => updateItem(idx, 'brand', e.target.value)} readOnly={lockFields} disabled={lockFields} title={lockFields ? 'Selecione um produto da busca acima' : undefined} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Código</Label>
                          <Input value={item.product_code} onChange={e => updateItem(idx, 'product_code', e.target.value)} readOnly={lockFields} disabled={lockFields} title={lockFields ? 'Selecione um produto da busca acima' : undefined} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Qtd</Label>
                          <Input type="number" min={1} value={item.quantity === 0 ? '' : item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            onFocus={e => e.target.select()} />
                        </div>
                      </div>
                      ); })()}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs">Especificações</Label>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Layout no PDF:</Label>
                            <Select
                              value={item.description_layout || 'compact'}
                              onValueChange={v => updateItem(idx, 'description_layout', v)}
                            >
                              <SelectTrigger className="h-7 w-36 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="compact">Compacto (curto)</SelectItem>
                                <SelectItem value="expanded">Expandido (completo)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Textarea value={item.specifications} rows={2}
                          onChange={e => updateItem(idx, 'specifications', e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Preço Unit. (R$)</Label>
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={item.unit_price === 0 ? '' : item.unit_price} 
                            disabled={true}
                            onChange={e => updateItem(idx, 'unit_price', e.target.value)} 
                            onFocus={e => e.target.select()}
                            className="bg-muted opacity-80 cursor-not-allowed" 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Desconto (%)</Label>
                          <div className="relative">
                            <Input 
                              type="number" 
                              step="0.1" 
                              min={0} 
                              max={100} 
                              value={item.discount_percent === 0 ? '' : item.discount_percent} 
                              disabled={item.is_gift}
                              onChange={e => updateItem(idx, 'discount_percent', e.target.value)} 
                              onFocus={e => e.target.select()}
                              className={cn("pr-7", item.is_gift && "opacity-50")} 
                            />
                            {item.discount_percent !== 0 && item.discount_percent !== '' && !item.is_gift && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                                %
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Valor Unit.</Label>
                          <Input value={item.is_gift ? 'BRINDE' : formatCurrency(item.unit_total)} readOnly className="bg-muted" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Total</Label>
                          <Input value={item.is_gift ? 'BRINDE' : formatCurrency(item.line_total)} readOnly className={`bg-muted font-semibold ${item.is_gift ? 'text-emerald-600' : ''}`} />
                        </div>
                        <div className="space-y-1 flex items-end">
                          <Button
                            type="button"
                            variant={item.is_gift ? 'default' : 'outline'}
                            size="sm"
                            className={`w-full gap-1.5 min-h-[36px] ${item.is_gift ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                            onClick={() => {
                              setItems(prev => {
                                const updated = [...prev];
                                updated[idx] = calcItem({ ...updated[idx], is_gift: !updated[idx].is_gift });
                                return updated;
                              });
                            }}
                          >
                            <Gift className="h-3.5 w-3.5" />
                            {item.is_gift ? 'Brinde ✓' : 'Brinde'}
                          </Button>
                        </div>
                      </div>
                      {/* Transfer Status */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed">
                        <Label className="text-xs font-semibold text-orange-700">Em Transferência:</Label>
                        <div className="flex gap-2 flex-wrap">
                          {TRANSFER_OPTIONS.map(opt => (
                            <Button
                              key={opt.value}
                              type="button"
                              size="sm"
                              variant={item.transfer_status === opt.value ? 'default' : 'outline'}
                              className={cn(
                                "h-7 text-xs gap-1",
                                item.transfer_status === opt.value && "bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
                              )}
                              onClick={() => updateItem(idx, 'transfer_status', item.transfer_status === opt.value ? null : opt.value)}
                            >
                              ⇄ {opt.label}
                            </Button>
                          ))}
                          {item.transfer_status && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => updateItem(idx, 'transfer_status', null)}
                            >
                              Limpar
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Pré-venda */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed">
                        <Label className="text-xs font-semibold text-purple-700">Pré-venda:</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant={item.is_presale ? 'default' : 'outline'}
                          className={cn(
                            "h-7 text-xs gap-1",
                            item.is_presale && "bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                          )}
                          onClick={() => updateItem(idx, 'is_presale', !item.is_presale)}
                        >
                          🏷️ {item.is_presale ? 'Marcado como Pré-venda ✓' : 'Marcar como Pré-venda'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" onClick={addItem} className="mt-3 w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                  <Plus className="h-4 w-4" /> Adicionar Novo Item
                </Button>
              </div>


              {/* Dados para Frete — consolidado a partir dos itens */}
              <div className="p-4 rounded-lg border bg-gradient-to-br from-primary/[0.04] to-transparent space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <Label className="text-sm font-semibold">Dados para Frete</Label>
                    <p className="text-xs text-muted-foreground">Peso e dimensões consolidados dos itens do orçamento.</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="gap-1.5"
                    onClick={() => openFreightDrawer(editingQuote?.quote_number)}
                  >
                    <Truck className="h-3.5 w-3.5" /> Calcular Frete
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">CEP Origem</Label>
                    <Select
                      value={(cepOrigem || '').replace(/\D/g, '')}
                      onValueChange={(v) => {
                        setCepOrigem(v);
                        try { localStorage.setItem('mci_cep_origem', v); } catch { /* noop */ }
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecionar origem…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="05305003">05305-003 · SP</SelectItem>
                        <SelectItem value="88310180">88310-180 · SC</SelectItem>
                        <SelectItem value="60025001">60025-001 · CE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <SummaryStat label="Peso total" value={`${freightData.peso_total_kg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`} />
                  <SummaryStat label="Peso cubado" value={`${freightData.peso_cubado_total_kg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`} />
                  <SummaryStat label="Volumes" value={String(freightData.volumes_qtd || 0)} />
                  <SummaryStat label="Volume" value={`${freightData.volume_total_m3.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³`} />
                  <SummaryStat
                    label="Maiores dims (A×L×C)"
                    value={`${freightData.altura_cm}×${freightData.largura_cm}×${freightData.comprimento_cm} cm`}
                    className="col-span-2"
                  />
                  <SummaryStat label="CEP Destino" value={freightData.cep_destino ? freightData.cep_destino.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '—'} />
                </div>

                {freightData.itens_sem_dados > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <div className="flex items-start gap-2 flex-1">
                      <span>⚠</span>
                      <span>
                        {freightData.itens_vinculados_sem_dados > 0 ? (
                          <>
                            <strong>{freightData.itens_vinculados_sem_dados}</strong> produto(s) vinculado(s) à Loja Integrada,
                            mas sem dados logísticos cadastrados lá (peso ou dimensões).
                            {freightData.itens_sem_dados - freightData.itens_vinculados_sem_dados > 0 && (
                              <> Outros <strong>{freightData.itens_sem_dados - freightData.itens_vinculados_sem_dados}</strong> produto(s) sem vínculo.</>
                            )}
                          </>
                        ) : (
                          <>
                            Existem <strong>{freightData.itens_sem_dados}</strong> produto(s) sem peso ou dimensões cadastrados.
                            Complete os dados em <em>Produtos</em> para calcular o frete com maior precisão.
                          </>
                        )}
                      </span>
                    </div>
                    {productIdsSemDados.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        onClick={handleFetchFreightFromLI}
                        disabled={syncingFreightLI}
                      >
                        {syncingFreightLI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Buscar dados na Loja Integrada
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end p-3 bg-primary/5 rounded-lg">
                <div className="text-right space-y-1">
                  <p className="text-sm text-muted-foreground">Subtotal: {formatCurrency(totalAmount)}</p>
                  {Number(form.shipping_cost) > 0 && <p className="text-sm text-muted-foreground">Frete: {formatCurrency(Number(form.shipping_cost))}</p>}
                  <p className="text-2xl font-bold font-display text-primary">Total: {formatCurrency(grandTotal)}</p>
                </div>
              </div>



              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Orçamento'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <FreightQuoteDrawer
        open={freightDrawerOpen}
        onOpenChange={(o) => { setFreightDrawerOpen(o); if (!o) setFreightContext(undefined); }}
        freightData={freightContext ? freightData : undefined}
        quoteContext={freightContext ? { quoteNumber: freightContext.quoteNumber } : undefined}
        onCepOrigemChange={(cep) => {
          setCepOrigem(cep);
          try { localStorage.setItem('mci_cep_origem', cep); } catch { /* noop */ }
        }}
      />

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'flex-row items-center'}`}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar orçamento..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            {canViewTeamQuotes && (
              <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
                <SelectTrigger className="w-full sm:w-[220px] min-h-[44px]">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Meus Orçamentos</SelectItem>
                  <SelectItem value="all">Todos os Vendedores</SelectItem>
                  {sellerProfiles.filter(s => s.user_id !== user?.id).map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full sm:w-auto min-h-[44px] justify-start text-left font-normal gap-2", !dateFrom && !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4" />
                  {dateFrom || dateTo ? (
                    <span className="text-xs">
                      {dateFrom ? safeFormatDate(format(dateFrom, 'yyyy-MM-dd')) : '...'} - {dateTo ? safeFormatDate(format(dateTo, 'yyyy-MM-dd')) : '...'}
                    </span>
                  ) : (
                    <span className="text-xs">Faixa de data</span>
                  )}
                  {(dateFrom || dateTo) && (
                    <X className="h-3 w-3 ml-1 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDateFrom(undefined); setDateTo(undefined); }} />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: dateFrom, to: dateTo }}
                  onSelect={(range: any) => { setDateFrom(range?.from); setDateTo(range?.to); }}
                  locale={ptBR}
                  numberOfMonths={isMobile ? 1 : 2}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => setTypeFilter(typeFilter === 'demonstration' ? 'all' : 'demonstration')}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === 'demonstration'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : 'bg-background hover:bg-muted border-border text-foreground'
              }`}
            >
              Demonstração
            </button>
          </div>
          <div className="mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {statusChips.map(chip => {
              const active = statusFilter === chip.key;
              const count = statusCounts[chip.key] ?? 0;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(chip.key);
                    if (canViewTeamQuotes) setResponsibleFilter('all');
                  }}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted border-border text-foreground'
                  }`}
                >
                  <span>{chip.label}</span>
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-[10px] font-semibold ${
                    active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2 px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? 'orçamento' : 'orçamentos'}
                {(dateFrom || dateTo) && ' no período selecionado'}
              </p>
              {(dateFrom || dateTo || statusFilter !== 'all' || search || (canViewTeamQuotes && responsibleFilter !== 'all')) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => { setDateFrom(undefined); setDateTo(undefined); setStatusFilter('all'); setSearch(''); if (canViewTeamQuotes) setResponsibleFilter('all'); }}
                >
                  <X className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
            </div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              Total: <span className="text-primary">{privacyHidden ? '••••••••' : formatCurrency(filteredTotal)}</span>
              <PrivacyToggle />
            </p>
          </div>

        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground mt-3">
                {responsibleFilter !== 'me' && responsibleFilter !== 'all' 
                  ? "Este vendedor ainda não possui orçamentos." 
                  : "Nenhum orçamento encontrado"}
              </p>
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {paged.map((q: any) => {
                const ps = paymentStatusLabels[q.payment_status] || paymentStatusLabels.pendente;
                const PsIcon = ps.icon;
                return (
                  <div key={q.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                          <span>{q.quote_number}</span>
                          {renderDemoBadge(q, 'sm')}
                        </p>
                        <p className="text-xs text-muted-foreground">{q.clients?.company_name || q.clients?.name || q.client_name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{safeFormatDate(q.quote_date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">{formatCurrency((parseFloat(q.total_amount) || 0))}</p>
                        {parseFloat(q.shipping_cost) > 0 && (
                          <p className="text-xs text-muted-foreground">Frete: {formatCurrency(parseFloat(q.shipping_cost))}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                        q.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        q.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                        q.status === 'sent' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {statusLabels[q.status] || q.status}
                      </span>
                      {q.source === 'loja_integrada' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                          <ShoppingBag className="h-3 w-3" /> Loja Integrada
                        </span>
                      )}
                      {(q.is_reseller || q.clients?.is_revenda) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                          <Store className="h-3 w-3" /> Revenda
                        </span>
                      )}
                      {renderQuoteItemFlowBadge(q, 'sm')}
                      {renderPaymentInfo(q)}
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${ps.className}`}>
                        <PsIcon className="h-3 w-3" /> {ps.label}
                      </span>
                    </div>
                    <div className="flex gap-1 pt-1 border-t">
                      {q.clients?.phone && (
                        <Button size="sm" variant="ghost" disabled={whatsappLoading === q.id} onClick={() => handleWhatsAppWithPdf(q)} className="min-h-[44px] flex-1">
                          {whatsappLoading === q.id ? <Loader2 className="h-4 w-4 animate-spin text-green-600" /> : <MessageCircle className="h-4 w-4 text-green-600" />}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleCopyPublicLink(q)} className="min-h-[44px] flex-1" title="Link público">
                        <Link2 className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDuplicate(q)} className="min-h-[44px] flex-1">
                        <Copy className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setChatQuote({ id: q.id, number: q.quote_number })} className="min-h-[44px] flex-1" title="Chat interno">
                        <MessageSquare className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleExportPdf(q)} className="min-h-[44px] flex-1">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(q)} className="min-h-[44px] flex-1">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(q.id)} className="min-h-[44px] flex-1">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Orçamento</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Frete</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Financeiro</TableHead>
                  <TableHead className="w-28">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((q: any) => {
                  const ps = paymentStatusLabels[q.payment_status] || paymentStatusLabels.pendente;
                  const PsIcon = ps.icon;
                  return (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-1.5">
                        {q.quote_number}
                        {q.source === 'loja_integrada' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 border border-purple-200">
                            <ShoppingBag className="h-2.5 w-2.5" /> Importado
                          </span>
                        )}
                        {(q.is_reseller || q.clients?.is_revenda) && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            <Store className="h-2.5 w-2.5" /> Revenda
                          </span>
                        )}
                        {renderDemoBadge(q)}
                        {renderQuoteItemFlowBadge(q)}
                      </div>
                    </TableCell>
                    <TableCell>{q.clients?.company_name || q.clients?.name || q.client_name || '-'}</TableCell>
                    <TableCell>{safeFormatDate(q.quote_date)}</TableCell>
                    <TableCell>
                      {parseFloat(q.shipping_cost) > 0 ? (
                        <span className="text-xs font-medium text-muted-foreground">{formatCurrency(parseFloat(q.shipping_cost))}</span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-semibold">{formatCurrency((parseFloat(q.total_amount) || 0))}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        q.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        q.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                        q.status === 'sent' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {q.status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
                        {statusLabels[q.status] || q.status}
                      </span>
                    </TableCell>
                    <TableCell>{renderPaymentInfo(q)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${ps.className}`}>
                        <PsIcon className="h-3 w-3" /> {ps.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ActionMenu 
                        actions={[
                          { 
                            label: "WhatsApp com PDF", 
                            icon: MessageCircle, 
                            onClick: () => handleWhatsAppWithPdf(q),
                            isPrimary: true,
                            isLoading: whatsappLoading === q.id,
                            className: "text-green-600",
                            disabled: !q.clients?.phone
                          },
                          { 
                            label: "Link Público", 
                            icon: Link2, 
                            onClick: () => handleCopyPublicLink(q),
                            className: "text-primary"
                          },
                          { 
                            label: "Duplicar", 
                            icon: Copy, 
                            onClick: () => handleDuplicate(q),
                            className: "text-blue-600"
                          },
                          { 
                            label: "Chat Interno", 
                            icon: MessageSquare, 
                            onClick: () => setChatQuote({ id: q.id, number: q.quote_number }),
                            className: "text-primary"
                          },
                          { 
                            label: "Exportar PDF", 
                            icon: Download, 
                            onClick: () => handleExportPdf(q)
                          },
                          { 
                            label: "Editar", 
                            icon: Pencil, 
                            onClick: () => handleEdit(q),
                            isSecondary: true
                          },
                          ...(canRecycle(q) ? [{
                            label: "Reciclar p/ ciclo",
                            icon: RefreshCw,
                            onClick: () => openRecycleDialog(q),
                            className: "text-purple-600"
                          }] : canRequestRecycle(q) ? [{
                            label: "Solicitar reciclagem",
                            icon: RefreshCw,
                            onClick: () => openRecycleDialog(q),
                            className: "text-purple-600"
                          }] : []),
                          { 
                            label: "Excluir", 
                            icon: Trash2, 
                            onClick: () => handleDelete(q.id),
                            variant: 'destructive'
                          }
                        ]} 
                      />
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {filtered.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Exibindo {showingFrom}–{showingTo} de {filtered.length} orçamento{filtered.length === 1 ? '' : 's'}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1 flex-wrap justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    Anterior
                  </Button>
                  {getPageNumbers().map((p, i) =>
                    p === 'ellipsis' ? (
                      <span key={`e-${i}`} className="px-2 text-muted-foreground text-sm">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === safePage ? 'default' : 'outline'}
                        size="sm"
                        className="min-w-[36px]"
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <QuoteChat
        quoteId={chatQuote?.id || ''}
        quoteNumber={chatQuote?.number || ''}
        open={!!chatQuote}
        onOpenChange={(o) => { if (!o) setChatQuote(null); }}
      />

      <Dialog open={!!recycleQuote} onOpenChange={(o) => { if (!o) setRecycleQuote(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-purple-600" />
              {(isAdmin || isGestor) ? 'Reciclar orçamento para novo ciclo' : 'Solicitar reciclagem'}
            </DialogTitle>
          </DialogHeader>
          {recycleQuote && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/40 border text-sm space-y-1">
                <div><span className="text-muted-foreground">Nº:</span> <strong>{recycleQuote.quote_number}</strong></div>
                <div><span className="text-muted-foreground">Cliente:</span> {recycleQuote.client_name || '-'}</div>
                <div><span className="text-muted-foreground">Data atual:</span> {safeFormatDate(recycleQuote.quote_date)}</div>
              </div>
              <div className="space-y-2">
                <Label>Nova data do ciclo</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {recycleDate ? format(recycleDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Escolher data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={recycleDate} onSelect={setRecycleDate} initialFocus locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Status alvo</Label>
                <Select value={recycleTargetStatus} onValueChange={setRecycleTargetStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_venda">Pré-venda</SelectItem>
                    <SelectItem value="contato_feito">Contato Feito</SelectItem>
                    <SelectItem value="sent">Proposta Enviada</SelectItem>
                    <SelectItem value="negociacao">Negociação</SelectItem>
                    <SelectItem value="approved">Aprovado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!(isAdmin || isGestor) && (
                <div className="space-y-2">
                  <Label>Justificativa (opcional)</Label>
                  <Textarea value={recycleReason} onChange={(e) => setRecycleReason(e.target.value)} placeholder="Explique brevemente o motivo" rows={3} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {(isAdmin || isGestor)
                  ? 'Move este orçamento importado (pago, não faturado) para o ciclo escolhido, mantendo pagamento e itens.'
                  : 'Sua solicitação será enviada aos administradores/gestores para aprovação.'}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setRecycleQuote(null)} disabled={recycling}>Cancelar</Button>
                <Button onClick={handleConfirmRecycle} disabled={recycling || !recycleDate}>
                  {recycling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {(isAdmin || isGestor) ? 'Reciclar' : 'Enviar solicitação'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View client details dialog */}
      <Dialog open={viewClientOpen} onOpenChange={setViewClientOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dados do Cliente</DialogTitle>
          </DialogHeader>
          {viewClientLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !viewClient ? (
            <p className="text-sm text-muted-foreground py-4">Não foi possível carregar os dados.</p>
          ) : (
            <div className="space-y-3 text-sm max-h-[65vh] overflow-y-auto">
              {[
                ['Razão Social / Empresa', viewClient.company_name],
                ['Nome / Responsável', viewClient.name],
                ['CNPJ / CPF', viewClient.cpf_cnpj],
                ['Inscrição Estadual', viewClient.contrib_icms],
                ['E-mail', viewClient.email],
                ['Telefone', viewClient.phone],
                ['Contato', viewClient.contact_name],
                ['Telefone do Contato', viewClient.contact_phone],
                ['CEP', viewClient.cep],
                ['Endereço', viewClient.address],
                ['Número', viewClient.address_number],
                ['Complemento', viewClient.address_complement],
                ['Bairro', viewClient.neighborhood],
                ['Cidade', viewClient.city],
                ['Estado', viewClient.state],
                ['Observações', viewClient.notes],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label as string} className="flex flex-col sm:flex-row sm:justify-between gap-1 border-b pb-2 last:border-0">
                  <span className="text-muted-foreground font-medium">{label}</span>
                  <span className="font-medium text-right break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
