# Reestruturar o dashboard à volta do Negócio

O Negócio passa a ser a entidade central. Hoje → Quadro de Negócios → Detalhe do Negócio.
Trabalho incremental: aproveita o que já existe (cores, Source Serif 4, cartões, TierGate, diálogos de Editar, Drive, grelha de mês). Nada é reconstruído do zero.

Nota: o chat real em "Falar com Afonso" (Pro/Team) mantém-se exatamente como ficou. Este plano não lhe toca.

## Decisão base: evoluir `opportunities`, não criar `deals`

A tabela `opportunities` já é um negócio a meio caminho: tem pessoa, imóvel, tipo, valor, próxima ação e data. E já é o ponto de ligação de outras tabelas: `financial_movements.opportunity_id`, `follow_ups.opportunity_id`, `interactions.opportunity_id`.

Criar uma tabela `deals` nova obrigaria a migrar esses três laços e a reescrever o motor do Afonso, a ficha `/oportunidades/$id`, a faturação e a auditoria. Evoluir a tabela existente dá exatamente a mesma entidade sem partir nada, e sem um único dia com dados em dois sítios.

Na interface o nome passa a ser **Negócio** em todo o lado. Por dentro continua a chamar-se `opportunities` — é só o nome técnico da tabela, o consultor nunca o vê.

## Fase 0 — antes de tocar em dados reais

- Contagem exata do que existe hoje por conta (negócios, com/sem imóvel, com/sem pessoa, por estado atual) e mapa de conversão estado antigo → fase nova, apresentado para aprovação.
- Ensaio da migração numa conta de teste primeiro; só depois nas contas reais.
- Tudo aditivo: nenhuma coluna nem tabela é apagada nesta fase. As colunas antigas ficam a ser escritas em paralelo durante a transição, para haver caminho de volta.

## Fase 1 — base de dados

Acrescenta ao negócio: nome do negócio, natureza (comprador/vendedor), fase, prazo, próximo passo já existe, arquivado.

Fases: Preparação → Angariação/Procura → Promoção/Procura ativa → Visitas → Proposta → CPCV → Escritura → Concluído/Arquivado.
Agrupamento visual: Preparação | Em promoção/procura | Visitas | Proposta e fecho.

- Tabela nova de ligação **negócio ↔ imóveis** (um negócio pode ter vários; um comprador tem vários imóveis em avaliação).
- Tabela nova de **histórico do negócio**: eventos estruturados (mudança de fase, visita, proposta, documento ligado, contacto) — é isto que alimenta a linha temporal, não a cópia da conversa.
- Ligação de negócio em: compromissos (`follow_ups` já tem), documentos (`uploaded_files`, campo novo com recurso ao existente pessoa/imóvel como alternativa), movimentos financeiros (já tem).
- Segurança igual à do resto: RLS por `user_id`, GRANT explícito, e as mudanças de fase ficam registadas no histórico com quem e quando.

Conversão dos dados existentes: cada negócio atual recebe um nome gerado a partir da pessoa e do imóvel, natureza inferida pelo tipo já registado, e fase mapeada a partir do estado atual. O imóvel já ligado passa também para a tabela de ligação. Nada é perdido.

## Fase 2 — Quadro de Negócios (`/negocios`)

Substitui o "Negócio" solto como destino principal. Cartões por fase, com alternância quadro/lista (os dois desenhos já existem).
Cada cartão: nome, natureza, pessoa principal, imóvel ou critério, fase, próximo passo, prazo e alerta do Afonso quando houver.
Filtros: ativos, compradores, vendedores, concluídos, com alerta, e pesquisa.
Mudar de fase abre sempre confirmação. Concluir uma tarefa nunca muda a fase sozinho.

A faturação/comissões/despesas atuais continuam onde estão, acessíveis a partir do negócio.

## Fase 3 — Detalhe do Negócio

