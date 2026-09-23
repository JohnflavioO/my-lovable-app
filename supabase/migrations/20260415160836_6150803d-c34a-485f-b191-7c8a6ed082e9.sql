-- Gestor can view all quotes (team dashboard)
CREATE POLICY "Gestors can view all quotes"
ON public.quotes
FOR SELECT
TO authenticated
USING (public.is_gestor());

-- Gestor can view all clients (team dashboard)
CREATE POLICY "Gestors can view all clients"
ON public.clients
FOR SELECT
TO authenticated
USING (public.is_gestor());