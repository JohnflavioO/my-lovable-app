DROP POLICY IF EXISTS "system_settings readable by all auth" ON public.system_settings;
CREATE POLICY "system_settings readable by authenticated" ON public.system_settings FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.system_settings FROM anon;