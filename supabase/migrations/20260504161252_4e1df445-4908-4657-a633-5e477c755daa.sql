-- Ajustando search_path e permissões para segurança
ALTER FUNCTION public.generate_smart_opportunities_for_quote(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.generate_smart_opportunities_for_quote(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_smart_opportunities_for_quote(UUID) TO authenticated;

ALTER FUNCTION public.on_quote_status_change_generate_opportunities() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.on_quote_status_change_generate_opportunities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.on_quote_status_change_generate_opportunities() TO authenticated;

ALTER FUNCTION public.process_all_approved_quotes_opportunities() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.process_all_approved_quotes_opportunities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_all_approved_quotes_opportunities() TO authenticated;
