import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { differenceInDays, isToday, isBefore, parseISO, startOfDay } from 'date-fns';

const db = supabase as any;
const ACTIVE_STATUSES = ['sent', 'negociacao', 'negotiation', 'contato_feito', 'contact_made', 'pre_sale', 'pre_venda'];

export function useFollowUpScanner() {
  const { user, isAdmin, isGestor, isFinanceiro, isLogistica } = useAuth();

  const scan = useCallback(async () => {
    if (!user || isFinanceiro || isLogistica) return;

    try {
      console.log('[FollowUpScanner] Starting scan...');
      
      const { error: checkError } = await db.from('followup_notification_logs').select('id').limit(1);
      if (checkError && checkError.code === 'PGRST116') {
        console.warn('[FollowUpScanner] Table followup_notification_logs not found, skipping scan.');
        return;
      }

      let query = db
        .from('quotes')
        .select('id, quote_number, status, followup_date, updated_at, created_at, client_name, total_amount, created_by')
        .in('status', ACTIVE_STATUSES);

      if (!isAdmin && !isGestor) {
        query = query.eq('created_by', user.id);
      } else {
        query = query.order('updated_at', { ascending: false }).limit(100);
      }

      const { data: quotes, error: quotesError } = await query;

      if (quotesError || !quotes || quotes.length === 0) {
        return;
      }

      const now = new Date();
      const today = startOfDay(now);
      const todayStr = now.toISOString().split('T')[0];

      const quoteIds = quotes.map(q => q.id);
      const { data: existingLogs } = await db
        .from('followup_notification_logs')
        .select('quote_id, notification_type')
        .in('quote_id', quoteIds)
        .eq('user_id', user.id)
        .eq('notified_at', todayStr);

      const logsMap = new Set(existingLogs?.map(l => `${l.quote_id}_${l.notification_type}`) || []);

      const notificationsToInsert = [];
      const logsToInsert = [];

      for (const quote of quotes) {
        let alertType: 'today' | 'overdue' | 'forgotten' | 'no_return' | null = null;
        let title = '';
        let message = '';

        const followupDateStr = quote.followup_date;
        const lastUpdate = parseISO(quote.updated_at || quote.created_at);
        const daysSinceLastUpdate = differenceInDays(now, lastUpdate);

        if (followupDateStr) {
          const fDate = parseISO(followupDateStr);
          if (isToday(fDate)) {
            alertType = 'today';
            title = '📌 Follow-up para hoje';
            message = `O orçamento ${quote.quote_number} (${quote.client_name || 'Sem nome'}) tem follow-up agendado para hoje.`;
          } else if (isBefore(fDate, today)) {
            alertType = 'overdue';
            title = '⚠ Follow-up atrasado';
            message = `O follow-up do orçamento ${quote.quote_number} (${quote.client_name || 'Sem nome'}) está vencido desde ${new Date(fDate).toLocaleDateString('pt-BR')}.`;
          }
        } 
        
        if (!alertType) {
          // Regulado: Só dispara se estiver entre 3 e 30 dias (evita propostas de meses atrás gerarem spam)
          if (quote.status === 'sent' && daysSinceLastUpdate >= 3 && daysSinceLastUpdate <= 30) {
            alertType = 'no_return';
            title = '📧 Proposta sem retorno';
            message = `A proposta ${quote.quote_number} foi enviada há ${daysSinceLastUpdate} dias e ainda não teve retorno.`;
          } else if (daysSinceLastUpdate >= 5 && daysSinceLastUpdate <= 30) {
            alertType = 'forgotten';
            title = '⏳ Orçamento esquecido';
            message = `O orçamento ${quote.quote_number} está sem interação há ${daysSinceLastUpdate} dias.`;
          }
        }

        if (alertType && !logsMap.has(`${quote.id}_${alertType}`)) {
          notificationsToInsert.push({
            user_id: user.id,
            title,
            message,
            type: 'followup',
            related_quote_id: quote.id
          });
          logsToInsert.push({
            quote_id: quote.id,
            user_id: user.id,
            notification_type: alertType,
            notified_at: todayStr
          });
        }
      }

      // Limitado a no máximo 5 inserções por varredura para nunca sobrecarregar a tela com dezenas de pop-ups
      const limitedNotifications = notificationsToInsert.slice(0, 5);
      const limitedLogs = logsToInsert.slice(0, 5);

      if (limitedNotifications.length > 0) {
        await Promise.all([
          db.from('notifications').insert(limitedNotifications),
          db.from('followup_notification_logs').insert(limitedLogs)
        ]);
      }
      
      console.log('[FollowUpScanner] Scan completed successfully.');
    } catch (err) {
      console.error('[FollowUpScanner] Fatal error during scan:', err);
    }
  }, [user, isFinanceiro, isLogistica, isAdmin, isGestor]);

  useEffect(() => {
    const timeout = setTimeout(scan, 3000);
    return () => clearTimeout(timeout);
  }, [scan]);

  return { scan };
}