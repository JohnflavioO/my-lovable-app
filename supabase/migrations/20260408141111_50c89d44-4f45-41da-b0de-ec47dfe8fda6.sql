
-- 1. Fix storage: restrict SELECT to own files
DROP POLICY IF EXISTS "Authenticated users can view own quote PDFs" ON storage.objects;
CREATE POLICY "Users can view own quote PDFs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'quote-pdfs' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Fix gestors self-approval
DROP POLICY IF EXISTS "Gestors can update approvals" ON user_approvals;
CREATE POLICY "Gestors can update approvals"
ON user_approvals
FOR UPDATE
TO authenticated
USING (is_gestor() AND user_id != auth.uid());

-- 3. Restrict public quote update to only status fields via a function
CREATE OR REPLACE FUNCTION public.check_public_quote_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow changes to status, approved_at, rejected_at
  IF NEW.quote_number != OLD.quote_number
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.client_name != OLD.client_name
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.salesperson IS DISTINCT FROM OLD.salesperson
    OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms
    OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
    OR NEW.shipping_deadline IS DISTINCT FROM OLD.shipping_deadline
    OR NEW.shipping_method IS DISTINCT FROM OLD.shipping_method
    OR NEW.proposal_validity IS DISTINCT FROM OLD.proposal_validity
    OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.public_token IS DISTINCT FROM OLD.public_token
  THEN
    -- Check if it's an anon user (no auth.uid)
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Anonymous users can only update status fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_public_quote_update
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.check_public_quote_update();
