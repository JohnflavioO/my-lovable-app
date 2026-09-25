# Corrigir restauração de backup

## Objetivo
Garantir que a importação dos dados de `comercial2@mcistore.com.br` seja executada com autorização administrativa, sem ser bloqueada pelas regras de usuários anônimos.

## Alterações
- Ajustar a conexão administrativa usada pela restauração para aceitar corretamente a chave secreta atual do banco.
- Preservar a validação da sessão e da permissão de administrador separadamente.
- Melhorar o diagnóstico quando a credencial administrativa estiver incorreta.
- Validar compilação e funcionamento do endpoint publicado.

## Detalhes técnicos
A conexão administrativa não enviará uma chave secreta opaca como token de usuário. Ela seguirá usando a chave apenas na identificação administrativa esperada pelo banco, evitando que as gravações sejam interpretadas como anônimas.
