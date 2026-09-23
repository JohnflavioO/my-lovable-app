UPDATE public.products SET company_id = (SELECT company_id FROM public.products WHERE company_id IS NOT NULL GROUP BY company_id ORDER BY count(*) DESC LIMIT 1) WHERE company_id IS NULL;

DROP POLICY IF EXISTS "Approved users can view products" ON public.products;
CREATE POLICY "Approved users can view products"
ON public.products FOR SELECT TO authenticated
USING (is_approved() AND (is_admin() OR company_id = current_user_company_id()));

DROP POLICY IF EXISTS "Approved users can read equivalences" ON public.product_equivalences;
CREATE POLICY "Approved users can read equivalences"
ON public.product_equivalences FOR SELECT TO authenticated
USING (is_approved() AND (is_admin() OR company_id = current_user_company_id()));