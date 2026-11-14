# Matriz de acesso — v1.0.2 (gerada por análise estática; nada executado)

Modelo: parte do **pior caso** — PUBLIC, anon, authenticated **e service_role** com todas as permissões em cada objeto novo (como se o staging tivesse privilégios por omissão abertos, incluindo TRUNCATE/REFERENCES/TRIGGER) — e aplica, pela ordem dos ficheiros, os GRANT/REVOKE, o RLS, a barreira RESTRICTIVE e as políticas V2.

- `sem papel`, `tester` e `admin` são o mesmo papel de base de dados (`authenticated`). Só `has_staging_access(auth.uid())` os distingue, e só atua através da barreira.
- `service_role` ignora RLS (BYPASSRLS) e é o único com permissões diretas.

| Quem | Tabelas V2 com acesso direto | Funções V2 executáveis | Tabelas V2 sob a barreira | Tabelas V2 em que passaria SE a tabela fosse aberta ao cliente |
|---|---|---|---|---|
| anon | 0 | 0 | 104 | 0 |
| authenticated_sem_papel | 0 | 0 | 104 | 0 |
| tester | 0 | 0 | 104 | 96 |
| admin | 0 | 0 | 104 | 96 |
| service_role | 104 | 38 | 0 | 104 |

Total: 104 tabelas V2, 38 funções V2 instaladas (3 em quarentena: `handle_new_user`, `merge_accounts_apply`, `merge_accounts_preview`).

## Privilégios finais de service_role (achado D)

| | v1.0.1 | v1.0.2 |
|---|---|---|
| Tabelas V2 com exatamente DELETE/INSERT/SELECT/UPDATE | 0 | 104 |
| Tabelas V2 que mantinham ALL (TRUNCATE, REFERENCES, TRIGGER incluídos) no pior caso | 104 | 0 |
| Funções V2 sem EXECUTE para service_role | 0 | 0 |

Cada tabela: `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` e depois `GRANT DELETE, INSERT, SELECT, UPDATE … TO service_role`. Cada função: o mesmo REVOKE e depois `GRANT EXECUTE`. Na base, a ACL final confere-se entrada a entrada com `posflight/Q02` (Q02-07, Q02-08, Q02-09, Q02-16) e `Q05-08`. Tipos enum mantêm o USAGE por omissão do PostgreSQL (não dá acesso a dados).

## O que esta matriz NÃO prova (achado B)

- Prova **privilégios da base**, não segurança funcional da aplicação.
- O acesso V2 é "só pelo servidor": os REVOKE a clientes mantêm-se e **nenhum acesso de cliente foi aberto**.
- As **APIs de servidor** que verificariam a sessão do utilizador **e** `has_staging_access` antes de usar `service_role` **ainda não existem**. Como `service_role` ignora a barreira, sem essas APIs não há afirmação de segurança funcional (BLOCKERS B3).

Na base, estes números confirmam-se só de leitura com `posflight/Q02_seguranca.sql` e `posflight/Q05_matriz_acesso.sql`. O teste comportamental (`tests-db/T01`) está preparado e bloqueado.
