import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type Preview = {
  preview: true;
  action_id: string;
  action_type: string;
  tool_name: string;
  summary: string;
  details: any;
  resolved?: 'confirmed' | 'cancelled';
};

interface Props {
  preview: Preview;
  onResolved: () => void;
}

export default function PreviewActionCard({ preview, onResolved }: Props) {
  const [busy, setBusy] = useState<null | 'confirm' | 'cancel'>(null);
  const resolved = preview.resolved;

  const call = async (decision: 'confirm' | 'cancel') => {
    setBusy(decision);
    try {
      const { data, error } = await supabase.functions.invoke('assistant-commercial/confirm', {
        body: { action_id: preview.action_id, decision },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(decision === 'confirm' ? 'Ação executada com sucesso.' : 'Ação cancelada.');
      onResolved();
    } catch (e: any) {
      toast.error('Falha ao processar ação', { description: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-primary/40 bg-primary/[0.02]">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Confirmação necessária
          <Badge variant="outline" className="text-[10px] font-normal">{preview.action_type}</Badge>
          {resolved === 'confirmed' && <Badge className="text-[10px]" variant="secondary">Executado</Badge>}
          {resolved === 'cancelled' && <Badge className="text-[10px]" variant="outline">Cancelado</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[15px] font-medium">{preview.summary}</p>
        {preview.details && (
          <div className="rounded-md border border-border/60 bg-background p-3 text-xs space-y-1">
            {Object.entries(preview.details).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-muted-foreground min-w-[120px] capitalize">{k.replace(/_/g, ' ')}:</span>
                <span className="font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</span>
              </div>
            ))}
          </div>
        )}
        {!resolved && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Nada será gravado até você confirmar. Expira em 10 minutos.
            </div>
            <div className="flex gap-2">
              <Button onClick={() => call('confirm')} disabled={!!busy} className="flex-1">
                {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Confirmar e executar
              </Button>
              <Button variant="outline" onClick={() => call('cancel')} disabled={!!busy}>
                {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Cancelar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
