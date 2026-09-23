ALTER TABLE public.contract_signature_requests
  ADD COLUMN IF NOT EXISTS validation_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_csr_validation_code
  ON public.contract_signature_requests(validation_code);