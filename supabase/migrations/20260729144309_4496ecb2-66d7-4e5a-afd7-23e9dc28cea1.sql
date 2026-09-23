DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reseller_consultants','reseller_registrations','reseller_registration_history','reseller_consultant_history','reseller_rate_limit'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

GRANT SELECT ON public.reseller_consultants TO authenticated;
GRANT SELECT ON public.reseller_registrations TO authenticated;
GRANT SELECT ON public.reseller_registration_history TO authenticated;
GRANT SELECT ON public.reseller_consultant_history TO authenticated;