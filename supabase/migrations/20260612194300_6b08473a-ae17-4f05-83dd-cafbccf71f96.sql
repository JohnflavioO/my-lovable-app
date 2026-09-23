-- Financial import batches: role-restricted company access
DROP POLICY IF EXISTS "Users can view batches from their company" ON public.financial_import_batches;
DROP POLICY IF EXISTS "Users can insert batches for their company" ON public.financial_import_batches;
DROP POLICY IF EXISTS "Users can update batches from their company" ON public.financial_import_batches;
DROP POLICY IF EXISTS "Users can delete batches from their company" ON public.financial_import_batches;

CREATE POLICY "Finance roles can view company batches"
ON public.financial_import_batches
FOR SELECT
TO authenticated
USING (
  (public.is_financeiro() OR public.is_admin() OR public.is_gestor())
  AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

CREATE POLICY "Finance roles can insert company batches"
ON public.financial_import_batches
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_financeiro() OR public.is_admin())
  AND imported_by = auth.uid()
  AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

CREATE POLICY "Finance roles can update company batches"
ON public.financial_import_batches
FOR UPDATE
TO authenticated
USING (
  (public.is_financeiro() OR public.is_admin())
  AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid())
)
WITH CHECK (
  (public.is_financeiro() OR public.is_admin())
  AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

CREATE POLICY "Finance roles can delete company batches"
ON public.financial_import_batches
FOR DELETE
TO authenticated
USING (
  (public.is_financeiro() OR public.is_admin())
  AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- Task comments: inserts must reference an accessible task
DROP POLICY IF EXISTS "Users can insert comments on accessible tasks" ON public.task_comments;

CREATE POLICY "Users can insert comments on accessible tasks"
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_approved()
  AND EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_comments.task_id
      AND (t.user_id = auth.uid() OR public.is_admin() OR public.is_gestor())
  )
);

-- Task activities: allow only scoped inserts for tasks the user can access
DROP POLICY IF EXISTS "Users can insert activity for accessible tasks" ON public.task_activities;

CREATE POLICY "Users can insert activity for accessible tasks"
ON public.task_activities
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_approved()
  AND EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_activities.task_id
      AND (t.user_id = auth.uid() OR public.is_admin() OR public.is_gestor())
  )
);

-- Integration credentials: stop using plaintext credential columns
CREATE OR REPLACE FUNCTION public.prevent_plaintext_integration_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.api_key := NULL;
  NEW.application_key := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_plaintext_integration_credentials ON public.integrations;
CREATE TRIGGER prevent_plaintext_integration_credentials
BEFORE INSERT OR UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_plaintext_integration_credentials();

REVOKE ALL ON public.integrations FROM authenticated;
GRANT SELECT (id, integration_name, status, last_sync_at, config, created_by, created_at, updated_at) ON public.integrations TO authenticated;
GRANT INSERT (integration_name, status, config, created_by, created_at, updated_at) ON public.integrations TO authenticated;
GRANT UPDATE (status, last_sync_at, config, created_by, updated_at) ON public.integrations TO authenticated;
GRANT DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;