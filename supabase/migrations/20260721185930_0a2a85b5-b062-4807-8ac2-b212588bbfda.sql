
-- 1) clients_broad_support_update: restrict support update to clients they have a technical link to
DROP POLICY IF EXISTS "Support can update contact fields of crm clients" ON public.clients;
CREATE POLICY "Support can update contact fields of crm clients"
ON public.clients
FOR UPDATE
USING (
  is_support_any()
  AND company_id = current_user_company_id()
  AND EXISTS (
    SELECT 1 FROM public.technical_clients tc
    WHERE tc.crm_client_id = clients.id
  )
)
WITH CHECK (
  is_support_any()
  AND company_id = current_user_company_id()
  AND EXISTS (
    SELECT 1 FROM public.technical_clients tc
    WHERE tc.crm_client_id = clients.id
  )
);

-- 2) get_public_quote_token_header_trust: ensure public token always has an expiration
CREATE OR REPLACE FUNCTION public.enforce_public_quote_token_expiry()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.public_token IS NOT NULL AND NEW.public_token_expires_at IS NULL THEN
    NEW.public_token_expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_public_quote_token_expiry ON public.quotes;
CREATE TRIGGER trg_enforce_public_quote_token_expiry
BEFORE INSERT OR UPDATE OF public_token, public_token_expires_at ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.enforce_public_quote_token_expiry();

-- Backfill any existing rows missing expiry
UPDATE public.quotes
SET public_token_expires_at = now() + interval '30 days'
WHERE public_token IS NOT NULL AND public_token_expires_at IS NULL;

-- 3) profiles_broad_role_visibility: restrict sensitive columns via column-level privileges
REVOKE SELECT (permissions, force_password_change) ON public.profiles FROM authenticated;
REVOKE SELECT (permissions, force_password_change) ON public.profiles FROM anon;
REVOKE UPDATE (permissions) ON public.profiles FROM authenticated;

-- Admin RPC to read a user's permissions (bypasses column revoke via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_get_user_permissions(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT COALESCE(permissions, '{}'::jsonb) INTO result
  FROM public.profiles WHERE user_id = _user_id;
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_user_permissions(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_user_permissions(uuid) TO authenticated;

-- Admin RPC to update permissions
CREATE OR REPLACE FUNCTION public.admin_set_user_permissions(_user_id uuid, _permissions jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.profiles SET permissions = _permissions WHERE user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_permissions(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_permissions(uuid, jsonb) TO authenticated;

-- 4) reseller_consultants_crm_user_id_exposure: drop public policy; public access via edge function only
DROP POLICY IF EXISTS "Public reads active consultants" ON public.reseller_consultants;
