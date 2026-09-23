CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add unique constraint on integration_name for upsert to work properly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integrations_integration_name_key'
  ) THEN
    ALTER TABLE public.integrations ADD CONSTRAINT integrations_integration_name_key UNIQUE (integration_name);
  END IF;
END $$;