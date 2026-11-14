# Diferenças v1.0.0 → v1.0.1 (gerado)

**Abordagem.** A v1.0.0 reproduzia o histórico de 184 migrações (com dados, reparos, DROP, RENAME e DROP NOT NULL). A v1.0.1 parte do **estado final** do esquema (o `pg_dump --schema-only` do ensaio descartável autorizado, commit 84f428ce, sha256 `e047c2e1fe0effb55a1208970befbb3d15a1e283baaaefc61793f9e1dc9e278c`) e só cria objetos.

| Medida | v1.0.0 | v1.0.1 |
|---|---|---|
| Ficheiros de migração | 4 | 6 |
| Instruções no topo | 1267 | 1241 |
| INSERT / UPDATE / DELETE no topo | 46 / 31 / 1 | 0 / 0 / 0 |
| Blocos DO no topo | 12 | 0 |
| DROP / ALTER destrutivo (DROP COLUMN, RENAME, DROP NOT NULL, DROP CONSTRAINT…) | 47 | 0 |
| CREATE OR REPLACE | 56 | 0 |
| Referências a auth.users em chaves estrangeiras | 88 | 1 |
| GRANT a anon | 4 | 0 |
| Políticas para PUBLIC | 2 | 0 |
| Tabelas V2 com barreira admin/tester | 0 | 104 |
| Funções V2 executáveis por anon/authenticated (pior caso) | 14/17 | 0/0 |
| Gatilho em auth.users | 1 | 0 |
| Políticas em storage.objects | 4 | 0 |
| Publicação Realtime | 1 | 0 |
| Substitui has_role do staging | sim | não |
| Políticas V2 acrescentadas a user_roles | 4 | 0 |
| Chave created_by → auth.users em user_roles | sim | não |

## O que foi para a quarentena (não executável)

- `quarantine/QZ-01_dml_v1.0.0.quarantine` — Dados, reparos, preenchimentos e blocos DO da v1.0.0: 90 itens.
- `quarantine/QZ-02_gatilho_auth_users.quarantine` — Gatilho em auth.users que cria perfil/papel/categorias em cada conta nova: 1 itens.
- `quarantine/QZ-03_realtime.quarantine` — Publicação Realtime de assessor_messages: 2 itens.
- `quarantine/QZ-04_politicas_storage_v1.0.0.quarantine` — Políticas de storage.objects para assessor-files (v1.0.0, SEM barreira admin/tester — não usar tal como estão): 4 itens.
- `quarantine/QZ-05_chaves_auth_users_retiradas.quarantine` — Chaves estrangeiras para auth.users retiradas da instalação (só para rastreio): 84 itens.

Itens de dados da v1.0.0 por categoria: interruptor 11, papel_preenchimento 1, reparo 31, seed 35, verificacao 12.

## Operações destrutivas da v1.0.0 que deixam de existir

Num esquema criado já no estado final não há nada a apagar, renomear ou relaxar. Lista completa:

