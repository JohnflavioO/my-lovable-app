
CREATE TABLE public.app_changelog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  release_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'producao',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_changelog TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_changelog TO authenticated;
GRANT ALL ON public.app_changelog TO service_role;

ALTER TABLE public.app_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view changelog"
  ON public.app_changelog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert changelog"
  ON public.app_changelog FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update changelog"
  ON public.app_changelog FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can delete changelog"
  ON public.app_changelog FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE TRIGGER app_changelog_updated_at
  BEFORE UPDATE ON public.app_changelog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial version
INSERT INTO public.app_changelog (version, title, description, environment)
VALUES ('1.0.0', 'Lançamento inicial', 'Primeira versão do MCI CRM com controle de versões e histórico de atualizações.', 'producao');
