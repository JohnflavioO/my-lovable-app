# Roadmap
- [x] Disponibilizar edição e download dos orçamentos filtrados do comercial para gestores, preservando responsável e escopo (testes de responsável e botões passaram)
- [ ] Conferir edição, salvamento e download com conta de gestor no banco externo (sessão autenticada indisponível neste ambiente)
- [x] Criar migração de auditoria, escopo e policies de itens
- [x] Criar e testar função protegida de exportação
- [x] Substituir interface por ZIP completo e verificado
- [x] Adicionar testes de mapa, cursor e autorização
- [x] Validar compilação e fluxo visual
- [x] Otimizar os 5 maiores consumos seguros sem alterar comportamento
- [x] Validar consultas reduzidas, testes e preview
- [x] Disponibilizar instalação do MCI CRM no computador e celular
- [ ] Importar o backup do Wendell para comercial2@mcistore.com.br com validação e sem duplicar registros (aguarda execução autenticada na tela Backup completo)
- [x] Garantir todas as formas de pagamento no orçamento, inclusive em pagamento dividido
- [x] Generalizar a restauração de backups antigos para qualquer usuário, com seleção simples e validação

- [x] Exibir parcelas de boleto de 1x a 10x no orçamento e validar o limite no app
- [x] Corrigir a falha ao exibir erros durante a restauração de backups
- [x] Corrigir a identidade administrativa usada para restaurar orçamentos
- [x] Corrigir no banco a regra que confundia restauração administrativa com usuário anônimo
- [x] Aceitar pagamentos históricos incompletos somente pela restauração administrativa autenticada
- [x] Proteger edições de orçamento com confirmação para salvar rascunho, descartar ou continuar

- [x] Corrigir a lista de usuários cadastrados na restauração de backup
- [x] Incluir obrigatoriamente o endereço do cliente nas exportações de OS do Suporte Técnico
- [x] Corrigir o bloqueio de vínculo de cliente ao gestor editar propostas, preservando isolamento por empresa
- [x] Padronizar documentos técnicos pelo PDF enviado e exibir endereço do cliente nas telas e exportações (PDFs revisados visualmente; teste autenticado no banco externo indisponível)
- [x] Usar Modelo como nome principal do equipamento nos orçamentos técnicos, com fallback para Equipamento (14 testes passaram; PDF conferido)
