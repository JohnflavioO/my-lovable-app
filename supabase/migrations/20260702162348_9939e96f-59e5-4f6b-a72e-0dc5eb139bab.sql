
-- 1) New columns
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS salesperson_id uuid;
CREATE INDEX IF NOT EXISTS idx_clients_salesperson_id ON public.clients(salesperson_id);
UPDATE public.clients SET salesperson_id = created_by WHERE salesperson_id IS NULL;

ALTER TABLE public.technical_clients ADD COLUMN IF NOT EXISTS crm_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_technical_clients_crm_client_id ON public.technical_clients(crm_client_id);

ALTER TABLE public.technical_orders ADD COLUMN IF NOT EXISTS handoff_quote_id uuid;

-- 2) Protect salesperson_id (only admin/gestor may change it)
CREATE OR REPLACE FUNCTION public.protect_client_salesperson()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id THEN
    IF NOT (public.is_admin() OR public.is_gestor()) THEN
      NEW.salesperson_id := OLD.salesperson_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_client_salesperson ON public.clients;
CREATE TRIGGER trg_protect_client_salesperson
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.protect_client_salesperson();

-- 3) Sync technical_clients -> clients
CREATE OR REPLACE FUNCTION public.sync_technical_client_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.crm_client_id IS NULL AND NULLIF(NEW.cpf_cnpj, '') IS NOT NULL THEN
      SELECT id INTO v_client_id FROM public.clients WHERE cpf_cnpj = NEW.cpf_cnpj LIMIT 1;
    END IF;

    IF NEW.crm_client_id IS NULL AND v_client_id IS NULL THEN
      INSERT INTO public.clients (name, company_name, cpf_cnpj, email, phone, address, city, state, cep, notes, created_by, salesperson_id, company_id, pipeline_stage, is_revenda)
      VALUES (NEW.name, NEW.name, NEW.cpf_cnpj, NEW.email, COALESCE(NEW.phone, NEW.whatsapp), NEW.address, NEW.city, NEW.state, NEW.zip_code, NEW.notes, COALESCE(NEW.created_by, auth.uid()), NULL, NEW.company_id, 'lead', false)
      RETURNING id INTO v_client_id;
    END IF;

    IF NEW.crm_client_id IS NULL AND v_client_id IS NOT NULL THEN
      NEW.crm_client_id := v_client_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.crm_client_id IS NOT NULL THEN
      UPDATE public.clients SET
        name = COALESCE(NULLIF(NEW.name, ''), name),
        email = COALESCE(NULLIF(NEW.email, ''), email),
        phone = COALESCE(NULLIF(NEW.phone, ''), phone),
        cpf_cnpj = COALESCE(NULLIF(NEW.cpf_cnpj, ''), cpf_cnpj),
        address = COALESCE(NULLIF(NEW.address, ''), address),
        city = COALESCE(NULLIF(NEW.city, ''), city),
        state = COALESCE(NULLIF(NEW.state, ''), state),
        cep = COALESCE(NULLIF(NEW.zip_code, ''), cep),
        updated_at = now()
      WHERE id = NEW.crm_client_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_technical_client_ins ON public.technical_clients;
CREATE TRIGGER trg_sync_technical_client_ins
BEFORE INSERT ON public.technical_clients
FOR EACH ROW EXECUTE FUNCTION public.sync_technical_client_to_crm();

DROP TRIGGER IF EXISTS trg_sync_technical_client_upd ON public.technical_clients;
CREATE TRIGGER trg_sync_technical_client_upd
AFTER UPDATE ON public.technical_clients
FOR EACH ROW EXECUTE FUNCTION public.sync_technical_client_to_crm();

-- 4) Extra RLS on clients: allow salesperson and support to view; salesperson to update
DROP POLICY IF EXISTS "Salesperson can view assigned clients" ON public.clients;
CREATE POLICY "Salesperson can view assigned clients" ON public.clients
FOR SELECT USING (is_approved() AND salesperson_id = auth.uid());

DROP POLICY IF EXISTS "Salesperson can update assigned clients" ON public.clients;
CREATE POLICY "Salesperson can update assigned clients" ON public.clients
FOR UPDATE USING (is_approved() AND salesperson_id = auth.uid())
WITH CHECK (is_approved() AND salesperson_id = auth.uid());

DROP POLICY IF EXISTS "Support can view crm clients" ON public.clients;
CREATE POLICY "Support can view crm clients" ON public.clients
FOR SELECT USING (is_support_any());

DROP POLICY IF EXISTS "Support can insert crm clients via trigger" ON public.clients;
CREATE POLICY "Support can insert crm clients via trigger" ON public.clients
FOR INSERT WITH CHECK (is_support_any() OR (is_approved() AND created_by = auth.uid()));

DROP POLICY IF EXISTS "Support can update contact fields of crm clients" ON public.clients;
CREATE POLICY "Support can update contact fields of crm clients" ON public.clients
FOR UPDATE USING (is_support_any()) WITH CHECK (is_support_any());

DROP POLICY IF EXISTS "Admins and gestors full access to clients" ON public.clients;
CREATE POLICY "Admins and gestors full access to clients" ON public.clients
FOR ALL USING (is_admin() OR is_gestor()) WITH CHECK (is_admin() OR is_gestor());
