# Área de Administração — “Assessor do Consultor”

Objetivo: adicionar um backoffice `/admin` separado da app do consultor, com papéis, RLS estrita, auditoria imutável e feature flags. Nenhum admin vê dados privados do consultor por defeito.

## 1. Base de dados (uma migração)

Novos objetos:

- Enum `public.app_role`: `consultant`, `support_admin`, `super_admin`.
- Tabela `public.user_roles` (`id`, `user_id`, `role`, `created_at`, `created_by`, UNIQUE(`user_id`,`role`)).
  - RLS: utilizador lê apenas as suas próprias funções; **nenhuma** policy de INSERT/UPDATE/DELETE para `authenticated` (só service_role via server functions).
- Função `public.has_role(_user_id uuid, _role app_role)` SECURITY DEFINER (padrão do projeto).
- Função `public.is_admin(_user_id uuid)` → `has_role(super_admin) OR has_role(support_admin)`.
- Tabela `public.admin_audit_logs` (`id`, `admin_user_id`, `action`, `target_user_id`, `resource_type`, `resource_id`, `reason`, `metadata jsonb`, `created_at`).
  - RLS: SELECT permitido a admins; nenhum INSERT/UPDATE/DELETE do lado do cliente (append-only via service_role). Sem trigger de update.
- Tabela `public.feature_flags` (`key`, `description`, `enabled_globally`, `enabled_plans text[]`, `rollout_percentage`, `updated_at`, `updated_by`).
  - RLS: SELECT a `authenticated`; escrita só via service_role.
- Tabela `public.feature_flag_users` (`flag_key`, `user_id`) para overrides por utilizador.
- Tabela `public.admin_mfa_required` (`user_id`, `required_at`) — placeholder para futura obrigatoriedade de MFA (mostrada na UI, não bloqueante nesta fase).
- Trigger em `auth.users` já existente cria profile; adicionar seed automático da role `consultant` em `user_roles` via extensão do `handle_new_user` (função re-declarada).
- GRANTs conforme regras do projeto (`authenticated` SELECT onde aplicável, `service_role` ALL).

## 2. Server functions (backend privilegiado)

Todas em `src/lib/admin.functions.ts`, com `.middleware([requireSupabaseAuth])`. Cada handler:
1. Verifica role do chamador via `context.supabase` (RLS como user).
2. Se necessário `super_admin`, valida antes de importar `supabaseAdmin`.
3. Executa a ação com `supabaseAdmin` (import dinâmico dentro do handler).
4. Escreve linha em `admin_audit_logs`.
5. **Bloqueia** qualquer alteração onde `target_user_id === context.userId` (impede auto-promoção/auto-alteração).

Funções:
- `getAdminOverview` — agregados (contagens de users, seguimentos, movimentos, mensagens, erros).
- `listAdminUsers` — junta `auth.users` (via admin API) + `profiles` + `user_roles` + métricas de uso. Sem dados privados.
- `inviteUser`, `suspendUser`, `reactivateUser`, `sendPasswordReset`, `startUserDeletion`, `extendTrial`, `changePlan` — `super_admin` para suspender/eliminar/alterar plano; `support_admin` para reset/convite.
- `grantRole` / `revokeRole` — só `super_admin`, nunca sobre si próprio.
- `listAuditLogs` — admins.
- `listFeatureFlags`, `upsertFeatureFlag`, `setFlagUsers` — `super_admin`.
- `getIntegrationsStatus` — placeholders.

## 3. Rotas e UI

Novo layout dedicado `src/routes/_admin/route.tsx` (`ssr: false`):
- `beforeLoad` chama server fn `requireAdmin` que devolve role; se não for admin, `redirect('/')`.
- Layout próprio (sidebar/topo distintos da app consultor, tema neutro).

Páginas (`src/routes/_admin/…`):
- `index.tsx` — Visão geral (cards de métricas + estado integrações + erros recentes).
- `utilizadores.tsx` — tabela com filtros e ações (menu por linha). Ações críticas exigem `super_admin` (botões desativados p/ support).
- `subscricoes.tsx`, `utilizacao.tsx`, `suporte.tsx`, `integracoes.tsx` — vistas de leitura + placeholders.
- `funcionalidades.tsx` — CRUD de feature flags com toggle global, planos, % rollout, lista de utilizadores.
- `auditoria.tsx` — tabela paginada, apenas leitura, filtro por admin/ação/data.
- `seguranca.tsx` — estado de MFA por admin, botão “Marcar MFA obrigatório” (grava em `admin_mfa_required`), aviso do desenho de “acesso de suporte temporário” (mostrado como roadmap, sem permitir aceder a dados privados).
- `definicoes.tsx` — preferências do backoffice.

Sem overlap com `/`: os utilizadores consultores continuam a ver `/hoje`, `/assessor`, etc. Route `/admin` fica fora de `_authenticated/` para ter o próprio guard e layout, mas usa o mesmo Supabase auth.

## 4. Privacidade

- `listAdminUsers` e restantes fetchers **nunca** selecionam colunas de `people`, `opportunities`, `interactions`, `assessor_messages`, `financial_movements`, `follow_ups`, `properties`, `documents`.
- Métricas usam `count(*)` agregados via `supabaseAdmin`.
- Secção “Acesso de suporte temporário” apresentada como *coming soon* com o fluxo desenhado (autorização, motivo, duração, revogação, auditoria) — nenhum endpoint de leitura de dados privados é criado.

## 5. Documentação

Novo `docs/admin-bootstrap.md` a explicar (passos manuais, sem credenciais no código):
1. Criar/entrar como utilizador normal na app.
2. No SQL editor do backend (Lovable Cloud → Backend), executar:
   ```sql
   INSERT INTO public.user_roles (user_id, role, created_by)
   VALUES ('<uuid do utilizador>', 'super_admin', '<uuid do utilizador>')
   ON CONFLICT DO NOTHING;
   ```
3. Confirmar em `/admin`.
4. Promoções seguintes fazem-se pela UI (só `super_admin`).
5. Recomendação: ativar MFA na conta antes de promover.

## 6. Critérios de aceitação (verificação)

- Consultor autenticado que abre `/admin` é redirecionado para `/`.
- `support_admin` vê overview/users/auditoria/suporte mas botões de suspender/eliminar/alterar plano/gerir flags estão desativados.
- `super_admin` acede a tudo.
- Nenhuma página admin lê tabelas de dados privados do consultor.
- `grantRole`/`revokeRole` rejeitam `target_user_id === caller`.
- Todas as mutações admin escrevem em `admin_audit_logs`.
- Um segundo utilizador não consegue promover-se (só `super_admin` chama `grantRole`, e a self-check bloqueia mesmo assim).

## Ordem de execução

1. Migração SQL (aprovação do utilizador).
2. `src/lib/admin.functions.ts` + helpers.
3. Layout `_admin` + páginas.
4. `docs/admin-bootstrap.md`.
5. Verificação (typecheck + smoke navegação).

## Fora de âmbito nesta iteração

- Implementação real do fluxo “acesso de suporte temporário” (apenas UI/estado).
- Enforcement de MFA (apenas registo de exigência).
- Integrações reais (WhatsApp/Google/Microsoft/Stripe): só estado mostrado.
