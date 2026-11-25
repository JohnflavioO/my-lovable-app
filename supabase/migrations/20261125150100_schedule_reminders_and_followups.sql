-- Agendamentos diários (horário de Brasília = UTC-3).
-- 08:00 — lembretes de demonstração (7 dias, 3 dias, no dia e vencidas).
-- 08:05 — resumo diário de follow-ups: 1 notificação por vendedor.
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('demonstration-reminders', 'followup-daily-digest');
END;
$$;

SELECT cron.schedule('demonstration-reminders', '0 11 * * *',
  $$ SELECT public.invoke_edge_function('demonstration-reminders') $$);

SELECT cron.schedule('followup-daily-digest', '5 11 * * *',
  $$ SELECT public.invoke_edge_function('send-push-notifications', '{"action":"scan_followups"}') $$);
