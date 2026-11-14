# Mapa de colisões com o AFONSO Staging atual

**Estado de partida.** O staging tem só a sua migração `0000_staging_access_control.sql` (commit 608dad98, sha256 começa por `a87578e5`):
- o tipo `app_role` com os valores (admin, tester);
- a tabela `user_roles`;
- as funções `has_role` e `has_staging_access`;
- a tabela `staging_notes` com 3 notas;
- uma conta, a do proprietário, com o papel `admin`.

O P00 e o P03 confirmam este estado. **Se não coincidir, PARAR.** Isto vale em especial se existir `public.profiles` ou um gatilho em `auth.users` criado fora das migrações.

As linhas abaixo são de `sql/`, com os números de linha de cada ficheiro.

| Objeto | No staging hoje | O que os 4 SQL fazem | Efeito | Requisito | Verificação |
|---|---|---|---|---|---|
| tipo `public.app_role` | `admin, tester` | S2-00:23-25 acrescenta `consultant`, `support_admin`, `super_admin` (`IF NOT EXISTS`). S2-01:214 tenta `CREATE TYPE` dentro de um bloco que ignora `duplicate_object`, por isso não faz nada | Os valores do staging ficam primeiro e intactos | Executor dono do tipo | P02, P03, Q02 |
| tabela `public.user_roles` | id, user_id, role, created_at; 1 política | S2-00:27 acrescenta `created_by` (opcional, FK `auth.users` com SET NULL). S2-01:220 `CREATE TABLE IF NOT EXISTS` é saltado. S2-01:229-231 repete os GRANT e o RLS, sem efeito novo. S2-01:233-234 recria "Users read own roles" com regra equivalente. S2-01:254 e 369-373 acrescentam 4 políticas só para `super_admin`/`support_admin` | Nenhuma linha alterada. O `admin` do staging **não** ganha poderes V2 | Executor dono da tabela | Q03, Q04 |
| preenchimento de papéis (S2-01:350) | — | Dá `consultant` a contas **sem nenhum papel** | A conta do proprietário já tem `admin`, por isso não é tocada. Seria afetada qualquer conta sem papel | P04 "contas sem papel" = 0 | P04, Q03 |
| função `public.has_role(uuid, app_role)` | SQL, responde sobre qualquer utilizador | Substituída 3 vezes (S2-01:236, S2-02:46), sempre com a mesma assinatura e nomes de parâmetros. A versão final responde `false` quando um utilizador com sessão pergunta por outro. Execução: anon sem, authenticated e service_role com | O staging não chama `has_role` no código nem nas políticas: só usa `has_staging_access` | Executor dono da função | P03 (corpo `6b9bca1c…`), Q02 (corpo `f12f7a59…`) |
| função `public.has_staging_access(uuid)` | admin ou tester | **Não referida** nos 4 SQL | Inalterada | — | P03 e Q04 (corpo `4376edee…`) |
| tabela `public.staging_notes` | 3 notas, 1 política | **Não referida** | Inalterada | — | P03 e Q04 (`9839c856…`) |
| `auth.users`, linhas existentes | 1 conta | **Nenhum** INSERT, UPDATE ou DELETE | Identidade intacta | — | P04 = Q03 (impressões digitais) |
| `auth.users`, gatilhos | nenhum esperado | S2-01:40 `CREATE TRIGGER on_auth_user_created AFTER INSERT` → `handle_new_user`, sem `IF NOT EXISTS`: falha se já existir um com o mesmo nome. S2-01:339 só o cria se faltar | Só dispara em contas **novas**, criando perfil, papel `consultant` e 6 categorias de imóveis. Não há gatilhos de UPDATE nem de DELETE | `TRIGGER` e `REFERENCES` em `auth.users` | P02, P03, Q02 |
| tabela `public.profiles` | não existe | S2-01:11 `CREATE TABLE`, sem `IF NOT EXISTS`: falha se existir. **Sem preenchimento para contas existentes**. S2-01:377 aplica `FORCE ROW LEVEL SECURITY` | O proprietário fica sem perfil V2 (opção A, ver OWNER-ACCOUNT.md) | Executor com `BYPASSRLS`, porque `handle_new_user` escreve em `profiles` com FORCE RLS | P00, P02, Q03 |
| `profiles` → `account_access` | — | O gatilho S2-02:1123 só cria acesso se `access.early_access_gate.v1` estiver ligado | Com tudo desligado (S2-99), não cria nada | — | Q02, Q03 |
| 8 tabelas com FORCE RLS | — | S2-01:377-384 | As funções SECURITY DEFINER do dono precisam de `BYPASSRLS` | `BYPASSRLS` | P02, Q01 |
| `storage.objects` | políticas da plataforma | 4 políticas novas para o bucket `assessor-files` | O bucket **não** é criado pelo SQL | Executor dono (ou membro do dono) de `storage.objects` | P02, Q01, Q02 |
| publicação `supabase_realtime` | sem tabelas esperadas | `ALTER PUBLICATION … ADD TABLE public.assessor_messages` | Só essa tabela | Executor dono da publicação | P02, P03, Q02 |
| extensão `unaccent` | provavelmente ausente | `CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions` | Se já estiver noutro schema, `extensions.unaccent()` falha mais tarde | `CREATE` em `extensions` | P03, Q02 |

**Não presumido:**
- Que o staging real não tenha objetos criados fora das migrações. O P03 lista funções, tipos, políticas e gatilhos em `auth.users`; qualquer diferença obriga a parar.
- Que os privilégios do executor sejam os de produção (ver EXECUTOR-PRIVILEGES.md).
