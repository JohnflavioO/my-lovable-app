
-- Table to store integration credentials securely
CREATE TABLE public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_name text NOT NULL,
  api_key text,
  application_key text,
  status text NOT NULL DEFAULT 'disconnected',
  last_sync_at timestamp with time zone,
  config jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(integration_name)
);

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view integrations"
  ON public.integrations FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert integrations"
  ON public.integrations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update integrations"
  ON public.integrations FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete integrations"
  ON public.integrations FOR DELETE
  TO authenticated
  USING (public.is_admin());
