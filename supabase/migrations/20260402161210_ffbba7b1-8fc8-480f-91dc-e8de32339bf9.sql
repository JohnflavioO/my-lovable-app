
-- Allow gestors to manage products too
CREATE POLICY "Gestors can manage products"
  ON public.products FOR ALL TO authenticated
  USING (is_gestor())
  WITH CHECK (is_gestor());
