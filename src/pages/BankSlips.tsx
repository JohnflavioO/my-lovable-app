import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  format, isToday, isBefore, startOfDay, addDays,
  parseISO, differenceInDays, isWithinInterval
} from 'date-fns';
import {
  FileSpreadsheet, Download, Search,
  CheckCircle2, AlertTriangle, Clock,
  History, Users, Edit2, Calendar, List, FileText, Wallet, CalendarDays, Trash2, Filter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseCurrencyBR } from '@/utils/currency';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

const readLastBankSlipBatch = () => {
  try {
    return localStorage.getItem('last_bank_slip_batch');
  } catch {
    return null;
  }
};

const writeLastBankSlipBatch = (batchId: string | null) => {
  try {
    if (batchId) localStorage.setItem('last_bank_slip_batch', batchId);
    else localStorage.removeItem('last_bank_slip_batch');
  } catch {
    // O módulo financeiro segue funcionando mesmo se o navegador bloquear armazenamento local.
  }
};

interface BankSlip {
  id: string;
  dda: string;
  lembrete?: string;
  classification?: string;
  nfe_number?: string;
  client_name: string;
  principal_amount: number;
  due_date: string;
  payment_date?: string;
  interest_amount: number;
  fine_amount: number;
  updated_amount: number;
  reference?: string;
  status: string;
  salesperson_name?: string;
  notes?: string;
  created_at: string;
  import_batch_id?: string;
  days_late?: number; // Propriedade virtual para exibição
}

interface ImportBatch {
  id: string;
  filename: string;
  import_date: string;
  total_records: number;
  total_value: number;
  status: 'ativo' | 'arquivado';
}

interface ParsedRow {
  raw: any[];
  originalValues: {
    principal_amount: any;
    interest_amount: any;
    fine_amount: any;
  };
  mapped: {
    dda: string;
    lembrete?: string;
    classification?: string;
    nfe_number?: string;
    client_name: string;
    principal_amount: number;
    due_date: string | null;
    payment_date: string | null;
    interest_amount: number;
    fine_amount: number;
    updated_amount: number;
    reference?: string;
    salesperson_name?: string;
    status: string;
  };
  valid: boolean;
  error?: string;
}

const statusColors: Record<string, string> = {
  'A vencer': 'bg-blue-100 text-blue-800 border-blue-200',
  'Vencido': 'bg-red-100 text-red-800 border-red-200',
  'Pago': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Em aberto': 'bg-gray-100 text-gray-800 border-gray-200',
  'Em negociação': 'bg-purple-100 text-purple-800 border-purple-200',
  'Cancelado': 'bg-slate-100 text-slate-800 border-slate-200',
  'Vence hoje': 'bg-orange-100 text-orange-800 border-orange-200',
};

// ---------- Helpers de parsing da planilha ----------

const cleanText = (v: any): string => {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\u00a0/g, ' ').trim();
};

// A função parseCurrencyBR foi movida para @/utils/currency.ts para facilitar testes unitários.

const htmlToRowsPreservingCurrencyText = (html: string): any[][] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));

  return tables.flatMap(table =>
    Array.from(table.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th,td')).map(cell =>
        cleanText(cell.textContent || '')
      )
    )
  );
};

const parseBool = (v: any): boolean => {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'boolean') return v;
  const s = cleanText(v).toLowerCase();
  return s === 'true' || s === 'sim' || s === 'x' || s === '1' || s === 'verdadeiro';
};

const parseDate = (v: any): string | null => {
  if (!v) return null;
  // Excel date number
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (v instanceof Date) {
    return format(v, 'yyyy-MM-dd');
  }
  const s = cleanText(v);
  if (!s) return null;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return format(dt, 'yyyy-MM-dd');
  return null;
};

// Normaliza texto: minúsculas, sem acentos, sem pontuação extra
const normalizeHeader = (v: any): string => {
  return cleanText(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[().:;,\-_/\\$º°ª"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Sinônimos aceitos por campo (todos já normalizados)
const FIELD_ALIASES: Record<string, string[]> = {
  dda: ['dda'],
  lembrete: ['lembrete', 'reminder'],
  classification: ['classificacao', 'carteira'],
  nfe_number: ['nf e', 'nfe', 'nf', 'nota fiscal', 'n nf e', 'numero nf', 'nosso numero', 'numero documento', 'documento', 'n docto', 'num docto'],
  client_name: ['cliente', 'pagador', 'sacado', 'razao social', 'nome', 'nome cliente', 'nome pagador'],
  principal_amount: ['valor r', 'valor rs', 'valor', 'valor r$', 'principal', 'valor principal', 'valor titulo', 'vlr titulo', 'valor total', 'valor do titulo', 'valor r$'],
  due_date: ['vencimento', 'data vencimento', 'data de vencimento', 'dt vencimento', 'vcto', 'venc'],
  payment_date: ['data pagamento', 'data de pagamento', 'pagamento', 'dt pagamento', 'liquidacao'],
  days_late: ['dias de atraso', 'dias atraso', 'atraso'],
  interest_amount: ['juros'],
  fine_amount: ['multa'],
  reference: ['referencia', 'seu numero', 'observacao', 'obs'],
  a_vencer: ['a vencer'],
  pago: ['pago'],
  vencido: ['vencido'],
  salesperson_name: ['vendedor', 'representante', 'responsavel', 'comercial'],
};

const matchField = (normalizedHeader: string): string | null => {
  if (!normalizedHeader) return null;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalizedHeader)) return field;
  }
  // fallback parcial: começa com algum alias (ex.: "vencimento titulo")
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(a => normalizedHeader === a || normalizedHeader.startsWith(a + ' ') || normalizedHeader.endsWith(' ' + a))) {
      return field;
    }
  }
  return null;
};

const normalizeImportKeyPart = (value: any): string => {
  const text = cleanText(value);
  return /^\d+$/.test(text) ? text.replace(/^0+/, '') || '0' : text;
};

const buildImportKey = (nfeNumber: any, clientName: any, dueDate: any): string =>
  `${normalizeImportKeyPart(nfeNumber)}|${cleanText(clientName)}|${cleanText(dueDate)}`;

