
-- 1) Fail-closed tenant isolation: return NULL when user has no company assignment
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- 2) Public quote share-link expiration
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_token_expires_at timestamptz;

-- Backfill: existing tokens get a 30-day window from now (best-effort, avoids breaking active links)
UPDATE public.quotes
   SET public_token_expires_at = now() + interval '30 days'
 WHERE public_token IS NOT NULL AND public_token_expires_at IS NULL;

-- Auto-set/refresh expiration whenever token is set or rotated
CREATE OR REPLACE FUNCTION public.set_public_token_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.public_token IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.public_token IS DISTINCT FROM OLD.public_token) THEN
    NEW.public_token_expires_at := now() + interval '30 days';
  ELSIF NEW.public_token IS NULL THEN
    NEW.public_token_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_public_token_expiration ON public.quotes;
CREATE TRIGGER trg_quotes_public_token_expiration
BEFORE INSERT OR UPDATE OF public_token ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_public_token_expiration();

-- Tighten anon RLS to require unexpired token
DROP POLICY IF EXISTS "Public can view quote by token" ON public.quotes;
CREATE POLICY "Public can view quote by token"
ON public.quotes
FOR SELECT
TO anon
USING (
  public_token IS NOT NULL
  AND public_token = public.get_public_quote_token()
  AND (public_token_expires_at IS NULL OR public_token_expires_at > now())
);

DROP POLICY IF EXISTS "Public can view quote items by token" ON public.quote_items;
CREATE POLICY "Public can view quote items by token"
ON public.quote_items
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND q.public_token IS NOT NULL
      AND q.public_token = public.get_public_quote_token()
      AND (q.public_token_expires_at IS NULL OR q.public_token_expires_at > now())
  )
);

-- Enforce expiration inside public approval/rejection RPC
CREATE OR REPLACE FUNCTION public.public_quote_action(p_token text, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quote public.quotes;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE public_token = p_token LIMIT 1;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.public_token_expires_at IS NOT NULL AND v_quote.public_token_expires_at <= now() THEN
    RAISE EXCEPTION 'Link expired' USING ERRCODE = '42501';
  END IF;

  IF v_quote.status IN ('approved','rejected') THEN
    RETURN jsonb_build_object('status', v_quote.status, 'already', true);
  END IF;

  IF p_action = 'approved' THEN
    UPDATE public.quotes
      SET status = 'approved', approved_at = now(), updated_at = now()
      WHERE id = v_quote.id;
  ELSE
    UPDATE public.quotes
      SET status = 'rejected', rejected_at = now(), updated_at = now()
      WHERE id = v_quote.id;
  END IF;

  RETURN jsonb_build_object('status', p_action, 'already', false);
END;
$$;