Evolui a ficha `/oportunidades/$id` já construída, em vez de criar página nova:
cabeçalho com nome, natureza, fase, última atualização e "Tratar com o Afonso" (abre o canal já com o contexto do negócio);
percurso pelas fases em forma de caminho, sem percentagens nem pontuação;
três blocos de relação — Pessoa / Imóvel / Negócio — cada um com ligação à ficha completa e aos diálogos de Editar já feitos;
próxima ação recomendada em destaque;
leitura do Afonso calculada a partir dos números reais (ex.: proposta abaixo do pedido, dias parado na mesma fase, prazo a passar) — se não houver nada concreto a dizer, não aparece nada;
linha temporal do histórico estruturado;
documentos do negócio, através do Drive já existente.

## Fase 4 — Hoje

Mantém a estrutura visual atual e liga-a ao negócio:
cada prioridade mostra a que negócio pertence, com Concluir / Adiar / Abrir negócio / Tratar no WhatsApp — ação principal visível, resto no menu discreto que já usamos;
"O que vem a seguir" junta prioridades e compromissos por ordem cronológica;
"Afonso chama a atenção" reduz-se a **uma** situação, com contexto e ligação ao negócio;
"A aguardar resposta" mantém-se como está.
Zero percentagens, rankings ou gráficos.

## Fase 5 — Pessoas, Imóveis, Agenda, Drive, Pesquisa

- Pessoas e Imóveis continuam para consulta e pesquisa directa. Cada ficha passa a listar os **negócios associados** (podem ser vários), em vez de "imóvel ligado" solto. Editar/Eliminar/Exportar, etiquetas e pastas mantêm-se.
- Agenda: compromisso pode ligar-se a negócio, pessoa, imóvel, ou ficar pessoal. Grelha de mês mantém-se.
- Drive: ficheiro liga-se ao negócio quando existir, com recurso a pessoa/imóvel quando não existir. "Corrigir ligação" mantém-se e passa a poder escolher negócio.
- Pesquisa global: passa a procurar em pessoas, imóveis, negócios, notas, documentos e compromissos ao mesmo tempo, e cada resultado mostra as três pontas ligadas (pessoa + negócio + imóvel), não a entidade isolada.

## Fase 6 — Afonso

O motor passa a saber criar e atualizar negócios e a referir-se-lhes pelo nome. Mudança de fase por conversa continua a pedir confirmação, como qualquer outra ação. Sem alterar a arquitetura do motor.

## Validação final

Pesquisar "João Silva" → pessoa → negócio associado → abrir negócio → ver imóvel → fase → próxima ação → alerta do Afonso → abrir WhatsApp já com o contexto.
E confirmar que se chega ao mesmo negócio a partir de: Hoje, Quadro, ficha da pessoa, ficha do imóvel e pesquisa global.

## Detalhe técnico

- `opportunities` ganha: `title`, `deal_kind` ('comprador'|'vendedor'), `stage` (enum novo `deal_stage`), `deadline`, `archived_at`. `status` fica preenchido em paralelo durante a transição.
- Novas tabelas: `opportunity_properties` (negócio ↔ imóveis, com papel) e `opportunity_events` (histórico estruturado: `kind`, `summary`, `payload`, `occurred_at`). Ambas com RLS por `user_id` e GRANT a `authenticated`/`service_role`.
- `uploaded_files` ganha `opportunity_id`; `follow_ups`/`financial_movements`/`interactions` já têm.
- Rotas: `/negocios` (quadro) e reaproveitamento de `/oportunidades/$id` como detalhe, com redireccionamento das entradas antigas do menu.
- Pesquisa global passa a uma função de servidor única que devolve o resultado já com as entidades ligadas resolvidas, em vez de cinco consultas soltas no cliente.
- Auditoria: mudanças de fase e arquivo ficam em `opportunity_events` e, quando feitas pelo Afonso, também no rasto de ações autónomas já existente.
