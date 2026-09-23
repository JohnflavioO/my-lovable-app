import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { ArrowLeft, Bot, Wrench, History, Shield, Palette, Bell, Activity, Trash2, Download, FileSearch } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'assistant_settings_v1';

type Settings = {
  model: string;
  provider: string;
  temperature: number;
  contextLimit: number;
  streaming: boolean;
  tools: Record<string, boolean>;
  requireConfirmation: boolean;
  showPreview: boolean;
  auditEnabled: boolean;
  autoSuggestions: boolean;
  insightCards: boolean;
  quickShortcuts: boolean;
  theme: 'system' | 'light' | 'dark';
  notifications: boolean;
  sounds: boolean;
  smartReminders: boolean;
};

const DEFAULTS: Settings = {
  model: 'google/gemini-2.5-flash',
  provider: 'Lovable AI Gateway',
  temperature: 0.3,
  contextLimit: 16000,
  streaming: false,
  tools: {
    'Consultar clientes': true,
    'Consultar produtos': true,
    'Consultar orçamento': true,
    'Criar orçamento': true,
    'Criar cliente': true,
    'Editar cliente': true,
    'Criar tarefa': true,
    'Criar follow-up': true,
    'Gerar contrato': false,
    'Gerar PDF': false,
  },
  requireConfirmation: true,
  showPreview: true,
  auditEnabled: true,
  autoSuggestions: true,
  insightCards: true,
  quickShortcuts: true,
  theme: 'system',
  notifications: true,
  sounds: false,
  smartReminders: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export default function AssistantSettings() {
  const navigate = useNavigate();
  const { user, isAdmin, isGestor } = useAuth();
  const [s, setS] = useState<Settings>(loadSettings);
  const [diag, setDiag] = useState<{ tokens: number; avgMs: number; lastError: string | null; keyConfigured: boolean }>({
    tokens: 0, avgMs: 0, lastError: null, keyConfigured: true,
  });

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const toggleTool = (name: string, v: boolean) => setS((prev) => ({ ...prev, tools: { ...prev.tools, [name]: v } }));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, [s]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('assistant_audit_log' as any)
          .select('tokens_total, execution_time_ms, execution_status, error_message')
          .order('created_at', { ascending: false })
          .limit(50);
        if (!data) return;
        const tokens = data.reduce((a: number, r: any) => a + (r.tokens_total || 0), 0);
        const times = data.map((r: any) => r.execution_time_ms).filter(Boolean);
        const avg = times.length ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length) : 0;
        const err = (data as any[]).find((r: any) => r.execution_status === 'error')?.error_message || null;
        setDiag({ tokens, avgMs: avg, lastError: err, keyConfigured: true });
      } catch { /* silent */ }
    })();
  }, []);

  const clearHistory = async () => {
    if (!user || !confirm('Limpar todo o histórico de conversas?')) return;
    try {
      await supabase.from('assistant_conversations' as any).delete().eq('user_id', user.id);
      toast.success('Histórico limpo com sucesso');
    } catch (e: any) {
      toast.error('Erro ao limpar histórico');
    }
  };

  const exportHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('assistant_conversations' as any)
      .select('*, assistant_messages(*)')
      .eq('user_id', user.id);
    const blob = new Blob([JSON.stringify(data || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assistente-historico-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Histórico exportado');
  };

  const canAudit = isAdmin || isGestor;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/assistente')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">Configurações do Assistente</h1>
            <p className="text-sm text-muted-foreground">Ajuste o comportamento do Copiloto Comercial.</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> IA</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div><Label>Modelo</Label><Input value={s.model} onChange={(e) => update('model', e.target.value)} /></div>
              <div><Label>Provider</Label><Input value={s.provider} onChange={(e) => update('provider', e.target.value)} /></div>
            </div>
            <div>
              <Label>Temperatura: {s.temperature.toFixed(2)}</Label>
              <Slider value={[s.temperature]} min={0} max={1} step={0.05} onValueChange={([v]) => update('temperature', v)} />
            </div>
            <div>
              <Label>Limite de contexto (tokens)</Label>
              <Input type="number" value={s.contextLimit} onChange={(e) => update('contextLimit', Number(e.target.value))} />
            </div>
            <div className="flex items-center justify-between"><Label>Streaming</Label><Switch checked={s.streaming} onCheckedChange={(v) => update('streaming', v)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Ferramentas</CardTitle><CardDescription>Ative ou desative as capacidades do Assistente.</CardDescription></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3">
            {Object.entries(s.tools).map(([name, enabled]) => (
              <div key={name} className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm">{name}</span>
                <Switch checked={enabled} onCheckedChange={(v) => toggleTool(name, v)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Histórico</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={clearHistory}><Trash2 className="h-4 w-4" /> Limpar histórico</Button>
            <Button variant="outline" onClick={exportHistory}><Download className="h-4 w-4" /> Exportar histórico</Button>
            <Button variant="outline" disabled={!canAudit} onClick={() => navigate('/assistente/auditoria')}>
              <FileSearch className="h-4 w-4" /> Mostrar auditoria
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Segurança</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><Label>Exigir confirmação antes de gravar</Label><Switch checked={s.requireConfirmation} onCheckedChange={(v) => update('requireConfirmation', v)} /></div>
            <div className="flex items-center justify-between"><Label>Mostrar prévia</Label><Switch checked={s.showPreview} onCheckedChange={(v) => update('showPreview', v)} /></div>
            <div className="flex items-center justify-between"><Label>Registrar auditoria</Label><Switch checked={s.auditEnabled} onCheckedChange={(v) => update('auditEnabled', v)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Aparência</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><Label>Sugestões automáticas</Label><Switch checked={s.autoSuggestions} onCheckedChange={(v) => update('autoSuggestions', v)} /></div>
            <div className="flex items-center justify-between"><Label>Cards de Insights</Label><Switch checked={s.insightCards} onCheckedChange={(v) => update('insightCards', v)} /></div>
            <div className="flex items-center justify-between"><Label>Atalhos rápidos</Label><Switch checked={s.quickShortcuts} onCheckedChange={(v) => update('quickShortcuts', v)} /></div>
            <div>
              <Label>Tema</Label>
              <div className="flex gap-2 mt-1">
                {(['system', 'light', 'dark'] as const).map((t) => (
                  <Button key={t} size="sm" variant={s.theme === t ? 'default' : 'outline'} onClick={() => update('theme', t)}>{t}</Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notificações</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><Label>Receber notificações da IA</Label><Switch checked={s.notifications} onCheckedChange={(v) => update('notifications', v)} /></div>
            <div className="flex items-center justify-between"><Label>Sons</Label><Switch checked={s.sounds} onCheckedChange={(v) => update('sounds', v)} /></div>
            <div className="flex items-center justify-between"><Label>Lembretes inteligentes</Label><Switch checked={s.smartReminders} onCheckedChange={(v) => update('smartReminders', v)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Diagnóstico</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">Modelo carregado</span><span>{s.model}</span></div>
            <div className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">Provider</span><span>{s.provider}</span></div>
            <div className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">Chave configurada</span><span>{diag.keyConfigured ? 'Sim' : 'Não'}</span></div>
            <div className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">Tempo médio</span><span>{diag.avgMs} ms</span></div>
            <div className="flex justify-between border-b border-border py-2"><span className="text-muted-foreground">Tokens consumidos (50 últ.)</span><span>{diag.tokens.toLocaleString('pt-BR')}</span></div>
            <div className="flex justify-between border-b border-border py-2 md:col-span-2"><span className="text-muted-foreground">Último erro</span><span className="truncate max-w-[60%]">{diag.lastError || '—'}</span></div>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground text-center">Configurações salvas automaticamente neste dispositivo.</div>
      </div>
    </AppLayout>
  );
}
