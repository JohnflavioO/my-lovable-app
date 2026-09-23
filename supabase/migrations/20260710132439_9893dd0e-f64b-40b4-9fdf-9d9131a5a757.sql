
-- 1) Replace public UPDATE policy on quotes with RPC-only approach
DROP POLICY IF EXISTS "Public can update quote status by token" ON public.quotes;

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

REVOKE ALL ON FUNCTION public.public_quote_action(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_quote_action(text, text) TO anon, authenticated;

-- 2) Scope product_external_links write policies to company_id
DROP POLICY IF EXISTS "Approved users can insert product external links" ON public.product_external_links;
DROP POLICY IF EXISTS "Approved users can update product external links" ON public.product_external_links;
DROP POLICY IF EXISTS "Approved users can delete product external links" ON public.product_external_links;

CREATE POLICY "Approved users can insert product external links"
  ON public.product_external_links
  FOR INSERT
  WITH CHECK (
    is_approved() AND (
      is_admin()
      OR company_id IS NULL
      OR company_id = current_user_company_id()
    )
  );

CREATE POLICY "Approved users can update product external links"
  ON public.product_external_links
  FOR UPDATE
  USING (
    is_approved() AND (
      is_admin()
      OR company_id IS NULL
      OR company_id = current_user_company_id()
    )
  )
  WITH CHECK (
    is_approved() AND (
      is_admin()
      OR company_id IS NULL
      OR company_id = current_user_company_id()
    )
  );

CREATE POLICY "Approved users can delete product external links"
  ON public.product_external_links
  FOR DELETE
  USING (
    is_approved() AND (
      is_admin()
      OR company_id IS NULL
      OR company_id = current_user_company_id()
    )
  );
