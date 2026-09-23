
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS approver_name text;

CREATE OR REPLACE FUNCTION public.public_quote_action(p_token text, p_action text, p_approver_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quote public.quotes;
  v_name text;
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
    RETURN jsonb_build_object('status', v_quote.status, 'already', true, 'approver_name', v_quote.approver_name);
  END IF;

  v_name := NULLIF(trim(p_approver_name), '');

  IF p_action = 'approved' THEN
    UPDATE public.quotes
      SET status = 'approved', approved_at = now(), approver_name = v_name, updated_at = now()
      WHERE id = v_quote.id;
  ELSE
    UPDATE public.quotes
      SET status = 'rejected', rejected_at = now(), approver_name = v_name, updated_at = now()
      WHERE id = v_quote.id;
  END IF;

  RETURN jsonb_build_object('status', p_action, 'already', false, 'approver_name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.public_quote_action(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_quote_action(text, text, text) TO anon, authenticated;
