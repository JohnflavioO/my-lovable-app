# Restaurar backup do comercial2

## Objetivo
Carregar o backup enviado na conta `comercial2@mcistore.com.br`, preservando os vínculos entre clientes, pedidos e itens.

## Implementação
- Criar uma restauração protegida, disponível somente para administradores.
- Validar o formato, a conta de destino e a integridade do arquivo antes de gravar.
- Importar na ordem correta: conta e perfil, clientes, pedidos, itens e registros relacionados.
- Reutilizar os mesmos identificadores e atualizar registros existentes, evitando duplicações.
- Manter o nível da conta como Comercial e conservar suas permissões do backup.
- Exibir o resumo final com quantidades importadas e eventuais falhas.

## Dados identificados
- 275 clientes
- 82 pedidos
- 264 itens de pedidos
- Registros financeiros, logísticos, notificações, permissões e aprovação vinculados

## Segurança
- A chave administrativa permanece protegida e nunca é enviada ao navegador.
- A restauração recusa arquivos de outra conta ou empresa.
- Nenhuma tabela fora do backup do usuário será apagada.

## Validação
- Conferir as contagens após a importação.
- Confirmar que todos os pedidos e itens aparecem para `comercial2@mcistore.com.br`.
