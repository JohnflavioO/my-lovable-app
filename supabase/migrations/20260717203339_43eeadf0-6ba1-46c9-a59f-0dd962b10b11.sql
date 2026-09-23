
-- 1. Extend clients (non-destructive)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_label TEXT,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_new_registration BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_status TEXT,
  ADD COLUMN IF NOT EXISTS external_registration_id TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_is_new_registration ON public.clients(is_new_registration) WHERE is_new_registration = true;
CREATE INDEX IF NOT EXISTS idx_clients_source ON public.clients(source);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_user_id ON public.clients(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_external_reg_id ON public.clients(external_registration_id);

-- 2. Consultants table
CREATE TABLE IF NOT EXISTS public.reseller_consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  crm_user_id UUID,
  is_none_option BOOLEAN NOT NULL DEFAULT false,
  is_default_fallback BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  received_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reseller_consultants_none_no_user CHECK (
    (is_none_option = true AND crm_user_id IS NULL) OR
    (is_none_option = false AND crm_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reseller_consultants_one_default_active
  ON public.reseller_consultants(is_default_fallback)
  WHERE is_default_fallback = true AND active = true;

CREATE UNIQUE INDEX IF NOT EXISTS reseller_consultants_one_none
  ON public.reseller_consultants((is_none_option))
  WHERE is_none_option = true;

GRANT SELECT ON public.reseller_consultants TO anon, authenticated;
GRANT ALL ON public.reseller_consultants TO service_role;

ALTER TABLE public.reseller_consultants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads active consultants"
  ON public.reseller_consultants FOR SELECT
  USING (active = true);

CREATE POLICY "Admins manage consultants"
  ON public.reseller_consultants FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER trg_reseller_consultants_updated
  BEFORE UPDATE ON public.reseller_consultants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Guard: prevent destructive code change after receiving registrations; prevent deactivating fallback without another
CREATE OR REPLACE FUNCTION public.guard_reseller_consultants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_other_default INT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.consultant_code <> OLD.consultant_code AND OLD.received_count > 0 THEN
      RAISE EXCEPTION 'Não é permitido alterar o código público de um consultor que já recebeu cadastros. Desative-o ao invés disso.';
    END IF;
    IF OLD.is_default_fallback = true AND (NEW.is_default_fallback = false OR NEW.active = false) THEN
      SELECT COUNT(*) INTO v_other_default
        FROM public.reseller_consultants
        WHERE id <> OLD.id AND is_default_fallback = true AND active = true;
      IF v_other_default = 0 THEN
        RAISE EXCEPTION 'Não é possível desativar/desmarcar o consultor padrão sem definir outro fallback ativo.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_reseller_consultants
  BEFORE UPDATE ON public.reseller_consultants
  FOR EACH ROW EXECUTE FUNCTION public.guard_reseller_consultants();

-- 3. Consultant config history
CREATE TABLE IF NOT EXISTS public.reseller_consultant_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID,
  action TEXT NOT NULL,
  changed_by UUID,
  previous_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reseller_consultant_history TO authenticated;
GRANT ALL ON public.reseller_consultant_history TO service_role;
ALTER TABLE public.reseller_consultant_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view consultant history"
  ON public.reseller_consultant_history FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins insert consultant history"
  ON public.reseller_consultant_history FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_reseller_consultant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.reseller_consultant_history (consultant_id, action, changed_by, previous_data, new_data)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_log_reseller_consultant_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reseller_consultants
  FOR EACH ROW EXECUTE FUNCTION public.log_reseller_consultant_change();

-- 4. Registrations
CREATE TABLE IF NOT EXISTS public.reseller_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  is_duplicate BOOLEAN NOT NULL DEFAULT false,
  duplicate_reason TEXT,
  registration_status TEXT NOT NULL DEFAULT 'novo',

  responsible_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT NOT NULL,
  state_registration TEXT,

  cep TEXT,
  city TEXT,
  street TEXT,
  state TEXT,
  neighborhood TEXT,
  address_number TEXT,
  complement TEXT,

  website TEXT,
  years_in_market TEXT,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,

  how_did_you_know TEXT,
  interests TEXT[] NOT NULL DEFAULT '{}',
  message TEXT,
  privacy_consent BOOLEAN NOT NULL DEFAULT false,

  consultant_selected_code TEXT,
  consultant_selected_label TEXT,
  assigned_user_id UUID,
  assignment_reason TEXT,

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  form_url TEXT,
  origin TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  ip_hash TEXT,
  raw_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_regs_cnpj ON public.reseller_registrations(cnpj);
CREATE INDEX IF NOT EXISTS idx_reseller_regs_client ON public.reseller_registrations(client_id);
CREATE INDEX IF NOT EXISTS idx_reseller_regs_assigned ON public.reseller_registrations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_reseller_regs_status ON public.reseller_registrations(registration_status);

GRANT SELECT, UPDATE ON public.reseller_registrations TO authenticated;
GRANT ALL ON public.reseller_registrations TO service_role;

ALTER TABLE public.reseller_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/admin/gestor read registrations"
  ON public.reseller_registrations FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor());

CREATE POLICY "Owner/admin/gestor update registrations"
  ON public.reseller_registrations FOR UPDATE TO authenticated
  USING (assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor())
  WITH CHECK (assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor());

CREATE TRIGGER trg_reseller_registrations_updated
  BEFORE UPDATE ON public.reseller_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Registration history/audit
CREATE TABLE IF NOT EXISTS public.reseller_registration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES public.reseller_registrations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID,
  performed_by_name TEXT,
  previous_status TEXT,
  new_status TEXT,
  previous_assigned_user_id UUID,
  new_assigned_user_id UUID,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reseller_registration_history TO authenticated;
GRANT ALL ON public.reseller_registration_history TO service_role;
ALTER TABLE public.reseller_registration_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View reg history"
  ON public.reseller_registration_history FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.reseller_registrations r
            WHERE r.id = registration_id
              AND (r.assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor()))
  );
CREATE POLICY "Insert reg history"
  ON public.reseller_registration_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.reseller_registrations r
            WHERE r.id = registration_id
              AND (r.assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor()))
  );

-- 6. Seed consultants (idempotent)
INSERT INTO public.reseller_consultants
  (consultant_code, display_name, crm_user_id, is_none_option, is_default_fallback, active, display_order)
VALUES
  ('felipe-aguiar',    'Felipe Aguiar',    '9d113145-0825-47d9-b8e9-c3ba82465f72', false, false, true, 10),
  ('joao-gomes',       'João Gomes',       'e7b262df-0f9e-4951-bde7-019af73de198', false, false, true, 20),
  ('joao-sousa',       'João Sousa',       '3d0226a2-39a0-417c-91f3-55862ed043df', false, false, true, 30),
  ('john-flavio',      'John Flávio',      '38e2b046-5c6a-40bf-a6c9-e3dc4709c07a', false, true,  true, 40),
  ('sarah-aragao',     'Sarah Aragão',     'ec5e5ea3-6ad3-43d4-84fa-3e6e0f0fd515', false, false, true, 50),
  ('vinicius-lando',   'Vinicius Lando',   '79978ef3-36f9-4de5-a3b8-52b0db8610b6', false, false, true, 60),
  ('wendel-nascimento','Wendel Nascimento','3a78eb78-81dc-405e-ae03-6d0cf5364365', false, false, true, 70),
  ('none',             'Nenhum deles',      NULL,                                   true,  false, true, 999)
ON CONFLICT (consultant_code) DO NOTHING;
