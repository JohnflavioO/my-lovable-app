import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const db = supabase as any;

export interface ResellerRegSummary {
  id: string;
  client_id: string | null;
  company_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  registration_status: string;
  is_duplicate: boolean;
  duplicate_reason: string | null;
  submitted_at: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  consultant_selected_label: string | null;
  viewed_by_me: boolean;
}

export const RESELLER_STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_analise: 'Em análise',
  contatado: 'Contatado',
  aprovado_revenda: 'Aprovado como revenda',
  reprovado: 'Reprovado',
  pendente_distribuicao: 'Pendente de distribuição',
};

export const RESELLER_STATUS_OPTIONS = Object.entries(RESELLER_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export const RESELLER_ACTION_LABELS: Record<string, string> = {
  created: 'Cadastro recebido',
  received: 'Cadastro recebido',
  assigned: 'Responsável atribuído',
  auto_assigned: 'Responsável atribuído automaticamente',
  duplicate_detected: 'Duplicidade identificada',
  notification_created: 'Notificação enviada ao responsável',
  notification_failed: 'Falha ao notificar o responsável',
  viewed: 'Cadastro visualizado',
  status_changed: 'Status alterado',
  portfolio_transferred: 'Responsável transferido',
  pending_distribution: 'Aguardando distribuição',
  updated: 'Cadastro atualizado',
};

export function useResellerRegistrations() {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<ResellerRegSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setRegistrations([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await db.rpc('list_reseller_registrations_summary');
      if (err) throw err;
      setRegistrations((data as ResellerRegSummary[]) || []);
      setError(null);
    } catch (e: any) {
      console.error('[reseller] summary error', e);
      setError(e?.message || 'Erro ao carregar cadastros de revenda');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Mantém a referência mais recente sem recriar o canal a cada render.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    // Nome único por montagem evita colisão de tópico (StrictMode / remount),
    // que causava "cannot add postgres_changes callbacks ... after subscribe()".
    const topic = `reseller-registrations-live-${user.id}-${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel(topic)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reseller_registrations' }, () => loadRef.current())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reseller_registration_history' }, () => loadRef.current())
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[reseller] realtime indisponível:', status);
          }
        });
    } catch (e) {
      // Realtime é melhoria, nunca requisito para renderizar a página.
      console.warn('[reseller] falha ao iniciar realtime', e);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);


  const byClient = useMemo(() => {
    const map = new Map<string, ResellerRegSummary[]>();
    for (const r of registrations) {
      if (!r.client_id) continue;
      const list = map.get(r.client_id) || [];
      list.push(r);
      map.set(r.client_id, list);
    }
    return map;
  }, [registrations]);

  const newCount = useMemo(
    () => registrations.filter(r => !r.viewed_by_me && r.registration_status !== 'reprovado').length,
    [registrations],
  );

  const pendingDistributionCount = useMemo(
    () => registrations.filter(r => r.registration_status === 'pendente_distribuicao').length,
    [registrations],
  );

  return { registrations, byClient, newCount, pendingDistributionCount, loading, error, refresh: load };
}
