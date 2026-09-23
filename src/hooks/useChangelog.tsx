import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const LS_SEEN_KEY = 'mci_changelog_last_seen_version';

export interface ChangelogEntry {
  id: string;
  version: string;
  release_date: string;
  title: string;
  description: string;
  environment: string;
  created_at: string;
}

export function useChangelog() {
  const { session } = useAuth();
  const [lastSeen, setLastSeen] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_SEEN_KEY); } catch { return null; }
  });

  const query = useQuery({
    queryKey: ['app-changelog'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('app_changelog')
        .select('id, version, release_date, title, description, environment, created_at')
        .order('release_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ChangelogEntry[];
    },
  });
  const entries = query.data ?? [];

  const currentVersion = entries[0]?.version ?? null;
  const latest = entries[0] ?? null;
  const hasUnseen = !!(currentVersion && currentVersion !== lastSeen);

  const markSeen = useCallback(() => {
    if (!currentVersion) return;
    try { localStorage.setItem(LS_SEEN_KEY, currentVersion); } catch {}
    setLastSeen(currentVersion);
  }, [currentVersion]);

  return { entries, latest, currentVersion, hasUnseen, loading: query.isLoading, markSeen, refetch: query.refetch };
}
