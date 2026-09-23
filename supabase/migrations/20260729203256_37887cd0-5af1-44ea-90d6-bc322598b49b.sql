
-- generated_contracts: owner-only, gestor/admin veem tudo da empresa
DROP POLICY IF EXISTS generated_contracts_select_policy ON public.generated_contracts;
DROP POLICY IF EXISTS generated_contracts_update_policy ON public.generated_contracts;
DROP POLICY IF EXISTS generated_contracts_delete_policy ON public.generated_contracts;

CREATE POLICY generated_contracts_select_policy ON public.generated_contracts
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
);

CREATE POLICY generated_contracts_update_policy ON public.generated_contracts
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
)
WITH CHECK (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
);

CREATE POLICY generated_contracts_delete_policy ON public.generated_contracts
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
);

-- contract_signature_requests
DROP POLICY IF EXISTS csr_select ON public.contract_signature_requests;
DROP POLICY IF EXISTS csr_update ON public.contract_signature_requests;
DROP POLICY IF EXISTS csr_delete ON public.contract_signature_requests;

CREATE POLICY csr_select ON public.contract_signature_requests
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
);

CREATE POLICY csr_update ON public.contract_signature_requests
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
)
WITH CHECK (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
);

CREATE POLICY csr_delete ON public.contract_signature_requests
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR is_admin()
  OR (is_gestor() AND company_id IS NOT NULL AND company_id = public.current_user_company_id())
);

-- contract_signature_events: segue a visibilidade da solicitação
DROP POLICY IF EXISTS cse_select ON public.contract_signature_events;

CREATE POLICY cse_select ON public.contract_signature_events
FOR SELECT TO authenticated
USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.contract_signature_requests r
      WHERE r.id = contract_signature_events.signature_request_id
      AND (
        r.created_by = auth.uid()
        OR (is_gestor() AND r.company_id IS NOT NULL AND r.company_id = public.current_user_company_id())
      )
  )
);
