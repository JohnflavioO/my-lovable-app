
-- =========================================================
-- Enums
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.contract_signature_status AS ENUM (
    'draft','ready_to_send','sent','viewed','awaiting_signature',
    'signed','refused','expired','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_signature_event_type AS ENUM (
    'request_created','invitation_sent','link_opened','identity_confirmed',
    'verification_code_sent','verification_code_validated','document_viewed',
    'terms_accepted','signature_completed','signature_refused',
    'request_expired','request_cancelled','document_downloaded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- Column on generated_contracts
-- =========================================================
ALTER TABLE public.generated_contracts
  ADD COLUMN IF NOT EXISTS signature_status public.contract_signature_status NOT NULL DEFAULT 'draft';

-- =========================================================
-- contract_signature_requests
-- =========================================================
CREATE TABLE IF NOT EXISTS public.contract_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  contract_id UUID NOT NULL REFERENCES public.generated_contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mci_native',
  provider_request_id TEXT,
  signer_name TEXT NOT NULL,
  signer_document TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_phone TEXT,
  status public.contract_signature_status NOT NULL DEFAULT 'ready_to_send',
  public_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  refused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  original_document_url TEXT,
  signed_document_url TEXT,
  evidence_document_url TEXT,
  original_document_hash TEXT,
  signed_document_hash TEXT,
  otp_code_hash TEXT,
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  identity_confirmed_at TIMESTAMPTZ,
  terms_accepted_at TIMESTAMPTZ,
  signature_image TEXT,
  signature_method TEXT,
  last_ip TEXT,
  last_user_agent TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_signature_requests_public_token_hash_unique UNIQUE (public_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_csr_contract ON public.contract_signature_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_csr_company ON public.contract_signature_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_csr_status  ON public.contract_signature_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_signature_requests TO authenticated;
GRANT ALL ON public.contract_signature_requests TO service_role;

ALTER TABLE public.contract_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csr_select" ON public.contract_signature_requests FOR SELECT TO authenticated
USING (company_id = public.current_user_company_id() OR public.is_admin());

CREATE POLICY "csr_insert" ON public.contract_signature_requests FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (public.is_admin() OR (company_id IS NOT NULL AND company_id = public.current_user_company_id()))
);

CREATE POLICY "csr_update" ON public.contract_signature_requests FOR UPDATE TO authenticated
USING (company_id = public.current_user_company_id() OR public.is_admin())
WITH CHECK (company_id = public.current_user_company_id() OR public.is_admin());

CREATE POLICY "csr_delete" ON public.contract_signature_requests FOR DELETE TO authenticated
USING (public.is_admin() OR public.is_gestor());

-- =========================================================
-- contract_signature_events
-- =========================================================
CREATE TABLE IF NOT EXISTS public.contract_signature_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  signature_request_id UUID NOT NULL REFERENCES public.contract_signature_requests(id) ON DELETE CASCADE,
  event_type public.contract_signature_event_type NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cse_request ON public.contract_signature_events(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_cse_company ON public.contract_signature_events(company_id);

GRANT SELECT, INSERT ON public.contract_signature_events TO authenticated;
GRANT ALL ON public.contract_signature_events TO service_role;

ALTER TABLE public.contract_signature_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cse_select" ON public.contract_signature_events FOR SELECT TO authenticated
USING (company_id = public.current_user_company_id() OR public.is_admin());

CREATE POLICY "cse_insert_owner" ON public.contract_signature_events FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_user_company_id() OR public.is_admin());

-- =========================================================
-- Trigger: fill company_id from contract, updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_signature_request_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.contract_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.generated_contracts WHERE id = NEW.contract_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_user_company_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_csr_defaults ON public.contract_signature_requests;
CREATE TRIGGER trg_csr_defaults
  BEFORE INSERT ON public.contract_signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_signature_request_defaults();

CREATE OR REPLACE FUNCTION public.set_signature_event_company()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.signature_request_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
      FROM public.contract_signature_requests WHERE id = NEW.signature_request_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cse_company ON public.contract_signature_events;
CREATE TRIGGER trg_cse_company
  BEFORE INSERT ON public.contract_signature_events
  FOR EACH ROW EXECUTE FUNCTION public.set_signature_event_company();

DROP TRIGGER IF EXISTS trg_csr_updated_at ON public.contract_signature_requests;
CREATE TRIGGER trg_csr_updated_at
  BEFORE UPDATE ON public.contract_signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Trigger: lock contract content while a signature request is active
-- =========================================================
CREATE OR REPLACE FUNCTION public.protect_contract_when_signing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_has_active BOOLEAN;
BEGIN
  IF NEW.contract_data_json IS DISTINCT FROM OLD.contract_data_json
     OR NEW.total_value IS DISTINCT FROM OLD.total_value
     OR NEW.client_name IS DISTINCT FROM OLD.client_name
     OR NEW.client_document IS DISTINCT FROM OLD.client_document
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.contract_signature_requests
      WHERE contract_id = NEW.id
        AND status IN ('ready_to_send','sent','viewed','awaiting_signature','signed')
    ) INTO v_has_active;

    IF v_has_active AND NOT (public.is_admin()) THEN
      RAISE EXCEPTION 'Contrato bloqueado: existe solicitação de assinatura ativa. Cancele-a antes de editar.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_contract_signing ON public.generated_contracts;
CREATE TRIGGER trg_protect_contract_signing
  BEFORE UPDATE ON public.generated_contracts
  FOR EACH ROW EXECUTE FUNCTION public.protect_contract_when_signing();
