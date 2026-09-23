import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { clearBrowserCachesAndWorkers, reloadWithCacheBust } from '@/lib/browserRecovery';
import { useAuth } from '@/hooks/useAuth';

const LS_KEY = 'app_version';

const isPreviewRuntime = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return window.self !== window.top
    || host.startsWith('id-preview--')
    || host.includes('-preview--')
    || host.includes('lovable.app')
    || host.endsWith('.lovableproject.com');
};

export interface AppVersionInfo {
  version: string;
  force_update: boolean;
  message?: string;
}

export function useAppVersion() {
  const { session } = useAuth();
  const [local, setLocal] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_KEY); } catch { return null; }
  });

  const query = useQuery({
    queryKey: ['system-setting', 'app_version'],
    enabled: !!session,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'app_version')
        .maybeSingle();
      if (error) throw error;
      return data?.value as unknown as AppVersionInfo | undefined;
    },
  });
  const remote = query.data ?? null;

  useEffect(() => {
    if (!remote?.version || local) return;
    try { localStorage.setItem(LS_KEY, remote.version); } catch {}
    setLocal(remote.version);
  }, [local, remote]);

  const updateNow = useCallback(async () => {
    if (remote?.version) {
      try { localStorage.setItem(LS_KEY, remote.version); } catch {}
      setLocal(remote.version);
    }

    if (isPreviewRuntime()) {
      return;
    }

    try { await clearBrowserCachesAndWorkers(); } catch {}
    try {
      reloadWithCacheBust();
    } catch {}

    setTimeout(() => {
      try { window.location.reload(); } catch {}
    }, 150);
  }, [remote]);

  const hasUpdate = !!(remote && local && remote.version !== local);

  return { remote, local, hasUpdate, updateNow, refetch: query.refetch };
}
