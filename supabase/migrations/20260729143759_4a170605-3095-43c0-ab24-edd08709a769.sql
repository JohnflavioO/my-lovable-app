-- =========================================================
-- BASELINE (idempotente) — Integração "Cadastro de Revendas MCI"
-- Representa fielmente o estado JÁ IMPLANTADO no banco remoto.
-- Nenhum objeto é recriado, apagado ou sobrescrito.
-- =========================================================

-- 1. Colunas de integração em clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_revenda boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS assigned_user_id uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_new_registration boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS source_label text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS registration_status text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS external_registration_id text;

-- 2. reseller_consultants
CREATE TABLE IF NOT EXISTS public.reseller_consultants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  crm_user_id uuid,
  is_none_option boolean NOT NULL DEFAULT false,
  is_default_fallback boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  received_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reseller_consultants_one_default_active
  ON public.reseller_consultants (is_default_fallback) WHERE is_default_fallback = true AND active = true;
CREATE UNIQUE INDEX IF NOT EXISTS reseller_consultants_one_none
  ON public.reseller_consultants (is_none_option) WHERE is_none_option = true;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reseller_consultants_none_no_user') THEN
    ALTER TABLE public.reseller_consultants ADD CONSTRAINT reseller_consultants_none_no_user
      CHECK ((is_none_option = true AND crm_user_id IS NULL) OR (is_none_option = false AND crm_user_id IS NOT NULL));
  END IF;
END $$;

-- 3. reseller_registrations
CREATE TABLE IF NOT EXISTS public.reseller_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_reason text,
  registration_status text NOT NULL DEFAULT 'novo',
  responsible_name text NOT NULL,
  company_name text NOT NULL,
  trade_name text,
  cnpj text NOT NULL,
  state_registration text,
  cep text,
  city text,
  street text,
  state text,
  neighborhood text,
  address_number text,
  complement text,
  website text,
  years_in_market text,
  email text NOT NULL,
  phone text NOT NULL,
  how_did_you_know text,
  interests text[] NOT NULL DEFAULT '{}'::text[],
  message text,
  privacy_consent boolean NOT NULL DEFAULT false,
  consultant_selected_code text,
  consultant_selected_label text,
  assigned_user_id uuid,
  assignment_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  form_url text,
  origin text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ip_hash text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reseller_regs_assigned ON public.reseller_registrations (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_reseller_regs_client ON public.reseller_registrations (client_id);
CREATE INDEX IF NOT EXISTS idx_reseller_regs_cnpj ON public.reseller_registrations (cnpj);
CREATE INDEX IF NOT EXISTS idx_reseller_regs_status ON public.reseller_registrations (registration_status);

-- 4. reseller_registration_history
CREATE TABLE IF NOT EXISTS public.reseller_registration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES public.reseller_registrations(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid,
  performed_by_name text,
  previous_status text,
  new_status text,
  previous_assigned_user_id uuid,
  new_assigned_user_id uuid,
  notes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. reseller_consultant_history
CREATE TABLE IF NOT EXISTS public.reseller_consultant_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid,
  action text NOT NULL,
  changed_by uuid,
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Funções (idempotentes)
CREATE OR REPLACE FUNCTION public.guard_reseller_consultants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.log_reseller_consultant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END $function$;

-- 7. Triggers (criados apenas se ausentes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reseller_consultants_updated') THEN
    CREATE TRIGGER trg_reseller_consultants_updated BEFORE UPDATE ON public.reseller_consultants
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_reseller_consultants') THEN
    CREATE TRIGGER trg_guard_reseller_consultants BEFORE UPDATE ON public.reseller_consultants
      FOR EACH ROW EXECUTE FUNCTION public.guard_reseller_consultants();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_reseller_consultant_change') THEN
    CREATE TRIGGER trg_log_reseller_consultant_change AFTER INSERT OR UPDATE OR DELETE ON public.reseller_consultants
      FOR EACH ROW EXECUTE FUNCTION public.log_reseller_consultant_change();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reseller_registrations_updated') THEN
    CREATE TRIGGER trg_reseller_registrations_updated BEFORE UPDATE ON public.reseller_registrations
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 8. RLS
ALTER TABLE public.reseller_consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_registration_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_consultant_history ENABLE ROW LEVEL SECURITY;

-- 9. Policies existentes (criadas apenas se ausentes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reseller_consultants' AND policyname='Admins manage consultants') THEN
    CREATE POLICY "Admins manage consultants" ON public.reseller_consultants
      TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reseller_registrations' AND policyname='Owner/admin/gestor read registrations') THEN
    CREATE POLICY "Owner/admin/gestor read registrations" ON public.reseller_registrations
      FOR SELECT TO authenticated
      USING (assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reseller_registrations' AND policyname='Owner/admin/gestor update registrations') THEN
    CREATE POLICY "Owner/admin/gestor update registrations" ON public.reseller_registrations
      FOR UPDATE TO authenticated
      USING (assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor())
      WITH CHECK (assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reseller_registration_history' AND policyname='View reg history') THEN
    CREATE POLICY "View reg history" ON public.reseller_registration_history
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.reseller_registrations r
        WHERE r.id = registration_id AND (r.assigned_user_id = auth.uid() OR public.is_admin() OR public.is_gestor())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reseller_consultant_history' AND policyname='Admins view consultant history') THEN
    CREATE POLICY "Admins view consultant history" ON public.reseller_consultant_history
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;