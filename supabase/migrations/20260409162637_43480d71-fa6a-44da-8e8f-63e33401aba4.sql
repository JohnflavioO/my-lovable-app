
-- Drop existing policies
DROP POLICY IF EXISTS "Financeiro, Gestor, Admin can view financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Financeiro and Admin can insert financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Financeiro and Admin can update financial records" ON public.financial_records;
DROP POLICY IF EXISTS "Admin can delete financial records" ON public.financial_records;

-- Recreate without admin
CREATE POLICY "Financeiro and Gestor can view financial records"
ON public.financial_records FOR SELECT TO authenticated
USING (is_gestor() OR is_financeiro());

CREATE POLICY "Financeiro can insert financial records"
ON public.financial_records FOR INSERT TO authenticated
WITH CHECK (is_financeiro());

CREATE POLICY "Financeiro can update financial records"
ON public.financial_records FOR UPDATE TO authenticated
USING (is_financeiro());

CREATE POLICY "Financeiro can delete financial records"
ON public.financial_records FOR DELETE TO authenticated
USING (is_financeiro());
