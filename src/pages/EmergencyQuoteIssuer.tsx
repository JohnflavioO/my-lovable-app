import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileText, ShieldCheck, Users, Plus, Trash2, Search, Loader2, Package, Send } from 'lucide-react';
import { toast } from 'sonner';

type Seller = { user_id: string; full_name: string };
type Client = { id: string; name: string; company_name: string | null; phone: string | null; email: string | null; city: string | null; state: string | null };
type Product = { id: string; name: string; brand: string | null; code: string | null; sku: string | null; price: number; image_url: string | null; description: string | null };
type DraftItem = { product: Product; quantity: number };
type EmergencyQuote = { id: string; quote_number: string; client_name: string | null; total_amount: number; regularization_status: string; emergency_reason: string | null; created_at: string; regularized_quote_id?: string | null; billing_sent_at?: string | null };

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export default function EmergencyQuoteIssuer() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canUseEmergency = hasPermission('emergency_quote_issuer');
  const [mode, setMode] = useState<'own' | 'on_behalf'>('own');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<EmergencyQuote[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [regularizationNumbers, setRegularizationNumbers] = useState<Record<string, string>>({});
  const [regularizingId, setRegularizingId] = useState<string | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientForm, setClientForm] = useState({ company_name: '', name: '', phone: '', email: '', cpf_cnpj: '', city: '', state: '' });
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);

  const loadSellers = useCallback(async () => {
    const { data, error } = await supabase.rpc('emergency_quote_sellers');
    if (error) throw error;
    setSellers((data || []) as Seller[]);
  }, []);

  const loadClients = useCallback(async (targetId: string) => {
    setClientsLoading(true);
    setClientId('');
    try {
      const { data, error } = await supabase.rpc('emergency_quote_clients', { _seller_id: targetId });
      if (error) throw error;
      setClients((data || []) as Client[]);
    } catch (error: any) {
      setClients([]);
      toast.error('Não foi possível carregar a carteira', { description: error.message });
    } finally {
      setClientsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    const { data, error } = await supabase.from('quotes')
      .select('id,quote_number,client_name,total_amount,regularization_status,emergency_reason,created_at,regularized_quote_id,billing_sent_at')
      .eq('is_transitional', true).eq('emergency_operator_id', user.id)
      .order('created_at', { ascending: false }).limit(30);
    if (error) {
      console.error('[EmergencyQuoteIssuer] history:', error);
      setHistory([]);
    } else setHistory((data || []) as EmergencyQuote[]);
    setHistoryLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!canUseEmergency) return;
    (async () => {
      try {
        if (user?.id) {
          setSellerId(user.id);
          await loadClients(user.id);
        }
        const { data, error } = await supabase.rpc('emergency_quote_sellers');
        if (error) console.error('[EmergencyQuoteIssuer] sellers:', error);
        else setSellers((data || []) as Seller[]);
        await loadHistory();
      } catch (error: any) {
        toast.error('Falha ao iniciar emissão emergencial', { description: error.message });
      } finally { setLoading(false); }
    })();
  }, [canUseEmergency, loadClients, loadHistory, user?.id]);

  useEffect(() => {
    if (productSearch.trim().length < 2) { setProducts([]); return; }
    let active = true;
    const load = async () => {
      setProductsLoading(true);
      const term = productSearch.trim().replace(/[%_]/g, '');
      const { data, error } = await supabase.from('products')
        .select('id,name,brand,code,sku,price,image_url,description')
        .or(`name.ilike.%${term}%,code.ilike.%${term}%,sku.ilike.%${term}%`)
        .order('name').limit(20);
      if (!active) return;
      if (error) toast.error('Falha ao buscar produtos', { description: error.message });
      setProducts((data || []) as Product[]);
      setProductsLoading(false);
    };
    const timer = window.setTimeout(load, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [productSearch]);

  const handleModeChange = async (value: 'own' | 'on_behalf') => {
    setMode(value);
    setClients([]);
    setClientId('');
    setItems([]);
    if (value === 'own' && user?.id) {
      setSellerId(user.id);
      await loadClients(user.id);
    } else setSellerId('');
  };

  const handleSellerChange = async (value: string) => {
    setSellerId(value);
    setItems([]);
    await loadClients(value);
  };

  const regularizeQuote = async (quote: EmergencyQuote) => {
    const definitiveNumber = (regularizationNumbers[quote.id] || '').trim();
    if (!definitiveNumber) { toast.error('Informe o número do orçamento definitivo.'); return; }
    setRegularizingId(quote.id);
    try {
      const { data, error } = await supabase.rpc('regularize_emergency_quote', {
        _emergency_quote_id: quote.id,
        _definitive_quote_number: definitiveNumber,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      toast.success('Orçamento emergencial regularizado', { description: `Vinculado ao orçamento ${result?.regularized_quote_number || definitiveNumber}.` });
      setRegularizationNumbers(current => ({ ...current, [quote.id]: '' }));
      await loadHistory();
    } catch (error: any) {
      toast.error('Não foi possível regularizar', { description: error.message });
    } finally { setRegularizingId(null); }
  };

  const createOwnClient = async () => {
    if (mode !== 'own') { toast.error('Só é permitido cadastrar clientes na sua própria carteira.'); return; }
    if (!clientForm.company_name.trim() && !clientForm.name.trim()) { toast.error('Informe o nome da empresa ou do contato.'); return; }
    if (clientForm.phone.trim().length < 8) { toast.error('Informe um telefone válido.'); return; }
    setClientSaving(true);
    try {
      const { data, error } = await supabase.rpc('emergency_create_own_client', {
        _company_name: clientForm.company_name.trim(),
        _name: clientForm.name.trim(),
        _phone: clientForm.phone.trim(),
        _email: clientForm.email.trim() || null,
        _cpf_cnpj: clientForm.cpf_cnpj.trim() || null,
        _city: clientForm.city.trim() || null,
        _state: clientForm.state.trim().toUpperCase() || null,
      });
      if (error) throw error;
      await loadClients(user?.id || '');
      setClientId(data);
      setClientForm({ company_name: '', name: '', phone: '', email: '', cpf_cnpj: '', city: '', state: '' });
      setShowClientForm(false);
      toast.success('Cliente cadastrado na sua carteira.');
    } catch (error: any) {
      toast.error('Não foi possível cadastrar o cliente', { description: error.message });
    } finally { setClientSaving(false); }
  };

  const deleteEmergencyQuote = async (quote: EmergencyQuote) => {
    if (quote.regularization_status !== 'pending' || quote.regularized_quote_id || quote.billing_sent_at) {
      toast.error('Este orçamento não pode ser excluído', { description: 'Somente registros pendentes, não enviados e ainda não vinculados podem ser removidos.' });
      return;
    }
    if (!window.confirm(`Excluir o orçamento emergencial ${quote.quote_number}? Esta ação não pode ser desfeita.`)) return;
    setDeletingQuoteId(quote.id);
    try {
      const { error } = await supabase.from('quotes').delete()
        .eq('id', quote.id).eq('is_transitional', true)
        .eq('emergency_operator_id', user?.id)
        .eq('regularization_status', 'pending')
        .is('regularized_quote_id', null).is('billing_sent_at', null);
      if (error) throw error;
      toast.success('Orçamento emergencial excluído.');
      await loadHistory();
    } catch (error: any) {
      toast.error('Não foi possível excluir o orçamento', { description: error.message });
    } finally { setDeletingQuoteId(null); }
  };

  const addProduct = (product: Product) => {
    setItems(current => {
      const existing = current.find(item => item.product.id === product.id);
      if (existing) return current.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { product, quantity: 1 }];
    });
    setProductSearch('');
    setProducts([]);
  };

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0), [items]);

  const createQuote = async () => {
    if (!sellerId || !clientId) { toast.error('Selecione o vendedor e o cliente.'); return; }
    if (!items.length) { toast.error('Adicione pelo menos um produto.'); return; }
    if (reason.trim().length < 5) { toast.error('Informe o motivo do atendimento emergencial (mínimo 5 caracteres).'); return; }
    setSaving(true);
    try {
      const payload = {
        _seller_id: sellerId,
        _client_id: clientId,
        _mode: mode,
        _reason: reason.trim(),
        _items: items.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
      };
      const { data, error } = await supabase.rpc('create_emergency_quote', payload);
      if (error) throw error;
      const created = Array.isArray(data) ? data[0] : data;
      toast.success('Orçamento emergencial criado', { description: created?.quote_number || 'Registro salvo com sucesso.' });
      setItems([]);
      setReason('');
      setClientId('');
      await loadHistory();
    } catch (error: any) {
      toast.error('Não foi possível criar o orçamento', { description: error.message });
    } finally { setSaving(false); }
  };

  if (!canUseEmergency) {
    return <AppLayout><Alert variant="destructive"><AlertTitle>Acesso não autorizado</AlertTitle><AlertDescription>Esta função exige a permissão Emissão Emergencial.</AlertDescription></Alert></AppLayout>;
  }

  return <AppLayout>
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3"><FileText className="h-6 w-6 text-primary" /></div>
        <div><h1 className="text-2xl font-bold">Emissão Emergencial</h1><p className="text-sm text-muted-foreground">Atendimento temporário de carteiras comerciais com rastreabilidade do emissor.</p></div>
      </div>
      <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Acesso controlado</AlertTitle><AlertDescription>O servidor valida a permissão, a empresa, o vendedor e a carteira. O orçamento fica transitório e não pode ser enviado diretamente ao faturamento.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle>Contexto de atendimento</CardTitle><CardDescription>Escolha sua carteira ou a carteira de um vendedor.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><label className="text-sm font-medium">Modo de operação</label>
            <Select value={mode} onValueChange={(v) => handleModeChange(v as 'own' | 'on_behalf')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="own">Minha carteira</SelectItem><SelectItem value="on_behalf">Atender vendedor</SelectItem></SelectContent></Select>
          </div>
          {mode === 'on_behalf' && <div className="space-y-2"><label className="text-sm font-medium">Vendedor responsável</label>
            <Select value={sellerId} onValueChange={handleSellerChange}><SelectTrigger><SelectValue placeholder="Selecione um vendedor" /></SelectTrigger><SelectContent>{sellers.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}</SelectContent></Select>
          </div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Carteira de clientes</CardTitle><CardDescription>{mode === 'own' ? 'Somente clientes cadastrados por você.' : 'Clientes pertencentes ao vendedor selecionado.'}</CardDescription></div><Badge variant="outline">{clients.length} clientes</Badge></div></CardHeader>
        <CardContent className="space-y-3">
          {mode === 'own' && <div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => setShowClientForm(v => !v)}><Plus className="mr-2 h-4 w-4" />{showClientForm ? 'Fechar cadastro' : 'Cadastrar cliente próprio'}</Button></div>}
          {showClientForm && mode === 'own' && <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-2">
            <div className="space-y-1"><label className="text-sm font-medium">Empresa / Razão social</label><Input value={clientForm.company_name} onChange={e => setClientForm(v => ({...v,company_name:e.target.value}))} placeholder="Nome da empresa" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Contato principal</label><Input value={clientForm.name} onChange={e => setClientForm(v => ({...v,name:e.target.value}))} placeholder="Nome do contato" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Telefone *</label><Input value={clientForm.phone} onChange={e => setClientForm(v => ({...v,phone:e.target.value}))} placeholder="(00) 00000-0000" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">E-mail</label><Input type="email" value={clientForm.email} onChange={e => setClientForm(v => ({...v,email:e.target.value}))} placeholder="contato@empresa.com" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">CPF / CNPJ</label><Input value={clientForm.cpf_cnpj} onChange={e => setClientForm(v => ({...v,cpf_cnpj:e.target.value}))} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Cidade</label><Input value={clientForm.city} onChange={e => setClientForm(v => ({...v,city:e.target.value}))} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">UF</label><Input maxLength={2} value={clientForm.state} onChange={e => setClientForm(v => ({...v,state:e.target.value}))} /></div>
            <div className="flex items-end justify-end"><Button onClick={createOwnClient} disabled={clientSaving}>{clientSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Salvar cliente</Button></div>
          </div>}
          {loading || clientsLoading ? <p className="py-8 text-center text-muted-foreground">Carregando carteira...</p> : mode === 'on_behalf' && !sellerId ? <p className="py-8 text-center text-muted-foreground">Selecione um vendedor para consultar a carteira.</p> : clients.length === 0 ? <p className="py-8 text-center text-muted-foreground">Nenhum cliente encontrado.</p> : <div className="grid gap-2 sm:grid-cols-2">{clients.map(client => <button type="button" key={client.id} onClick={() => setClientId(client.id)} className={`rounded-lg border p-3 text-left transition-colors ${clientId === client.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}><p className="font-medium">{client.company_name || client.name}</p><p className="text-sm text-muted-foreground">{client.name}{client.city ? ' · ' + client.city + '/' + (client.state || '') : ''}</p><p className="text-xs text-muted-foreground">{client.phone || client.email || 'Sem contato cadastrado'}</p></button>)}</div>}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Editor comercial de orçamento</CardTitle><CardDescription>O orçamento será preenchido no mesmo editor utilizado pelo Comercial, Gestor e Admin, incluindo produtos, descontos, pagamento, frete e dados de entrega.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Justifique o atendimento emergencial (ex.: vendedor em atendimento externo; cliente aguardando confirmação urgente...)" rows={3} />
          <div className="flex justify-end"><Button onClick={() => {
            if (!sellerId || !clientId) { toast.error('Selecione o vendedor e o cliente antes de continuar.'); return; }
            if (reason.trim().length < 5) { toast.error('Informe uma justificativa com pelo menos 5 caracteres.'); return; }
            const params = new URLSearchParams({
              emergency: '1',
              mode,
              seller_id: sellerId,
              seller_name: mode === 'own' ? (profile?.full_name || '') : (sellers.find(s => s.user_id === sellerId)?.full_name || ''),
              client_id: clientId,
              reason: reason.trim(),
              new: '1',
            });
            navigate(`/emissao-emergencial/editor?${params.toString()}`);
          }} disabled={loading || clientsLoading || !clientId || !sellerId || reason.trim().length < 5}><FileText className="mr-2 h-4 w-4" />Abrir editor comercial</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Meus atendimentos emergenciais</CardTitle><CardDescription>Histórico dos orçamentos transitórios emitidos por você.</CardDescription></CardHeader>
        <CardContent>{historyLoading ? <p className="py-4 text-center text-muted-foreground">Carregando histórico...</p> : history.length === 0 ? <p className="py-4 text-center text-muted-foreground">Nenhum orçamento emergencial emitido.</p> : <div className="divide-y">{history.map(q => <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{q.quote_number} · {q.client_name || 'Cliente'}</p><p className="text-sm text-muted-foreground">{q.emergency_reason}</p></div><div className="flex flex-col items-end gap-2"><p className="font-semibold">{money(Number(q.total_amount))}</p><Badge variant="outline">{q.regularization_status === 'regularized' ? 'Regularizado' : q.regularization_status === 'cancelled' ? 'Cancelado' : 'Pendente de regularização'}</Badge>{q.regularization_status !== 'regularized' && q.regularization_status !== 'cancelled' && <div className="flex flex-wrap justify-end gap-2"><Input className="w-52" placeholder="ORC-00000 definitivo" value={regularizationNumbers[q.id] || ''} onChange={e => setRegularizationNumbers(current => ({ ...current, [q.id]: e.target.value }))} /><Button size="sm" variant="outline" disabled={regularizingId === q.id} onClick={() => regularizeQuote(q)}>{regularizingId === q.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Vincular definitivo</Button></div>}
              {q.regularization_status === 'pending' && !q.regularized_quote_id && !q.billing_sent_at && <Button size="sm" variant="destructive" disabled={deletingQuoteId === q.id} onClick={() => deleteEmergencyQuote(q)}>{deletingQuoteId === q.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Excluir</Button>}</div></div>)}</div>}</CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Operador: {profile?.full_name || 'Usuário autenticado'}. O orçamento fica em rascunho transitório; não gera faturamento nem baixa de estoque nesta etapa.</p>
    </div>
  </AppLayout>;
}
