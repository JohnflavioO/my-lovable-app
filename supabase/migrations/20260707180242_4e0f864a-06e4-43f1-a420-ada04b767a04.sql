-- Function to expose default origin CEP to authenticated users
CREATE OR REPLACE FUNCTION public.get_default_origin_cep()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value->>'cep' FROM public.system_settings WHERE key = 'default_origin_zipcode' LIMIT 1),
    ''
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_default_origin_cep() TO authenticated, anon;

-- Function for admins to update the default origin CEP
CREATE OR REPLACE FUNCTION public.set_default_origin_cep(_cep text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cep text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar esta configuração';
  END IF;
  v_cep := regexp_replace(COALESCE(_cep, ''), '\D', '', 'g');
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES ('default_origin_zipcode', jsonb_build_object('cep', v_cep), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN v_cep;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_origin_cep(text) TO authenticated;