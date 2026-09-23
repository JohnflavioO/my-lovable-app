
DROP POLICY IF EXISTS "Approved users can view products" ON public.products;

CREATE POLICY "Approved users can view products"
  ON public.products
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_approved());
