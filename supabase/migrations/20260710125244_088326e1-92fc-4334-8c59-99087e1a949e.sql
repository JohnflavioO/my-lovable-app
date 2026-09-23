
DROP POLICY IF EXISTS "Authenticated can read product external links" ON public.product_external_links;
CREATE POLICY "Users read own company product external links"
ON public.product_external_links FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR company_id IS NULL
  OR company_id = public.current_user_company_id()
);

DROP POLICY IF EXISTS "Authenticated can view product relationships" ON public.product_relationships;
CREATE POLICY "Users read own company product relationships"
ON public.product_relationships FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR company_id IS NULL
  OR company_id = public.current_user_company_id()
);

DROP POLICY IF EXISTS "Authenticated can read sync logs" ON public.sync_execution_logs;
CREATE POLICY "Users read own company sync logs"
ON public.sync_execution_logs FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR company_id IS NULL
  OR company_id = public.current_user_company_id()
);
