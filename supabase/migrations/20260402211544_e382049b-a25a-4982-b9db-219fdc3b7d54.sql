
-- Create a sequence for unique quote numbers
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START WITH 1 INCREMENT BY 1;

-- Set the sequence to start after the highest existing number
DO $$
DECLARE
  max_num INT;
BEGIN
  SELECT COALESCE(MAX(
    CASE 
      WHEN quote_number ~ '^\d+$' THEN quote_number::int
      WHEN quote_number ~ '-(\d+)$' THEN (regexp_replace(quote_number, '.*-', ''))::int
      ELSE 0
    END
  ), 0) INTO max_num FROM public.quotes;
  
  IF max_num > 0 THEN
    PERFORM setval('public.quote_number_seq', max_num);
  END IF;
END $$;

-- Replace the function to use the sequence
CREATE OR REPLACE FUNCTION public.generate_quote_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN 'ORC-' || LPAD(nextval('public.quote_number_seq')::TEXT, 5, '0');
END;
$function$;
