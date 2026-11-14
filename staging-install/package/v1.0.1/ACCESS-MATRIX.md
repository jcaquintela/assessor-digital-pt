# Matriz de acesso — v1.0.1 (gerada por análise estática; nada executado)

Modelo: parte do **pior caso** — PUBLIC, anon e authenticated com todas as permissões em cada objeto novo (como se o staging tivesse privilégios por omissão abertos) — e aplica, pela ordem dos ficheiros, os GRANT/REVOKE, o RLS, a barreira RESTRICTIVE e as políticas V2.

- `sem papel`, `tester` e `admin` são o mesmo papel de base de dados (`authenticated`). Só `has_staging_access(auth.uid())` os distingue, e só atua através da barreira.
- `service_role` ignora RLS (BYPASSRLS) e é o único com permissões diretas.

| Quem | Tabelas V2 com acesso direto | Funções V2 executáveis | Tabelas V2 sob a barreira | Tabelas V2 em que passaria SE a tabela fosse aberta ao cliente |
|---|---|---|---|---|
| anon | 0 | 0 | 104 | 0 |
| authenticated_sem_papel | 0 | 0 | 104 | 0 |
| tester | 0 | 0 | 104 | 96 |
| admin | 0 | 0 | 104 | 96 |
| service_role | 104 | 41 | 0 | 104 |

Total: 104 tabelas V2, 41 funções V2.

**Leitura:** ninguém do lado do cliente chega a uma tabela ou função V2. Se um dia uma tabela for aberta a `authenticated` (decisão do proprietário, nova versão), a barreira continua a negar anónimos e contas sem papel; tester e admin ficam sujeitos às políticas V2 de cada tabela (linhas próprias; poderes de admin V2 exigem `super_admin`, que ninguém tem).

## Comparação com a v1.0.0 (leitura aproximada do SQL antigo, mesmo pior caso)

| Quem | Tabelas V2 com acesso direto | Funções V2 executáveis | Tabelas sob barreira | Se aberta ao cliente |
|---|---|---|---|---|
| anon | 1 | 14 | 0 | 1 |
| authenticated_sem_papel | 97 | 17 | 0 | 97 |
| tester | 97 | 17 | 0 | 97 |
| admin | 97 | 17 | 0 | 97 |
| service_role | 105 | 41 | 0 | 105 |

Na base, estes números confirmam-se só de leitura com `posflight/Q05_matriz_acesso.sql` e `posflight/Q02_seguranca.sql`. O teste comportamental (`tests-db/T01`) está preparado e bloqueado.
