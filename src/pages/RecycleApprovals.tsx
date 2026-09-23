import { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RefreshCw, Check, X, Loader2, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RecycleRequest {
  id: string;
  quote_id: string;
  requested_by: string;
  target_date: string;
  target_status: string;
  reason: string | null;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  quotes?: { quote_number: string; client_name: string; quote_date: string; status: string; total_amount: number } | null;
  requester?: { full_name: string } | null;
}

const statusLabels: Record<string, string> = {
  pre_venda: 'Pré-venda', contato_feito: 'Contato Feito', sent: 'Proposta Enviada',
  negociacao: 'Negociação', approved: 'Aprovado',
};

export default function RecycleApprovals() {
  const { isAdmin, isGestor } = useAuth();
  const [requests, setRequests] = useState<RecycleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tab, setTab] = useState('pendente');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quote_recycle_requests' as any)
        .select('*, quotes:quote_id(quote_number, client_name, quote_date, status, total_amount)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data as any[]) || [];
      const ids = Array.from(new Set(rows.map(r => r.requested_by).filter(Boolean)));
      let profilesMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
        profilesMap = Object.fromEntries((profs || []).map((p: any) => [p.user_id, p.full_name]));
      }
      setRequests(rows.map((r: any) => ({ ...r, requester: { full_name: profilesMap[r.requested_by] || 'Vendedor' } })));
    } catch (err: any) {
      toast.error('Erro ao carregar solicitações: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (req: RecycleRequest, status: 'aprovada' | 'rejeitada') => {
    setProcessing(req.id);
    try {
      const { error } = await supabase
        .from('quote_recycle_requests' as any)
        .update({ status, review_notes: notes[req.id] || null })
        .eq('id', req.id);
      if (error) throw error;
      toast.success(status === 'aprovada' ? 'Solicitação aprovada e orçamento reciclado' : 'Solicitação rejeitada');
      load();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setProcessing(null);
    }
  };

  if (!(isAdmin || isGestor)) {
    return <AppLayout><div className="p-6 text-muted-foreground">Acesso restrito a admin e gestor.</div></AppLayout>;
  }

  const filtered = requests.filter(r => r.status === tab);

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-purple-600" />
              Solicitações de Reciclagem
            </h1>
            <p className="text-sm text-muted-foreground">Aprove ou rejeite solicitações de vendedores para reciclar orçamentos importados.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pendente">Pendentes ({requests.filter(r => r.status === 'pendente').length})</TabsTrigger>
            <TabsTrigger value="aprovada">Aprovadas</TabsTrigger>
            <TabsTrigger value="rejeitada">Rejeitadas</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4 space-y-3">
            {loading && <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
            {!loading && filtered.length === 0 && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma solicitação {tab === 'pendente' ? 'pendente' : tab}.</CardContent></Card>
            )}
            {filtered.map(req => (
              <Card key={req.id} className="border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm">{req.quotes?.quote_number || '—'}</span>
                        <Badge variant="outline">{req.quotes?.client_name || 'Cliente'}</Badge>
                        <Badge className={
                          req.status === 'pendente' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          req.status === 'aprovada' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          'bg-red-100 text-red-800 border-red-200'
                        }>{req.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {req.requester?.full_name}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {format(new Date(req.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-muted-foreground">Data alvo</p>
                      <p className="font-semibold">{format(new Date(req.target_date + 'T00:00'), 'dd/MM/yyyy', { locale: ptBR })}</p>
                      <p className="text-xs text-muted-foreground mt-1">→ {statusLabels[req.target_status] || req.target_status}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {req.reason && (
                    <div className="text-sm p-3 rounded-md bg-muted/40 border">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Justificativa</p>
                      {req.reason}
                    </div>
                  )}
                  {req.status === 'pendente' ? (
                    <>
                      <Textarea
                        placeholder="Observação da revisão (opcional)"
                        value={notes[req.id] || ''}
                        onChange={(e) => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                        rows={2}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => review(req, 'rejeitada')} disabled={processing === req.id}>
                          <X className="h-4 w-4 mr-1" /> Rejeitar
                        </Button>
                        <Button onClick={() => review(req, 'aprovada')} disabled={processing === req.id} className="bg-emerald-600 hover:bg-emerald-700">
                          {processing === req.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                          Aprovar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {req.reviewed_at && <>Revisado em {format(new Date(req.reviewed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</>}
                      {req.review_notes && <p className="mt-1 italic">"{req.review_notes}"</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
