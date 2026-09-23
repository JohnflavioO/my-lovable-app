import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

const db = supabase as any;

export const NOTIF_TIMESTAMP_KEYS = {
  lastInternal: 'mci_last_internal_notif_at',
  lastToast: 'mci_last_toast_at',
} as const;

function stampNow(key: string) {
  try { localStorage.setItem(key, new Date().toISOString()); } catch { /* no-op */ }
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  priority?: string | null;
  module?: string | null;
  related_url?: string | null;
  is_read: boolean;
  created_at: string;
  related_quote_id?: string;
  related_client_id?: string;
}

interface Preferences {
  notifications_enabled: boolean;
  sound_enabled: boolean;
}

interface Ctx {
  notifications: AppNotification[];
  unreadCount: number;
  preferences: Preferences;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteOne: (id: string) => Promise<void>;
  setPreference: (patch: Partial<Preferences>) => Promise<void>;
}

const NotificationsContext = createContext<Ctx | null>(null);

const SOUND_SRC = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    notifications_enabled: true,
    sound_enabled: true,
  });
  const [loading, setLoading] = useState(false);
  const lastIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const snoozeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const fetchNotifications = useCallback(async () => {
    if (!user) { setNotifications([]); return; }
    setLoading(true);
    const { data, error } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) logger.error('[notifications] fetch error', error);
    const list = (data || []) as AppNotification[];
    setNotifications(list);
    if (list[0]) lastIdRef.current = list[0].id;
    setLoading(false);
  }, [user]);

  const fetchPreferences = useCallback(async () => {
    if (!user) return;
    const { data, error } = await db
      .from('user_preferences')
      .select('notifications_enabled, sound_enabled')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) { logger.error('[prefs] fetch error', error); return; }
    if (data) setPreferences({
      notifications_enabled: !!data.notifications_enabled,
      sound_enabled: !!data.sound_enabled,
    });
  }, [user]);

  // Initial load
  useEffect(() => {
    if (!user) return;
    fetchPreferences();
    fetchNotifications();
    initializedRef.current = true;
  }, [user, fetchPreferences, fetchNotifications]);

  // Refs para evitar re-subscribe quando preferências mudam
  const notificationsEnabledRef = useRef(preferences.notifications_enabled);
  const soundEnabledRef = useRef(preferences.sound_enabled);
  useEffect(() => { notificationsEnabledRef.current = preferences.notifications_enabled; }, [preferences.notifications_enabled]);
  useEffect(() => { soundEnabledRef.current = preferences.sound_enabled; }, [preferences.sound_enabled]);

  // Realtime — inscreve UMA vez por usuário; leitura das prefs via ref
  useEffect(() => {
    if (!user) return;

    let closed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const channelTopic = `notifications-user-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      channel = supabase.channel(channelTopic);
      channel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        }, (payload) => {
          if (closed || !notificationsEnabledRef.current) return;
          if (payload.eventType === 'INSERT') {
            const n = payload.new as AppNotification;
            setNotifications(prev => {
              if (prev.some(p => p.id === n.id)) return prev;
              return [n, ...prev].slice(0, 100);
            });
            stampNow(NOTIF_TIMESTAMP_KEYS.lastInternal);
            if (soundEnabledRef.current && !n.is_read && typeof Audio !== 'undefined') {
              try { const a = new Audio(SOUND_SRC); a.volume = 0.4; a.play().catch(() => {}); } catch { /* no-op */ }
            }
            // Toast interno com ações rápidas (Abrir / Marcar como lida / Adiar)
            try {
              const target = n.related_url
                || (n.related_quote_id ? `/quotes?id=${n.related_quote_id}` : null)
                || (n.related_client_id ? `/clients?id=${n.related_client_id}` : null);
              const showToast = (isSnoozed = false) => {
                const t = toast.custom((id) => (
                  <div className="w-[360px] max-w-[92vw] rounded-lg border border-border bg-background shadow-lg p-3 space-y-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {isSnoozed ? '⏰ Lembrete: ' : ''}{n.title || 'Nova notificação'}
                      </p>
                      {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {target && (
                        <button
                          onClick={() => {
                            db.from('notifications').update({ is_read: true }).eq('id', n.id);
                            toast.dismiss(id);
                            navigate(target);
                          }}
                          className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                        >Abrir</button>
                      )}
                      <button
                        onClick={() => {
                          db.from('notifications').update({ is_read: true }).eq('id', n.id);
                          toast.dismiss(id);
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted"
                      >Marcar como lida</button>
                      <button
                        onClick={() => {
                          toast.dismiss(id);
                          const timer = setTimeout(() => {
                            snoozeTimersRef.current.delete(n.id);
                            showToast(true);
                          }, 15 * 60 * 1000);
                          const prev = snoozeTimersRef.current.get(n.id);
                          if (prev) clearTimeout(prev);
                          snoozeTimersRef.current.set(n.id, timer);
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted"
                      >Adiar 15 min</button>
                    </div>
                  </div>
                ), { duration: 10000 });
                stampNow(NOTIF_TIMESTAMP_KEYS.lastToast);
                return t;
              };
              showToast();
            } catch (e) { logger.warn('[toast] falhou', e); }
          } else if (payload.eventType === 'UPDATE') {
            const n = payload.new as AppNotification;
            setNotifications(prev => prev.map(p => p.id === n.id ? { ...p, ...n } : p));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as any)?.id;
            if (oldId) setNotifications(prev => prev.filter(p => p.id !== oldId));
          }
        })
        .subscribe((status, error) => {
          if (error) logger.warn('[notifications] realtime indisponível', error);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') void fetchNotifications();
        });
    } catch (error) {
      logger.warn('[notifications] realtime não iniciado', error);
    }

    return () => {
      closed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user?.id, navigate, fetchNotifications]);

  // Cleanup snooze timers ao desmontar
  useEffect(() => {
    const timersRef = snoozeTimersRef;
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);


  // Reconecta e recarrega ao reativar
  useEffect(() => {
    if (preferences.notifications_enabled && initializedRef.current) {
      fetchNotifications();
    }
  }, [preferences.notifications_enabled, fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    const { error } = await db.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) logger.error('[notifications] markRead error', error);
  }, []);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    const { error } = await db.from('notifications').update({ is_read: true }).in('id', unreadIds);
    if (error) logger.error('[notifications] markAllRead error', error);
  }, [notifications]);

  const deleteOne = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const { error } = await db.from('notifications').delete().eq('id', id);
    if (error) logger.error('[notifications] delete error', error);
  }, []);

  const setPreference = useCallback(async (patch: Partial<Preferences>) => {
    if (!user) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    const { error } = await db.from('user_preferences').upsert({
      user_id: user.id,
      notifications_enabled: next.notifications_enabled,
      sound_enabled: next.sound_enabled,
    }, { onConflict: 'user_id' });
    if (error) logger.error('[prefs] upsert error', error);
  }, [user, preferences]);

  const unreadCount = useMemo(
    () => preferences.notifications_enabled ? notifications.filter(n => !n.is_read).length : 0,
    [notifications, preferences.notifications_enabled]
  );

  const value: Ctx = {
    notifications,
    unreadCount,
    preferences,
    loading,
    refresh: fetchNotifications,
    markRead,
    markAllRead,
    deleteOne,
    setPreference,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
