import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, Smartphone, Volume2, VolumeX, Send, RefreshCw, Trash2, ShieldCheck, Activity, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { requestNotificationPermission, getFcmDiagnostics, markFcmTestPerformed, type FcmDiagnostics } from '@/lib/firebase';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNotifications, NOTIF_TIMESTAMP_KEYS } from '@/contexts/NotificationsContext';
import { logger } from '@/lib/logger';

const db = supabase as any;

const PUSH_TIMESTAMP_KEYS = {
  lastPushAttempt: 'mci_last_push_attempt_at',
  lastPushSuccess: 'mci_last_push_success_at',
  lastFcmError: 'mci_last_fcm_error_at',
  lastFcmErrorMsg: 'mci_last_fcm_error_msg',
} as const;

function readTs(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeTs(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* no-op */ }
}
function formatTs(iso: string | null): string {
  if (!iso) return 'nunca';
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }); } catch { return iso; }
}

type TestChannelResult = { ok: boolean; message: string };
type TestResults = {
  internal: TestChannelResult | null;
  toast: TestChannelResult | null;
  push: TestChannelResult | null;
};

interface Device {
  id: string;
  fcm_token: string;
  device_type: string | null;
  browser: string | null;
  last_seen_at: string;
  is_active: boolean;
}

export default function NotificationSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { preferences, setPreference } = useNotifications();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activatingPush, setActivatingPush] = useState(false);
  const [diag, setDiag] = useState<FcmDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [tsTick, setTsTick] = useState(0);
  const lastInternalAt = readTs(NOTIF_TIMESTAMP_KEYS.lastInternal);
  const lastToastAt = readTs(NOTIF_TIMESTAMP_KEYS.lastToast);
  const lastPushAttemptAt = readTs(PUSH_TIMESTAMP_KEYS.lastPushAttempt);
  const lastPushSuccessAt = readTs(PUSH_TIMESTAMP_KEYS.lastPushSuccess);
  const lastFcmErrorAt = readTs(PUSH_TIMESTAMP_KEYS.lastFcmError);
  const lastFcmErrorMsg = readTs(PUSH_TIMESTAMP_KEYS.lastFcmErrorMsg);
  void tsTick;
  useEffect(() => {
    const i = setInterval(() => setTsTick((n) => n + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const loadDevices = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await db
      .from('user_push_tokens')
      .select('*')
      .eq('user_id', user.id)
      .order('last_seen_at', { ascending: false });
    setDevices(data || []);
    setLoading(false);
  };

  const runDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const d = await getFcmDiagnostics();
      setDiag(d);
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => { loadDevices(); runDiagnostics(); }, [user]);

  const handleEnablePush = async () => {
    setActivatingPush(true);
    try {
      await requestNotificationPermission();
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
      toast.success('Push ativado e dispositivo registrado!');
      await loadDevices();
      await runDiagnostics();
    } catch (e: any) {
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
      toast.error(`[${e?.code || 'erro'}] ${e?.message || 'Falha ao ativar push'}`, { duration: 12000 });
      await runDiagnostics();
    } finally {
      setActivatingPush(false);
    }
  };

  const handleTest = async () => {
    if (!user) return;
    setTesting(true);
    const results: TestResults = { internal: null, toast: null, push: null };
    const toastCountBefore = readTs(NOTIF_TIMESTAMP_KEYS.lastToast);

    // 1. Notificação interna (INSERT no banco → dispara realtime → toast)
    try {
      const { error } = await db.from('notifications').insert({
        user_id: user.id,
        title: '🔔 Notificação de teste',
        message: 'Se você está vendo isso, sua Central de Notificações está funcionando.',
        type: 'test',
        priority: 'normal',
        module: 'configuracoes',
        is_read: false,
      });
      if (error) throw error;
      results.internal = { ok: true, message: 'Registrada na tabela notifications' };
    } catch (e: any) {
      results.internal = { ok: false, message: e?.message || 'Falha ao inserir notificação' };
    }

    // 2. Toast — verifica em até 3s se o realtime disparou um novo timestamp
    if (results.internal?.ok) {
      const deadline = Date.now() + 3000;
      let toastFired = false;
      while (Date.now() < deadline) {
        const cur = readTs(NOTIF_TIMESTAMP_KEYS.lastToast);
        if (cur && cur !== toastCountBefore) { toastFired = true; break; }
        await new Promise((r) => setTimeout(r, 200));
      }
      results.toast = toastFired
        ? { ok: true, message: 'Toast exibido no canto da tela' }
        : { ok: false, message: 'Toast não foi disparado (verifique se as notificações internas estão ativas)' };
    } else {
      results.toast = { ok: false, message: 'Depende da notificação interna' };
    }

    // 3. Push FCM — só se houver token salvo
    writeTs(PUSH_TIMESTAMP_KEYS.lastPushAttempt, new Date().toISOString());
    if (!diag?.tokenSavedInDb) {
      results.push = { ok: false, message: 'Sem token FCM salvo — ative o push do navegador primeiro' };
    } else {
      try {
        const { data: pushData, error: pushErr } = await supabase.functions.invoke('send-push-notifications', {
          body: {
            action: 'send_push',
            notification: {
              userId: user.id,
              title: '🔔 Notificação de teste',
              body: 'Push do MCI CRM chegou no seu navegador.',
              data: { url: '/configuracoes/notificacoes' },
            },
          },
        });
        if (pushErr) throw pushErr;
        if (!pushData?.success) throw new Error(pushData?.error || 'send-push-notifications retornou success=false');
        if ((pushData.sent ?? 0) < 1) {
          throw new Error(`Push real não enviado: sent=${pushData.sent ?? 0}, failed=${pushData.failed ?? 0}`);
        }
        results.push = { ok: true, message: `Push entregue ao FCM (sent=${pushData.sent})` };
        writeTs(PUSH_TIMESTAMP_KEYS.lastPushSuccess, new Date().toISOString());
      } catch (e: any) {
        const msg = e?.message || 'Falha ao enviar push';
        results.push = { ok: false, message: msg };
        writeTs(PUSH_TIMESTAMP_KEYS.lastFcmError, new Date().toISOString());
        writeTs(PUSH_TIMESTAMP_KEYS.lastFcmErrorMsg, msg);
        logger.warn('Push test invoke failed:', e);
      }
    }

    markFcmTestPerformed();
    await runDiagnostics();
    setTestResults(results);
    setTsTick((n) => n + 1);
    const okCount = [results.internal, results.toast, results.push].filter((r) => r?.ok).length;
    if (okCount === 3) toast.success('Teste concluído: todos os canais OK');
    else if (okCount > 0) toast.warning(`Teste parcial: ${okCount}/3 canais OK`);
    else toast.error('Teste falhou em todos os canais');
    setTesting(false);
  };


  const removeDevice = async (id: string) => {
    await db.from('user_push_tokens').delete().eq('id', id);
    setDevices(prev => prev.filter(d => d.id !== id));
    toast.success('Dispositivo removido');
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6" /> Notificações
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie como e onde você recebe alertas do MCI CRM.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Voltar</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferências</CardTitle>
            <CardDescription>Controle global da central interna e do som. Sincronizado entre dispositivos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Notificações internas</Label>
                <p className="text-xs text-muted-foreground">Sino, badge e realtime dentro do CRM.</p>
              </div>
              <Switch
                checked={preferences.notifications_enabled}
                onCheckedChange={(v) => setPreference({ notifications_enabled: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium flex items-center gap-2">
                  {preferences.sound_enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Som
                </Label>
                <p className="text-xs text-muted-foreground">Reproduzir som ao chegar novas notificações.</p>
              </div>
              <Switch
                checked={preferences.sound_enabled}
                onCheckedChange={(v) => setPreference({ sound_enabled: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Push do navegador (Firebase FCM)
            </CardTitle>
            <CardDescription>
              Status atual:{' '}
              <Badge variant={diag?.tokenSavedInDb && permission === 'granted' ? 'default' : permission === 'denied' ? 'destructive' : 'secondary'}>
                {diag?.tokenSavedInDb && permission === 'granted'
                  ? 'Push ativo'
                  : permission === 'denied'
                    ? 'Bloqueado'
                    : permission === 'granted'
                      ? 'Permitido (sem token)'
                      : 'Não solicitado'}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleEnablePush} disabled={activatingPush}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                {activatingPush
                  ? 'Ativando...'
                  : diag?.tokenSavedInDb
                    ? 'Reativar push do navegador'
                    : 'Ativar push do navegador'}
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing}>
                <Send className="h-4 w-4 mr-2" /> {testing ? 'Enviando...' : 'Testar notificação'}
              </Button>
            </div>
            {permission === 'denied' && (
              <p className="text-xs text-destructive">
                Push foi bloqueado neste navegador. Abra as permissões do site e libere "Notificações".
              </p>
            )}
            {testResults && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
                <div className="font-semibold text-sm mb-1">Resultado do teste</div>
                <TestResultRow label="Notificação interna" result={testResults.internal} />
                <TestResultRow label="Toast no CRM" result={testResults.toast} />
                <TestResultRow label="Push FCM (navegador)" result={testResults.push} />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border">
              <div><span className="font-medium">Última notificação interna:</span> {formatTs(lastInternalAt)}</div>
              <div><span className="font-medium">Último toast exibido:</span> {formatTs(lastToastAt)}</div>
              <div><span className="font-medium">Última tentativa de push:</span> {formatTs(lastPushAttemptAt)}</div>
              <div><span className="font-medium">Último push com sucesso:</span> {formatTs(lastPushSuccessAt)}</div>
              <div className="sm:col-span-2">
                <span className="font-medium">Último erro FCM:</span>{' '}
                {lastFcmErrorAt ? (
                  <span className="text-destructive">
                    {formatTs(lastFcmErrorAt)}
                    {lastFcmErrorMsg ? ` — ${lastFcmErrorMsg}` : ''}
                  </span>
                ) : 'nenhum'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Diagnóstico FCM
              </CardTitle>
              <CardDescription>Verificação completa do fluxo de push.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={runDiagnostics} disabled={diagLoading}>
              <RefreshCw className={`h-4 w-4 ${diagLoading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {!diag ? (
              <p className="text-sm text-muted-foreground">Executando diagnóstico…</p>
            ) : (
              <div className="space-y-1.5 text-sm">
                <DiagRow ok={diag.isSecureContext} label="Contexto seguro (HTTPS)" />
                <DiagRow ok={diag.notificationApi} label="Notification API disponível" />
                <DiagRow
                  ok={diag.permission === 'granted'}
                  warn={diag.permission === 'default'}
                  label={`Permissão do navegador: ${diag.permission}`}
                />
                <DiagRow ok={diag.serviceWorkerApi} label="Service Worker API disponível" />
                <DiagRow
                  ok={diag.serviceWorkerFileReachable}
                  label="Arquivo /firebase-messaging-sw.js servido"
                />
                <DiagRow
                  ok={diag.serviceWorkerRegistered}
                  label={`Service Worker registrado${diag.serviceWorkerScope ? ` — scope ${diag.serviceWorkerScope}` : ''}${diag.serviceWorkerState ? ` (${diag.serviceWorkerState})` : ''}`}
                />
                <DiagRow
                  ok={diag.serviceWorkerReady}
                  label={`Service Worker ready${diag.serviceWorkerReadyScope ? ` — scope ${diag.serviceWorkerReadyScope}` : ''}`}
                />
                {diag.serviceWorkerRegisterError && (
                  <div className="ml-6 text-xs text-destructive">
                    register() error: <span className="font-mono">{diag.serviceWorkerRegisterError}</span>
                  </div>
                )}
                <DiagRow ok={diag.firebaseInitialized} label="Firebase inicializado" />
                <DiagRow ok={diag.messagingSupported} label="Firebase Messaging suportado" />
                <DiagRow ok={diag.vapidConfigured} label={`VAPID Key configurada (${diag.vapidKeyMasked})`} />
                <DiagRow ok={diag.getTokenExecuted} label="getToken executado" />
                <DiagRow
                  ok={diag.tokenReturned}
                  label={`Token retornado${diag.tokenPreview ? ` (${diag.tokenPreview})` : ''}`}
                />
                <DiagRow ok={diag.tokenSavedInDb} label="Token salvo no banco (user_push_tokens)" />
                <div className="pt-2 text-xs text-muted-foreground space-y-0.5">
                  <div><span className="font-medium">Firebase project:</span> {diag.firebaseProjectId}</div>
                  <div><span className="font-medium">Sender ID:</span> {diag.messagingSenderId}</div>
                  <div><span className="font-medium">Firebase SDK:</span> {diag.firebaseSdkVersion}</div>
                </div>
                {diag.tokenTechnicalError && (
                  <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive space-y-2">
                    <div className="font-semibold">Erro técnico do token</div>
                    <div className="grid gap-1">
                      <div><span className="font-medium">error.code:</span> <span className="font-mono break-all">{diag.tokenTechnicalError.code}</span></div>
                      <div><span className="font-medium">error.message:</span> <span className="font-mono break-words">{diag.tokenTechnicalError.message}</span></div>
                      {diag.tokenTechnicalError.name && (
                        <div><span className="font-medium">name:</span> <span className="font-mono">{diag.tokenTechnicalError.name}</span></div>
                      )}
                      {diag.tokenTechnicalError.stackSummary && (
                        <div>
                          <div className="font-medium mb-1">stack resumida:</div>
                          <pre className="whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono text-[10px] leading-relaxed">{diag.tokenTechnicalError.stackSummary}</pre>
                        </div>
                      )}
                      <div className="pt-1 text-destructive/80">
                        <div><span className="font-medium">messaging inicializado:</span> {diag.tokenTechnicalError.messagingInitialized ? 'sim' : 'não'}</div>
                        <div><span className="font-medium">VAPID usada:</span> <span className="font-mono">{diag.tokenTechnicalError.vapidKeyMasked}</span></div>
                        <div><span className="font-medium">SW passado ao getToken:</span> <span className="font-mono break-all">{diag.tokenTechnicalError.serviceWorkerRegistration?.scriptURL || 'indisponível'}</span></div>
                        <div><span className="font-medium">SW ready:</span> <span className="font-mono break-all">{diag.tokenTechnicalError.serviceWorkerReady?.scriptURL || 'indisponível'}</span></div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Device ID:</span>
                  <span className="font-mono">{diag.deviceId}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Último teste:</span>
                  <span>
                    {diag.lastTestAt
                      ? formatDistanceToNow(new Date(diag.lastTestAt), { addSuffix: true, locale: ptBR })
                      : 'nunca'}
                  </span>
                </div>
                {diag.errors.length > 0 && (
                  <div className="mt-2 p-2 rounded border border-destructive/40 bg-destructive/5 text-xs text-destructive space-y-1">
                    {diag.errors.map((e, i) => (<div key={i}>• {e}</div>))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Dispositivos conectados
              </CardTitle>
              <CardDescription>Navegadores e celulares que recebem suas notificações push.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={loadDevices} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum dispositivo registrado. Clique em "Ativar push do navegador" acima.
              </p>
            ) : (
              <div className="space-y-2">
                {devices.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={d.is_active ? 'default' : 'secondary'} className="text-[10px]">
                          {d.device_type || 'desktop'}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {(d.browser || '').split(' ').slice(0, 4).join(' ') || 'Navegador'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Última sincronização: {formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true, locale: ptBR })}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                        {d.fcm_token.slice(0, 24)}…
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeDevice(d.id)} aria-label="Remover dispositivo">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function DiagRow({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertCircle : XCircle;
  const cls = ok ? 'text-emerald-600' : warn ? 'text-amber-600' : 'text-destructive';
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 shrink-0 ${cls}`} />
      <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

function TestResultRow({ label, result }: { label: string; result: TestChannelResult | null }) {
  if (!result) return null;
  const Icon = result.ok ? CheckCircle2 : XCircle;
  const cls = result.ok ? 'text-emerald-600' : 'text-destructive';
  return (
    <div className="flex items-start gap-2">
      <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${cls}`} />
      <div className="flex-1">
        <span className="font-medium">{label}:</span>{' '}
        <span className={result.ok ? 'text-muted-foreground' : 'text-destructive'}>{result.message}</span>
      </div>
    </div>
  );
}
