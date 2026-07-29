# Diagnóstico multi-tenant — sem alterações a aplicar

Este "plano" é apenas o registo do diagnóstico pedido. **Não propõe alterações de código nem de base de dados.** Aprovar apenas se quiseres marcar o diagnóstico como fechado; para agir sobre algum dos pontos abertos, pede-me um plano específico.

## 1. Isolamento entre contas: SIM

Uma segunda conta com outro email e outro número de WhatsApp/Telegram começa **vazia e isolada**. Não vê Pessoas, Imóveis, Negócio, Drive, Diversos, Seguimentos, Conversas, Prospeção nem Ficheiros da primeira conta.

## 2. Coluna de dono + RLS: SIM em todas as tabelas de domínio

Todas as tabelas relevantes têm `user_id` e política RLS `auth.uid() = user_id` (verificado em `pg_policies`):

- `people`, `properties`, `opportunities`, `follow_ups`
- `financial_movements`, `miscellaneous_items`, `prospecting_leads`
- `uploaded_files` (4 políticas separadas por operação)
- `reminders`, `assessor_messages`, `conversation_states`, `pending_actions`

Não existem tabelas de domínio ligadas a uma única conta hardcoded.

## 3. O motor sabe de quem é a mensagem: SIM

- **WhatsApp**: `findUserIdByPhone()` em `src/routes/api/public/whatsapp-webhook.ts` procura em `profiles` filtrando por `phone` + `whatsapp_link_status='linked'`. Só números emparelhados via `LIGAR-123456` são reconhecidos.
- **Chat web**: `sendAssessorMessage` usa `context.userId` do bearer JWT (via `requireSupabaseAuth`).
- Todo o motor v3 (Observe/Think/Search/Decide/Act), extractores, autonomia, prioridades e lembretes recebem `userId` como parâmetro e escrevem sempre com esse `user_id`.

## Pontos de atenção (não urgentes)

- **Números não emparelhados são silenciosamente ignorados** — UX de onboarding pobre.
- **Sem conceito de workspace/agência** — cada consultor é uma ilha; partilha entre consultores da mesma agência exige refactor de RLS.
- **`storage.objects` do bucket `assessor-files`** — validar formalmente que as políticas do bucket filtram por `user_id` no path.
- **Cron/proatividade correm como service_role** — respeitam isolamento por construção hoje, mas qualquer `.eq('user_id', ...)` esquecido seria vazamento cross-tenant. Zona a vigiar em auditorias.

## Próximos passos possíveis (só se pedires)

- (a) Melhorar onboarding de números não emparelhados.
- (b) Introduzir workspaces partilhados (`account_id`).
- (c) Auditoria formal a todos os call sites que fazem `.eq('user_id', ...)` no código do motor e nos cron jobs.
