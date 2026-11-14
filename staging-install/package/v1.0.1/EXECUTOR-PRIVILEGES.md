# Privilégios do papel REAL que aplica as migrações — v1.0.1

O papel das consultas de leitura não é o das migrações. Por isso: **P01** identifica o executor pelo dono dos objetos que a migração 0000 do staging criou; **P02** avalia os privilégios **desse** papel no catálogo (`has_*_privilege`, `pg_has_role`, `pg_roles`), sem escrever.

## O que a v1.0.1 precisa (P02)

| Requisito | Porquê | Verificação |
|---|---|---|
| CREATE em `public` | criar tipos, tabelas, funções | P02-02 |
| USAGE em `auth` + EXECUTE em `auth.uid()` | barreira e políticas | P02-03 |
| REFERENCES em `auth.users` | só `profiles_id_fkey` | P02-04 |
| dono (ou membro) de `app_role` | `ALTER TYPE … ADD VALUE` | P02-05 |
| dono de `user_roles` | `ADD COLUMN created_by` | P02-06 |
| BYPASSRLS ou superutilizador | 8 tabelas com FORCE RLS escritas por funções SECURITY DEFINER do dono | P02-07 |
| `unaccent` em `extensions`, ou CREATE em `extensions` | colunas geradas usam `extensions.unaccent` | P02-08 |
| `service_role` com USAGE em `extensions` | o servidor escreve nas colunas geradas | P02-09 |

**Deixaram de ser precisos** (em relação à v1.0.0): TRIGGER em `auth.users`, dono de `storage.objects`, dono da publicação Realtime, dono de `has_role`.

## Limite desta prova (bloqueio B2)

O resultado de P01/P02 é **inferido** do catálogo. Não prova que a ferramenta de migrações do staging usa exatamente esse papel no momento da aplicação, nem que não há regras da plataforma por cima. A prova definitiva só existe ao aplicar (ou num ensaio com o mesmo papel), o que exige autorização separada. Se P01 der vários donos ou nenhum: **BLOQUEIO**, não instalar.
