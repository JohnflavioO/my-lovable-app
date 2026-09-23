import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle } from 'lucide-react';

const STATUS_FLOW = [
  { key: 'recebido', label: 'Recebido' },
  { key: 'diagnostico', label: 'Diagnóstico' },
  { key: 'aguardando_aprovacao', label: 'Aguardando Aprovação' },
  { key: 'aguardando_peca', label: 'Aguardando Peça' },
  { key: 'em_reparo', label: 'Em Reparo' },
  { key: 'pronto', label: 'Pronto' },
  { key: 'entregue', label: 'Entregue' },
];

export default function PublicTracking() {
  const { token } = useParams();
  const [os, setOs] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await client.rpc('get_public_technical_tracking' as any, { p_token: token });
      if (data) {
        const payload = data as any;
        setOs(payload.order);
        setHistory(payload.history || []);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!os) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">OS não encontrada</div>;

  const currentIdx = STATUS_FLOW.findIndex(s => s.key === os.status);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <img src="/mci-logo.png" alt="MCI" className="h-12 mx-auto mb-3" />
          <h1 className="text-2xl md:text-3xl font-bold">Acompanhamento da OS</h1>
          <p className="text-muted-foreground">{os.os_number}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{os.equipment}</span>
              <Badge>{STATUS_FLOW.find(s => s.key === os.status)?.label || os.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Cliente:</span> {os.client_name}</div>
            {os.brand && <div><span className="text-muted-foreground">Marca/Modelo:</span> {os.brand} {os.model}</div>}
            {os.estimated_date && <div><span className="text-muted-foreground">Previsão:</span> {new Date(os.estimated_date).toLocaleDateString('pt-BR')}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Andamento</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {STATUS_FLOW.map((s, i) => {
                const done = i <= currentIdx && os.status !== 'cancelado';
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                    <span className={done ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-2">
                    <Badge variant="outline">{STATUS_FLOW.find(s => s.key === h.new_status)?.label || h.new_status}</Badge>
                    <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
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
