
CREATE TABLE public.help_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Geral',
  loom_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_videos TO authenticated;
GRANT ALL ON public.help_videos TO service_role;

ALTER TABLE public.help_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view help videos"
ON public.help_videos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Gestor and admin can insert help videos"
ON public.help_videos FOR INSERT
TO authenticated
WITH CHECK (public.is_gestor() OR public.is_admin());

CREATE POLICY "Gestor and admin can update help videos"
ON public.help_videos FOR UPDATE
TO authenticated
USING (public.is_gestor() OR public.is_admin())
WITH CHECK (public.is_gestor() OR public.is_admin());

CREATE POLICY "Gestor and admin can delete help videos"
ON public.help_videos FOR DELETE
TO authenticated
USING (public.is_gestor() OR public.is_admin());

CREATE TRIGGER help_videos_updated_at
BEFORE UPDATE ON public.help_videos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
