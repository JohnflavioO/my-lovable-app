-- Ajustar a sequência de Ordens de Serviço (OS) para começar em 257
SELECT setval('public.technical_os_number_seq', 256, true);