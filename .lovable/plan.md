# Formas de pagamento e restauração por usuário

## Objetivo
Corrigir as opções de pagamento dos orçamentos e permitir que administradores carreguem facilmente backups antigos para cada usuário.

## Implementação
- Centralizar a lista de formas de pagamento e usá-la no pagamento único e nos dois métodos, evitando opções diferentes entre telas ou usuários.
- Manter as regras atuais de PIX, cartão, boleto e parceria, com validações e campos específicos.
- Transformar a restauração atual, hoje fixa no comercial2, em um fluxo genérico: selecionar o usuário de destino, escolher o ZIP e revisar a conta identificada antes de importar.
- Validar formato, integridade, empresa e vínculos; substituir somente o usuário de origem pelo usuário escolhido e atualizar registros existentes sem duplicá-los.
- Exibir progresso, totais importados e erros claros; restringir a operação a administradores.

## Validação
- Conferir no orçamento que PIX, Cartão, Boleto e Parceria aparecem nos modos único e dividido.
- Testar a leitura de um backup antigo e a seleção do usuário, sem executar gravações reais durante a validação local.
- Confirmar compilação e ausência de erros na tela.

## Observação
A importação real depende da chave administrativa válida do banco próprio e da publicação da função de restauração nesse banco.