
-- 1. Refactor products/salespeople policies to use is_admin() helper
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage salespeople" ON public.salespeople;
CREATE POLICY "Admins can manage salespeople" ON public.salespeople
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2. Column-level restriction for support role updates on clients
CREATE OR REPLACE FUNCTION public.prevent_support_client_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only apply when the acting user is support-only (not admin/gestor)
  IF public.is_support_any() AND NOT (public.is_admin() OR public.is_gestor()) THEN
    -- Preserve all non-contact fields (support can only edit contact info)
    NEW.company_name := OLD.company_name;
    NEW.cpf_cnpj := OLD.cpf_cnpj;
    NEW.pipeline_stage := OLD.pipeline_stage;
    NEW.salesperson_id := OLD.salesperson_id;
    NEW.created_by := OLD.created_by;
    NEW.company_id := OLD.company_id;
    NEW.notes := OLD.notes;
    NEW.is_revenda := OLD.is_revenda;
    NEW.tags := OLD.tags;
    NEW.priority := OLD.priority;
    NEW.source := OLD.source;
    NEW.status := OLD.status;
    NEW.segment := OLD.segment;
    NEW.website := OLD.website;
    NEW.rating := OLD.rating;
    NEW.last_contact_date := OLD.last_contact_date;
    NEW.next_followup_date := OLD.next_followup_date;
    NEW.lifetime_value := OLD.lifetime_value;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_support_client_field_escalation ON public.clients;
CREATE TRIGGER trg_prevent_support_client_field_escalation
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.prevent_support_client_field_escalation();
