# Colisões com o AFONSO Staging atual — v1.0.1

Estado de partida esperado (confirmado pelo P00 e pelo P03; se não coincidir, **PARAR**): só a migração `0000_staging_access_control.sql` do staging — tipo `app_role (admin, tester)`, tabela `user_roles`, funções `has_role` e `has_staging_access`, tabela `staging_notes` com 3 notas, uma conta (proprietário, `admin`).

| Objeto do staging | O que a v1.0.1 faz | Efeito | Verificação |
|---|---|---|---|
| tipo `app_role` | S3-00: `ADD VALUE IF NOT EXISTS` consultant, support_admin, super_admin | Valores do staging ficam primeiro e intactos | P03-06, Q04-09 |
| tabela `user_roles` | S3-00: `ADD COLUMN IF NOT EXISTS created_by uuid` (nula, sem valor por omissão, **sem** chave) | Nenhuma linha, política, permissão ou restrição alterada. **Não** recebe barreira nem as 4 políticas de admin V2 | P03-07/08, Q04-03/05/06/07/08, Q03-06/07 |
| função `has_role` | Nada (a v1.0.0 substituía-a) | Inalterada | P03-02, Q04-02 |
| função `has_staging_access` | Nada; é usada pela barreira | Inalterada | P03-03, Q04-01, Q05-06 |
| tabela `staging_notes` | Nada | Inalterada | P03-13, Q04-04/05 |
| `auth.users` | Nada: 0 escritas, **0 gatilhos** | Identidade intacta | P04 = Q03 |
| `public.profiles` | Criada vazia, com `profiles_id_fkey → auth.users ON DELETE CASCADE`. Nenhum perfil criado | Proprietário continua sem perfil | P04-08, Q03-09 |
| `storage.objects` / bucket | Nada (quarentena QZ-04) | Sem ficheiros V2 | Q02-14 |
| publicação `supabase_realtime` | Nada (quarentena QZ-03) | Sem tempo real V2 | Q02-15 |
| extensão `unaccent` | `CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions` | Se já estiver noutro schema, P02-08 falha antes | P02-08, Q02-22 |
| Nomes V2 | `CREATE` sem `IF NOT EXISTS` nem `OR REPLACE`: se algum nome já existir, a migração falha sem estragar nada | Falha fechada | P00-03/04/05 |
