
# MVP funcional e persistente — Plano

Objetivo: substituir o store em memória e os dados demo por Supabase (Lovable Cloud) com autenticação real, RLS por `user_id`, formulários funcionais e histórico de chat persistente. Sem alterar o design atual.

## 1. Backend (Lovable Cloud)

Ativar Lovable Cloud e criar uma migração única com as 8 tabelas pedidas: `profiles`, `people`, `opportunities`, `properties`, `follow_ups`, `interactions`, `financial_movements`, `assessor_messages`.

Para cada tabela:
- `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`, `created_at`, `updated_at` com trigger de `updated_at`.
- Enums Postgres para: `relationship_type`, `opportunity_type`, `opportunity_status`, `probability`, `property_type`, `property_status`, `follow_up_type` (task/event), `follow_up_status`, `priority`, `interaction_source_channel`, `movement_type` (expense/commission/invoice/receipt), `movement_status`, `assessor_role` (user/assistant).
- GRANTs a `authenticated` e `service_role` (nunca `anon`). RLS ON com policies `auth.uid() = user_id` para SELECT/INSERT/UPDATE/DELETE.
- Trigger `on_auth_user_created` cria linha em `profiles`.

## 2. Autenticação

- Rota pública `/auth` com sign-up, sign-in, reset (redirect `/reset-password`) e `/reset-password`.
- Layout `_authenticated` (managed) protege todas as rotas de app; mover `hoje`, `assessor`, `pessoas`, `oportunidades`, `imoveis`, `seguimentos`, `calendario`, `documentos`, `negocio`, `definicoes`, `mais` para `_authenticated/`.
- `/` continua com o redirect mobile/desktop, mas para utilizadores não autenticados envia para `/auth`.
- Header/nav com sign-out; listener `onAuthStateChange` no `__root`.

## 3. Camada de dados

Substituir `AppStoreProvider` por hooks de TanStack Query por entidade (`usePeople`, `useOpportunities`, `useProperties`, `useFollowUps`, `useFinancialMovements`, `useInteractions`, `useAssessorMessages`) usando o cliente browser Supabase com RLS. Mutations com invalidateQueries e optimistic updates onde seguro (concluir seguimento, alterar estado).

## 4. Dados iniciais

Após primeiro login, se `people` está vazio mostrar modal "Começar vazio" ou "Carregar demo". "Carregar demo" chama server function que insere para `user_id` os registos equivalentes ao seed atual. Em Definições: "Apagar dados demo" e "Repor conta" (apaga tudo do user exceto profile).

## 5. Módulos funcionais

- **Pessoas**: criar/editar (Sheet com form + zod), eliminar com AlertDialog, pesquisa server-side, ficha com tabs (Oportunidades, Seguimentos, Interações, Documentos).
- **Oportunidades**: CRUD, quick-actions para estado/probabilidade, associar pessoa/imóvel via Combobox.
- **Imóveis**: CRUD, associar proprietário.
- **Seguimentos**: CRUD task/event, concluir, reagendar (date picker), prioridade. Vistas filtradas em Europe/Lisbon usando `date-fns-tz`.
- **O Meu Negócio**: CRUD `financial_movements`, agregados calculados client-side por queries.

## 6. Chat do Assessor (interpretação heurística funcional)

Manter UI. Substituir handler por parser determinístico (regex + tokens PT) que:
- extrai valores €, datas relativas ("amanhã às 10h"), nomes de pessoa (fuzzy match contra `people`).
- gera cartão estruturado com payload; ao Confirmar, executa a mutation real e regista `interactions` + `assessor_messages` com `structured_payload`.
- fluxos: Criar seguimento, Registar despesa, Registar comissão, Registar conversa, "O que tenho hoje?" (agrega dados reais).
- ambiguidade → pergunta de follow-up em vez de inventar (ex.: várias "Ana" → cartão de escolha).

Mensagens persistidas em `assessor_messages`; ao abrir /assessor carrega histórico recente. Botões "Limpar conversa" e "Nova conversa".

## 7. Estados e formulários

Loading skeletons, empty states, toasts de sucesso/erro reais. Remover "em breve" exceto em: WhatsApp, Google Calendar, Outlook, Stripe, OpenAI, upload avançado de documentos.

## 8. Segurança

RLS em todas as tabelas. Nenhuma service-role no cliente. Só chave publishable no browser. Validação zod client + constraints DB.

## Detalhes técnicos

- Stack: TanStack Start + Supabase browser client via `@/integrations/supabase/client`. Reads/writes user-scoped fazem-se direto do browser sob RLS — sem server functions nesta fase, exceto seed demo e reset conta (que usam `requireSupabaseAuth` + `supabaseAdmin` só onde estritamente necessário; caso contrário direto).
- Timezone: helper `src/lib/tz.ts` para Europe/Lisbon (usar `date-fns-tz`).
- MCP tools atuais lêem do store em memória — atualizar para query direta ao Supabase com service role (mantendo endpoint público) OU marcar como demo. Proponho: MCP passa a exigir `user_id` como parâmetro e usa service role internamente; documentar que continua público (fora do critério de aceitação desta fase).

## Escopo

Implemento tudo acima numa única iteração longa. Não incluído (conforme pedido): WhatsApp, Google/Outlook, Stripe, OpenAI real, upload de ficheiros, faturação certificada.

Confirmas para avançar?
