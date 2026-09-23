-- Fix: budget-proofs bucket ownership/company scoping
DROP POLICY IF EXISTS "Authenticated read budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated read budget-proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'budget-proofs'
  AND (public.is_support_any() OR public.is_admin() OR public.is_gestor())
  AND EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND o.company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS "Authenticated write budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated write budget-proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'budget-proofs'
  AND (public.is_support_any() OR public.is_admin() OR public.is_gestor())
  AND EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND o.company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS "Authenticated update budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated update budget-proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'budget-proofs'
  AND (public.is_support_any() OR public.is_admin() OR public.is_gestor())
  AND EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND o.company_id = public.current_user_company_id()
  )
)
WITH CHECK (
  bucket_id = 'budget-proofs'
  AND (public.is_support_any() OR public.is_admin() OR public.is_gestor())
  AND EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND o.company_id = public.current_user_company_id()
  )
);

DROP POLICY IF EXISTS "Authenticated delete budget-proofs" ON storage.objects;
CREATE POLICY "Authenticated delete budget-proofs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'budget-proofs'
  AND (public.is_support_manager() OR public.is_admin() OR public.is_gestor())
  AND EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND o.company_id = public.current_user_company_id()
  )
);

-- Fix: technical_maintenances insert must always set company_id to current user's company
DROP POLICY IF EXISTS "Support staff can insert maintenance" ON public.technical_maintenances;
CREATE POLICY "Support staff can insert maintenance"
  ON public.technical_maintenances FOR INSERT
  WITH CHECK (
    (public.is_support_any() OR public.is_admin())
    AND company_id IS NOT NULL
    AND company_id = public.current_user_company_id()
  );
