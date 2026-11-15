# Colisões com o AFONSO Staging atual — v1.0.2

Estado de partida esperado (P00, P03, P04; se não coincidir, **PARAR**): só a migração `0000_staging_access_control.sql` do staging — tipo `app_role (admin, tester)`, tabela `user_roles` (RLS ligado), funções `has_role(uuid, app_role)` e `has_staging_access(uuid)`, tabela `staging_notes` (RLS ligado) com 3 notas, **exatamente uma conta** (proprietário, `admin`).

| Objeto do staging | O que a v1.0.2 faz | Verificação antes | Verificação depois |
|---|---|---|---|
| tipo `app_role` | S4-00: `ADD VALUE IF NOT EXISTS` consultant, support_admin, super_admin | P03-06/07, P05-B07 | Q04-06 (dono/permissões = B07), Q04-12 (valores) |
| tabela `user_roles` | S4-00: `ADD COLUMN IF NOT EXISTS created_by uuid` (nula, sem omissão, sem chave). Nenhuma função instalada escreve nela (A) | P03-08/09/10/11, P04-07/08, P05-B03/B04/B06 | Q03-07/08, Q04-03/05/08/09/10/11, Q02-13/20 |
| função `has_role` | Nada | P03-02/04/05, P05-B05 | Q04-02/04 |
| função `has_staging_access` | Nada; usada pela barreira | P03-03/04/05, P05-B05 | Q04-01/04, Q05-06 |
| tabela `staging_notes` | Nada; nenhuma função instalada escreve nela | P03-10/11/15, P05-B04/B06 | Q04-03/05/07/08, Q02-13/20 |
| `auth.users` / `auth.identities` | Nada: 0 escritas, 0 gatilhos | P03-12, P04, P05-B01/B02 | Q03-01…05, Q02-20 |
| `public.profiles` | Criada vazia, com `profiles_id_fkey → auth.users ON DELETE CASCADE` | P04-09 | Q03-09 |
| `storage.objects` / bucket, Realtime | Nada (QZ-03, QZ-04) | — | Q02-18/19 |
| extensão `unaccent` | `CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions` | P02-07 | Q02-26 |
| Nomes V2 (incluindo os de quarentena) | `CREATE` sem `IF NOT EXISTS` nem `OR REPLACE` | P00-03/04/05 | Q02-12 |
