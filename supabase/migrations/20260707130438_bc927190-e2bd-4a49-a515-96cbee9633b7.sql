
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE public.contract_templates
SET company_id = COALESCE(company_id, '00000000-0000-0000-0000-000000000001'::uuid);

CREATE INDEX IF NOT EXISTS contract_templates_company_id_idx ON public.contract_templates(company_id);

DROP POLICY IF EXISTS "All authenticated users can view active templates" ON public.contract_templates;

CREATE POLICY "Users view active templates in their company"
ON public.contract_templates
FOR SELECT
TO authenticated
USING (
  active = true
  AND (company_id IS NULL OR company_id = public.current_user_company_id())
);
