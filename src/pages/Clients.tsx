import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, Building2, Upload, Loader2, MessageCircle, Store, Phone, History, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { ActionMenu } from '@/components/ActionMenu';
import ClientFilterBar from '@/components/clients/ClientFilterBar';
import ClientFilterDrawer, { emptyFilters } from '@/components/clients/ClientFilterDrawer';
import { useClientFilters } from '@/components/clients/useClientFilters';
import ClientHistory360 from '@/components/clients/ClientHistory360';
import { Badge } from '@/components/ui/badge';
import ResellerRegistrationDrawer from '@/components/clients/ResellerRegistrationDrawer';
import { useResellerRegistrations, RESELLER_STATUS_LABELS, RESELLER_STATUS_OPTIONS } from '@/hooks/useResellerRegistrations';

interface Client {
  id: string;
  company_name: string;
  cpf_cnpj: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  contact_name: string;
  address: string;
  address_number: string;
  complement: string;
  neighborhood: string;
  cep: string;
  contact_phone: string;
  contrib_icms: string;
  notes: string;
  is_whatsapp: boolean;
  is_revenda: boolean;
  client_type: string;
  created_by?: string;
  created_at?: string;
  last_interaction_at?: string;
}

const emptyClient: Omit<Client, 'id'> = {
  company_name: '', cpf_cnpj: '', city: '', state: '', phone: '', email: '',
  contact_name: '', address: '', address_number: '', complement: '',
  neighborhood: '', cep: '', contact_phone: '', contrib_icms: '', notes: '',
  is_whatsapp: false, is_revenda: false, client_type: '',
};

const db = supabase as any;
const CLIENT_LIST_FIELDS = 'id, company_name, name, cpf_cnpj, city, state, phone, email, contact_name, address, address_number, complement, neighborhood, cep, contact_phone, contrib_icms, notes, is_whatsapp, is_revenda, client_type, created_by, created_at, last_interaction_at, source';

interface SellerInfo {
  user_id: string;
  full_name: string;
}

