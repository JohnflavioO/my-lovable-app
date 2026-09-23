CREATE OR REPLACE FUNCTION public.current_user_has_permission(_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN jsonb_typeof(COALESCE(p.permissions, '{}'::jsonb) -> _permission) = 'boolean'
          THEN (p.permissions ->> _permission)::boolean
        ELSE false
      END
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
      LIMIT 1
    ),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.current_user_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text) TO authenticated;

DROP POLICY IF EXISTS "Users with product create permission can create products" ON public.products;
CREATE POLICY "Users with product create permission can create products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (public.current_user_has_permission('products.create'));

DROP POLICY IF EXISTS "Users with product edit permission can update products" ON public.products;
CREATE POLICY "Users with product edit permission can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (public.current_user_has_permission('products.edit'))
WITH CHECK (public.current_user_has_permission('products.edit'));

DROP POLICY IF EXISTS "Users with product delete permission can delete products" ON public.products;
CREATE POLICY "Users with product delete permission can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (public.current_user_has_permission('products.delete'));