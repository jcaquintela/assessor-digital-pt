# Executor das migrações — v1.0.2 (achado C)

## O que o SQL consegue e não consegue provar

- **P01** lê o **dono histórico** dos objetos que a migração 0000 do staging criou (`user_roles`, `staging_notes`, `app_role`, `has_role`, `has_staging_access`).
- **P02** lê, no catálogo, os privilégios **desse** papel.
- Isto diz quem criou esses objetos **no passado**. **Não prova** que a ferramenta de migrações do staging vai usar esse papel ao aplicar S4-00…S4-05, nem que não há regras da plataforma por cima. Por isso o veredito de P01/P02 é "APROVADO SÓ COMO DONO HISTÓRICO".

## Evidência independente exigida (antes de qualquer aplicação)

Uma das seguintes, registada e anexada ao pedido de autorização:

1. Declaração/registo da plataforma do AFONSO Staging que identifique o papel de base de dados usado pela ferramenta de migrações (nome do papel, se é superutilizador, se tem BYPASSRLS, se é dono do schema `public`).
2. Um ensaio autorizado com **a mesma ferramenta e o mesmo papel**, cujo resultado mostre o dono dos objetos criados (lido depois, só de leitura, com `pg_get_userbyid(relowner)`).

| Item | Estado |
|---|---|
| Papel efetivo das migrações | **PENDENTE** — sem evidência independente |
| Esse papel = dono histórico (P01)? | **DESCONHECIDO** |
| BYPASSRLS / CREATE em `public` / REFERENCES em `auth.users` desse papel | **DESCONHECIDO** (P02 só cobre o dono histórico) |

Nenhum destes estados foi preenchido por suposição. Enquanto estiverem pendentes, B2 fica aberto e a instalação não avança.

## O que a v1.0.2 precisa desse papel

| Requisito | Porquê | Leitura do dono histórico |
|---|---|---|
| CREATE em `public` | criar tipos, tabelas, funções | P02-02 |
| USAGE em `auth` + EXECUTE em `auth.uid()` | barreira e políticas | P02-03 |
| REFERENCES em `auth.users` | só `profiles_id_fkey` | P02-04 |
| dono (ou membro) de `app_role` e dono de `user_roles` | `ADD VALUE`, `ADD COLUMN created_by` | P02-05, P02-01 |
| BYPASSRLS ou superutilizador | 8 tabelas com FORCE RLS escritas por funções SECURITY DEFINER do dono | P02-06 |
| `unaccent` em `extensions`, ou CREATE em `extensions` | colunas geradas usam `extensions.unaccent` | P02-07 |
| poder revogar privilégios a `service_role` nos objetos que cria | normalização do achado D | (é dono: sempre pode) |
