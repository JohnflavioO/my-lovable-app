import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { differenceInDays, isToday, isBefore, parseISO, startOfDay } from 'date-fns';

const db = supabase as any;
const ACTIVE_STATUSES = ['sent', 'negociacao', 'negotiation', 'contato_feito', 'contact_made', 'pre_sale', 'pre_venda'];

export function useFollowUpScanner() {
  const { user, isAdmin, isGestor, isFinanceiro, isLogistica } = useAuth();

  const scan = useCallback(async () => {
    // Only Seller, Admin, Gestor should run the scanner
    if (!user || isFinanceiro || isLogistica) return;

    try {
      console.log('[FollowUpScanner] Starting scan...');
      
      // Basic check for tables
      const { error: checkError } = await db.from('followup_notification_logs').select('id').limit(1);
      if (checkError && checkError.code === 'PGRST116') {
        console.warn('[FollowUpScanner] Table followup_notification_logs not found, skipping scan.');
        return;
      }

      
      // 1. Fetch active quotes for the user directly with filter for performance
      let query = db
        .from('quotes')
        .select('id, quote_number, status, followup_date, updated_at, created_at, client_name, total_amount, created_by')
        .in('status', ACTIVE_STATUSES);

      // Security/Performance: Filter by user unless they are privileged
      if (!isAdmin && !isGestor) {
        query = query.eq('created_by', user.id);
      } else {
        // For Admins/Gestors, we still might want to limit to 100 most recent active ones to avoid freezing
        query = query.order('updated_at', { ascending: false }).limit(100);
      }

      const { data: quotes, error: quotesError } = await query;

      if (quotesError) {
        console.error('[FollowUpScanner] Quotes fetch error:', quotesError);
        return;
      }

      if (!quotes || quotes.length === 0) {
        console.log('[FollowUpScanner] No active quotes to scan.');
        return;
      }

      const now = new Date();
      const today = startOfDay(now);
      const todayStr = now.toISOString().split('T')[0];

      // 2. Optimization: Get all notifications for these quotes today in one go
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
          if (quote.status === 'sent' && daysSinceLastUpdate >= 3) {
            alertType = 'no_return';
            title = '📧 Proposta sem retorno';
            message = `A proposta ${quote.quote_number} foi enviada há ${daysSinceLastUpdate} dias e ainda não teve retorno.`;
          } else if (daysSinceLastUpdate >= 5) {
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

      // 3. Batch insert for efficiency
      if (notificationsToInsert.length > 0) {
        console.log(`[FollowUpScanner] Inserting ${notificationsToInsert.length} new notifications.`);
        await Promise.all([
          db.from('notifications').insert(notificationsToInsert),
          db.from('followup_notification_logs').insert(logsToInsert)
        ]);
      }
      
      console.log('[FollowUpScanner] Scan completed successfully.');
    } catch (err) {
      console.error('[FollowUpScanner] Fatal error during scan:', err);
    }
  }, [user, isFinanceiro, isLogistica, isAdmin, isGestor]);

  useEffect(() => {
    // Initial scan on load
    const timeout = setTimeout(scan, 3000); // delay to let auth settle
    return () => clearTimeout(timeout);
  }, [scan]);

  return { scan };
}
