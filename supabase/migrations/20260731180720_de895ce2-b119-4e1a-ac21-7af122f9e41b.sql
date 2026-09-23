ALTER TABLE public.technical_orders
  ADD COLUMN IF NOT EXISTS discount_scope text NOT NULL DEFAULT 'parts',
  ADD COLUMN IF NOT EXISTS budget_valid_days integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS budget_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS budget_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS repair_description text,
  ADD COLUMN IF NOT EXISTS technician_email text,
  ADD COLUMN IF NOT EXISTS technician_phone text,
  ADD COLUMN IF NOT EXISTS service_type text;

ALTER TABLE public.technical_orders
  DROP CONSTRAINT IF EXISTS technical_orders_discount_scope_check;
ALTER TABLE public.technical_orders
  ADD CONSTRAINT technical_orders_discount_scope_check CHECK (discount_scope IN ('parts','total'));

CREATE TABLE IF NOT EXISTS public.technical_budget_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.technical_orders(id) ON DELETE CASCADE,
  company_id uuid,
  version integer NOT NULL DEFAULT 1,
  parts_value numeric NOT NULL DEFAULT 0,
  labor_value numeric NOT NULL DEFAULT 0,
  shipping_value numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  discount_scope text NOT NULL DEFAULT 'parts',
  total_value numeric NOT NULL DEFAULT 0,
  parts_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version)
);

GRANT SELECT, INSERT ON public.technical_budget_versions TO authenticated;
GRANT ALL ON public.technical_budget_versions TO service_role;

ALTER TABLE public.technical_budget_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_versions_select" ON public.technical_budget_versions;
CREATE POLICY "budget_versions_select" ON public.technical_budget_versions
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id = technical_budget_versions.order_id
      AND public.is_approved()
      AND (o.company_id IS NULL OR o.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  )
);

DROP POLICY IF EXISTS "budget_versions_insert" ON public.technical_budget_versions;
CREATE POLICY "budget_versions_insert" ON public.technical_budget_versions
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.technical_orders o
    WHERE o.id = technical_budget_versions.order_id
      AND public.is_approved()
      AND (o.company_id IS NULL OR o.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  )
);

CREATE INDEX IF NOT EXISTS idx_technical_budget_versions_order ON public.technical_budget_versions(order_id, version DESC);

CREATE TRIGGER update_technical_budget_versions_updated_at
BEFORE UPDATE ON public.technical_budget_versions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();