// Detecta a linha do cabeçalho procurando colunas conhecidas dentro das primeiras 20 linhas.
// Aceita o cabeçalho se reconhecer >= 2 campos, sendo um deles client_name OU due_date OU principal_amount.
const findHeaderRow = (rows: any[][]): number => {
  let best = { idx: -1, score: 0 };
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    const matched = new Set<string>();
    row.forEach(cell => {
      const f = matchField(normalizeHeader(cell));
      if (f) matched.add(f);
    });
    const hasKey = matched.has('client_name') || matched.has('due_date') || matched.has('principal_amount');
    if (hasKey && matched.size >= 2 && matched.size > best.score) {
      best = { idx: i, score: matched.size };
    }
  }
  return best.idx;
};

// Mapeia índices de coluna por nome do cabeçalho
const buildColumnMap = (headerRow: any[]): Record<string, number> => {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const field = matchField(normalizeHeader(cell));
    if (field && map[field] === undefined) {
      map[field] = idx;
    }
  });
  return map;
};

const parseSheetRows = (rows: any[][]): { parsed: ParsedRow[]; headerIdx: number; colMap: Record<string, number> } => {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) {
    return { parsed: [], headerIdx: -1, colMap: {} };
  }
  const colMap = buildColumnMap(rows[headerIdx]);
  const parsed: ParsedRow[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const get = (key: string) => (colMap[key] !== undefined ? row[colMap[key]] : undefined);

    const client = cleanText(get('client_name'));
    const due = parseDate(get('due_date'));
    
    const rawPrincipal = get('principal_amount');
    const principal = parseCurrencyBR(rawPrincipal);

    // Linha vazia - ignorar silenciosamente
    if (!client && !due && principal === 0) continue;

    const pago = parseBool(get('pago'));
    const vencido = parseBool(get('vencido'));
    const aVencer = parseBool(get('a_vencer'));
    const paymentDate = parseDate(get('payment_date'));

    let status = 'Em aberto';
    if (pago || paymentDate) status = 'Pago';
    else if (vencido) status = 'Vencido';
    else if (aVencer) status = 'A vencer';

    const rawInterest = get('interest_amount');
    const importedInterest = parseCurrencyBR(rawInterest);
    
    const rawFine = get('fine_amount');
    const importedFine = parseCurrencyBR(rawFine);
    
    // Cálculo automático inicial na importação conforme regra de negócio
    const today = startOfDay(new Date());
    const isPaid = status === 'Pago';
    const diffDays = due ? differenceInDays(today, parseISO(due)) : 0;
    const daysLate = isPaid ? 0 : (diffDays > 0 ? diffDays : 0);
    
    let interest = importedInterest;
    let fine = importedFine;
    
    // Regra: Aplicar cálculo automático quando Vencido ou Atrasado não pago se não houver valor importado
    if ((status === 'Vencido' || (daysLate > 0 && !isPaid)) && interest === 0 && fine === 0) {
      interest = (principal * daysLate * 0.06) / 30;
      fine = principal * 0.02;
    }

    const updated = principal + interest + fine;

    const mapped = {
      dda: cleanText(get('dda')) || 'NÃO',
      lembrete: cleanText(get('lembrete')) || undefined,
      classification: cleanText(get('classification')) || undefined,
      nfe_number: cleanText(get('nfe_number')) || undefined,
      client_name: client,
      principal_amount: principal,
      due_date: due,
      payment_date: paymentDate,
      interest_amount: interest,
      fine_amount: fine,
      updated_amount: updated,
      reference: cleanText(get('reference')) || undefined,
      salesperson_name: cleanText(get('salesperson_name')) || undefined,
      status,
    };

    let valid = true;
    let error: string | undefined;
    if (!client) { valid = false; error = 'Cliente ausente'; }
    else if (!due) { valid = false; error = 'Vencimento inválido'; }
    else if (principal <= 0) { valid = false; error = 'Valor principal inválido'; }

    parsed.push({ 
      raw: row, 
      originalValues: {
        principal_amount: rawPrincipal,
        interest_amount: rawInterest,
        fine_amount: rawFine
      },
      mapped, 
      valid, 
      error 
    });
  }

  return { parsed, headerIdx, colMap };
};

// ---------- Componente ----------

