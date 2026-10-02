# Corrigir lista de usuários na restauração

## Objetivo
Fazer o campo “Selecionar usuário de destino” listar corretamente as contas cadastradas.

## Alterações
- Separar o carregamento de usuários das consultas de histórico e empresas, evitando que uma falha secundária apague a lista inteira.
- Manter somente contas com e-mail e ordenar a lista alfabeticamente.
- Exibir uma mensagem clara quando a lista não puder ser carregada e permitir uma nova tentativa.
- Preservar a restrição da restauração apenas para administradores.

## Validação
- Confirmar que usuários cadastrados aparecem no seletor.
- Confirmar que falhas no histórico não afetam mais a lista.
- Validar compilação e o estado vazio/erro da tela.
