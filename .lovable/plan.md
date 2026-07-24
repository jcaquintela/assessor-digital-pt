# Plano — Preparar “Assessor do Consultor” para piloto de 14 dias

Este é um gate de qualidade: sem novas áreas, apenas endurecer o núcleo para deixar de ser demo. O trabalho é grande e vou dividi-lo em fases coerentes. Após aprovação, executo tudo de seguida.

## Fase 1 — Assessor real (chat sem dados inventados)

Reescrever `src/routes/_authenticated/assessor.tsx` e criar `src/lib/assessor/` com:

- **Parser PT-PT** (`parser.ts`): extrai nome, data, hora, valor (€), categoria a partir do texto. Timezone `Europe/Lisbon`. Sem defaults inventados — se falta info, marca campo como vazio.
- **Cartões editáveis** (`CartaoSeguimento`, `CartaoDespesa`, `CartaoComissao`, `CartaoConversa`): cada cartão tem modo *view* e *edit* com inputs reais (Combobox de pessoa/oportunidade/imóvel a ler do store, DatePicker, TimePicker, Select de categoria/estado/prioridade). Botões Confirmar / Editar / Cancelar. Confirmar só fecha após a mutation resolver.
- **Resolução de pessoa**: pesquisa por nome no `people` do utilizador; 0 → sugere "Criar pessoa X"; 1 → associa; N → mostra lista para escolher.
- **Sem `montarCartao` com valores fixos**: remover "Ana Silva", "42 €", "9.450 €", "amanhã 10h", briefings falsos, resultados de pesquisa simulados.
- **Briefing real** (ação `O que tenho hoje?`): consulta live `follow_ups`, `opportunities`, `financial_movements` do utilizador e devolve contagens/listas reais.
- **Pesquisa real**: query textual (`ilike`) em `people`, `opportunities`, `properties`, `follow_ups`. Sem resultados inventados.

## Fase 2 — Histórico persistente do chat

- Novo módulo `src/lib/assessor/messages.ts` com CRUD sobre `assessor_messages` (colunas existentes: role, content, card_type, card_state, card_payload, created_record_id).
- Ao abrir `/assessor`, carregar últimas ~50 mensagens do utilizador.
- Guardar cada mensagem do utilizador, cada resposta do assessor e cada cartão com estado (`draft`/`confirmed`/`cancelled`) e `card_payload` JSON.
- Botões **Nova conversa** e **Limpar conversa** no header do chat. Limpar apaga só `assessor_messages`; não toca em pessoas, seguimentos, despesas nem comissões já confirmados.

## Fase 3 — Persistência das ações (com estados de erro/loading)

Rever `src/lib/store.tsx`:
- Adicionar mutations para **comissão** e **despesa** que gravam em `financial_movements` (`type = commission | expense`), campos: amount, description, category, movement_date, opportunity_id, property_id.
- Adicionar `atualizarPessoa`, `eliminarPessoa`, `atualizarSeguimento`, `eliminarSeguimento`, `atualizarMovimento`, `eliminarMovimento`.
- Todas retornam promessa; erros propagam para o cartão (que mantém estado `draft`, mostra mensagem e permite retry, sem duplicar).

## Fase 4 — CRUD mínimo nas páginas existentes

- `/pessoas`: já tem criar; adicionar editar e eliminar no Sheet de detalhe.
- `/seguimentos`: adicionar editar, eliminar, reagendar-para-data-arbitrária (para além do já existente concluir + reagendar amanhã).
- `/negocio`: adicionar botões “Nova despesa” e “Nova comissão” + editar/eliminar em cada linha.

## Fase 5 — Definições, dados demo e aviso de piloto

- `seedDemoData` só corre por ação explícita do utilizador (já é o caso; garantir que nada mais chama seed).
- Novo campo `profiles.account_kind` (`real` | `demo`) — set para `demo` quando seed corre; volta a `real` no `resetAccount`.
- Definições: badge “Conta com dados reais” / “Conta de demonstração”.
- Onboarding (primeiro login) e Definições: mostrar aviso *“Versão piloto de 14 dias. Não inserir documentos sensíveis…”* — usar `localStorage` para dispensar após leitura. Não aparece nas outras páginas.

## Fase 6 — Segurança / RLS

- Migração de verificação: `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + policies confirmadas em `profiles`, `people`, `opportunities`, `properties`, `follow_ups`, `interactions`, `financial_movements`, `assessor_messages`.
- Confirmar que `/admin` não expõe conteúdo privado — auditar `src/routes/admin/utilizadores.tsx` e remover qualquer leitura de dados de consultor.

## Fase 7 — Mobile

- Garantir que a caixa de mensagem respeita `env(safe-area-inset-bottom)` e não é tapada pelo teclado (usar `visualViewport` API para ajustar o `bottom` do compositor).
- Cartões editáveis compactos em mobile (mesma lógica, layout empilhado).

## Fase 8 — Relatório final

Documento em `docs/piloto-14-dias.md` com:
- Cenários testados (Consultor A, Consultor B, Super Admin, mobile).
- Passos manuais executados e resultados.
- Falhas encontradas / limitações conhecidas (WhatsApp, áudio real, upload, Google/Outlook, Stripe indisponíveis — mensagem “Ainda não disponível nesta versão piloto”).
- Veredicto: **Apto** ou **Não apto**.

## Detalhes técnicos

- Timezone: usar `Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon' })` + `date-fns-tz` (já disponível via `date-fns`, ou parse manual — evito nova dependência).
- Sem alteração de layout desktop existente.
- Sem novas rotas.
- Migração única para `profiles.account_kind` + FORCE RLS.
- Reutilizar componentes shadcn existentes (Popover, Command, Calendar) para os cartões editáveis; instalar apenas se faltarem (`cmdk`, `react-day-picker` provavelmente já presentes via shadcn).

## Volume estimado

- Reescrever assessor.tsx (~1000 linhas → dividido em módulos ~1200).
- ~6 novos ficheiros em `src/lib/assessor/`.
- 1 migração SQL.
- Edições em store.tsx, pessoas.tsx, seguimentos.tsx, negocio.tsx, definicoes.tsx.
- Novo `docs/piloto-14-dias.md`.

Confirmas para avançar com todas as fases de uma vez? Se preferires, posso entregar por fases (ex.: Fase 1+2+3 primeiro, resto depois) para reveres cada bloco.
