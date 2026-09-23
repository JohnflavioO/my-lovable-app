
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt INT;
BEGIN
  SELECT COUNT(*) + 1 INTO cnt FROM public.quotes WHERE quote_date = CURRENT_DATE;
  RETURN TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(cnt::TEXT, 3, '0');
END;
$$;
