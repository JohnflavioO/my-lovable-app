# Proteger edições não salvas de orçamento

## Objetivo
Impedir que alterações feitas no editor de orçamento sejam perdidas por clique fora da janela, botão Cancelar, tecla Esc, atualização ou fechamento da página.

## Alterações
- Registrar o estado inicial do formulário e dos itens ao abrir um orçamento novo ou existente.
- Detectar alterações reais durante a edição, sem alertar quando nada mudou.
- Interceptar qualquer tentativa de fechar a janela de edição e mostrar uma confirmação com três ações:
  - **Salvar como rascunho**: grava o orçamento com status Rascunho e fecha somente após sucesso.
  - **Descartar alterações**: fecha sem salvar.
  - **Continuar editando**: mantém a janela aberta e todos os dados preenchidos.
- Aplicar a mesma confirmação ao botão Cancelar, clique fora da janela e tecla Esc.
- Exibir o aviso nativo do navegador ao atualizar ou fechar a aba com alterações pendentes.
- Limpar a proteção após salvar ou descartar, evitando alertas indevidos.

## Detalhes técnicos
- Reutilizar o salvamento atual com uma opção explícita para forçar o status `draft`, mantendo as validações mínimas necessárias e os relacionamentos de itens.
- Usar os componentes de confirmação já existentes no projeto e impedir o fechamento automático da janela enquanto houver alterações.
- Manter toda a mudança na tela de orçamentos, sem alterar banco de dados nem permissões.

## Validação
- Testar criação e edição com e sem alterações.
- Confirmar os três caminhos do aviso: salvar rascunho, descartar e continuar editando.
- Confirmar proteção no clique externo, Cancelar, Esc e recarregamento da página.
- Validar que o salvamento normal continua funcionando.
