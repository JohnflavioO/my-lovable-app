import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Phone, Clock, Sparkles, FileText } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import FollowUpGeneratorModal from './FollowUpGeneratorModal';

const db = supabase as any;

const ACTIVE_STATUSES = ['sent', 'negociacao', 'negotiation', 'contato_feito', 'contact_made', 'pre_sale', 'pre_venda'];


interface FollowUpOpportunity {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  last_interaction_at: string;
  pipeline_stage: string;
  daysAgo: number;
  quoteValue: number;
  quoteNumber: string;
  quoteStatus: string;
  quoteId: string;
  clientId: string;
  alertType: 'today' | 'overdue' | 'forgotten' | 'no_return';
}

const stageLabels: Record<string, string> = {
  sent: 'Proposta Enviada',
  negociacao: 'Negociação',
  negotiation: 'Negociação',
  contato_feito: 'Contato Feito',
  contact_made: 'Contato Feito',
  pre_sale: 'Pré-venda',
  pre_venda: 'Pré-venda',
};

export default function FollowUpAlerts() {
  const { user } = useAuth();
  const { profile } = useAuth();
  const [opportunities, setOpportunities] = useState<FollowUpOpportunity[]>([]);
  const [selectedClient, setSelectedClient] = useState<FollowUpOpportunity | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;

      // 1. Fetch quotes for today or overdue follow-ups
      // 2. Fetch forgotten quotes (no interaction for 3+ days and no future follow-up)
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const { data: quotesData, error: quotesError } = await db
        .from('quotes')
        .select('*')
        .in('status', ACTIVE_STATUSES)
        .eq('created_by', user.id);

      if (quotesError || !quotesData) {
        setOpportunities([]);
        return;
      }

      const clientIds = [...new Set(quotesData.map((q: any) => q.client_id).filter(Boolean))];
      let clientsMap: Record<string, any> = {};
      if (clientIds.length > 0) {
        const { data: clientsData } = await db
          .from('clients')
          .select('id, company_name, contact_name, phone, last_interaction_at')
          .in('id', clientIds);
        (clientsData || []).forEach((c: any) => { clientsMap[c.id] = c; });
      }

      const items: FollowUpOpportunity[] = quotesData
        .map((q: any) => {
          const client = q.client_id ? clientsMap[q.client_id] : null;
          const lastActivity = client?.last_interaction_at || q.updated_at || q.created_at;
          const daysAgo = differenceInDays(now, new Date(lastActivity));
          const value = parseFloat(q.total_amount) || parseFloat(q.total) || 0;
          
          let alertType: 'today' | 'overdue' | 'forgotten' | 'no_return' | null = null;
          
          if (q.followup_date) {
            const fDateStr = q.followup_date.split('T')[0];
            if (fDateStr === todayStr) alertType = 'today';
            else if (fDateStr < todayStr) alertType = 'overdue';
          }

          if (!alertType) {
            if (q.status === 'sent' && daysAgo >= 3) alertType = 'no_return';
            else if (daysAgo >= 5) alertType = 'forgotten';
          }

          if (!alertType) return null;

          return {
            id: q.id,
            company_name: client?.company_name || q.client_name || 'Sem nome',
            contact_name: client?.contact_name || '',
            phone: client?.phone || '',
            last_interaction_at: lastActivity,
            pipeline_stage: q.status || 'sent',
            daysAgo,
            quoteValue: value,
            quoteNumber: q.quote_number || '',
            quoteStatus: q.status || '',
            quoteId: q.id,
            clientId: q.client_id || '',
            alertType
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          // Priority: Overdue > Today > No Return > Forgotten
          const p: Record<string, number> = { overdue: 4, today: 3, no_return: 2, forgotten: 1 };
          if (p[b.alertType] !== p[a.alertType]) return p[b.alertType] - p[a.alertType];
          return b.daysAgo - a.daysAgo;
        })
        .slice(0, 10);

      setOpportunities(items);
    };
    load();
  }, [user?.id]);

  if (opportunities.length === 0) return null;

  const markInteraction = async (opp: FollowUpOpportunity) => {
    // Update client last_interaction_at if client exists
    if (opp.clientId) {
      await db.from('clients').update({ last_interaction_at: new Date().toISOString() }).eq('id', opp.clientId);
    }
    // Also touch the quote updated_at
    await db.from('quotes').update({ updated_at: new Date().toISOString() }).eq('id', opp.quoteId);
    setOpportunities(prev => prev.filter(o => o.id !== opp.id));
  };

  const openFollowUp = (opp: FollowUpOpportunity) => {
    setSelectedClient(opp);
    setModalOpen(true);
  };

  const getUrgencyBadge = (opp: FollowUpOpportunity) => {
    if (opp.alertType === 'overdue') return <Badge variant="destructive" className="text-[10px]">Vencido</Badge>;
    if (opp.alertType === 'today') return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Hoje</Badge>;
    if (opp.alertType === 'no_return') return <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">Sem Retorno</Badge>;
    if (opp.daysAgo >= 5) return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Esquecido</Badge>;
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">Pendente</Badge>;
  };

  const formatCurrency = (v: number) =>
    v > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '';

  return (
    <>
      <Card className="shadow-card border-l-4 border-l-amber-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Follow-up Inteligente
            <Badge variant="destructive" className="ml-auto">{opportunities.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Propostas abertas que precisam de retomada comercial</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {opportunities.map(opp => (
              <div key={opp.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{opp.company_name}</p>
                    {getUrgencyBadge(opp)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {opp.quoteNumber}
                    </span>
                    <span className="text-primary/70">{stageLabels[opp.pipeline_stage] || opp.pipeline_stage}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {opp.daysAgo}d sem contato
                    </span>
                    {opp.quoteValue > 0 && (
                      <span className="font-medium text-foreground">{formatCurrency(opp.quoteValue)}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => openFollowUp(opp)} title="Gerar follow-up inteligente">
                    <Sparkles className="h-3 w-3 mr-1 text-amber-500" /> Follow-up
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => markInteraction(opp)} title="Marcar como contatado">
                    <Phone className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedClient && (
        <FollowUpGeneratorModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          client={selectedClient}
          sellerName={profile?.full_name || 'Vendedor'}
          onMarkContacted={() => {
            markInteraction(selectedClient);
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