export default function BankSlips() {
  const { user, profile } = useAuth();
  const [bankSlips, setBankSlips] = useState<BankSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterBatch, setFilterBatch] = useState('all');
  const [activeView, setActiveView] = useState<'list' | 'sellers'>('list');

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isBatchManagementOpen, setIsBatchManagementOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importMeta, setImportMeta] = useState<{ totalRows: number; valid: number; invalid: number; sheetName: string }>({ totalRows: 0, valid: 0, invalid: 0, sheetName: '' });
  const [lastBatchId, setLastBatchId] = useState<string | null>(() => readLastBankSlipBatch());

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState<BankSlip | null>(null);
  const [systemUsers, setSystemUsers] = useState<string[]>([]);
  const [editForm, setEditForm] = useState({
    interest_amount: 0,
    fine_amount: 0,
    notes: '',
    status: '',
    payment_date: '',
    lembrete: '',
    classification: '',
    salesperson_name: '',
    reference: '',
  });
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadBatches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('financial_import_batches' as any)
        .select('*')
        .order('import_date', { ascending: false });

      if (error) throw error;
      setBatches((data || []) as any[]);
    } catch (error: any) {
      console.error('Erro ao carregar lotes:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bank_slips' as any)
        .select('*');

      if (filterBatch !== 'all') {
        query = query.eq('import_batch_id', filterBatch);
      }

      const { data, error } = await query.order('due_date', { ascending: true });

      if (error) throw error;

      const today = startOfDay(new Date());
      const updatedData = (data || []).map((slip: any) => {
        let status = slip.status;
        const dueDate = parseISO(slip.due_date);
        const principal = parseFloat(slip.principal_amount) || 0;

        // Regra de Negócio: Dias de Atraso
        // se dias_atraso < 0 → considerar 0
        // se boleto estiver pago → dias_atraso = 0
        const isPaid = status === 'Pago';
        const diffDays = differenceInDays(today, dueDate);
        const daysLate = isPaid ? 0 : (diffDays > 0 ? diffDays : 0);

        // Atualização Dinâmica de Status
        if (status !== 'Pago' && status !== 'Cancelado' && status !== 'Em negociação') {
          if (isToday(dueDate)) status = 'Vence hoje';
          else if (isBefore(dueDate, today)) status = 'Vencido';
          else status = 'A vencer';
        }

        // Cálculos Automáticos de Juros e Multa
        // Regra: Aplicar somente quando status = Vencido OU data atual > data de vencimento e não está pago
        let interest = parseFloat(slip.interest_amount) || 0;
        let fine = parseFloat(slip.fine_amount) || 0;

        const isOverdue = status === 'Vencido' || (daysLate > 0 && !isPaid);

        if (isOverdue) {
          // Fórmula Juros: (Principal * Dias * 6%) / 30
          interest = (principal * daysLate * 0.06) / 30;
          // Fórmula Multa: Principal * 2%
          fine = principal * 0.02;
        } else if (isPaid) {
          // Conforme regra: NÃO aplicar juros/multa em boletos pagos
          // (Preservamos o que foi salvo ou zeramos? A regra diz para não aplicar, 
          // mas se já foi pago com juros, o valor salvo deve ser mantido se estivermos visualizando histórico.
          // No entanto, para cálculo EM TEMPO REAL de novos atrasos, seguimos a regra.)
          interest = parseFloat(slip.interest_amount) || 0;
          fine = parseFloat(slip.fine_amount) || 0;
        } else {
          interest = 0;
          fine = 0;
        }

        const updatedAmount = principal + interest + fine;

        return {
          ...slip,
          status,
          days_late: daysLate, // Adicionado para facilitar exibição
          principal_amount: principal,
          interest_amount: interest,
          fine_amount: fine,
          updated_amount: updatedAmount
        };
      });

      setBankSlips(updatedData);
    } catch (error: any) {
      toast.error('Erro ao carregar boletos: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadBatches();
    const fetchUsers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('active', true)
        .or('role.in.("vendedor","comercial"),full_name.eq."John Flavio"');
      
      if (data) {
        // Filtra usuários de teste (que contenham "teste" no nome)
        const names = data
          .map(p => p.full_name)
          .filter(name => !name.toLowerCase().includes('teste'))
          .sort();
        setSystemUsers(names);
      }
    };
    fetchUsers();
  }, [loadData, loadBatches, filterBatch]);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const total = bankSlips.length;
    const totalEmitido = bankSlips.reduce((acc, s) => acc + s.principal_amount, 0);
    const aVencer = bankSlips.filter(s => s.status === 'A vencer' || s.status === 'Vence hoje').reduce((acc, s) => acc + s.updated_amount, 0);
    const pago = bankSlips.filter(s => s.status === 'Pago').reduce((acc, s) => acc + s.updated_amount, 0);
    const vencido = bankSlips.filter(s => s.status === 'Vencido').reduce((acc, s) => acc + s.updated_amount, 0);
    const emAberto = bankSlips.filter(s => s.status !== 'Pago' && s.status !== 'Cancelado').reduce((acc, s) => acc + s.updated_amount, 0);
    const vencendoHojeCount = bankSlips.filter(s => s.status === 'Vence hoje').length;
    const proximos7DiasCount = bankSlips.filter(s => {
      if (s.status === 'Pago' || s.status === 'Cancelado') return false;
      const due = parseISO(s.due_date);
      const in7Days = addDays(today, 7);
      return isWithinInterval(due, { start: today, end: in7Days });
    }).length;

    return { total, totalEmitido, aVencer, pago, vencido, emAberto, vencendoHojeCount, proximos7DiasCount };
  }, [bankSlips]);

  const filteredSlips = useMemo(() => {
    return bankSlips.filter(s => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        s.client_name.toLowerCase().includes(q) ||
        (s.nfe_number || '').toLowerCase().includes(q) ||
        (s.reference || '').toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
      const matchesSeller = filterSeller === 'all' || 
        (filterSeller === 'none' && !s.salesperson_name) ||
        (s.salesperson_name === filterSeller);
      
      let matchesMonth = true;
      if (filterMonth !== 'all') {
        const date = parseISO(s.due_date);
        const monthYear = format(date, 'MM/yyyy');
        matchesMonth = monthYear === filterMonth;
      }

      return matchesSearch && matchesStatus && matchesSeller && matchesMonth;
    });
  }, [bankSlips, search, filterStatus, filterSeller, filterMonth]);

  const sellerGroups = useMemo(() => {
    const groups: Record<string, any> = {};
    bankSlips.forEach(s => {
      const seller = s.salesperson_name || 'Nenhum';
      if (!groups[seller]) {
        groups[seller] = { name: seller, total: 0, pago: 0, vencido: 0, emAberto: 0, count: 0 };
      }
      groups[seller].total += s.updated_amount;
      if (s.status === 'Pago') groups[seller].pago += s.updated_amount;
      else if (s.status === 'Vencido') groups[seller].vencido += s.updated_amount;
      if (s.status !== 'Pago' && s.status !== 'Cancelado') groups[seller].emAberto += s.updated_amount;
      groups[seller].count++;
    });
    return Object.values(groups).sort((a: any, b: any) => b.total - a.total);
  }, [bankSlips]);

  const sellers = useMemo(() => {
    return [...systemUsers].sort();
  }, [systemUsers]);

  const months = useMemo(() => {
    const uniqueMonths = Array.from(new Set(bankSlips.map(s => {
      const date = parseISO(s.due_date);
      return format(date, 'MM/yyyy');
    })));
    return uniqueMonths.sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yB !== yA ? yB - yA : mB - mA; // Orden decrescente
    });
  }, [bankSlips]);

  const handleDeleteSlip = async (slip: BankSlip) => {
    if (!confirm(`Deseja realmente excluir o boleto de ${slip.client_name}?`)) return;
    
    try {
      const { error } = await supabase
        .from('bank_slips' as any)
        .delete()
        .eq('id', slip.id);

      if (error) throw error;
      
      toast.success('Boleto excluído com sucesso!');
      loadData();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    }
  };

  const handleDeleteFiltered = async () => {
    if (filteredSlips.length === 0) return;
    if (!confirm(`Deseja realmente excluir os ${filteredSlips.length} boletos filtrados? Esta ação não pode ser desfeita.`)) return;

    try {
      const ids = filteredSlips.map(s => s.id);
      const { error } = await supabase
        .from('bank_slips' as any)
        .delete()
        .in('id', ids);

      if (error) throw error;

      toast.success(`${ids.length} boletos excluídos!`);
      loadData();
    } catch (error: any) {
      toast.error('Erro ao excluir boletos: ' + error.message);
    }
  };
  const handleUndoImport = async () => {
    if (!lastBatchId) return;
    if (!confirm(`Deseja desfazer a última importação (Lote: ${lastBatchId.slice(0, 8)})? Todos os registros deste lote serão removidos.`)) return;

    try {
      const { error } = await supabase
        .from('bank_slips' as any)
        .delete()
        .eq('import_batch_id', lastBatchId);

      if (error) throw error;

      toast.success(`Importação desfeita com sucesso!`);
      setLastBatchId(null);
      writeLastBankSlipBatch(null);
      loadData();
    } catch (error: any) {
      toast.error('Erro ao desfazer importação: ' + error.message);
    }
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buf = evt.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(buf);

        // Detecta arquivos HTML (ex: Itaú exporta .xls que na verdade é HTML)
        const head = new TextDecoder('latin1').decode(bytes.slice(0, 1000)).trim().toLowerCase();
        const isHtml = head.startsWith('<!doctype') || head.includes('<html') || head.includes('<table') || head.includes('<tr');

        let wb: XLSX.WorkBook | null = null;
        let htmlRows: any[][] | null = null;
        if (isHtml) {
          // Tenta UTF-8, cai para latin-1 se necessário
          let text: string;
          try {
            text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            if (text.includes('\uFFFD')) throw new Error('encoding');
          } catch {
            text = new TextDecoder('latin1').decode(bytes);
          }
          htmlRows = htmlToRowsPreservingCurrencyText(text);
        } else {
          wb = XLSX.read(bytes, { type: 'array', cellDates: true });
        }

        // Procura a aba que contém um cabeçalho válido
        let chosen: { name: string; rows: any[][]; headerIdx: number } | null = null;
        const sheetSummaries: { name: string; firstRows: string[]; detectedCols: string[] }[] = [];

        if (htmlRows) {
          const headerIdx = findHeaderRow(htmlRows);
          if (headerIdx >= 0) chosen = { name: 'Arquivo HTML', rows: htmlRows, headerIdx };
          const detected = headerIdx >= 0 ? Object.keys(buildColumnMap(htmlRows[headerIdx])) : [];
          sheetSummaries.push({
            name: 'Arquivo HTML',
            firstRows: htmlRows.slice(0, 5).map(r => r.map(c => String(c ?? '')).join(' | ')),
            detectedCols: detected,
          });
        }

        for (const name of wb?.SheetNames || []) {
          const ws = wb.Sheets[name];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: '',
            raw: false, // OBRIGATÓRIO: Pegar o texto formatado para não deixar o Excel arredondar ou cortar zeros
          });
          const headerIdx = findHeaderRow(rows);
          if (headerIdx >= 0 && !chosen) {
            chosen = { name, rows, headerIdx };
          }
          // Resumo para mensagem de erro caso nenhuma aba sirva
          const detected = headerIdx >= 0
            ? Object.keys(buildColumnMap(rows[headerIdx]))
            : [];
          sheetSummaries.push({
            name,
            firstRows: rows.slice(0, 5).map(r => r.map(c => String(c ?? '')).join(' | ')),
            detectedCols: detected,
          });
        }

        if (!chosen) {
          const detail = sheetSummaries.map(s =>
            `• Aba "${s.name}":\n   Primeiras linhas:\n   ${s.firstRows.slice(0, 3).join('\n   ')}`
          ).join('\n\n');
          toast.error(
            `Não foi possível localizar o cabeçalho.\nAbas encontradas: ${wb?.SheetNames.join(', ') || 'Arquivo HTML'}.\nCampos obrigatórios faltando: Cliente/Pagador, Vencimento ou Valor(R$).\n\n${detail}`,
            { duration: 15000 }
          );
          return;
        }

        const { parsed, headerIdx } = parseSheetRows(chosen.rows);
        const colMap = buildColumnMap(chosen.rows[chosen.headerIdx]);
        const missing: string[] = [];
        if (colMap.client_name === undefined) missing.push('Cliente/Pagador');
        if (colMap.due_date === undefined) missing.push('Vencimento');
        if (colMap.principal_amount === undefined) missing.push('Valor(R$)');
        if (missing.length > 0) {
          toast.warning(`Cabeçalho localizado na linha ${headerIdx + 1} da aba "${chosen.name}", mas faltam colunas: ${missing.join(', ')}.`);
        } else {
          toast.success(`Cabeçalho localizado na linha ${headerIdx + 1} da aba "${chosen.name}".`);
        }

        const valid = parsed.filter(p => p.valid).length;
        const invalid = parsed.length - valid;

        setParsedRows(parsed);
        setImportMeta({ totalRows: parsed.length, valid, invalid, sheetName: chosen.name });
        setIsImportDialogOpen(true);
      } catch (err: any) {
        toast.error('Erro ao ler arquivo: ' + err.message);
      } finally {
        // Permite reimportar o mesmo arquivo
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processImport = async () => {
    setImporting(true);
    try {
      const validRows = parsedRows.filter(p => p.valid);
      const totalValue = validRows.reduce((acc, row) => acc + (row.mapped.principal_amount || 0), 0);
      
      // Criar o lote primeiro
      const { data: batch, error: batchError } = await supabase
        .from('financial_import_batches' as any)
        .insert({
          company_id: profile?.company_id,
          filename: importMeta.sheetName,
          imported_by: user?.id,
          total_records: validRows.length,
          total_value: totalValue,
          status: 'ativo'
        })
        .select()
        .single();

      if (batchError) throw batchError;
      const batchId = (batch as any).id;

      // Anti-duplicação/correção
      const { data: existing } = await supabase
        .from('bank_slips' as any)
        .select('id, nfe_number, client_name, due_date, principal_amount');

      const existingMap = new Map<string, string[]>();
      (existing || []).forEach((e: any) => {
        const k = buildImportKey(e.nfe_number, e.client_name, e.due_date);
        existingMap.set(k, [...(existingMap.get(k) || []), e.id]);
      });

      let inserted = 0;
      let updatedCount = 0;
      const inserts: any[] = [];
      const updates: { id: string; payload: any }[] = [];

      for (const row of validRows) {
        const m = row.mapped;
        const k = buildImportKey(m.nfe_number, m.client_name, m.due_date);
        const payload: any = {
          dda: m.dda,
          lembrete: m.lembrete,
          classification: m.classification,
          nfe_number: m.nfe_number,
          client_name: m.client_name,
          principal_amount: m.principal_amount,
          interest_amount: m.interest_amount,
          fine_amount: m.fine_amount,
          updated_amount: m.updated_amount,
          due_date: m.due_date,
          payment_date: m.payment_date,
          reference: m.reference,
          salesperson_name: m.salesperson_name,
          status: m.status,
          import_batch_id: batchId,
          company_id: profile?.company_id
        };
        const existsIds = existingMap.get(k);
        if (existsIds?.length) {
          existsIds.forEach(id => updates.push({ id, payload }));
        } else {
          inserts.push({ ...payload, created_by: user?.id });
        }
      }

      if (inserts.length) {
        const { error } = await supabase.from('bank_slips' as any).insert(inserts);
        if (error) throw error;
        inserted = inserts.length;
      }
      for (const u of updates) {
        const { error } = await supabase.from('bank_slips' as any).update(u.payload).eq('id', u.id);
        if (error) throw error;
        updatedCount++;
      }

      setLastBatchId(batchId);
      writeLastBankSlipBatch(batchId);

      toast.success(`Importação concluída: ${inserted} novos, ${updatedCount} atualizados (Lote: ${importMeta.sheetName}).`);
      setIsImportDialogOpen(false);
      setParsedRows([]);
      loadData();
      loadBatches();
    } catch (error: any) {
      toast.error('Erro ao importar: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleOpenEdit = (slip: BankSlip) => {
    setSelectedSlip(slip);
    setEditForm({
      interest_amount: slip.interest_amount,
      fine_amount: slip.fine_amount,
      notes: slip.notes || '',
      status: slip.status,
      payment_date: slip.payment_date || '',
      lembrete: slip.lembrete || '',
      classification: slip.classification || '',
      salesperson_name: slip.salesperson_name || '',
      reference: slip.reference || '',
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedSlip) return;
    try {
      const { error } = await supabase
        .from('bank_slips' as any)
        .update({
          interest_amount: editForm.interest_amount,
          fine_amount: editForm.fine_amount,
          updated_amount: (selectedSlip.principal_amount || 0) + editForm.interest_amount + editForm.fine_amount,
          notes: editForm.notes,
          status: editForm.status,
          payment_date: editForm.payment_date || null,
          lembrete: editForm.lembrete || null,
          classification: editForm.classification || null,
          salesperson_name: editForm.salesperson_name || null,
          reference: editForm.reference || null,
        })
        .eq('id', selectedSlip.id);

      if (error) throw error;

      await supabase.from('bank_slip_history' as any).insert({
        bank_slip_id: selectedSlip.id,
        action: 'Edição de Dados',
        prev_status: selectedSlip.status,
        new_status: editForm.status,
        notes: `Juros: ${editForm.interest_amount}, Multa: ${editForm.fine_amount}`,
        performed_by: user?.id
      });

      toast.success('Dados atualizados!');
      setIsEditModalOpen(false);
      loadData();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Deseja excluir este lote e TODOS os boletos vinculados a ele? Esta ação não pode ser desfeita.')) return;
    
    try {
      const { error } = await supabase
        .from('financial_import_batches' as any)
        .delete()
        .eq('id', batchId);

      if (error) throw error;
      
      toast.success('Lote e boletos excluídos com sucesso.');
      loadData();
      loadBatches();
      if (filterBatch === batchId) setFilterBatch('all');
    } catch (error: any) {
      toast.error('Erro ao excluir lote: ' + error.message);
    }
  };

  const handleArchiveBatch = async (batchId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ativo' ? 'arquivado' : 'ativo';
    try {
      const { error } = await supabase
        .from('financial_import_batches' as any)
        .update({ status: newStatus })
        .eq('id', batchId);

      if (error) throw error;
      
      toast.success(`Lote ${newStatus === 'arquivado' ? 'arquivado' : 'reativado'} com sucesso.`);
      loadBatches();
    } catch (error: any) {
      toast.error('Erro ao alterar status do lote: ' + error.message);
    }
  };

  const handleInlineUpdate = async (id: string, field: string, value: any) => {
    const finalValue = value === 'none' ? null : value;
    const slip = bankSlips.find(s => s.id === id);
    if (!slip) return;

    try {
      const updateData: any = { [field]: finalValue };
      
      // Regras de negócio para status via checkbox
      if (field === 'status') {
        if (value === 'Pago' && !slip.payment_date) {
          updateData.payment_date = format(new Date(), 'yyyy-MM-dd');
        } else if (value !== 'Pago') {
          updateData.payment_date = null;
        }
      }

      const { error } = await supabase
        .from('bank_slips' as any)
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      let oldValue = '';
      if (field === 'dda') oldValue = slip.dda;
      else if (field === 'lembrete') oldValue = slip.lembrete;
      else if (field === 'status') oldValue = slip.status;
      else if (field === 'salesperson_name') oldValue = slip.salesperson_name;
      else if (field === 'reference') oldValue = slip.reference;
      else if (field === 'interest_amount') oldValue = String(slip.interest_amount);
      else if (field === 'fine_amount') oldValue = String(slip.fine_amount);
      
      await supabase.from('bank_slip_history' as any).insert({
        bank_slip_id: id,
        action: 'Edição Rápida',
        notes: `${field.toUpperCase()}: ${oldValue || '-'} -> ${finalValue || '-'}`,
        performed_by: user?.id
      });

      if (field === 'status' || field === 'interest_amount' || field === 'fine_amount') {
        loadData(); // Recarrega para atualizar cálculos de totais e status derivados
      } else {
        setBankSlips(prev => prev.map(s => s.id === id ? { ...s, ...updateData } : s));
      }
      toast.success('Campo atualizado!');
    } catch (error: any) {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  };

  const handleStatusChange = async (slip: BankSlip, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'Pago' && !slip.payment_date) {
        updateData.payment_date = format(new Date(), 'yyyy-MM-dd');
      }
      const { error } = await supabase.from('bank_slips' as any).update(updateData).eq('id', slip.id);
      if (error) throw error;

      await supabase.from('bank_slip_history' as any).insert({
        bank_slip_id: slip.id,
        action: 'Alteração de Status',
        prev_status: slip.status,
        new_status: newStatus,
        performed_by: user?.id
      });

      toast.success('Status atualizado!');
      loadData();
    } catch (error: any) {
      toast.error('Erro ao atualizar status: ' + error.message);
    }
  };

  const openHistory = async (slip: BankSlip) => {
    setSelectedSlip(slip);
    try {
      const { data, error } = await supabase
        .from('bank_slip_history' as any)
        .select('*, performed_by_name:profiles(full_name)')
        .eq('bank_slip_id', slip.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
      setIsHistoryModalOpen(true);
    } catch (error: any) {
      toast.error('Erro ao carregar histórico');
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const calcDaysLate = (slip: BankSlip): number => {
    if (slip.status === 'Pago') return 0;
    const due = parseISO(slip.due_date);
    const today = startOfDay(new Date());
    const diff = differenceInDays(today, due);
    return diff > 0 ? diff : 0;
  };

  const exportReport = () => {
    const dataToExport = filteredSlips.map(s => ({
      'DDA': s.dda || '',
      'Lembrete': s.lembrete || '',
      'Classificação': s.classification || '',
      'NF-e': s.nfe_number || '',
      'Cliente': s.client_name,
      'Principal': s.principal_amount,
      'Vencimento': format(parseISO(s.due_date), 'dd/MM/yyyy'),
      'Data Pagamento': s.payment_date ? format(parseISO(s.payment_date), 'dd/MM/yyyy') : '',
      'Dias de Atraso': calcDaysLate(s),
      'Juros': s.interest_amount,
      'Multa': s.fine_amount,
      'Referência': s.reference || '',
      'Valor Atualizado': s.updated_amount,
      'Status': s.status,
      'Vendedor': s.salesperson_name || '',
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Boletos');
    XLSX.writeFile(wb, `relatorio_boletos_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    toast.success('Relatório exportado!');
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-display">Controle de Boletos</h1>
            <p className="text-gray-500">Importação e gestão de Títulos a Vencer / Vencidos</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastBatchId && (
              <Button variant="ghost" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-2" onClick={handleUndoImport}>
                <History className="h-4 w-4" /> Desfazer Última Importação
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={exportReport} disabled={filteredSlips.length === 0}>
              <Download className="h-4 w-4" /> Relatório
            </Button>
            <Button variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setIsBatchManagementOpen(true)}>
              <List className="h-4 w-4" /> Lotes
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => document.getElementById('excel-upload')?.click()}>
              <FileSpreadsheet className="h-4 w-4" /> Importar
            </Button>
            <input type="file" id="excel-upload" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
          </div>
        </div>

        {/* KPIs - 2 linhas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Total Emitido</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.totalEmitido)}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{stats.total} boletos</p>
                </div>
                <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <FileText className="h-6 w-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">A Vencer</p>
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(stats.aVencer)}</p>
                </div>
                <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Pago</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCurrency(stats.pago)}</p>
                </div>
                <div className="h-12 w-12 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Vencido</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(stats.vencido)}</p>
                </div>
                <div className="h-12 w-12 bg-red-50 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Em Aberto</p>
                  <p className="text-xl font-bold text-purple-600">{formatCurrency(stats.emAberto)}</p>
                </div>
                <div className="h-12 w-12 bg-purple-50 rounded-full flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Quantidade</p>
                  <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                  <p className="text-[10px] text-gray-400 mt-1">boletos no painel</p>
                </div>
                <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Vencendo Hoje</p>
                  <p className="text-xl font-bold text-orange-600">{stats.vencendoHojeCount}</p>
                </div>
                <div className="h-12 w-12 bg-orange-50 rounded-full flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Próximos 7 dias</p>
                  <p className="text-xl font-bold text-amber-600">{stats.proximos7DiasCount}</p>
                </div>
                <div className="h-12 w-12 bg-amber-50 rounded-full flex items-center justify-center">
                  <CalendarDays className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros + view toggle */}
        <div className="flex flex-col md:flex-row gap-4">
          <Card className="flex-1">
            <CardContent className="p-4 flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por cliente, NF-e ou referência..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="w-full md:w-48">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="A vencer">A vencer</SelectItem>
                    <SelectItem value="Vence hoje">Vence hoje</SelectItem>
                    <SelectItem value="Vencido">Vencido</SelectItem>
                    <SelectItem value="Pago">Pago</SelectItem>
                    <SelectItem value="Em negociação">Em negociação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full md:w-48">
                <Select value={filterBatch} onValueChange={setFilterBatch}>
                  <SelectTrigger className="whitespace-nowrap overflow-hidden text-left">
                    <SelectValue placeholder="Lote / Importação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Lotes</SelectItem>
                    {batches.filter(b => b.status === 'ativo' || b.id === filterBatch).map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.filename} ({format(parseISO(b.import_date), 'dd/MM/yy')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full md:w-48">
                <Select value={filterSeller} onValueChange={setFilterSeller}>
                  <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Vendedores</SelectItem>
                    <SelectItem value="Standby">Standby</SelectItem>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {sellers.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full md:w-48">
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger><SelectValue placeholder="Mês Venc." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Meses</SelectItem>
                    {months.map(m => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {filteredSlips.length > 0 && (
                <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2" onClick={handleDeleteFiltered}>
                  <Trash2 className="h-4 w-4" /> Apagar Filtrados
                </Button>
              )}
            </CardContent>
          </Card>
          <div className="flex bg-gray-100 p-1 rounded-lg self-start">
            <Button variant={activeView === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveView('list')} className="gap-2">
              <List className="h-4 w-4" /> Lista
            </Button>
            <Button variant={activeView === 'sellers' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveView('sellers')} className="gap-2">
              <Users className="h-4 w-4" /> Vendedores
            </Button>
          </div>
        </div>

        {/* Tabela */}
        {activeView === 'list' ? (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="w-20">DDA</TableHead>
                    <TableHead className="w-24">Lembrete</TableHead>
                    <TableHead className="w-24">Classif.</TableHead>
                    <TableHead className="w-24">NF-e</TableHead>
                    <TableHead className="min-w-[180px]">Cliente</TableHead>
                    <TableHead className="text-right w-28">Principal</TableHead>
                    <TableHead className="w-28">Vencimento</TableHead>
                    <TableHead className="w-16 text-center">A Vencer</TableHead>
                    <TableHead className="w-16 text-center">Pago</TableHead>
                    <TableHead className="w-16 text-center">Vencido</TableHead>
                    <TableHead className="w-28 text-right">Atraso</TableHead>
                    <TableHead className="w-24 text-right">Juros</TableHead>
                    <TableHead className="w-24 text-right">Multa</TableHead>
                    <TableHead className="min-w-[150px]">Refer.</TableHead>
                    <TableHead className="text-right w-28">Atualizado</TableHead>
                    <TableHead className="min-w-[150px]">Vendedor</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="text-right w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={16} className="h-32 text-center">Carregando...</TableCell></TableRow>
                  ) : filteredSlips.length === 0 ? (
                    <TableRow><TableCell colSpan={16} className="h-32 text-center text-gray-500">Nenhum boleto encontrado.</TableCell></TableRow>
                  ) : (
                    filteredSlips.map((slip) => {
                      const days = slip.days_late || 0;
                      return (
                        <TableRow key={slip.id} className="hover:bg-gray-50/50 text-xs">
                          <TableCell>
                            <Select 
                              value={slip.dda || 'NÃO'} 
                              onValueChange={(val) => handleInlineUpdate(slip.id, 'dda', val)}
                            >
                              <SelectTrigger className="h-7 text-[10px] py-0 px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="SIM">SIM</SelectItem>
                                <SelectItem value="NÃO">NÃO</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={slip.lembrete || 'none'} 
                              onValueChange={(val) => handleInlineUpdate(slip.id, 'lembrete', val)}
                            >
                              <SelectTrigger className={cn(
                                "h-7 text-[10px] py-0 px-2",
                                slip.lembrete === 'P' && "bg-purple-100 text-purple-800",
                                slip.lembrete === 'W' && "bg-blue-100 text-blue-800",
                                slip.lembrete === 'Standby' && "bg-orange-100 text-orange-800",
                                slip.lembrete === 'Vendedor' && "bg-gray-100 text-gray-800"
                              )}>
                                <SelectValue placeholder="-" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="P">P</SelectItem>
                                <SelectItem value="W">W</SelectItem>
                                <SelectItem value="Standby">Standby</SelectItem>
                                <SelectItem value="Vendedor">Vendedor</SelectItem>
                                <SelectItem value="none">-</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="max-w-[100px] truncate">{slip.classification || '-'}</TableCell>
                          <TableCell className="font-mono">{slip.nfe_number || '-'}</TableCell>
                          <TableCell className="font-medium truncate max-w-[150px]">{slip.client_name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(slip.principal_amount)}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
                              slip.status === 'Vencido' ? "bg-red-50 text-red-700" :
                              slip.status === 'Vence hoje' ? "bg-orange-50 text-orange-700" : ""
                            )}>
                              {slip.due_date ? format(parseISO(slip.due_date), 'dd/MM/yyyy') : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox 
                              checked={slip.status === 'A vencer' || slip.status === 'Vence hoje' || slip.status === 'Em aberto'} 
                              onCheckedChange={(checked) => checked && handleInlineUpdate(slip.id, 'status', 'A vencer')}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox 
                              checked={slip.status === 'Pago'} 
                              onCheckedChange={(checked) => checked && handleInlineUpdate(slip.id, 'status', 'Pago')}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox 
                              checked={slip.status === 'Vencido'} 
                              onCheckedChange={(checked) => checked && handleInlineUpdate(slip.id, 'status', 'Vencido')}
                            />
                          </TableCell>
                          <TableCell className={cn("text-right", days > 0 && "text-red-600 font-semibold")}>{days > 0 ? `${days}d` : '-'}</TableCell>
                          <TableCell className="text-right p-1">
                            <Input 
                              type="number" 
                              className="h-7 text-[10px] text-right" 
                              key={`interest-${slip.id}-${slip.interest_amount}`}
                              defaultValue={slip.interest_amount}
                              onBlur={(e) => handleInlineUpdate(slip.id, 'interest_amount', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-right p-1">
                            <Input 
                              type="number" 
                              className="h-7 text-[10px] text-right" 
                              key={`fine-${slip.id}-${slip.fine_amount}`}
                              defaultValue={slip.fine_amount}
                              onBlur={(e) => handleInlineUpdate(slip.id, 'fine_amount', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              className="h-7 text-[10px]" 
                              defaultValue={slip.reference || ''}
                              onBlur={(e) => handleInlineUpdate(slip.id, 'reference', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold text-gray-900">{formatCurrency(slip.updated_amount)}</TableCell>
                          <TableCell className="p-1">
                            <Select 
                              value={slip.salesperson_name || 'none'} 
                              onValueChange={(val) => handleInlineUpdate(slip.id, 'salesperson_name', val)}
                            >
                              <SelectTrigger className="h-7 text-[10px] py-0 px-2">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                {systemUsers.map(name => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                                <SelectItem value="Standby">Standby</SelectItem>
                                <SelectItem value="none">Nenhum</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("font-medium text-[10px]", statusColors[slip.status])}>{slip.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {slip.status !== 'Pago' && (
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                                  onClick={() => handleStatusChange(slip, 'Pago')} title="Marcar como Pago">
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                                onClick={() => handleOpenEdit(slip)} title="Editar">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                               <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                                onClick={() => openHistory(slip)} title="Histórico">
                                <History className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteSlip(slip)} title="Excluir">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sellerGroups.map((group) => (
              <Card key={group.name} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex justify-between items-center">
                    {group.name}
                    <Badge variant="secondary">{group.count} boletos</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Total</p>
                      <p className="text-sm font-bold">{formatCurrency(group.total)}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-lg">
                      <p className="text-xs text-emerald-600 uppercase font-semibold">Pago</p>
                      <p className="text-sm font-bold text-emerald-700">{formatCurrency(group.pago)}</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600 uppercase font-semibold">Vencido</p>
                      <p className="text-sm font-bold text-red-700">{formatCurrency(group.vencido)}</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600 uppercase font-semibold">Em Aberto</p>
                      <p className="text-sm font-bold text-blue-700">{formatCurrency(group.emAberto)}</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full text-xs" onClick={() => {
                    setFilterSeller(group.name);
                    setActiveView('list');
                  }}>
                    Ver Boletos do Vendedor
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Edição */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Boleto - {selectedSlip?.client_name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Juros (R$)</Label>
                <Input type="number" step="0.01" value={editForm.interest_amount}
                  onChange={(e) => setEditForm({ ...editForm, interest_amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Multa (R$)</Label>
                <Input type="number" step="0.01" value={editForm.fine_amount}
                  onChange={(e) => setEditForm({ ...editForm, fine_amount: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lembrete</Label>
                <Select value={editForm.lembrete || 'none'} onValueChange={(val) => setEditForm({ ...editForm, lembrete: val === 'none' ? '' : val })}>
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P">P</SelectItem>
                    <SelectItem value="W">W</SelectItem>
                    <SelectItem value="Standby">Standby</SelectItem>
                    <SelectItem value="Vendedor">Vendedor</SelectItem>
                    <SelectItem value="none">-</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Classificação</Label>
                <Input value={editForm.classification} onChange={(e) => setEditForm({ ...editForm, classification: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Referência</Label>
              <Input value={editForm.reference} onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={editForm.salesperson_name || 'none'} onValueChange={(val) => setEditForm({ ...editForm, salesperson_name: val === 'none' ? '' : val })}>
                <SelectTrigger><SelectValue placeholder="Selecione o vendedor..." /></SelectTrigger>
                <SelectContent>
                  {systemUsers.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                  <SelectItem value="Standby">Standby</SelectItem>
                  <SelectItem value="none">Nenhum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(val) => setEditForm({ ...editForm, status: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A vencer">A vencer</SelectItem>
                  <SelectItem value="Vence hoje">Vence hoje</SelectItem>
                  <SelectItem value="Em aberto">Em aberto</SelectItem>
                  <SelectItem value="Pago">Pago</SelectItem>
                  <SelectItem value="Vencido">Vencido</SelectItem>
                  <SelectItem value="Em negociação">Em negociação</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.status === 'Pago' && (
              <div className="space-y-2">
                <Label>Data de Pagamento</Label>
                <Input type="date" value={editForm.payment_date}
                  onChange={(e) => setEditForm({ ...editForm, payment_date: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Adicione uma nota..." value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} className="bg-emerald-600 hover:bg-emerald-700">Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Revisar Importação — {importMeta.sheetName}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-2">
            <div className="p-3 bg-gray-50 rounded">
              <p className="text-[10px] uppercase text-gray-500">Linhas Encontradas</p>
              <p className="text-xl font-bold">{importMeta.totalRows}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded">
              <p className="text-[10px] uppercase text-emerald-700">Válidos</p>
              <p className="text-xl font-bold text-emerald-700">{importMeta.valid}</p>
            </div>
            <div className="p-3 bg-red-50 rounded">
              <p className="text-[10px] uppercase text-red-700">Ignorados</p>
              <p className="text-xl font-bold text-red-700">{importMeta.invalid}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-[10px] uppercase text-blue-700">A Importar</p>
              <p className="text-xl font-bold text-blue-700">{importMeta.valid}</p>
            </div>
          </div>
          <div className="flex-1 overflow-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor Final (CRM)</TableHead>
                  <TableHead className="text-right">Lido da Planilha</TableHead>
                  <TableHead>Ref / Docto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.slice(0, 50).map((row, idx) => {
                  const convertedNum = row.mapped.principal_amount;


                  return (
                    <TableRow key={idx} className={cn("text-xs", !row.valid && "bg-red-50")}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {row.valid ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200" title={row.error}>{row.error}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{row.mapped.client_name || '-'}</TableCell>
                      <TableCell>{row.mapped.due_date ? format(parseISO(row.mapped.due_date), 'dd/MM/yyyy') : '-'}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "font-bold text-sm",
                          Math.abs(convertedNum - parseCurrencyBR(row.originalValues.principal_amount)) > 0.01 
                            ? "text-red-600 animate-pulse" 
                            : "text-emerald-600"
                        )}>
                          {formatCurrency(convertedNum)}
                        </span>
                        {Math.abs(convertedNum - parseCurrencyBR(row.originalValues.principal_amount)) > 0.01 && (
                          <div className="text-[9px] text-red-500 font-bold uppercase mt-1">Erro Crítico</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[10px] text-gray-400 font-mono">
                        <div className="bg-gray-50 p-1 rounded border border-gray-100">
                          {String(row.originalValues.principal_amount || '-')}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-gray-400">
                        {row.mapped.nfe_number || row.mapped.reference || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {parsedRows.length > 50 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-3">
                      + {parsedRows.length - 50} outras linhas...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={processImport} disabled={importing || importMeta.valid === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {importing ? 'Importando...' : `Confirmar Importação (${importMeta.valid} válidos)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico do Boleto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-4">
            {history.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Nenhuma alteração registrada.</p>
            ) : (
              <div className="space-y-4">
                {history.map((item, idx) => (
                  <div key={idx} className="flex gap-3 border-l-2 border-emerald-500 pl-4 py-1">
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-sm text-gray-900">{item.action}</p>
                        <span className="text-[10px] text-gray-400">{format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{item.prev_status} → {item.new_status}</p>
                      {item.performed_by_name && (
                        <p className="text-[10px] text-gray-400 mt-1">Por: {item.performed_by_name?.full_name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryModalOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isBatchManagementOpen} onOpenChange={setIsBatchManagementOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestão de Lotes de Importação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              {batches.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Nenhum lote encontrado.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Registros</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow key={batch.id} className={batch.status === 'arquivado' ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">{batch.filename}</TableCell>
                        <TableCell>{format(parseISO(batch.import_date), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell className="text-right">{batch.total_records}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(batch.total_value)}</TableCell>
                        <TableCell>
                          <Badge variant={batch.status === 'ativo' ? 'default' : 'secondary'}>
                            {batch.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => {
                                setFilterBatch(batch.id);
                                setIsBatchManagementOpen(false);
                              }}
                            >
                              Filtrar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-amber-600"
                              onClick={() => handleArchiveBatch(batch.id, batch.status)}
                            >
                              {batch.status === 'ativo' ? 'Arquivar' : 'Reativar'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-red-600"
                              onClick={() => handleDeleteBatch(batch.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchManagementOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
