GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_products TO authenticated;
GRANT ALL ON public.technical_products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_brands TO authenticated;
GRANT ALL ON public.technical_brands TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.technical_maintenances TO authenticated;
GRANT ALL ON public.technical_maintenances TO service_role;

ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privilege_escalation;

UPDATE public.profiles
SET company_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE company_id IS NULL
  AND (
    role IN ('support_tech', 'support_manager')
    OR user_id IN (
      SELECT user_id
      FROM public.user_roles
      WHERE role IN ('support_tech', 'support_manager')
    )
  );

ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privilege_escalation;