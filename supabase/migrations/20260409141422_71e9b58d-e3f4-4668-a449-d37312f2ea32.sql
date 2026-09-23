ALTER TABLE public.quotes
  ADD COLUMN payment_date date,
  ADD COLUMN installments integer DEFAULT 1,
  ADD COLUMN is_split_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN split_method_1 text,
  ADD COLUMN split_value_1 numeric DEFAULT 0,
  ADD COLUMN split_date_1 date,
  ADD COLUMN split_installments_1 integer DEFAULT 1,
  ADD COLUMN split_method_2 text,
  ADD COLUMN split_value_2 numeric DEFAULT 0,
  ADD COLUMN split_date_2 date,
  ADD COLUMN split_installments_2 integer DEFAULT 1;