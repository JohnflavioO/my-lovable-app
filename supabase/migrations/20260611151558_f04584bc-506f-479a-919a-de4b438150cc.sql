
DROP POLICY IF EXISTS generated_contracts_select_policy ON public.generated_contracts;
DROP POLICY IF EXISTS generated_contracts_insert_policy ON public.generated_contracts;
DROP POLICY IF EXISTS generated_contracts_update_policy ON public.generated_contracts;
DROP POLICY IF EXISTS generated_contracts_delete_policy ON public.generated_contracts;

CREATE POLICY generated_contracts_select_policy ON public.generated_contracts
FOR SELECT TO authenticated
USING (
  company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin()
);

CREATE POLICY generated_contracts_insert_policy ON public.generated_contracts
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    company_id IS NULL
    OR company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  )
);

CREATE POLICY generated_contracts_update_policy ON public.generated_contracts
FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin()
)
WITH CHECK (
  company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin()
);

CREATE POLICY generated_contracts_delete_policy ON public.generated_contracts
FOR DELETE TO authenticated
USING (
  company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin()
);
