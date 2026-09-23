
-- 1. technical_status_history: enforce company scope via join to technical_orders
DROP POLICY IF EXISTS "Support can view status history" ON public.technical_status_history;
DROP POLICY IF EXISTS "Support can insert status history" ON public.technical_status_history;

CREATE POLICY "Support can view status history"
ON public.technical_status_history
FOR SELECT
USING (
  public.is_support_any()
  AND EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id = technical_status_history.order_id
      AND o.company_id = public.current_user_company_id()
  )
);

CREATE POLICY "Support can insert status history"
ON public.technical_status_history
FOR INSERT
WITH CHECK (
  public.is_support_any()
  AND EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id = technical_status_history.order_id
      AND o.company_id = public.current_user_company_id()
  )
);

-- 2. quote_messages: add company_id scope for financeiro/logistica
DROP POLICY IF EXISTS "Financeiro can view messages on financial quotes" ON public.quote_messages;
DROP POLICY IF EXISTS "Financeiro can send messages on financial quotes" ON public.quote_messages;
DROP POLICY IF EXISTS "Logistica can view messages on logistics quotes" ON public.quote_messages;
DROP POLICY IF EXISTS "Logistica can send messages on logistics quotes" ON public.quote_messages;

CREATE POLICY "Financeiro can view messages on financial quotes"
ON public.quote_messages
FOR SELECT
USING (
  public.is_financeiro()
  AND EXISTS (
    SELECT 1 FROM public.financial_records fr
    JOIN public.quotes q ON q.id = fr.quote_id
    WHERE fr.quote_id = quote_messages.quote_id
      AND COALESCE(q.company_id, public.current_user_company_id()) = public.current_user_company_id()
  )
);

CREATE POLICY "Financeiro can send messages on financial quotes"
ON public.quote_messages
FOR INSERT
WITH CHECK (
  public.is_financeiro()
  AND user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.financial_records fr
    JOIN public.quotes q ON q.id = fr.quote_id
    WHERE fr.quote_id = quote_messages.quote_id
      AND COALESCE(q.company_id, public.current_user_company_id()) = public.current_user_company_id()
  )
);

CREATE POLICY "Logistica can view messages on logistics quotes"
ON public.quote_messages
FOR SELECT
USING (
  public.is_logistica()
  AND EXISTS (
    SELECT 1 FROM public.logistics_records lr
    JOIN public.quotes q ON q.id = lr.quote_id
    WHERE lr.quote_id = quote_messages.quote_id
      AND COALESCE(q.company_id, public.current_user_company_id()) = public.current_user_company_id()
  )
);

CREATE POLICY "Logistica can send messages on logistics quotes"
ON public.quote_messages
FOR INSERT
WITH CHECK (
  public.is_logistica()
  AND user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.logistics_records lr
    JOIN public.quotes q ON q.id = lr.quote_id
    WHERE lr.quote_id = quote_messages.quote_id
      AND COALESCE(q.company_id, public.current_user_company_id()) = public.current_user_company_id()
  )
);

-- 3. quotes: attach trigger to block anonymous public-token holders from modifying any non-status columns.
DROP TRIGGER IF EXISTS trg_restrict_public_quote_update ON public.quotes;
CREATE TRIGGER trg_restrict_public_quote_update
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.restrict_public_quote_update();

-- 4. clients: restrict which columns support staff may update (only contact info)
CREATE OR REPLACE FUNCTION public.restrict_support_client_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the caller is support-only (not admin/gestor/owner)
  IF public.is_support_any()
     AND NOT (public.is_admin() OR public.is_gestor())
     AND NOT (OLD.created_by IS NOT DISTINCT FROM auth.uid())
     AND NOT (OLD.salesperson_id IS NOT DISTINCT FROM auth.uid())
  THEN
    -- Preserve non-contact fields
    NEW.salesperson_id  := OLD.salesperson_id;
    NEW.created_by      := OLD.created_by;
    NEW.company_id      := OLD.company_id;
    NEW.pipeline_stage  := OLD.pipeline_stage;
    NEW.is_revenda      := OLD.is_revenda;
    NEW.client_type     := OLD.client_type;
    NEW.contrib_icms    := OLD.contrib_icms;
    NEW.last_interaction_at := OLD.last_interaction_at;
    NEW.notes           := OLD.notes;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_support_client_updates ON public.clients;
CREATE TRIGGER trg_restrict_support_client_updates
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.restrict_support_client_updates();

-- 5. Tighten always-true RLS policies
-- product_external_links: require approved user
DROP POLICY IF EXISTS "Authenticated can insert product external links" ON public.product_external_links;
DROP POLICY IF EXISTS "Authenticated can update product external links" ON public.product_external_links;
DROP POLICY IF EXISTS "Authenticated can delete product external links" ON public.product_external_links;

CREATE POLICY "Approved users can insert product external links"
ON public.product_external_links
FOR INSERT
WITH CHECK (public.is_approved());

CREATE POLICY "Approved users can update product external links"
ON public.product_external_links
FOR UPDATE
USING (public.is_approved())
WITH CHECK (public.is_approved());

CREATE POLICY "Approved users can delete product external links"
ON public.product_external_links
FOR DELETE
USING (public.is_approved());

-- notifications: restrict service role demo-insert policy to demonstration notifications only
DROP POLICY IF EXISTS "Service role can insert demo notifications" ON public.notifications;
CREATE POLICY "Service role can insert demo notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (type LIKE 'demonstration_%');
