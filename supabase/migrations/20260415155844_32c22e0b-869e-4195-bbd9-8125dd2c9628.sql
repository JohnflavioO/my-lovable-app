-- Drop existing authenticated policies for quotes
DROP POLICY IF EXISTS "Users can view quotes by role" ON public.quotes;
DROP POLICY IF EXISTS "Users can update quotes by role" ON public.quotes;
DROP POLICY IF EXISTS "Users can delete own quotes or gestor" ON public.quotes;

-- Owner-only SELECT
CREATE POLICY "Users can view own quotes"
ON public.quotes
FOR SELECT
TO authenticated
USING (
  is_approved()
  AND created_by = auth.uid()
);

-- Owner-only UPDATE
CREATE POLICY "Users can update own quotes"
ON public.quotes
FOR UPDATE
TO authenticated
USING (
  is_approved()
  AND created_by = auth.uid()
)
WITH CHECK (
  is_approved()
  AND created_by = auth.uid()
);

-- Owner-only DELETE
CREATE POLICY "Users can delete own quotes"
ON public.quotes
FOR DELETE
TO authenticated
USING (
  is_approved()
  AND created_by = auth.uid()
);

-- Logistica keeps viewing quotes linked to logistics records
DROP POLICY IF EXISTS "Logistica can view all quotes" ON public.quotes;
CREATE POLICY "Logistica can view linked quotes"
ON public.quotes
FOR SELECT
TO authenticated
USING (
  is_logistica()
  AND EXISTS (
    SELECT 1 FROM public.logistics_records lr
    WHERE lr.quote_id = quotes.id
  )
);