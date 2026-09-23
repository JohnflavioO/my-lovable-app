
-- 1. bank_slip_history: drop broad insert policy
DROP POLICY IF EXISTS "Authenticated users can insert history" ON public.bank_slip_history;

-- 2. contract_templates: fix profiles.id -> profiles.user_id
DROP POLICY IF EXISTS "Admins and Managers can manage templates" ON public.contract_templates;
CREATE POLICY "Admins and Managers can manage templates"
ON public.contract_templates
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = ANY (ARRAY['admin','gestor'])))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = ANY (ARRAY['admin','gestor'])));

-- 3. financial_import_batches: fix profiles.id -> profiles.user_id
DROP POLICY IF EXISTS "Users can view batches from their company" ON public.financial_import_batches;
DROP POLICY IF EXISTS "Users can insert batches for their company" ON public.financial_import_batches;
DROP POLICY IF EXISTS "Users can update batches from their company" ON public.financial_import_batches;
DROP POLICY IF EXISTS "Users can delete batches from their company" ON public.financial_import_batches;

CREATE POLICY "Users can view batches from their company"
ON public.financial_import_batches FOR SELECT TO authenticated
USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Users can insert batches for their company"
ON public.financial_import_batches FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Users can update batches from their company"
ON public.financial_import_batches FOR UPDATE TO authenticated
USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Users can delete batches from their company"
ON public.financial_import_batches FOR DELETE TO authenticated
USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));

-- 4. smart_opportunities: restrict to authenticated
DROP POLICY IF EXISTS "Users can view their own opportunities" ON public.smart_opportunities;
DROP POLICY IF EXISTS "Users can update their own opportunities" ON public.smart_opportunities;

CREATE POLICY "Users can view their own opportunities"
ON public.smart_opportunities FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() OR public.is_gestor() OR public.is_admin());

CREATE POLICY "Users can update their own opportunities"
ON public.smart_opportunities FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() OR public.is_gestor() OR public.is_admin())
WITH CHECK (vendedor_id = auth.uid() OR public.is_gestor() OR public.is_admin());

-- 5. Storage contracts bucket: restrict to owner + admin/gestor
DROP POLICY IF EXISTS "Authenticated can view signed contracts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload signed contracts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update signed contracts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete signed contracts" ON storage.objects;

CREATE POLICY "Contracts: owner or admin/gestor can view"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contracts' AND (owner = auth.uid() OR public.is_admin() OR public.is_gestor()));

CREATE POLICY "Contracts: authenticated can upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contracts' AND owner = auth.uid());

CREATE POLICY "Contracts: owner or admin/gestor can update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'contracts' AND (owner = auth.uid() OR public.is_admin() OR public.is_gestor()))
WITH CHECK (bucket_id = 'contracts' AND (owner = auth.uid() OR public.is_admin() OR public.is_gestor()));

CREATE POLICY "Contracts: owner or admin/gestor can delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contracts' AND (owner = auth.uid() OR public.is_admin() OR public.is_gestor()));

-- 6. Realtime: extend quote_messages subscription policy to mirror table SELECT access
DROP POLICY IF EXISTS "Users can subscribe to own realtime topics" ON realtime.messages;
CREATE POLICY "Users can subscribe to own realtime topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  (realtime.topic() LIKE ('notifications:' || auth.uid()::text || '%'))
  OR (
    realtime.topic() LIKE 'quote_messages:%'
    AND EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id::text = split_part(realtime.topic(), ':', 2)
        AND (
          q.created_by = auth.uid()
          OR public.is_admin()
          OR public.is_gestor()
          OR (public.is_financeiro() AND EXISTS (SELECT 1 FROM public.financial_records fr WHERE fr.quote_id = q.id))
          OR (public.is_logistica() AND EXISTS (SELECT 1 FROM public.logistics_records lr WHERE lr.quote_id = q.id))
        )
    )
  )
);
