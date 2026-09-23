
CREATE POLICY "Support read technical-cloud" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'technical-cloud' AND (public.is_admin() OR public.is_gestor() OR public.is_support_any()));
CREATE POLICY "Support upload technical-cloud" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'technical-cloud' AND (public.is_admin() OR public.is_gestor() OR public.is_support_any()));
CREATE POLICY "Support update technical-cloud" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'technical-cloud' AND (public.is_admin() OR public.is_gestor() OR public.is_support_any()));
CREATE POLICY "Support delete technical-cloud" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'technical-cloud' AND (public.is_admin() OR public.is_gestor() OR public.is_support_any()));
