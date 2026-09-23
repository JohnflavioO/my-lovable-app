UPDATE public.profiles SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.products SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.products ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

DROP POLICY IF EXISTS "Approved users can view products" ON public.products;
CREATE POLICY "Approved users can view products" ON public.products FOR SELECT TO authenticated
USING (
  is_approved() AND (
    is_admin()
    OR company_id IS NULL
    OR public.current_user_company_id() IS NULL
    OR company_id = public.current_user_company_id()
  )
);