- S2-01_v2_schema_part1.sql:233 — `DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles`
- S2-01_v2_schema_part1.sql:253 — `DROP POLICY IF EXISTS "Admins read all roles" ON public.user_roles`
- S2-01_v2_schema_part1.sql:273 — `DROP POLICY IF EXISTS "Admins read audit" ON public.admin_audit_logs`
- S2-01_v2_schema_part1.sql:291 — `DROP POLICY IF EXISTS "Authenticated read flags" ON public.feature_flags`
- S2-01_v2_schema_part1.sql:303 — `DROP POLICY IF EXISTS "User reads own flag membership" ON public.feature_flag_users`
- S2-01_v2_schema_part1.sql:316 — `DROP POLICY IF EXISTS "Admins read mfa flags" ON public.admin_mfa_required`
- S2-01_v2_schema_part1.sql:368 — `DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles`
- S2-01_v2_schema_part1.sql:387 — `ALTER TABLE public.assessor_messages ALTER COLUMN user_id DROP NOT NULL, ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS sen`
- S2-01_v2_schema_part1.sql:407 — `ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_whatsapp_link_status_check`
- S2-01_v2_schema_part1.sql:435 — `DROP POLICY IF EXISTS "own link codes read" ON public.whatsapp_link_codes`
- S2-01_v2_schema_part1.sql:790 — `ALTER TABLE public.properties ALTER COLUMN property_type DROP NOT NULL, ALTER COLUMN property_type DROP DEFAULT`
- S2-01_v2_schema_part1.sql:916 — `DROP POLICY IF EXISTS "own tool calls" ON public.assessor_tool_calls`
- S2-01_v2_schema_part1.sql:941 — `DROP POLICY IF EXISTS "own calendar connections" ON public.calendar_connections`
- S2-01_v2_schema_part1.sql:944 — `DROP TRIGGER IF EXISTS calendar_connections_touch ON public.calendar_connections`
- S2-01_v2_schema_part1.sql:1487 — `DROP POLICY IF EXISTS "person_phones_owner_all" ON public.person_phones`
- S2-01_v2_schema_part1.sql:1531 — `DROP TRIGGER IF EXISTS people_email_norm_trg ON public.people`
- S2-01_v2_schema_part1.sql:1801 — `ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan_tier`
- S2-01_v2_schema_part1.sql:1805 — `ALTER TABLE public.telegram_invites RENAME COLUMN plan_tier TO subscription_tier`
- S2-01_v2_schema_part1.sql:2060 — `DROP POLICY IF EXISTS "Published plans are readable by anyone" ON public.plan_configs`
- S2-01_v2_schema_part1.sql:2317 — `DROP TRIGGER IF EXISTS profiles_restrict_self_update ON public.profiles`
- S2-01_v2_schema_part1.sql:2350 — `ALTER TABLE public.admin_audit_logs ALTER COLUMN admin_user_id DROP NOT NULL`
- S2-01_v2_schema_part1.sql:2482 — `ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_deal_kind_check`
- S2-01_v2_schema_part1.sql:2990 — `DROP POLICY IF EXISTS "own messages" ON public.assessor_messages`
- S2-01_v2_schema_part1.sql:3004 — `ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_trial_status_check`
- S2-01_v2_schema_part1.sql:3067 — `DROP POLICY IF EXISTS subscription_events_admin_read ON public.subscription_events`
- S2-01_v2_schema_part1.sql:3093 — `DROP TRIGGER IF EXISTS subscription_events_validate_trg ON public.subscription_events`
- S2-01_v2_schema_part1.sql:3549 — `ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_kind_check`
- S2-01_v2_schema_part1.sql:4206 — `DROP TRIGGER IF EXISTS profiles_validate_billing ON public.profiles`
- S2-01_v2_schema_part1.sql:4242 — `ALTER TABLE public.follow_ups DROP CONSTRAINT IF EXISTS follow_ups_event_class_chk`
- S2-01_v2_schema_part1.sql:4320 — `ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_follow_up_id_fkey`
- S2-01_v2_schema_part1.sql:4348 — `DROP TRIGGER IF EXISTS reminders_sync_follow_up_id_trg ON public.reminders`
- S2-02_v2_schema_part2.sql:109 — `DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings`
- S2-02_v2_schema_part2.sql:113 — `DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings`
- S2-02_v2_schema_part2.sql:249 — `ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS email_messages_user_id_provider_message_id_key`
- S2-02_v2_schema_part2.sql:263 — `ALTER TABLE public.consultant_preferences DROP CONSTRAINT IF EXISTS consultant_preferences_active_calendar_provider_check`
- S2-02_v2_schema_part2.sql:269 — `ALTER TABLE public.consultant_preferences DROP CONSTRAINT IF EXISTS consultant_preferences_active_mail_provider_check`
- S2-02_v2_schema_part2.sql:349 — `ALTER TABLE public.mentor_decisions DROP CONSTRAINT IF EXISTS mentor_decisions_decision_check`
- S2-02_v2_schema_part2.sql:410 — `ALTER TABLE public.miscellaneous_items DROP CONSTRAINT IF EXISTS miscellaneous_items_item_class_check`
- S2-02_v2_schema_part2.sql:442 — `ALTER TABLE public.conversation_states DROP CONSTRAINT IF EXISTS conversation_states_last_read_axis_check`
- S2-02_v2_schema_part2.sql:691 — `ALTER TABLE public.consultant_preferences DROP CONSTRAINT IF EXISTS consultant_preferences_evening_review_detail_check`
- S2-02_v2_schema_part2.sql:707 — `ALTER TABLE public.routines DROP CONSTRAINT IF EXISTS routines_kind_check`
- S2-02_v2_schema_part2.sql:781 — `DROP POLICY IF EXISTS "Authenticated read flags" ON public.feature_flags`
- S2-02_v2_schema_part2.sql:783 — `DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings`
- S2-02_v2_schema_part2.sql:791 — `ALTER TABLE public.consultant_preferences DROP CONSTRAINT IF EXISTS consultant_preferences_max_unsolicited_check`
- S2-02_v2_schema_part2.sql:1022 — `DROP TRIGGER IF EXISTS consultant_preferences_track_opt_ins ON public.consultant_preferences`
- S2-02_v2_schema_part2.sql:1224 — `ALTER TABLE public.access_invites DROP CONSTRAINT access_invites_source_chk`
- S2-02_v2_schema_part2.sql:1294 — `DROP FUNCTION IF EXISTS public.issue_pilot_invite(text, uuid, text, text)`

## Chaves estrangeiras para auth.users retiradas

84 chaves (texto integral em `quarantine/QZ-05`). Fica só `profiles.profiles_id_fkey` (ON DELETE CASCADE). Por ação ao apagar a conta: SET NULL 15, CASCADE 69.

## Valores por omissão alterados no staging (divergência intencional da V1)

- `access_waitlist.notify`: true → **false** (avisar quem está na lista de espera).
- `calendar_sync_state.enabled`: true → **false** (sincronização com calendário externo).
- `consultant_preferences.morning_briefing_enabled`: true → **false** (briefing matinal enviado pelo canal).
- `consultant_preferences.evening_wrap_enabled`: true → **false** (resumo da noite enviado pelo canal).
- `consultant_preferences.evening_checkin_enabled`: true → **false** (check-in da noite enviado pelo canal).
- `whatsapp_proactive_tests.forced`: true → **false** (teste proativo forçado por WhatsApp).

## Políticas V2 alteradas

- `plan_configs` · "Published plans are readable by anyone": papéis public → authenticated.
- 104 políticas novas `staging_gate_admin_tester` (RESTRICTIVE), uma por tabela V2.
