import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, User, Briefcase, Wrench, Package, MessageSquare } from 'lucide-react';

const db = supabase as any;

interface Props {
  clientId: string;
}

export default function ClientHistory360({ clientId }: Props) {
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<any>(null);
  const [salesperson, setSalesperson] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [techClient, setTechClient] = useState<any>(null);
  const [maintenances, setMaintenances] = useState<any[]>([]);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const { data: c } = await db.from('clients').select('*').eq('id', clientId).maybeSingle();
      setClient(c);

      if (c?.salesperson_id) {
        const { data: sp } = await db.from('profiles').select('full_name').eq('user_id', c.salesperson_id).maybeSingle();
        setSalesperson(sp);
      }

      const [{ data: q }, { data: o }, { data: tc }] = await Promise.all([
        db.from('quotes').select('id,quote_number,status,total_amount,total,created_at,payment_status').eq('client_id', clientId).order('created_at', { ascending: false }),
        db.from('smart_opportunities').select('*').eq('cliente_id', clientId).order('created_at', { ascending: false }),
        db.from('technical_clients').select('*').eq('crm_client_id', clientId).maybeSingle(),
      ]);
      setQuotes(q || []);
      setOpps(o || []);
      setTechClient(tc);

      if (tc?.id) {
        const [{ data: os }, { data: m }] = await Promise.all([
          db.from('technical_orders').select('id,os_number,equipment,status,total_value,created_at').eq('client_id', tc.id).order('created_at', { ascending: false }),
          db.from('technical_maintenances').select('*').eq('client_id', tc.id).order('created_at', { ascending: false }),
        ]);
        setOrders(os || []);
        setMaintenances(m || []);
      }
      setLoading(false);
    })();
  }, [clientId]);

  if (loading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…</div>;
  if (!client) return <p className="text-muted-foreground py-4">Cliente não encontrado.</p>;

  const purchased = quotes.filter(q => ['approved', 'Aprovado', 'Entregue', 'Faturado'].includes(q.status));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg">{client.company_name || client.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{client.cpf_cnpj} · {client.email} · {client.phone}</p>
              <p className="text-xs text-muted-foreground mt-1">{[client.address, client.city, client.state].filter(Boolean).join(', ')}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={salesperson ? 'default' : 'outline'} className="gap-1">
                <User className="h-3 w-3" />
                {salesperson ? `Carteira: ${salesperson.full_name}` : 'Sem vendedor atribuído'}
              </Badge>
              {techClient && <Badge variant="secondary">Também cliente do Suporte</Badge>}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="quotes">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="quotes"><Briefcase className="h-3 w-3 mr-1" />Orçamentos ({quotes.length})</TabsTrigger>
          <TabsTrigger value="purchases"><Package className="h-3 w-3 mr-1" />Compras ({purchased.length})</TabsTrigger>
          <TabsTrigger value="opps"><MessageSquare className="h-3 w-3 mr-1" />Inteligência ({opps.length})</TabsTrigger>
          <TabsTrigger value="support"><Wrench className="h-3 w-3 mr-1" />Chamados ({orders.length})</TabsTrigger>
          <TabsTrigger value="equipment">Equipamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="quotes">
          <HistoryTable
            rows={quotes}
            columns={[
              { h: 'Nº', r: (q) => q.quote_number },
              { h: 'Status', r: (q) => <Badge variant="outline">{q.status}</Badge> },
              { h: 'Valor', r: (q) => `R$ ${Number(q.total_amount || q.total || 0).toFixed(2)}` },
              { h: 'Data', r: (q) => new Date(q.created_at).toLocaleDateString('pt-BR') },
            ]}
            empty="Nenhum orçamento"
          />
        </TabsContent>

        <TabsContent value="purchases">
          <HistoryTable
            rows={purchased}
            columns={[
              { h: 'Nº', r: (q) => q.quote_number },
              { h: 'Status', r: (q) => <Badge>{q.status}</Badge> },
              { h: 'Pagto', r: (q) => q.payment_status || '-' },
              { h: 'Valor', r: (q) => `R$ ${Number(q.total_amount || q.total || 0).toFixed(2)}` },
              { h: 'Data', r: (q) => new Date(q.created_at).toLocaleDateString('pt-BR') },
            ]}
            empty="Nenhuma compra aprovada"
          />
        </TabsContent>

        <TabsContent value="opps">
          <HistoryTable
            rows={opps}
            columns={[
              { h: 'Tipo', r: (o) => o.tipo_oportunidade },
              { h: 'Prioridade', r: (o) => <Badge variant="outline">{o.prioridade}</Badge> },
              { h: 'Status', r: (o) => o.status },
              { h: 'Motivo', r: (o) => <span className="text-xs">{o.motivo}</span> },
              { h: 'Data', r: (o) => new Date(o.created_at).toLocaleDateString('pt-BR') },
            ]}
            empty="Nenhuma oportunidade"
          />
        </TabsContent>

        <TabsContent value="support">
          <HistoryTable
            rows={orders}
            columns={[
              { h: 'OS', r: (o) => o.os_number },
              { h: 'Equipamento', r: (o) => o.equipment },
              { h: 'Status', r: (o) => <Badge variant="outline">{o.status}</Badge> },
              { h: 'Valor', r: (o) => `R$ ${Number(o.total_value || 0).toFixed(2)}` },
              { h: 'Data', r: (o) => new Date(o.created_at).toLocaleDateString('pt-BR') },
            ]}
            empty="Nenhum chamado técnico"
          />
        </TabsContent>

        <TabsContent value="equipment">
          <Card><CardContent className="pt-4">
            {techClient?.equipments && Array.isArray(techClient.equipments) && techClient.equipments.length > 0 ? (
              <ul className="text-sm space-y-2">
                {techClient.equipments.map((e: any, i: number) => (
                  <li key={i} className="border rounded p-2">
                    <div className="font-medium">{e.name || e.equipment || 'Equipamento'}</div>
                    <div className="text-xs text-muted-foreground">{[e.brand, e.model, e.serial].filter(Boolean).join(' · ')}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado</p>
            )}
            {maintenances.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2">Manutenções</h4>
                <ul className="text-xs space-y-1">
                  {maintenances.map((m: any) => (
                    <li key={m.id} className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString('pt-BR')} — {m.description || m.type || 'Manutenção'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HistoryTable({ rows, columns, empty }: { rows: any[]; columns: { h: string; r: (r: any) => any }[]; empty: string }) {
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>{columns.map(c => <TableHead key={c.h}>{c.h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={row.id || i}>{columns.map(c => <TableCell key={c.h}>{c.r(row)}</TableCell>)}</TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-6">{empty}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
