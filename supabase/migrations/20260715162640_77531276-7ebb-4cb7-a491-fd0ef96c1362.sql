DROP POLICY IF EXISTS "Users with product create permission can create products" ON public.products;
CREATE POLICY "Users with product create permission can create products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_approved()
  AND public.current_user_has_permission('products.create')
);

DROP POLICY IF EXISTS "Users with product edit permission can update products" ON public.products;
CREATE POLICY "Users with product edit permission can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (
  public.is_approved()
  AND public.current_user_has_permission('products.edit')
)
WITH CHECK (
  public.is_approved()
  AND public.current_user_has_permission('products.edit')
);

DROP POLICY IF EXISTS "Users with product delete permission can delete products" ON public.products;
CREATE POLICY "Users with product delete permission can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (
  public.is_approved()
  AND public.current_user_has_permission('products.delete')
);