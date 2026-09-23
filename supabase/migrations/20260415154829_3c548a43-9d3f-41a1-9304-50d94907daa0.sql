DROP POLICY IF EXISTS "Approved users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Users can view clients by role" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients by role" ON public.clients;
DROP POLICY IF EXISTS "Users can delete own clients or gestor" ON public.clients;
DROP POLICY IF EXISTS "Logistica can view all clients" ON public.clients;

CREATE POLICY "Users can insert own clients"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  is_approved()
  AND created_by = auth.uid()
);

CREATE POLICY "Users can view own clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  is_approved()
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update own clients"
ON public.clients
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

CREATE POLICY "Users can delete own clients"
ON public.clients
FOR DELETE
TO authenticated
USING (
  is_approved()
  AND created_by = auth.uid()
);

CREATE POLICY "Logistica can view linked clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  is_logistica()
  AND EXISTS (
    SELECT 1
    FROM public.quotes q
    JOIN public.logistics_records lr ON lr.quote_id = q.id
    WHERE q.client_id = clients.id
  )
);