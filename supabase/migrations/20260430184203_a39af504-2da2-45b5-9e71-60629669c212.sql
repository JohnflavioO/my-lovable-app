-- Fix is_admin to be security definer and set search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- Fix is_gestor
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'gestor'
  );
END;
$$;

-- Fix is_financeiro
CREATE OR REPLACE FUNCTION public.is_financeiro()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'financeiro'
  );
END;
$$;

-- Fix is_logistica
CREATE OR REPLACE FUNCTION public.is_logistica()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'logistica'
  );
END;
$$;

-- Fix is_approved
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'gestor', 'vendedor', 'comercial', 'financeiro', 'logistica')
  ) OR EXISTS (
    SELECT 1 FROM public.user_approvals
    WHERE user_id = auth.uid() AND status = 'approved'
  );
END;
$$;