export default function Clients() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allQuotes, setAllQuotes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [sellers, setSellers] = useState<SellerInfo[]>([]);
  const { isAdmin, isGestor } = useAuth();
  const canSeeAll = isGestor;

  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);

  // Cadastros de revenda (Landing Revenda)
  const {
    registrations: resellerRegs,
    byClient: resellerByClient,
    newCount: resellerNewCount,
    pendingDistributionCount,
    refresh: refreshResellers,
  } = useResellerRegistrations();
  const [resellerClient, setResellerClient] = useState<{ id: string; name: string; source: string | null } | null>(null);
  const [originFilter, setOriginFilter] = useState<'all' | 'landing' | 'internal'>('all');
  const [situationFilter, setSituationFilter] = useState<'all' | 'new' | 'viewed' | 'pending' | 'duplicate'>('all');
  const [regStatusFilter, setRegStatusFilter] = useState<string>('all');
  const [regOwnerFilter, setRegOwnerFilter] = useState<string>('all');
  const [regPeriodFilter, setRegPeriodFilter] = useState<string>('all');


  const loadClients = useCallback(async () => {
    if (!user?.id) return;
    try {
      let query = db.from('clients').select(CLIENT_LIST_FIELDS);
      if (!canSeeAll) {
        query = query.eq('created_by', user.id);
      }
      const { data, error } = await query.order('company_name');
      if (error) throw error;
      setAllClients((data as any[]) || []);
    } catch (err: any) {
      console.error('loadClients error:', err);
    }
  }, [user?.id, canSeeAll]);

  const loadQuotes = useCallback(async () => {
    if (!user?.id) return;
    try {
      let query = db.from('quotes').select('id, client_id, status, created_at');
      if (!canSeeAll) {
        query = query.eq('created_by', user.id);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      setAllQuotes((data as any[]) || []);
    } catch (err: any) {
      console.error('loadQuotes error:', err);
    }
  }, [user?.id, canSeeAll]);

  const loadSellers = useCallback(async () => {
    if (!canSeeAll) return;
    try {
      const { data, error } = await db.from('profiles').select('user_id, full_name').eq('active', true);
      if (error) throw error;
      setSellers(data || []);
    } catch (err: any) {
      console.error('loadSellers error:', err);
    }
  }, [canSeeAll]);

  useEffect(() => {
    if (!user?.id) {
      setAllClients([]);
      setAllQuotes([]);
      setSellers([]);
      return;
    }

    loadClients();
    loadQuotes();
    loadSellers();
  }, [loadClients, loadQuotes, loadSellers, user?.id]);

  // Advanced filters hook
  const {
    filters, setFilters,
    ownerFilter, setOwnerFilter,
    activePreset, applyPreset,
    activeFilterCount,
    drawerOpen, setDrawerOpen,
    clearAll,
    filtered: filteredByAdvanced,
  } = useClientFilters({
    clients: allClients,
    quotes: allQuotes,
    currentUserId: user?.id || '',
    canSeeAll,
  });

  // Apply text search on top of advanced filters
  const filtered = (filteredByAdvanced as Client[]).filter(c =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf_cnpj?.includes(search) ||
    c.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  const validateInscricaoEstadual = (ie: string): boolean => {
    if (!ie || !ie.trim()) return false;
    const clean = ie.replace(/[.\-\/\s]/g, '');
    if (clean.length < 8 || clean.length > 14) return false;
    if (/^(\d)\1+$/.test(clean)) return false;
    if (!/^\d+$/.test(clean) && !/^[A-Z0-9]+$/i.test(clean)) return false;
    return true;
  };

  const handleSave = async () => {
    if (!form.phone || form.phone.trim().length < 8) {
      toast.error('O campo Celular/Telefone é obrigatório.');
      return;
    }
    if (!form.email || !form.email.trim() || !form.email.includes('@')) {
      toast.error('O campo E-mail é obrigatório e deve ser válido.');
      return;
    }
    if (form.is_revenda) {
      if (!form.contrib_icms || !form.contrib_icms.trim()) {
        toast.error('Clientes do tipo revenda precisam ter Inscrição Estadual preenchida.');
        return;
      }
      if (!validateInscricaoEstadual(form.contrib_icms)) {
        toast.error('Inscrição Estadual inválida. Verifique o formato (8 a 14 caracteres numéricos).');
        return;
      }
    }

    try {
      if (editingClient) {
        const { error } = await db.from('clients').update(form).eq('id', editingClient.id);
        if (error) throw error;
        toast.success('Cliente atualizado!');
      } else {
        const { error } = await db.from('clients').insert({ ...form, name: form.company_name || '', source: 'crm_manual', created_by: user?.id });
        if (error) throw error;
        toast.success('Cliente criado!');
      }
      setDialogOpen(false);
      setForm(emptyClient);
      setEditingClient(null);
      loadClients();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setForm(client);
    setSearchParams({ edit: 'true' });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este cliente?')) return;
    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Cliente excluído'); loadClients(); }
  };

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || bulkDeleteConfirm !== 'EXCLUIR') return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await db.from('clients').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} cliente(s) excluído(s)`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      setBulkDeleteConfirm('');
      loadClients();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateForm = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const validateCnpj = (cnpj: string): boolean => {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return false;
    if (/^(\d)\1+$/.test(digits)) return false;
    const calc = (str: string, weights: number[]) =>
      weights.reduce((sum, w, i) => sum + parseInt(str[i]) * w, 0);
    const d1Weights = [5,4,3,2,9,8,7,6,5,4,3,2];
    const d2Weights = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const r1 = calc(digits, d1Weights) % 11;
    const d1 = r1 < 2 ? 0 : 11 - r1;
    if (parseInt(digits[12]) !== d1) return false;
    const r2 = calc(digits, d2Weights) % 11;
    const d2 = r2 < 2 ? 0 : 11 - r2;
    return parseInt(digits[13]) === d2;
  };

  const handleCnpjChange = async (value: string) => {
    updateForm('cpf_cnpj', value);
    const cleanCnpj = value.replace(/\D/g, '');
    
    // Auto-fill CNPJ logic
    if (cleanCnpj.length === 14) {
      if (!validateCnpj(cleanCnpj)) {
        toast.error('CNPJ inválido');
        return;
      }
      
      setCnpjLoading(true);
      try {
        console.log('[CNPJ] Buscando dados para:', cleanCnpj);
        const { data: result, error } = await supabase.functions.invoke('lookup-cnpj', {
          body: { cnpj: cleanCnpj },
        });

        if (error) {
          console.error('[CNPJ] Erro na função de consulta:', error);
          throw new Error('Erro ao conectar com o serviço de busca de CNPJ.');
        }

        if (!result?.success || !result?.data) {
          toast.error(result?.error || 'Não foi possível consultar este CNPJ.');
          return;
        }

        const data = result.data;
        setForm(prev => ({
          ...prev,
          company_name: data.company_name || prev.company_name,
          phone: data.phone || prev.phone,
          email: data.email || prev.email,
          cep: data.cep || prev.cep,
          address: data.address || prev.address,
          address_number: data.address_number || prev.address_number,
          complement: data.complement || prev.complement,
          neighborhood: data.neighborhood || prev.neighborhood,
          city: data.city || prev.city,
          state: data.state || prev.state,
        }));
        
        toast.success('Dados da empresa preenchidos!');
      } catch (err: any) {
        console.error('[CNPJ] Erro na consulta:', err);
        toast.error(err.message || 'Erro ao consultar CNPJ.');
      } finally {
        setCnpjLoading(false);
      }
    }
  };

  const handleCepChange = async (value: string) => {
    try {
      const cleanCep = value.replace(/\D/g, '');
      updateForm('cep', value);

      if (cleanCep.length !== 8) return;

      console.log('[CEP] Buscando endereço para:', cleanCep);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          console.warn('[CEP] Resposta não OK:', res.status);
          return;
        }

        const data = await res.json();
        if (data?.erro) {
          console.warn('[CEP] CEP não encontrado');
          toast.info('CEP não encontrado. Preencha o endereço manualmente.');
          return;
        }

        setForm(prev => ({
          ...prev,
          address: data.logradouro || prev.address,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          complement: data.complemento || prev.complement,
        }));
        toast.success('Endereço preenchido automaticamente!');
      } catch (err: any) {
        console.error('[CEP] Erro na consulta (silencioso):', err?.message || err);
        // Não exibe toast de erro nem fecha tela — fallback para preenchimento manual.
      }
    } catch (outerErr) {
      console.error('[CEP] Erro inesperado no handler:', outerErr);
    }
  };

  const detectWhatsApp = (phone: string): boolean => {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    const withoutCountry = digits.startsWith('55') ? digits.substring(2) : digits;
    return withoutCountry.length === 11 && withoutCountry[2] === '9';
  };

  const [importOpen, setImportOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<'url' | 'mapping'>('url');
  const [importData, setImportData] = useState<any>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const MAPPABLE_FIELDS = [
    { value: 'company_name', label: 'Razão Social / Nome' },
    { value: 'cpf_cnpj', label: 'CPF / CNPJ' },
    { value: 'phone', label: 'Telefone' },
    { value: 'email', label: 'E-mail' },
    { value: 'city', label: 'Cidade' },
    { value: 'state', label: 'Estado (UF)' },
    { value: 'contact_name', label: 'Nome do Contato' },
    { value: 'address', label: 'Endereço' },
    { value: 'address_number', label: 'Número' },
    { value: 'neighborhood', label: 'Bairro' },
    { value: 'cep', label: 'CEP' },
    { value: 'notes', label: 'Observações' },
    { value: 'client_type', label: 'Tipo de Cliente' },
  ];

  const handleFetchPreview = async () => {
    const url = sheetUrl.trim();
    if (!url) {
      toast.error('Cole o link da planilha do Google Sheets.');
      return;
    }
    
    // Normalize common mistakes in Google Sheets URLs
    let normalizedUrl = url;
    if (url.includes('/edit') && !url.includes('/export')) {
      // Just check if it's a valid docs link
    }

    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-clients-sheet', {
        body: { url: normalizedUrl },
      });

      if (error) throw new Error(error.message || 'Falha na comunicação.');
      if (!data?.success) throw new Error(data?.error || 'Não foi possível ler a planilha.');

      setImportData(data);
      
      // Initialize mappings from automatic detection
      const initialMappings: Record<string, string> = {};
      if (data.matched_columns) {
        Object.entries(data.matched_columns).forEach(([field, colIdx]) => {
          initialMappings[String(colIdx)] = field;
        });
      }
      setMappings(initialMappings);
      setImportStep('mapping');
    } catch (err: any) {
      toast.error(err.message, {
        description: "Certifique-se que a planilha está pública (Qualquer pessoa com o link)."
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!importData || !importData.rows) return;
    
    setImporting(true);
    try {
      const mappedEntries = Object.entries(mappings).filter(([_, field]) => field !== 'ignore');
      const mappedFields = mappedEntries.map(([_, field]) => field);
      
      if (!mappedFields.includes('company_name')) {
        toast.error('Associe uma coluna ao campo "Razão Social / Nome".');
        setImporting(false);
        return;
      }

      if (!mappedFields.includes('phone') && !mappedFields.includes('email')) {
        toast.warning('Atenção: Nenhuma coluna de Telefone ou E-mail foi mapeada.', {
          description: 'Isso pode dificultar o contato com os clientes importados.'
        });
      }

      const clientsToInsert = importData.rows.map((row: string[]) => {
        const client: any = {
          created_by: user?.id,
          is_revenda: false,
          is_whatsapp: false
        };

        mappedEntries.forEach(([colIdx, field]) => {
          const idx = parseInt(colIdx);
          if (idx < row.length && row[idx]) {
            client[field] = row[idx].trim();
          }
        });

        // Ensure name is always set
        client.name = client.company_name || '';
        
        // Detect WhatsApp if phone is present
        if (client.phone || client.contact_phone) {
          client.is_whatsapp = detectWhatsApp(client.phone || '') || detectWhatsApp(client.contact_phone || '');
        }

        return client;
      }).filter((c: any) => c.company_name || c.phone || c.email);

      if (clientsToInsert.length === 0) {
        throw new Error('Nenhum dado válido encontrado para importar com o mapeamento atual.');
      }

      const { data: insertData, error: insertErr } = await db.from('clients').insert(clientsToInsert.map((c: any) => ({ ...c, source: c.source || 'crm_import' }))).select('id');
      
      if (insertErr) throw insertErr;

      toast.success(`${insertData?.length || 0} clientes importados!`, {
        description: "Os dados foram salvos com sucesso."
      });
      
      setImportOpen(false);
      resetImport();
      loadClients();
    } catch (err: any) {
      console.error('[Import] Execution error:', err);
      toast.error(err.message || 'Erro ao salvar os clientes.');
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setImportStep('url');
    setSheetUrl('');
    setImportData(null);
    setMappings({});
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [ownerFilter]);

  const getSellerName = (userId: string) => {
    if (userId === user?.id) return 'Você';
    const seller = sellers.find(s => s.user_id === userId);
    return seller?.full_name || 'Desconhecido';
  };

  const showSellerColumn = canSeeAll && ownerFilter !== 'mine';

  // ---- Cadastros de revenda (Landing Revenda) ----
  const regsFor = (clientId: string) => resellerByClient.get(clientId) || [];
  const latestRegFor = (clientId: string) => regsFor(clientId)[0];

  const matchesResellerFilters = (c: Client) => {
    const regs = regsFor(c.id);
    const latest = regs[0];
    const src = (c as any).source || '';

    const isLanding = regs.length > 0 || src === 'landing_revenda_mci';
    if (originFilter === 'landing' && !isLanding) return false;
    if (originFilter === 'internal' && isLanding) return false;

    if (situationFilter !== 'all') {
      if (!regs.length) return false;
      if (situationFilter === 'new' && !regs.some(r => !r.viewed_by_me)) return false;
      if (situationFilter === 'viewed' && !regs.some(r => r.viewed_by_me)) return false;
      if (situationFilter === 'pending' && !regs.some(r => r.registration_status === 'pendente_distribuicao')) return false;
      if (situationFilter === 'duplicate' && !regs.some(r => r.is_duplicate)) return false;
    }

    if (regStatusFilter !== 'all') {
      if (!regs.some(r => r.registration_status === regStatusFilter)) return false;
    }

    if (regOwnerFilter !== 'all') {
      if (!regs.some(r => (r.assigned_user_id || 'none') === regOwnerFilter)) return false;
    }

    if (regPeriodFilter !== 'all' && latest) {
      const days = Number(regPeriodFilter);
      const since = Date.now() - days * 86400000;
      if (!regs.some(r => new Date(r.submitted_at || 0).getTime() >= since)) return false;
    } else if (regPeriodFilter !== 'all' && !latest) {
      return false;
    }

    return true;
  };

  const visibleClients = filtered
    .filter(matchesResellerFilters)
    .slice()
    .sort((a, b) => {
      const aNew = regsFor(a.id).some(r => !r.viewed_by_me) ? 1 : 0;
      const bNew = regsFor(b.id).some(r => !r.viewed_by_me) ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      return 0;
    });

  const openResellerDrawer = (c: Client) => {
    setResellerClient({ id: c.id, name: c.company_name, source: (c as any).source || null });
  };

  const ResellerBadges = ({ clientId }: { clientId: string }) => {
    const regs = regsFor(clientId);
    if (!regs.length) return null;
    const latest = regs[0];
    const hasNew = regs.some(r => !r.viewed_by_me);
    return (
      <span className="inline-flex flex-wrap items-center gap-1 align-middle">
        {hasNew && (
          <Badge className="h-5 px-1.5 text-[10px] bg-primary/15 text-primary hover:bg-primary/20 border-0">Novo cadastro</Badge>
        )}
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-orange-500/40 text-orange-600">Landing Revenda</Badge>
        {regs.length > 1 && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{regs.length} solicitações de revenda</Badge>
        )}
        {regs.some(r => r.is_duplicate) && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/50 text-amber-600">Duplicidade</Badge>
        )}
        <span className="text-[10px] text-muted-foreground">
          {RESELLER_STATUS_LABELS[latest.registration_status] || latest.registration_status}
          {' • '}{latest.submitted_at ? new Date(latest.submitted_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          {latest.assigned_user_name ? ` • ${latest.assigned_user_name}` : ' • Pendente de distribuição'}
        </span>
      </span>
    );
  };


  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display flex items-center gap-2">
            Clientes
            {resellerNewCount > 0 && (
              <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-0">
                {resellerNewCount} novo{resellerNewCount > 1 ? 's' : ''}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">Gerencie sua base de clientes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button variant="destructive" className="gap-2 min-h-[44px]" onClick={() => { setBulkDeleteOpen(true); setBulkDeleteConfirm(''); }} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir {selectedIds.size}
            </Button>
          )}
          <Button type="button" variant="outline" className="gap-2 min-h-[44px] border-primary text-primary hover:bg-primary/5" onClick={() => { console.log('[Page] Navegando para orçamentos'); navigate('/quotes'); }}>
            <Plus className="h-4 w-4" /> Criar Orçamento
          </Button>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 min-h-[44px]"><Upload className="h-4 w-4" /> Importar</Button>
            </DialogTrigger>
            <DialogContent className={importStep === 'mapping' ? "max-w-3xl max-h-[90vh] overflow-y-auto" : ""}>
              <DialogHeader>
                <DialogTitle>{importStep === 'url' ? 'Importar Clientes' : 'Mapear Colunas'}</DialogTitle>
              </DialogHeader>
              
              {importStep === 'url' ? (
                <div className="space-y-4 mt-4">
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                    <p className="font-semibold mb-1">Como preparar sua planilha:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Clique em <strong>Compartilhar</strong> no Google Sheets</li>
                      <li>Mude para <strong>Qualquer pessoa com o link</strong></li>
                      <li>Copie o link da aba que deseja importar</li>
                      <li>Cole o link abaixo</li>
                    </ul>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Link da Planilha Google</Label>
                    <Input
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={e => setSheetUrl(e.target.value)}
                      inputMode="url"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setImportOpen(false); resetImport(); }} className="min-h-[44px]">Cancelar</Button>
                    <Button onClick={handleFetchPreview} disabled={importing || !sheetUrl.trim()} className="min-h-[44px] gap-2">
                      {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando...</> : 'Analisar Planilha'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Encontramos {importData?.rows?.length || 0} registros. Associe as colunas da sua planilha aos campos do sistema.
                  </p>
                  
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Coluna na Planilha</TableHead>
                          <TableHead>Campo no Sistema</TableHead>
                          <TableHead className="hidden sm:table-cell">Exemplo de dado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importData?.headers?.map((header: string, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium truncate max-w-[200px]" title={header}>
                              {header || `(Coluna ${idx + 1})`}
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={mappings[String(idx)] || "ignore"} 
                                onValueChange={(val) => setMappings(prev => ({ ...prev, [String(idx)]: val }))}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Ignorar" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ignore">--- Ignorar coluna ---</SelectItem>
                                  {MAPPABLE_FIELDS.map(field => (
                                    <SelectItem key={field.value} value={field.value}>
                                      {field.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs hidden sm:table-cell truncate max-w-[150px]">
                              {importData.rows[0]?.[idx] || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <Button variant="ghost" onClick={() => setImportStep('url')} disabled={importing}>
                      Voltar
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setImportOpen(false); resetImport(); }} className="min-h-[44px]">Cancelar</Button>
                      <Button onClick={handleExecuteImport} disabled={importing} className="min-h-[44px] gap-2 bg-green-600 hover:bg-green-700">
                        {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</> : 'Confirmar Importação'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="gap-2 min-h-[44px]"
                onClick={() => { setEditingClient(null); setForm(emptyClient); setDialogOpen(true); }}
              ><Plus className="h-4 w-4" /> Novo Cliente</Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); console.log('[Form] Submit bloqueado'); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                  e.preventDefault();
                  console.log('[Form] Enter bloqueado no formulário');
                }
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4"
            >
              <div className="sm:col-span-2 space-y-2">
                <Label>Razão Social / Nome *</Label>
                <Input value={form.company_name} onChange={e => updateForm('company_name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Cliente</Label>
                <Select value={form.client_type || 'none'} onValueChange={v => updateForm('client_type', v === 'none' ? '' : v)}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione o tipo</SelectItem>
                    <SelectItem value="Cliente final">Cliente final</SelectItem>
                    <SelectItem value="Produtor de conteúdo">Produtor de conteúdo</SelectItem>
                    <SelectItem value="Produtor independente">Produtor independente</SelectItem>
                    <SelectItem value="Produtora">Produtora</SelectItem>
                    <SelectItem value="Locadora">Locadora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CPF/CNPJ</Label>
                <div className="relative">
                  <Input value={form.cpf_cnpj} onChange={e => handleCnpjChange(e.target.value)} inputMode="numeric" placeholder="Digite o CNPJ para buscar" />
                  {cnpjLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <Checkbox
                  id="is_revenda"
                  checked={form.is_revenda}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_revenda: !!checked }))}
                />
                <label htmlFor="is_revenda" className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                  <Store className="h-4 w-4 text-orange-500" />
                  Cliente é Revenda
                </label>
              </div>
              {form.is_revenda && (
                <div className="sm:col-span-2 space-y-2">
                  <Label className="flex items-center gap-1">
                    Inscrição Estadual *
                    <span className="text-xs text-muted-foreground">(obrigatória para revenda)</span>
                  </Label>
                  <Input
                    value={form.contrib_icms}
                    onChange={e => updateForm('contrib_icms', e.target.value)}
                    placeholder="Ex: 123.456.789.012"
                    maxLength={18}
                  />
                  {form.is_revenda && form.contrib_icms && !validateInscricaoEstadual(form.contrib_icms) && (
                    <p className="text-xs text-destructive">Inscrição Estadual inválida (8 a 14 caracteres numéricos)</p>
                  )}
                </div>
              )}
              {!form.is_revenda && (
                <div className="space-y-2">
                  <Label>Inscrição Estadual</Label>
                  <Input value={form.contrib_icms} onChange={e => updateForm('contrib_icms', e.target.value)} />
                </div>
              )}
              <div className="sm:col-span-2 space-y-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={e => updateForm('address', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input value={form.address_number} onChange={e => updateForm('address_number', e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={form.complement} onChange={e => updateForm('complement', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.neighborhood} onChange={e => updateForm('neighborhood', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={form.city} onChange={e => updateForm('city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Select value={form.state || 'none'} onValueChange={v => updateForm('state', v === 'none' ? '' : v)}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input 
                  value={form.cep} 
                  onChange={e => handleCepChange(e.target.value)} 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[CEP] Enter bloqueado no campo CEP');
                    }
                  }}
                  placeholder="00000-000" 
                  inputMode="numeric" 
                />
              </div>
              <div className="space-y-2">
                <Label>Celular *</Label>
                <Input value={form.phone} inputMode="tel" required onChange={e => {
                  updateForm('phone', e.target.value);
                  setForm(prev => ({ ...prev, phone: e.target.value, is_whatsapp: detectWhatsApp(e.target.value) }));
                }} />

                <div className="flex items-center gap-2 mt-1">
                  <Checkbox
                    checked={form.is_whatsapp}
                    onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_whatsapp: !!checked }))}
                  />
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input type="email" inputMode="email" required value={form.email} onChange={e => updateForm('email', e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Nome do Responsável</Label>
                <Input value={form.contact_name} onChange={e => updateForm('contact_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.contact_phone} inputMode="tel" onChange={e => updateForm('contact_phone', e.target.value)} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Observações</Label>
                <Input value={form.notes} onChange={e => updateForm('notes', e.target.value)} />
              </div>
            </form>
            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => { console.log('[Dialog] Cancelar clicado'); setDialogOpen(false); setEditingClient(null); setForm(emptyClient); }} className="min-h-[44px]">Cancelar</Button>
              <Button type="button" onClick={() => { console.log('[Dialog] Salvar clicado'); handleSave(); }} disabled={!form.company_name} className="min-h-[44px]">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filter bar */}
      <ClientFilterBar
        canSeeAll={canSeeAll}
        sellers={sellers}
        currentUserId={user?.id || ''}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        activeFilterCount={activeFilterCount}
        onOpenDrawer={() => setDrawerOpen(true)}
        onApplyPreset={applyPreset}
        activePreset={activePreset}
        onClearAll={clearAll}
      />

      {/* Filtros dos cadastros de revenda */}
      {(resellerRegs.length > 0 || originFilter !== 'all' || situationFilter !== 'all') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={originFilter} onValueChange={(v: any) => setOriginFilter(v)}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Origem: todas</SelectItem>
              <SelectItem value="landing">Landing Revenda</SelectItem>
              <SelectItem value="internal">Cadastros internos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={situationFilter} onValueChange={(v: any) => setSituationFilter(v)}>
            <SelectTrigger className="h-9 w-[210px]"><SelectValue placeholder="Situação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Situação: todas</SelectItem>
              <SelectItem value="new">Novos</SelectItem>
              <SelectItem value="viewed">Visualizados</SelectItem>
              <SelectItem value="pending">Pendentes de distribuição</SelectItem>
              <SelectItem value="duplicate">Duplicados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={regStatusFilter} onValueChange={setRegStatusFilter}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Status do cadastro" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: todos</SelectItem>
              {RESELLER_STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canSeeAll && (
            <Select value={regOwnerFilter} onValueChange={setRegOwnerFilter}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Consultor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Consultor: todos</SelectItem>
                <SelectItem value="none">Sem responsável</SelectItem>
                {sellers.map(s => (
                  <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={regPeriodFilter} onValueChange={setRegPeriodFilter}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Período: todos</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          {pendingDistributionCount > 0 && (
            <Button size="sm" variant="outline" className="h-9"
              onClick={() => { setOriginFilter('landing'); setSituationFilter('pending'); }}>
              Pendentes de distribuição ({pendingDistributionCount})
            </Button>
          )}
        </div>
      )}



      {/* Filter drawer */}
      <ClientFilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        filters={filters}
        onChange={setFilters}
        onApply={() => {}}
        onClear={() => setFilters(emptyFilters)}
      />

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            {visibleClients.length > 0 && (
              <p className="text-sm text-muted-foreground">{visibleClients.length} cliente(s)</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {visibleClients.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground mt-3">Nenhum cliente encontrado</p>
              {(activeFilterCount > 0 || activePreset) && (
                <Button variant="link" className="mt-2" onClick={clearAll}>Limpar filtros</Button>
              )}
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {visibleClients.map(c => (
                <div key={c.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                      />
                      <div>
                        <p className="font-medium text-sm">{c.company_name}</p>
                        <p className="text-xs text-muted-foreground">{c.cpf_cnpj || '-'}</p>
                        {regsFor(c.id).length > 0 && (
                          <button type="button" className="mt-1 text-left" onClick={() => openResellerDrawer(c)}>
                            <ResellerBadges clientId={c.id} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(c)} className="h-10 w-10">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)} className="h-10 w-10">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <span>{[c.city, c.state].filter(Boolean).join('/') || '-'}</span>
                    <span className="flex items-center gap-1">
                      {c.phone || '-'}
                      {(c as any).is_whatsapp && <MessageCircle className="h-3 w-3 text-emerald-500" />}
                    </span>
                    {c.contact_name && <span>{c.contact_name}</span>}
                    {showSellerColumn && <span>{getSellerName(c.created_by || '')}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={visibleClients.length > 0 && selectedIds.size === visibleClients.length}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Telefone</TableHead>
                  {showSellerColumn && <TableHead>Vendedor</TableHead>}
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleClients.map(c => (
                  <TableRow key={c.id} data-state={selectedIds.has(c.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <span>{c.company_name}</span>
                        {regsFor(c.id).length > 0 && (
                          <button type="button" className="block text-left" onClick={() => openResellerDrawer(c)}>
                            <ResellerBadges clientId={c.id} />
                          </button>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>{c.cpf_cnpj}</TableCell>
                    <TableCell>{[c.city, c.state].filter(Boolean).join('/')}</TableCell>
                    <TableCell>{c.contact_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {c.phone}
                        {(c as any).is_whatsapp && (
                          <span title="WhatsApp"><MessageCircle className="h-4 w-4 text-emerald-500" /></span>
                        )}
                      </div>
                    </TableCell>
                    {showSellerColumn && (
                      <TableCell className="text-xs text-muted-foreground">{getSellerName(c.created_by || '')}</TableCell>
                    )}
                    <TableCell>
                      <ActionMenu 
                        actions={[
                          ...(regsFor(c.id).length > 0 ? [{
                            label: "Cadastro de Revenda",
                            icon: Store,
                            onClick: () => openResellerDrawer(c),
                            className: "text-orange-600",
                          }] : []),
                          {
                            label: "Novo Orçamento",
                            icon: FileText,
                            onClick: () => navigate(`/quotes?new=1&client_id=${c.id}`),
                            isPrimary: true,
                            className: "text-primary"
                          },

                          { 
                            label: "WhatsApp", 
                            icon: MessageCircle, 
                            onClick: () => window.open(`https://wa.me/${c.phone?.replace(/\D/g, '')}`, '_blank'),
                            disabled: !c.phone,
                            className: "text-green-600"
                          },
                          { 
                            label: "Histórico 360", 
                            icon: History, 
                            onClick: () => setHistoryClientId(c.id),
                            isSecondary: true
                          },
                          { 
                            label: "Editar", 
                            icon: Pencil, 
                            onClick: () => handleEdit(c),
                          },
                          { 
                            label: "Excluir", 
                            icon: Trash2, 
                            onClick: () => handleDelete(c.id),
                            variant: 'destructive'
                          }
                        ]} 
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmação de exclusão em massa */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => { setBulkDeleteOpen(o); if (!o) setBulkDeleteConfirm(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Confirmar Exclusão em Massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Você está prestes a excluir <strong>{selectedIds.size}</strong> cliente(s). Esta ação não pode ser desfeita.
            </p>
            <p className="text-sm font-medium">
              Para confirmar, digite <strong>EXCLUIR</strong> no campo abaixo:
            </p>
            <Input
              value={bulkDeleteConfirm}
              onChange={e => setBulkDeleteConfirm(e.target.value)}
              placeholder="Digite EXCLUIR para confirmar"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleteConfirm !== 'EXCLUIR' || deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Excluir Definitivamente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyClientId} onOpenChange={(o) => !o && setHistoryClientId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico 360 do Cliente</DialogTitle></DialogHeader>
          {historyClientId && <ClientHistory360 clientId={historyClientId} />}
        </DialogContent>
      </Dialog>

      <ResellerRegistrationDrawer
        open={!!resellerClient}
        onOpenChange={(o) => { if (!o) setResellerClient(null); }}
        registrations={resellerClient ? (resellerByClient.get(resellerClient.id) || []) : []}
        clientName={resellerClient?.name}
        clientSource={resellerClient?.source}
        onChanged={refreshResellers}
      />
    </AppLayout>
  );
}
