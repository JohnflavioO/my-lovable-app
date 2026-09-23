
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  brand text,
  description text,
  code text,
  price numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view products"
ON public.products FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM user_approvals
  WHERE user_approvals.user_id = auth.uid() AND user_approvals.status = 'approved'
));

CREATE POLICY "Admins can manage products"
ON public.products FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
));
