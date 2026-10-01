import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useFollowUpScanner() {
  const { user, isFinanceiro, isLogistica } = useAuth();

  // Função limpa que silencia os pop-ups automáticos descontrolados em background
  const scan = useCallback(async () => {
    if (!user || isFinanceiro || isLogistica) return;
    // Scanner silenciado para evitar criação em massa de toasts flutuantes na tela
    console.log('[FollowUpScanner] Scanner em background pausado para evitar spam de notificações.');
  }, [user, isFinanceiro, isLogistica]);

  useEffect(() => {
    const timeout = setTimeout(scan, 3000);
    return () => clearTimeout(timeout);
  }, [scan]);

  return { scan };
}