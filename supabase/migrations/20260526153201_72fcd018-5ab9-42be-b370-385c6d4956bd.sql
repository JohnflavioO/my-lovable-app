
-- 1. bank_slip_history: remove anyone-can-view policy
DROP POLICY IF EXISTS "Anyone can view history" ON public.bank_slip_history;

-- 2. bank_slips: remove unrestricted UPDATE policy
DROP POLICY IF EXISTS "Users can update bank_slips" ON public.bank_slips;

-- 3. smart_opportunities: restrict insert to authenticated admins/gestors
DROP POLICY IF EXISTS "System/Admins can insert opportunities" ON public.smart_opportunities;
CREATE POLICY "Admins and gestors can insert opportunities"
ON public.smart_opportunities
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR public.is_gestor()
);

-- 4. technical_maintenances + technical_brands: drop broken (wrong-column) public ALL policies
DROP POLICY IF EXISTS "Technicians can manage maintenance" ON public.technical_maintenances;
DROP POLICY IF EXISTS "Admins and technicians can manage brands" ON public.technical_brands;

-- 5. Add fixed search_path to SECURITY DEFINER functions missing it
ALTER FUNCTION public.handle_user_permanent_delete() SET search_path = public;
ALTER FUNCTION public.is_support_manager() SET search_path = public;
ALTER FUNCTION public.is_support_tech() SET search_path = public;
ALTER FUNCTION public.process_smart_opportunities_diagnostics() SET search_path = public;
