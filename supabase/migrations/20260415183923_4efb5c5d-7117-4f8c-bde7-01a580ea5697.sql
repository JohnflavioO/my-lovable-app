-- Create a SECURITY DEFINER function to check quote ownership without triggering RLS on quotes
-- This breaks the recursion cycle: clients -> quotes -> logistics_records -> quotes
CREATE OR REPLACE FUNCTION public.is_quote_owner(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE id = p_quote_id AND created_by = auth.uid()
  )
$$;

-- Drop and recreate the policy on logistics_records that causes recursion
DROP POLICY IF EXISTS "Sellers can view own quote logistics" ON public.logistics_records;
CREATE POLICY "Sellers can view own quote logistics"
ON public.logistics_records
FOR SELECT
TO authenticated
USING (
  is_approved() AND public.is_quote_owner(quote_id)
);

-- Also fix the same pattern on logistics_action_history
DROP POLICY IF EXISTS "Sellers can view own logistics history" ON public.logistics_action_history;
CREATE POLICY "Sellers can view own logistics history"
ON public.logistics_action_history
FOR SELECT
TO authenticated
USING (
  is_approved() AND (EXISTS (
    SELECT 1 FROM public.logistics_records lr
    WHERE lr.id = logistics_action_history.logistics_record_id
      AND public.is_quote_owner(lr.quote_id)
  ))
);