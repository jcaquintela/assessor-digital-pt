# Diferenças v1.0.1 → v1.0.2 (gerado)

Mesmas fontes presas por sha256 (estado final `staging-install/rehearsal/results/schema_public.sql`, sha256 `e047c2e1fe0effb55a1208970befbb3d15a1e283baaaefc61793f9e1dc9e278c`) e mesmo montador; a v1.0.2 muda só o que o perfil declara. Números medidos sobre as duas montagens, nada executado.

| Medida | v1.0.1 | v1.0.2 |
|---|---|---|
| Ficheiros de migração | S3-00, S3-01, S3-02, S3-03, S3-04, S3-05 | S4-00, S4-01, S4-02, S4-03, S4-04, S4-05 |
| Instruções no topo | 1241 | 1232 |
| Funções V2 instaladas | 41 | 38 |
| Funções em quarentena | 0 | 3 |
| Funções instaladas que escrevem em user_roles/staging_notes | 1 | 0 |
| Funções instaladas com SQL dinâmico sobre tabelas descobertas | 2 | 0 |
| REVOKE que incluem service_role | 0 | 142 |
| Tabelas V2 com service_role exatamente DELETE/INSERT/SELECT/UPDATE (pior caso) | 0 | 104 |
| Ficheiros de verificação (preflight + posflight) | 11 | 11 |
| Ficheiros de registo de base (não verificação) | 0 | 1 |
| Verificações substantivas | 112 | 118 |
| Linhas 'é um hash, logo passa' (tautologias) | 4 (P03-15, P04-09, P04-10, P04-11) | 0 |
| Exigência de exatamente 1 conta no staging | não (>= 1) | sim (P04-01, P05-B01, Q03-01) |
| auth.identities comparado | não | sim (P04-10, P05-B02, Q03-05) |
| Políticas do staging: USING/WITH CHECK/papéis comparados | só nomes | sim (P05-B04, Q04-03) |
| Funções do staging: atributos comparados | só md5 do corpo | sim (P05-B05, Q04-04) |
| Impressões de base | md5 | sha256 com cobertura exigida |

## Verificações por ficheiro

| Ficheiro | v1.0.1 | v1.0.2 |
|---|---|---|
| preflight/P00_alvo.sql | 6 | 7 |
| preflight/P01_dono_historico.sql | 3 | 3 |
| preflight/P02_privilegios_dono_historico.sql | 10 | 9 |
| preflight/P03_colisoes.sql | 15 | 16 |
| preflight/P04_conta_proprietario.sql | 13 | 11 |
| preflight/P05_registo_base.sql | — | 7 registos (não verificações) |
| posflight/Q00_alvo.sql | 3 | 3 |
| posflight/Q01_estrutura.sql | 8 | 8 |
| posflight/Q02_seguranca.sql | 23 | 27 |
| posflight/Q03_conta_proprietario.sql | 11 | 11 |
| posflight/Q04_acesso_staging.sql | 10 | 13 |
| posflight/Q05_matriz_acesso.sql | 10 | 10 |

## Funções retiradas da instalação (quarentena QZ-06)

- `handle_new_user()` — escreve em user_roles (papel consultant) e cria perfil/categorias; só servia ao gatilho em auth.users, que já está em quarentena (QZ-02).
- `merge_accounts_apply(uuid, uuid)` — descobre TODAS as tabelas de public com user_id (incluindo user_roles e qualquer tabela futura) e move/APAGA linhas — podia transferir ou apagar o papel admin do staging.
- `merge_accounts_preview(uuid)` — par de leitura de merge_accounts_apply; também descobre tabelas no catálogo (incluindo user_roles); sem a fusão não tem uso.

## Marcadores do Q03/Q04 (substituídos pelo operador com o resultado do P05)

- `__EMAIL_AUTORIZADO__`
- `__P05_B01_CONTA__`
- `__P05_B02_IDENTIDADES__`
- `__P05_B03_PAPEIS__`
- `__P05_B04_POLITICAS__`
- `__P05_B05_FUNCOES__`
- `__P05_B06_TABELAS__`
- `__P05_B07_TIPO__`

Tipos de instrução por ficheiro (v1.0.2): S4-00 {"alter_type_add_value":3,"create_extension":1,"alter_table_add_column":1}; S4-01 {"create_type":7,"create_function":1,"revoke":53,"grant":53,"create_table":52,"alter_table_enable_rls":52,"create_policy":52,"comment":8,"alter_table_force_rls":1}; S4-02 {"create_table":52,"alter_table_enable_rls":52,"create_policy":52,"revoke":52,"grant":52,"alter_table_force_rls":7,"comment":8,"alter_table_add_constraint":131}; S4-03 {"create_function":37,"revoke":37,"grant":37}; S4-04 {"create_index":163,"alter_table_add_constraint":76,"create_trigger":72}; S4-05 {"create_policy":120}.
