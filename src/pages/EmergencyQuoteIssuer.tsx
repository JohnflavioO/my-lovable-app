import { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';

type Seller = { user_id: string; full_name: string };
type Client = { id: string; name: string; company_name: string | null; phone: string | null; email: string | null; city: string | null; state: string | null };

export default function EmergencyQuoteIssuer() {
  const { user, profile } = useAuth();
  const { hasPermission } = usePermissions();
  const canUseEmergency = hasPermission('emergency_quote_issuer');
  const [mode, setMode] = useState<'own' | 'on_behalf'>('own');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(false);

  const loadSellers = useCallback(async () => {
    const { data, error } = await supabase.rpc('emergency_quote_sellers');
    if (error) throw error;
    setSellers((data || []) as Seller[]);
  }, []);

  const loadClients = useCallback(async (targetId: string) => {
    setClientsLoading(true);
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

  useEffect(() => {
    if (!canUseEmergency) return;
    (async () => {
      try {
        // A carteira própria não depende da listagem de vendedores.
        if (user?.id) {
          setSellerId(user.id);
          await loadClients(user.id);
        }
        // Falha na listagem de vendedores não deve bloquear "Minha carteira".
        const { data, error } = await supabase.rpc('emergency_quote_sellers');
        if (error) {
          console.error('[EmergencyQuoteIssuer] sellers:', error);
        } else {
          setSellers((data || []) as Seller[]);
        }
      } catch (error: any) {
        toast.error('Falha ao iniciar emissão emergencial', { description: error.message });
      } finally { setLoading(false); }
    })();
  }, [canUseEmergency, loadSellers, loadClients, user?.id]);

  const handleModeChange = async (value: 'own' | 'on_behalf') => {
    setMode(value);
    setClients([]);
    if (value === 'own' && user?.id) {
      setSellerId(user.id);
      await loadClients(user.id);
    } else {
      setSellerId('');
    }
  };

  const handleSellerChange = async (value: string) => {
    setSellerId(value);
    await loadClients(value);
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
      <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Acesso controlado</AlertTitle><AlertDescription>O servidor valida a permissão, a empresa e a carteira antes de liberar os clientes. Seu cargo atual permanece inalterado.</AlertDescription></Alert>
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
        <CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Carteira de clientes</CardTitle><CardDescription>{mode === 'own' ? 'Clientes cadastrados ou atribuídos a você.' : 'Clientes pertencentes ao vendedor selecionado.'}</CardDescription></div><Badge variant="outline">{clients.length} clientes</Badge></div></CardHeader>
        <CardContent>{loading || clientsLoading ? <p className="py-8 text-center text-muted-foreground">Carregando carteira...</p> : mode === 'on_behalf' && !sellerId ? <p className="py-8 text-center text-muted-foreground">Selecione um vendedor para consultar a carteira.</p> : clients.length === 0 ? <p className="py-8 text-center text-muted-foreground">Nenhum cliente encontrado.</p> : <div className="divide-y">{clients.map(client => <div key={client.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{client.company_name || client.name}</p><p className="text-sm text-muted-foreground">{client.name}{client.city ? ' · ' + client.city + '/' + (client.state || '') : ''}</p></div><div className="text-sm text-muted-foreground">{client.phone || client.email || 'Sem contato cadastrado'}</div></div>)}</div>}</CardContent>
      </Card>
      <Alert variant="default"><AlertTitle>Emissão em preparação</AlertTitle><AlertDescription>A consulta de carteiras está disponível. A gravação de orçamentos transitórios, itens e regularização ainda não foi liberada; não utilize esta tela para registrar uma venda até a conclusão dessa etapa.</AlertDescription></Alert>
      <p className="text-xs text-muted-foreground">Operador: {profile?.full_name || 'Usuário autenticado'}.</p>
    </div>
  </AppLayout>;
}
