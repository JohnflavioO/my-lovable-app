import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ExternalLink, Truck } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  aguardando_entrada: 'Aguardando Entrada',
  entrada_realizada: 'Entrada Realizada',
  emitindo_nf: 'Emitindo NF',
  nf_emitida: 'NF Emitida',
  em_separacao: 'Em Separação',
  pronto_envio: 'Pronto para Envio',
  enviado: 'Enviado',
  em_transporte: 'Em Transporte',
  entregue: 'Entregue',
  problema_logistico: 'Problema Logístico',
};

const STATUS_PROGRESS: Record<string, number> = {
  aguardando_entrada: 20,
  entrada_realizada: 20,
  emitindo_nf: 40,
  nf_emitida: 40,
  em_separacao: 60,
  pronto_envio: 60,
  enviado: 80,
  em_transporte: 80,
  entregue: 100,
  problema_logistico: 10,
};

export default function LogisticsTracking() {
  const { token } = useParams();
  const [record, setRecord] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await client.rpc('get_public_logistics_tracking' as any, { p_token: token });
      if (data) {
        const payload = data as any;
        setRecord(payload.record);
        setQuote(payload.quote);
        setHistory(payload.history || []);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!record) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Pedido não encontrado</div>;

  const progress = STATUS_PROGRESS[record.logistics_status] ?? 0;
  const statusLabel = STATUS_LABELS[record.logistics_status] || record.logistics_status;
  const lastUpdate = record.updated_at ? new Date(record.updated_at).toLocaleString('pt-BR') : '-';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center justify-center gap-2">
            <Truck className="h-7 w-7" /> Acompanhe seu Pedido
          </h1>
          <p className="text-muted-foreground mt-1">Pedido {quote?.quote_number || '-'}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{quote?.client_name || 'Cliente'}</span>
              <Badge>{statusLabel}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progresso</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground block">Última atualização</span>
                <strong>{lastUpdate}</strong>
              </div>
              {record.transportadora && (
                <div>
                  <span className="text-muted-foreground block">Transportadora</span>
                  <strong>{record.transportadora}</strong>
                </div>
              )}
              {record.codigo_rastreio && (
                <div>
                  <span className="text-muted-foreground block">Código de Rastreio</span>
                  <strong className="font-mono">{record.codigo_rastreio}</strong>
                </div>
              )}
              {record.data_envio && (
                <div>
                  <span className="text-muted-foreground block">Enviado em</span>
                  <strong>{new Date(record.data_envio).toLocaleDateString('pt-BR')}</strong>
                </div>
              )}
              {record.data_entrega && (
                <div>
                  <span className="text-muted-foreground block">Entregue em</span>
                  <strong>{new Date(record.data_entrega).toLocaleDateString('pt-BR')}</strong>
                </div>
              )}
            </div>

            {record.tracking_url && (
              <a href={record.tracking_url} target="_blank" rel="noreferrer">
                <Button className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" /> Rastrear na Transportadora
                </Button>
              </a>
            )}

            {record.observacao_logistica && (
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Observações da Logística</span>
                <p className="whitespace-pre-wrap">{record.observacao_logistica}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-2 flex-wrap">
                    {h.new_status && <Badge variant="outline">{STATUS_LABELS[h.new_status] || h.new_status}</Badge>}
                    <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                    {h.notes && <span className="text-muted-foreground">— {h.notes}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
