-- Adiciona coluna de lote de importação
ALTER TABLE public.bank_slips ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Adiciona índice para performance em deleções por lote
CREATE INDEX IF NOT EXISTS idx_bank_slips_import_batch_id ON public.bank_slips(import_batch_id);