DROP INDEX IF EXISTS idx_bank_slips_unique_import;
CREATE UNIQUE INDEX idx_bank_slips_unique_import ON public.bank_slips (nfe_number, client_name, due_date, principal_amount);