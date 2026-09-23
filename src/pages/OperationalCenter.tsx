import { useAuth } from "@/hooks/useAuth";
import { usePrivacy } from "@/hooks/usePrivacy";
import AppLayout from "@/components/AppLayout";
import PrivacyToggle from "@/components/PrivacyToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, Clock, CheckCircle2, TrendingUp, Users, 
  DollarSign, Wrench, MessageSquare, ArrowRight,
  Zap, Calendar, Package, ClipboardList, Phone,
  ExternalLink, MoreHorizontal, User, Sparkles, Filter,
  ArrowUpRight, AlertCircle, HelpCircle, BarChart3, RefreshCw,
  Eye, EyeOff
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { differenceInDays, format, isBefore, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import FollowUpGeneratorModal from "@/components/FollowUpGeneratorModal";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { ActionMenu } from "@/components/ActionMenu";
import { useNavigate } from "react-router-dom";

const db = supabase as any;

// Priorities color mapping
const PRIORITY_CONFIG = {
  urgent: { bg: "bg-red-500", text: "text-red-500", border: "border-red-500", label: "Urgente", icon: AlertTriangle },
  attention: { bg: "bg-amber-500", text: "text-amber-500", border: "border-amber-500", label: "Atenção", icon: Clock },
  normal: { bg: "bg-emerald-500", text: "text-emerald-500", border: "border-emerald-500", label: "Normal", icon: CheckCircle2 }
};

export default function OperationalCenter() {
  const { user, profile, isAdmin, isGestor, isFinanceiro, isSupport } = useAuth();
  const { maskValue } = usePrivacy();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Data states
  const [data, setData] = useState<any>({
    seller: {
      overdueFollowups: [],
      noResponseProposals: [],
      forgottenClients: [],
      smartOpportunities: [],
      urgentTasks: [],
      demonstrations: []
    },
    manager: {
      teamNoFollowup: [],
      stuckFunnels: [],
      forecastRisk: [],
      topSellers: [],
      alerts: [],
      teamDemonstrations: []
    },
    finance: {
      expiringSlips: [],
      overdueSlips: [],
      delinquentClients: [],
      priorityCollections: []
    },
    support: {
      overdueOS: [],
      waitingParts: [],
      waitingApproval: [],
      readyEquipment: [],
      overloadedTechs: []
    }
  });

  // Modal states
  const [selectedFollowUp, setSelectedFollowUp] = useState<any>(null);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);

  useEffect(() => {
    async function loadAllData() {
      if (!user?.id) return;
      setLoading(true);
      
      try {
        const now = new Date();
        const fiveDaysAgo = subDays(now, 5).toISOString();
        const threeDaysAgo = subDays(now, 3).toISOString();

        const queries: Promise<any>[] = [];

        // --- VENDEDOR QUERIES ---
        queries.push(
          db.from('quotes')
            .select('*, clients(*)')
            .eq('created_by', user.id)
            .in('status', ['sent', 'negociacao', 'negotiation', 'contato_feito', 'contact_made', 'pre_sale', 'pre_venda'])
        );
        queries.push(
          db.from('clients')
            .select('*')
            .eq('created_by', user.id)
            .or(`last_interaction_at.lt.${fiveDaysAgo},last_interaction_at.is.null`)
            .limit(10)
        );
        queries.push(
          db.from('smart_opportunities')
            .select('*, clients(*)')
            .eq('vendedor_id', user.id)
            .eq('status', 'Nova')
            .limit(5)
        );
        queries.push(
          db.from('tasks')
            .select('*')
            .eq('assigned_to', user.id)
            .eq('status', 'pendente')
            .order('due_date', { ascending: true })
            .limit(10)
        );

        // Demonstrações ativas do vendedor
        queries.push(
          db.from('quotes')
            .select('id, quote_number, client_name, clients(company_name, name, phone), demonstration_start_date, demonstration_end_date, total_amount')
            .eq('is_demonstration', true)
            .eq('created_by', user.id)
            .not('demonstration_end_date', 'is', null)
            .order('demonstration_end_date', { ascending: true })
            .limit(20)
        );


        // --- GESTOR QUERIES ---
        if (isGestor || isAdmin) {
          queries.push(db.rpc('get_team_dashboard_sellers').catch((err: any) => {
            console.error('[Operational] Error in get_team_dashboard_sellers RPC:', err);
            return { data: [], error: err };
          }));
          queries.push(
            db.from('quotes')
              .select('*, clients(*), profiles!quotes_created_by_fkey(full_name)')
              .in('status', ['sent', 'negociacao', 'negotiation'])
              .lt('updated_at', threeDaysAgo)
              .order('total_amount', { ascending: false })
              .limit(10)
          );
          // Demonstrações da equipe
          queries.push(
            db.from('quotes')
              .select('id, quote_number, client_name, clients(company_name, name), profiles!quotes_created_by_fkey(full_name), demonstration_start_date, demonstration_end_date, total_amount')
              .eq('is_demonstration', true)
              .not('demonstration_end_date', 'is', null)
              .order('demonstration_end_date', { ascending: true })
              .limit(30)
          );
        }

        // --- FINANCE QUERIES ---
        if (isFinanceiro || isGestor || isAdmin) {
          queries.push(
            db.from('bank_slips')
              .select('*')
              .in('status', ['A vencer', 'Vencido', 'Vence hoje'])
              .order('due_date', { ascending: true })
          );
        }

        // --- SUPPORT QUERIES ---
        if (isSupport || isGestor || isAdmin) {
          queries.push(
            db.from('technical_orders')
              .select('*')
              .not('status', 'in', '("entregue","cancelado")')
              .order('created_at', { ascending: true })
          );
        }

        const results = await Promise.all(queries.map(q => q.catch((err: any) => {
          console.error('[Operational] Query error:', err);
          return { data: [], error: err };
        })));
        let resultIdx = 0;

        const myQuotes = results[resultIdx++]?.data || [];
        const myForgottenClients = results[resultIdx++]?.data || [];
        const myOpportunities = results[resultIdx++]?.data || [];
        const myTasks = results[resultIdx++]?.data || [];
        const myDemonstrations = results[resultIdx++]?.data || [];

        const overdueFollowups = myQuotes.filter((q: any) => q.followup_date && isBefore(new Date(q.followup_date), now));
        const noResponseProposals = myQuotes.filter((q: any) => q.status === 'sent' && isBefore(new Date(q.updated_at), subDays(now, 3)));

        const newData = { ...data };

        newData.seller = {
          overdueFollowups,
          noResponseProposals,
          forgottenClients: myForgottenClients,
          smartOpportunities: myOpportunities,
          urgentTasks: myTasks,
          demonstrations: myDemonstrations
        };

        if (isGestor || isAdmin) {
          const teamSellers = results[resultIdx++]?.data || [];
          const stuckFunnels = results[resultIdx++]?.data || [];
          const teamDemonstrations = results[resultIdx++]?.data || [];
          
          newData.manager = {
            teamNoFollowup: teamSellers.filter((s: any) => Number(s.pending_count) > 5),
            stuckFunnels: stuckFunnels,
            forecastRisk: stuckFunnels.filter((q: any) => Number(q.total_amount) > 10000),
            topSellers: [...teamSellers].sort((a, b) => Number(b.total_value) - Number(a.total_value)).slice(0, 5),
            alerts: [
              ...(stuckFunnels.filter((q: any) => Number(q.total_amount) > 50000).map((q: any) => ({ type: 'high_value_stuck', data: q }))),
            ],
            teamDemonstrations
          };
        }

        if (isFinanceiro || isGestor || isAdmin) {
          const slips = results[resultIdx++]?.data || [];
          newData.finance = {
            expiringSlips: slips.filter((s: any) => s.status === 'Vence hoje' || s.status === 'A vencer'),
            overdueSlips: slips.filter((s: any) => s.status === 'Vencido'),
            delinquentClients: [], // logic to find reincidents could be added here
            priorityCollections: slips.filter((s: any) => s.status === 'Vencido' && s.updated_amount > 5000)
          };
        }

        if (isSupport || isGestor || isAdmin) {
          const orders = results[resultIdx++]?.data || [];
          newData.support = {
            overdueOS: orders.filter((o: any) => isBefore(new Date(o.created_at), subDays(now, 7))),
            waitingParts: orders.filter((o: any) => o.status === 'aguardando_peca'),
            waitingApproval: orders.filter((o: any) => o.status === 'aguardando_aprovacao'),
            readyEquipment: orders.filter((o: any) => o.status === 'pronto'),
            overloadedTechs: [] // logic to count per tech
          };
        }

        setData(newData);
      } catch (err) {
        console.error("Error loading operational data:", err);
        toast.error("Erro ao carregar alguns dados da central.");
      } finally {
        setLoading(false);
      }
    }

    loadAllData();
  }, [user?.id, isAdmin, isGestor, isFinanceiro, isSupport, refreshKey]);

  const handleQuickAction = (action: string, item: any) => {
    switch (action) {
      case 'open_quote':
        navigate(`/quotes?id=${item.id}`);
        break;
      case 'open_client':
        navigate(`/clients?id=${item.client_id || item.id}`);
        break;
      case 'whatsapp':
        const phone = item.phone || item.clients?.phone || item.contact_phone;
        if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
        else toast.error("Telefone não cadastrado");
        break;
      case 'follow_up':
        setSelectedFollowUp({
          id: item.id,
          company_name: item.clients?.company_name || item.client_name || item.name,
          contact_name: item.clients?.contact_name || item.contact_name || '',
          phone: item.clients?.phone || item.phone || '',
          daysAgo: differenceInDays(new Date(), new Date(item.updated_at || item.last_interaction_at || item.created_at)),
          quoteValue: parseFloat(item.total_amount) || 0,
          quoteNumber: item.quote_number || '',
          quoteStatus: item.status || '',
          quoteId: item.id,
          clientId: item.client_id || item.id
        });
        setFollowUpModalOpen(true);
        break;
      case 'open_os':
        navigate(`/suporte/os/${item.id}`);
        break;
      case 'open_slip':
        navigate(`/bank-slips?id=${item.id}`);
        break;
      default:
        toast.info(`Ação ${action} ainda não implementada.`);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Zap className="h-12 w-12 text-amber-500 animate-pulse" />
          <p className="text-muted-foreground animate-pulse font-medium">Sintonizando central operacional...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8 pb-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
                <Zap className="h-6 w-6 fill-amber-500" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight font-display">Central Operacional</h1>
            </div>
            <p className="text-muted-foreground">
              Prioridades e inteligência operacional para <span className="text-foreground font-semibold">{profile?.full_name}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PrivacyToggle />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setRefreshKey((key) => key + 1)}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
            <Badge variant="secondary" className="px-4 py-1.5 rounded-full font-bold uppercase tracking-wider text-[10px] hidden sm:inline-flex">
              {isAdmin ? "Admin" : isGestor ? "Gestor" : isFinanceiro ? "Financeiro" : isSupport ? "Suporte" : "Comercial"}
            </Badge>
          </div>
        </header>

        {/* ROLE SECTIONS */}
        <div className="space-y-10">
          
          {/* VENDEDOR SECTIONS */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Operação Comercial
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <OperationalCard 
                title="Follow-ups Atrasados"
                count={data.seller.overdueFollowups.length}
                priority={data.seller.overdueFollowups.length > 0 ? "urgent" : "normal"}
                icon={Clock}
                description="Contatos agendados que já passaram da data"
                items={data.seller.overdueFollowups.slice(0, 5).map((q: any) => ({
                  id: q.id,
                  title: q.clients?.company_name || q.client_name,
                  subtitle: `Venceu em ${format(new Date(q.followup_date), 'dd/MM')}`,
                  origin: `Orçamento ${q.quote_number}`,
                  actions: [
                    { label: 'Follow-up', icon: MessageSquare, onClick: () => handleQuickAction('follow_up', q) },
                    { label: 'Abrir', icon: ExternalLink, onClick: () => handleQuickAction('open_quote', q) }
                  ]
                }))}
              />

              <OperationalCard 
                title="Propostas sem Resposta"
                count={data.seller.noResponseProposals.length}
                priority={data.seller.noResponseProposals.length > 5 ? "attention" : "normal"}
                icon={MessageSquare}
                description="Enviadas há +3 dias sem interação"
                items={data.seller.noResponseProposals.slice(0, 5).map((q: any) => ({
                  id: q.id,
                  title: q.clients?.company_name || q.client_name,
                  subtitle: `${differenceInDays(new Date(), new Date(q.updated_at))} dias sem retorno`,
                  origin: maskValue(parseFloat(q.total_amount)),
                  actions: [
                    { label: 'WhatsApp', icon: Phone, onClick: () => handleQuickAction('whatsapp', q) },
                    { label: 'Abrir', icon: ExternalLink, onClick: () => handleQuickAction('open_quote', q) }
                  ]
                }))}
              />

              <OperationalCard 
                title="Clientes Esquecidos"
                count={data.seller.forgottenClients.length}
                priority={data.seller.forgottenClients.length > 0 ? "attention" : "normal"}
                icon={AlertCircle}
                description="Base sem contato há mais de 5 dias"
                items={data.seller.forgottenClients.slice(0, 5).map((c: any) => ({
                  id: c.id,
                  title: c.company_name || c.name,
                  subtitle: c.last_interaction_at ? `Último contato: ${format(new Date(c.last_interaction_at), 'dd/MM')}` : 'Nunca contatado',
                  origin: c.pipeline_stage || 'Lead',
                  actions: [
                    { label: 'WhatsApp', icon: Phone, onClick: () => handleQuickAction('whatsapp', c) },
                    { label: 'Abrir Cliente', icon: User, onClick: () => handleQuickAction('open_client', c) }
                  ]
                }))}
              />

              <OperationalCard 
                title="Oportunidades Inteligentes"
                count={data.seller.smartOpportunities.length}
                priority="normal"
                icon={Sparkles}
                description="Sugestões de Upsell e Cross-sell"
                items={data.seller.smartOpportunities.slice(0, 5).map((o: any) => ({
                  id: o.id,
                  title: o.clients?.company_name || 'Oportunidade',
                  subtitle: `${o.tipo_oportunidade}: ${o.motivo || ''}`,
                  origin: o.prioridade === 'alta' ? '🔥 Alta Prioridade' : 'Média',
                  actions: [
                    { label: 'Follow-up', icon: MessageSquare, onClick: () => handleQuickAction('follow_up', o) },
                    { label: 'Ver Detalhes', icon: ArrowUpRight, onClick: () => toast.info(o.motivo) }
                  ]
                }))}
              />

              <OperationalCard 
                title="Tarefas Urgentes"
                count={data.seller.urgentTasks.length}
                priority={data.seller.urgentTasks.some((t: any) => t.priority === 'alta') ? "urgent" : "attention"}
                icon={ClipboardList}
                description="Suas ações prioritárias para hoje"
                items={data.seller.urgentTasks.slice(0, 5).map((t: any) => ({
                  id: t.id,
                  title: t.title,
                  subtitle: t.due_date ? `Vence: ${format(new Date(t.due_date), 'dd/MM')}` : 'Sem data',
                  origin: t.type || 'Tarefa',
                  actions: [
                    { label: 'Concluir', icon: CheckCircle2, onClick: () => toast.success("Tarefa concluída!") },
                    { label: 'Abrir', icon: ExternalLink, onClick: () => navigate('/tasks') }
                  ]
                }))}
              />

              <OperationalCard
                title="Demonstrações Ativas"
                count={data.seller.demonstrations.length}
                priority={
                  data.seller.demonstrations.some((d: any) => {
                    const diff = differenceInDays(new Date(d.demonstration_end_date), new Date());
                    return diff < 0;
                  })
                    ? "urgent"
                    : data.seller.demonstrations.some((d: any) => differenceInDays(new Date(d.demonstration_end_date), new Date()) <= 3)
                    ? "attention"
                    : "normal"
                }
                icon={Package}
                description="Propostas em demonstração com prazo definido"
                items={data.seller.demonstrations.slice(0, 6).map((d: any) => {
                  const end = new Date(d.demonstration_end_date);
                  const diff = differenceInDays(end, new Date());
                  const label =
                    diff < 0 ? `🔴 Vencida há ${Math.abs(diff)}d` :
                    diff === 0 ? '⏰ Vence hoje' :
                    diff <= 3 ? `⚠️ ${diff}d restantes` :
                    `${diff}d restantes`;
                  return {
                    id: d.id,
                    title: d.clients?.company_name || d.clients?.name || d.client_name,
                    subtitle: `Fim: ${format(end, 'dd/MM/yyyy')} · ${label}`,
                    origin: `${d.quote_number} · ${maskValue(parseFloat(d.total_amount) || 0)}`,
                    actions: [
                      { label: 'WhatsApp', icon: Phone, onClick: () => handleQuickAction('whatsapp', d) },
                      { label: 'Abrir', icon: ExternalLink, onClick: () => handleQuickAction('open_quote', d) }
                    ]
                  };
                })}
              />
            </div>
          </section>


          {/* GESTOR SECTIONS */}
          {isGestor && (
            <section className="space-y-4 pt-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Gestão de Performance
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <OperationalCard 
                  title="Equipe com Gargalo"
                  count={data.manager.teamNoFollowup.length}
                  priority="attention"
                  icon={Users}
                  description="Vendedores com mais de 5 orçamentos parados"
                  items={data.manager.teamNoFollowup.slice(0, 5).map((s: any) => ({
                    id: s.user_id,
                    title: s.full_name,
                    subtitle: `${s.pending_count} orçamentos em aberto`,
                    origin: `Total ${maskValue(parseFloat(s.total_value))}`,
                    actions: [
                      { label: 'Cobrar', icon: MessageSquare, onClick: () => toast.info(`Lembrete enviado para ${s.full_name}`) },
                      { label: 'Abrir Dashboard', icon: BarChart3, onClick: () => navigate(`/dashboard?seller=${s.user_id}`) }
                    ]
                  }))}
                />

                <OperationalCard 
                  title="Negociações Travadas"
                  count={data.manager.stuckFunnels.length}
                  priority="attention"
                  icon={Filter}
                  description="Propostas do time sem atualização há +3 dias"
                  items={data.manager.stuckFunnels.slice(0, 5).map((q: any) => ({
                    id: q.id,
                    title: q.clients?.company_name || q.client_name,
                    subtitle: `${q.profiles?.full_name} · ${differenceInDays(new Date(), new Date(q.updated_at))} dias`,
                    origin: `R$ ${parseFloat(q.total_amount).toLocaleString('pt-BR')}`,
                    actions: [
                      { label: 'Abrir', icon: ExternalLink, onClick: () => handleQuickAction('open_quote', q) }
                    ]
                  }))}
                />

                <OperationalCard 
                  title="Top Vendedores (Faturamento)"
                  count={data.manager.topSellers.length}
                  priority="normal"
                  icon={TrendingUp}
                  description="Ranking de vendas confirmadas do mês"
                  items={data.manager.topSellers.map((s: any, idx: number) => ({
                    id: s.user_id,
                    title: `${idx + 1}. ${s.full_name}`,
                    subtitle: `${s.approved_count} aprovações`,
                    origin: maskValue(parseFloat(s.total_value)),
                    actions: [
                      { label: 'Parabenizar', icon: Sparkles, onClick: () => toast.success(`Elogio enviado para ${s.full_name}!`) }
                    ]
                  }))}
                />

                <OperationalCard
                  title="Demonstrações da Equipe"
                  count={data.manager.teamDemonstrations.length}
                  priority={
                    data.manager.teamDemonstrations.some((d: any) => differenceInDays(new Date(d.demonstration_end_date), new Date()) < 0)
                      ? "urgent"
                      : data.manager.teamDemonstrations.some((d: any) => differenceInDays(new Date(d.demonstration_end_date), new Date()) <= 3)
                      ? "attention"
                      : "normal"
                  }
                  icon={Package}
                  description="Todas as demonstrações ativas do time"
                  items={data.manager.teamDemonstrations.slice(0, 8).map((d: any) => {
                    const end = new Date(d.demonstration_end_date);
                    const diff = differenceInDays(end, new Date());
                    const label =
                      diff < 0 ? `🔴 Vencida há ${Math.abs(diff)}d` :
                      diff === 0 ? '⏰ Vence hoje' :
                      diff <= 3 ? `⚠️ ${diff}d restantes` :
                      `${diff}d restantes`;
                    return {
                      id: d.id,
                      title: d.clients?.company_name || d.clients?.name || d.client_name,
                      subtitle: `${d.profiles?.full_name || '—'} · ${label}`,
                      origin: `${d.quote_number} · Fim ${format(end, 'dd/MM')}`,
                      actions: [
                        { label: 'Abrir', icon: ExternalLink, onClick: () => handleQuickAction('open_quote', d) }
                      ]
                    };
                  })}
                />
              </div>
            </section>
          )}


          {/* FINANCE SECTIONS */}
          {(isFinanceiro || isGestor || isAdmin) && (
            <section className="space-y-4 pt-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Fluxo Financeiro
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <OperationalCard 
                  title="Boletos Vencendo Hoje"
                  count={data.finance.expiringSlips.filter((s: any) => s.status === 'Vence hoje').length}
                  priority="attention"
                  icon={Clock}
                  description="Títulos com vencimento para data atual"
                  items={data.finance.expiringSlips.filter((s: any) => s.status === 'Vence hoje').slice(0, 5).map((s: any) => ({
                    id: s.id,
                    title: s.client_name,
                    subtitle: `Vence hoje: ${maskValue(s.updated_amount)}`,
                    origin: s.dda || 'DDA',
                    actions: [
                      { label: 'Abrir', icon: ExternalLink, onClick: () => handleQuickAction('open_slip', s) }
                    ]
                  }))}
                />

                <OperationalCard 
                  title="Inadimplência Crítica"
                  count={data.finance.overdueSlips.length}
                  priority="urgent"
                  icon={AlertTriangle}
                  description="Títulos vencidos que precisam de cobrança"
                  items={data.finance.overdueSlips.slice(0, 5).map((s: any) => ({
                    id: s.id,
                    title: s.client_name,
                    subtitle: `Vencido há ${differenceInDays(new Date(), new Date(s.due_date))} dias`,
                    origin: maskValue(s.updated_amount),
                    actions: [
                      { label: 'Cobrar', icon: DollarSign, onClick: () => handleQuickAction('open_slip', s) },
                      { label: 'WhatsApp', icon: Phone, onClick: () => handleQuickAction('whatsapp', s) }
                    ]
                  }))}
                />

                <OperationalCard 
                  title="Cobranças Prioritárias"
                  count={data.finance.priorityCollections.length}
                  priority="urgent"
                  icon={DollarSign}
                  description="Valores altos (+ R$ 5k) em atraso"
                  items={data.finance.priorityCollections.slice(0, 5).map((s: any) => ({
                    id: s.id,
                    title: s.client_name,
                    subtitle: maskValue(s.updated_amount),
                    origin: 'Ticket Alto',
                    actions: [
                      { label: 'Ação Rápida', icon: Zap, onClick: () => handleQuickAction('open_slip', s) }
                    ]
                  }))}
                />
              </div>
            </section>
          )}

          {/* SUPPORT SECTIONS */}
          {(isSupport || isGestor || isAdmin) && (
            <section className="space-y-4 pt-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Suporte e Laboratório
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <OperationalCard 
                  title="OS com Atraso (+7 dias)"
                  count={data.support.overdueOS.length}
                  priority="urgent"
                  icon={Clock}
                  description="Entradas antigas sem conclusão"
                  items={data.support.overdueOS.slice(0, 5).map((o: any) => ({
                    id: o.id,
                    title: `${o.os_number} - ${o.equipment}`,
                    subtitle: `${o.client_name} · Aberta há ${differenceInDays(new Date(), new Date(o.created_at))} dias`,
                    origin: o.status,
                    actions: [
                      { label: 'Abrir OS', icon: ExternalLink, onClick: () => handleQuickAction('open_os', o) }
                    ]
                  }))}
                />

                <OperationalCard 
                  title="Aguardando Ação Externa"
                  count={data.support.waitingParts.length + data.support.waitingApproval.length}
                  priority="attention"
                  icon={Package}
                  description="OS paradas por peça ou aprovação"
                  items={[...data.support.waitingParts, ...data.support.waitingApproval].slice(0, 5).map((o: any) => ({
                    id: o.id,
                    title: `${o.os_number} - ${o.equipment}`,
                    subtitle: o.status === 'aguardando_peca' ? 'Aguardando Peça' : 'Aguardando Aprovação',
                    origin: o.client_name,
                    actions: [
                      { label: 'Cobrar Peça', icon: Package, onClick: () => toast.info("Cobrança de peça enviada") },
                      { label: 'Follow-up', icon: MessageSquare, onClick: () => handleQuickAction('whatsapp', o) }
                    ]
                  }))}
                />

                <OperationalCard 
                  title="Equipamentos Prontos"
                  count={data.support.readyEquipment.length}
                  priority="normal"
                  icon={CheckCircle2}
                  description="Manutenções concluídas aguardando retirada"
                  items={data.support.readyEquipment.slice(0, 5).map((o: any) => ({
                    id: o.id,
                    title: `${o.os_number} - ${o.equipment}`,
                    subtitle: `Valor: R$ ${parseFloat(o.total_value || 0).toFixed(2)}`,
                    origin: o.client_name,
                    actions: [
                      { label: 'Notificar Cliente', icon: MessageSquare, onClick: () => handleQuickAction('whatsapp', o) }
                    ]
                  }))}
                />
              </div>
            </section>
          )}

        </div>
      </div>

      {selectedFollowUp && (
        <FollowUpGeneratorModal 
          open={followUpModalOpen}
          onOpenChange={setFollowUpModalOpen}
          client={selectedFollowUp}
          sellerName={profile?.full_name || 'Vendedor'}
          onMarkContacted={() => {
            setFollowUpModalOpen(false);
            toast.success("Interação registrada!");
          }}
        />
      )}
    </AppLayout>
  );
}

function OperationalCard({ title, count, priority, icon: Icon, description, items }: any) {
  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG];

  return (
    <Card className={cn(
      "overflow-hidden border-2 transition-all duration-300 hover:shadow-xl group",
      priority === 'urgent' ? "border-red-500/20 shadow-red-500/5" : 
      priority === 'attention' ? "border-amber-500/20 shadow-amber-500/5" : 
      "border-emerald-500/20 shadow-emerald-500/5"
    )}>
      <CardHeader className="pb-3 border-b bg-muted/5 group-hover:bg-muted/10 transition-colors">
        <div className="flex items-center justify-between">
          <div className={cn("p-2 rounded-xl", config.bg + "/10", config.text)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-bold uppercase tracking-tighter", config.text)}>
              {config.label}
            </span>
            <Badge className={cn("text-lg font-black px-3 py-0.5 rounded-lg border-none shadow-sm", config.bg, "text-white")}>
              {count}
            </Badge>
          </div>
        </div>
        <CardTitle className="text-xl mt-3 font-display tracking-tight leading-none">{title}</CardTitle>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {items && items.length > 0 ? (
            items.map((item: any) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-all group/item"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold truncate group-hover/item:text-primary transition-colors">{item.title}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                    <span className="truncate">{item.subtitle}</span>
                    <span className="opacity-30">•</span>
                    <span className="text-primary/70">{item.origin}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 ml-3">
                  {item.actions && item.actions.length > 0 && (
                    <ActionMenu 
                      actions={item.actions.map((act: any) => ({
                        ...act,
                        isPrimary: act.label === 'WhatsApp' || act.label === 'Follow-up' || act.label === 'Cobrar',
                        isSecondary: act.label === 'Abrir' || act.label === 'Ver Detalhes' || act.label === 'Abrir Cliente'
                      }))}
                    />
                  )}
                  {(!item.actions || item.actions.length === 0) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={item.onClick}>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center px-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/5 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-500/30" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">Nenhuma pendência</p>
              <p className="text-[10px] text-muted-foreground/60 max-w-[180px] mt-1">Ótimo trabalho! Você está em dia com esta área operacional.</p>
            </div>
          )}
        </div>
        
        {count > (items?.length || 0) && (
          <div className="p-3 border-t bg-muted/5">
            <Button variant="ghost" className="w-full text-[10px] font-bold uppercase tracking-widest h-8 text-muted-foreground hover:text-primary gap-2">
              Ver todos os {count} <ArrowUpRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

