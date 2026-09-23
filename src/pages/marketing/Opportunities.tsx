import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, Package, User, Calendar, MessageSquare, ExternalLink, 
  Trash2, Filter, AlertCircle, ShoppingBag, ArrowUpCircle, 
  RefreshCw, Layers, Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function Opportunities() {
  const { user, isAdmin, isGestor, isFinanceiro, isLogistica } = useAuth();
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('Todas');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [sellerFilter, setSellerFilter] = useState(isGestor ? user?.id || 'all' : user?.id || 'all');
  const [sellers, setSellers] = useState<any[]>([]);

  useEffect(() => {
    // Se não for Gestor nem Admin nem Vendedor (ex: Financeiro/Logistica), redirecionar ou tratar
    if (isFinanceiro || isLogistica) {
      toast.error('Você não tem permissão para acessar este módulo.');
      navigate('/dashboard', { replace: true });
      return;
    }

    fetchOpportunities();
    if (isGestor) {
      fetchSellers();
    }
  }, [user?.id, statusFilter, typeFilter, sellerFilter, isGestor, isAdmin, isFinanceiro, isLogistica]);

  const fetchSellers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .order('full_name');
    if (data) setSellers(data);
  };

  const fetchOpportunities = async () => {
    try {
      setLoading(true);
      
      // Obter perfil para pegar company_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id)
        .maybeSingle();

      let query = supabase
        .from('smart_opportunities')
        .select(`
          *,
          cliente:clients(company_name, contact_name),
          vendedor:profiles!smart_opportunities_vendedor_id_fkey_profiles(full_name),
          base_prod:products!produto_base(name, category_principal, level),
          suggested_prod:products!produto_sugerido(name, category_principal, level)
        `)
        .order('created_at', { ascending: false });

      if (profileData?.company_id) {
        query = query.eq('company_id', profileData.company_id);
      }

      if (statusFilter !== 'Todas') {
        query = query.eq('status', statusFilter);
      }
      if (typeFilter !== 'Todos') {
        query = query.eq('tipo_oportunidade', typeFilter);
      }
      
      if (!isGestor) {
        query = query.eq('vendedor_id', user?.id);
      } else if (sellerFilter !== 'all') {
        query = query.eq('vendedor_id', sellerFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOpportunities(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar oportunidades: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('smart_opportunities')
        .update({ status: newStatus })
        .eq('id', id);
      
      if (error) throw error;
      toast.success(`Status atualizado para ${newStatus}`);
      fetchOpportunities();
    } catch (error: any) {
      toast.error('Erro ao atualizar status: ' + error.message);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'alta': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'média': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'baixa': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return '';
    }
  };

  const getOpportunityIcon = (type: string) => {
    switch (type) {
      case 'Cross-sell': return <ShoppingBag className="h-4 w-4" />;
      case 'Upsell': return <ArrowUpCircle className="h-4 w-4" />;
      case 'Reativação': return <RefreshCw className="h-4 w-4" />;
      case 'Lançamento compatível': return <Zap className="h-4 w-4" />;
      case 'Acessório recomendado': return <Layers className="h-4 w-4" />;
      case 'Upgrade de equipamento': return <ArrowUpCircle className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-emerald-500" />
              Marketing Inteligente / Oportunidades
            </h1>
            <p className="text-muted-foreground">Sugestões de vendas baseadas no histórico dos clientes</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="gap-2"
              disabled={isGenerating}
              onClick={async () => {
                try {
                  setIsGenerating(true);
                  const { data, error } = await supabase.rpc('process_smart_opportunities_diagnostics') as { data: any, error: any };
                  if (error) throw error;
                  
                  setDiagnosticReport(data);
                  toast.success(`${data?.created_count || 0} novas oportunidades geradas.`);
                  fetchOpportunities();
                } catch (error: any) {
                  console.error('Erro ao gerar:', error);
                  toast.error('Erro ao gerar oportunidades: ' + error.message);
                } finally {
                  setIsGenerating(false);
                }
              }}
            >
              <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Processando...' : 'Gerar Oportunidades'}
            </Button>
          </div>
        </div>

        {diagnosticReport && (
          <Card className="bg-emerald-50 border-emerald-200 mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-800">
                <AlertCircle className="h-4 w-4" /> Relatório de Diagnóstico
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="ml-auto h-6 text-[10px]" 
                  onClick={() => setDiagnosticReport(null)}
                >
                  Fechar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="bg-white p-2 rounded border border-emerald-100">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Analisados</p>
                  <p className="text-lg font-bold">{diagnosticReport.analyzed_quotes}</p>
                </div>
                <div className="bg-white p-2 rounded border border-emerald-100">
                  <p className="text-[10px] text-emerald-600 uppercase font-bold">Criados</p>
                  <p className="text-lg font-bold text-emerald-600">{diagnosticReport.created_count}</p>
                </div>
                <div className="bg-white p-2 rounded border border-emerald-100">
                  <p className="text-[10px] text-amber-600 uppercase font-bold">Incompatíveis</p>
                  <p className="text-lg font-bold text-amber-600">{diagnosticReport.ignored_count}</p>
                </div>
                <div className="bg-white p-2 rounded border border-emerald-100">
                  <p className="text-[10px] text-red-600 uppercase font-bold">Vendedor Inválido</p>
                  <p className="text-lg font-bold text-red-600">{diagnosticReport.invalid_seller_count || 0}</p>
                </div>
                <div className="bg-white p-2 rounded border border-emerald-100">
                  <p className="text-[10px] text-red-600 uppercase font-bold">Cliente Inválido</p>
                  <p className="text-lg font-bold text-red-600">{diagnosticReport.invalid_client_count || 0}</p>
                </div>
                <div className="bg-white p-2 rounded border border-emerald-100">
                  <p className="text-[10px] text-blue-600 uppercase font-bold">Sem Relação</p>
                  <p className="text-lg font-bold text-blue-600">{diagnosticReport.no_relation_count || 0}</p>
                </div>
                <div className="bg-white p-2 rounded border border-emerald-100">
                  <p className="text-[10px] text-red-600 uppercase font-bold">Limpados</p>
                  <p className="text-lg font-bold text-red-600">{diagnosticReport.removed_count}</p>
                </div>
              </div>
              
              {diagnosticReport.details?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-bold uppercase mb-2">Detalhes dos Ignorados:</p>
                  <div className="max-h-32 overflow-y-auto text-[10px] space-y-1">
                    {diagnosticReport.details.slice(0, 10).map((d: any, i: number) => (
                      <div key={i} className="flex gap-2 bg-white/50 p-1 rounded">
                        <span className="font-mono text-muted-foreground">ID:{d.quote_id.slice(0,8)}</span>
                        <span className="text-amber-700">{d.reason}</span>
                      </div>
                    ))}
                    {diagnosticReport.details.length > 10 && (
                      <p className="text-muted-foreground italic">...e mais {diagnosticReport.details.length - 10} itens.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todas">Todas</SelectItem>
                <SelectItem value="Nova">Nova</SelectItem>
                <SelectItem value="Em contato">Em contato</SelectItem>
                <SelectItem value="Follow-up agendado">Follow-up agendado</SelectItem>
                <SelectItem value="Convertida">Convertida</SelectItem>
                <SelectItem value="Descartada">Descartada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">Tipo</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                <SelectItem value="Cross-sell">Cross-sell</SelectItem>
                <SelectItem value="Upsell">Upsell</SelectItem>
                <SelectItem value="Reativação">Reativação</SelectItem>
                <SelectItem value="Lançamento compatível">Lançamento compatível</SelectItem>
                <SelectItem value="Acessório recomendado">Acessório recomendado</SelectItem>
                <SelectItem value="Upgrade de equipamento">Upgrade de equipamento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isGestor && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase">Vendedor</label>
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os vendedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {sellers.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : opportunities.length === 0 ? (
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhuma oportunidade encontrada</p>
              <p className="text-sm text-muted-foreground">Tente ajustar os filtros para encontrar o que procura.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {opportunities.map((opp) => (
              <Card key={opp.id} className="overflow-hidden flex flex-col hover:shadow-lg transition-shadow border-emerald-500/10">
                <CardHeader className="bg-emerald-500/5 pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <Badge className={getPriorityColor(opp.prioridade)}>
                      Prioridade {opp.prioridade}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      {getOpportunityIcon(opp.tipo_oportunidade)}
                      {opp.tipo_oportunidade}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-600" />
                    {opp.cliente?.company_name || opp.cliente?.contact_name || 'Cliente'}
                  </CardTitle>
                  {isGestor && (
                    <p className="text-xs text-muted-foreground mt-1">Vendedor: {opp.vendedor?.full_name}</p>
                  )}
                </CardHeader>
                <CardContent className="pt-4 flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Comprou</p>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Package className="h-3 w-3" />
                        {opp.base_prod?.name || 'Produto Base'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">Sugestão</p>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                          <Sparkles className="h-3 w-3" />
                          {opp.suggested_prod?.name || 'Produto Sugerido'}
                        </div>
                        {opp.suggested_prod?.level && (
                          <Badge variant="secondary" className="text-[9px] h-4 w-fit px-1">
                            Nível {opp.suggested_prod.level}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-3 rounded-lg">
                    <p className="text-xs font-bold flex items-center gap-1 mb-1">
                      <MessageSquare className="h-3 w-3" /> Motivo:
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed italic">
                      "{opp.motivo}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Gerado em {format(new Date(opp.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1 gap-2"
                      onClick={() => updateStatus(opp.id, 'Em contato')}
                      disabled={opp.status === 'Em contato'}
                    >
                      Criar follow-up
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 gap-2"
                      onClick={() => navigate(`/quotes?id=${opp.quote_id}`)}
                      disabled={!opp.quote_id}
                    >
                      <ExternalLink className="h-3 w-3" /> Ver Orçamento
                    </Button>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="flex-1 text-xs h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      onClick={() => updateStatus(opp.id, 'Convertida')}
                    >
                      Marcar Convertida
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="flex-1 text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => updateStatus(opp.id, 'Descartada')}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Descartar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
