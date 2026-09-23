UPDATE public.profiles SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL AND role LIKE 'support%';

-- Ensure new support profiles get a default company_id
ALTER TABLE public.profiles ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';