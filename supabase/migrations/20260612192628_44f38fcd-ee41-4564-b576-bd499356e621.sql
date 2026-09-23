
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.system_settings TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings readable by all auth"
  ON public.system_settings FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "system_settings admin write"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.system_settings (key, value)
VALUES ('app_version', jsonb_build_object('version', '1.0.0', 'force_update', false, 'message', ''))
ON CONFLICT (key) DO NOTHING;
