DROP POLICY IF EXISTS "Approved users can insert quote items" ON public.quote_items;

CREATE POLICY "Owners or managers can insert quote items"
ON public.quote_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_approved()
  AND EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND (q.created_by = auth.uid() OR public.is_gestor() OR public.is_admin())
  )
);