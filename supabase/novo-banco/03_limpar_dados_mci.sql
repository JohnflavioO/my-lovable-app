-- =============================================================================
-- OPCIONAL: só se o novo banco for de OUTRA empresa.
--
-- Algumas migrations inserem dados da MCI: a equipe de vendas (salespeople) e
-- os consultores da landing de revendas (reseller_consultants), estes apontando
-- para IDs de usuários que só existem no banco antigo. Num banco novo esses IDs
-- não levam a ninguém, e os nomes aparecem nas telas.
--
-- Rode antes de cadastrar qualquer venda ou revenda.
-- =============================================================================

BEGIN;

DELETE FROM public.salespeople
WHERE email IN (
  'felipe@mcistore.com.br', 'comercial2@mcistore.com.br', 'joão@mci.tv',
  'marketing@mcistore.com.br', 'Marketing2@mcistore.com.br', 'bianca@mcistore.com.br',
  'vinicius@mcistore.com.br', 'joao.sousa@mcistore.com.br'
)
OR (email IS NULL AND name IN ('MARCEL', 'PAULO FERNANDO'));

-- Mantém a opção "Nenhum deles", que o formulário público usa. Sem consultor
-- padrão, novos cadastros de revenda ficam como "pending_distribution" até
-- você cadastrar os consultores da nova empresa em Configurações.
DELETE FROM public.reseller_consultants
WHERE consultant_code IN (
  'felipe-aguiar', 'joao-gomes', 'joao-sousa', 'john-flavio',
  'sarah-aragao', 'vinicius-lando', 'wendel-nascimento'
);

COMMIT;
