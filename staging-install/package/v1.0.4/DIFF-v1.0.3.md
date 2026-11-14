# Diferenças v1.0.3 → v1.0.4 (gerado; nada executado)

Comparação ficheiro a ficheiro com o `SHA256SUMS` da v1.0.3 (commit `fd4fdaca`). MANIFEST, SHA256SUMS e os ficheiros DIFF ficam de fora.

- **Migrações S4-00…S4-05: 6/6 idênticas byte a byte** (com os REVOKE e o acesso só pelo servidor).
- Idênticos: 27 · alterados: 22 · novos: 9 · retirados: 2.
- F1 (`pg_get_userbyid(oid)`): válido; **não alterado** (P01, P05 e Q02 iguais à v1.0.3).

| Ficheiro | Estado | sha256 v1.0.3 (16) | sha256 v1.0.4 (16) |
|---|---|---|---|
| ACCESS-MATRIX.md | idêntico | 7181fa2caded1846 | 7181fa2caded1846 |
| BLOCKERS.md | ALTERADO | aea6f6bcd928ef23 | be22ea2a1bca1dc8 |
| BOOTSTRAP-SINTETICO.md | ALTERADO | 7630e8ee9bbcfd7c | 553d13d9dc2716b3 |
| COLLISIONS.md | idêntico | 4874a3fb6ee9a5b2 | 4874a3fb6ee9a5b2 |
| EXECUTOR-PRIVILEGES.md | ALTERADO | 894c457bebc5b47c | b0dd8ee82f0ebd38 |
| FINDINGS-RESOLUTION.md | ALTERADO | 68ce28c1b6ef78ce | 5a0363316eefd163 |
| OWNER-ACCOUNT.md | idêntico | ccecb316555e682a | ccecb316555e682a |
| README.md | ALTERADO | 0a65e6cbeeef1d97 | 1ad87a62ba97fef0 |
| REHEARSAL-PLAN.md | ALTERADO | 24b544223c18469d | e7fda83cab61b047 |
| REHEARSAL-TARGET.md | ALTERADO | 8ce8fba5c18be32a | bd7148b8ecaa3680 |
| TEST-CRITERIA.md | ALTERADO | 801d8d4aa926ffc5 | 49de0e1c92326ea3 |
| ensaio/B00_papeis_e_base.bloqueado.sql | ALTERADO | 467589ccc5efa4a3 | c200892c26f6c0d6 |
| ensaio/B01_plataforma_sintetica.bloqueado.sql | ALTERADO | ac7f2d57307e7651 | f2d5565a5f066bb8 |
| ensaio/B01b_unaccent_instalada.bloqueado.sql | ALTERADO | ed89bfc952a8e87e | f0be1e2cc36b39b5 |
| ensaio/B02_papel_admin_sintetico.bloqueado.sql | ALTERADO | a1d285ccc9d5c670 | 4b793a30fdaff2e1 |
| ensaio/R30_sessao_alvo.sql | ALTERADO | 189db43b044477df | 14224f2ff798f131 |
| ensaio/R31_sessao_passo.sql | NOVO | — | 4e4a6222437a812e |
| ensaio/R32_instancia_super.sql | NOVO | — | 2babc1d7f9fdf5ce |
| ensaio/R40_ligacao.psql | RETIRADO | 587640447a91618b | — |
| ensaio/R40_sessao.psql | NOVO | — | 9fed4d048e1db21a |
| entradas/0000/ESPERADO | NOVO | — | a311f84ecca01d2e |
| entradas/0000/README.md | NOVO | — | 83d64dc2fd2eaf45 |
| evidence/parse-check.txt | ALTERADO | 65e7e2e9b6fc094a | 56d47aeffde118bc |
| evidence/shell-check.txt | NOVO | — | 197607eacb39c0df |
| operador/E-EVIDENCIA.modelo | NOVO | — | 37d43a97f25d8d0b |
| posflight/Q00_alvo.sql | idêntico | 194005d58f83da71 | 194005d58f83da71 |
| posflight/Q01_estrutura.sql | idêntico | e70797606a43ab11 | e70797606a43ab11 |
| posflight/Q02_seguranca.sql | idêntico | 09d1bc27a1f4ffb8 | 09d1bc27a1f4ffb8 |
| posflight/Q03_conta_proprietario.sql | idêntico | 9de4246c8a376685 | 9de4246c8a376685 |
| posflight/Q04_acesso_staging.sql | idêntico | 9a1665072f0fddb6 | 9a1665072f0fddb6 |
| posflight/Q05_matriz_acesso.sql | idêntico | faaa0cf67587bec1 | faaa0cf67587bec1 |
| preflight/P00_alvo.sql | idêntico | 89eaf34725d66bbf | 89eaf34725d66bbf |
| preflight/P01_dono_historico.sql | idêntico | b26f5f878eed2c91 | b26f5f878eed2c91 |
| preflight/P02_privilegios_dono_historico.sql | ALTERADO | 880fd8ecd4da120c | e5b7505100e22368 |
| preflight/P03_colisoes.sql | idêntico | ece9eac7f0292d9c | ece9eac7f0292d9c |
| preflight/P04_conta_proprietario.sql | idêntico | db2839ddc46e0b8b | db2839ddc46e0b8b |
| preflight/P05_registo_base.sql | idêntico | 69d084471601e573 | 69d084471601e573 |
| quarantine/QZ-01_dml_v1.0.0.quarantine | idêntico | 618c4228c915c4a6 | 618c4228c915c4a6 |
| quarantine/QZ-02_gatilho_auth_users.quarantine | idêntico | 23f28f563c39d52f | 23f28f563c39d52f |
| quarantine/QZ-03_realtime.quarantine | idêntico | d1454149232a16b9 | d1454149232a16b9 |
| quarantine/QZ-04_politicas_storage_v1.0.0.quarantine | idêntico | 39c60174aa6aff3a | 39c60174aa6aff3a |
| quarantine/QZ-05_chaves_auth_users_retiradas.quarantine | idêntico | 69a0e30f321817aa | 69a0e30f321817aa |
| quarantine/QZ-06_funcoes_retiradas.quarantine | idêntico | 6c1c0cda6917b376 | 6c1c0cda6917b376 |
| quarantine/README.md | idêntico | b92620426dce248a | b92620426dce248a |
| sql/S4-00_prelude_aditivo.sql | idêntico | 23f198ffa3135153 | 23f198ffa3135153 |
| sql/S4-01_tipos_tabelas_a.sql | idêntico | 5724b20543f0716e | 5724b20543f0716e |
| sql/S4-02_tabelas_b_restricoes.sql | idêntico | 5b8fae75417e16e2 | 5b8fae75417e16e2 |
| sql/S4-03_funcoes.sql | idêntico | 68f244fffb97280e | 68f244fffb97280e |
| sql/S4-04_indices_chaves_gatilhos.sql | idêntico | 8ba1230d83e7c879 | 8ba1230d83e7c879 |
| sql/S4-05_politicas.sql | idêntico | 6276b63eb5bd6c1c | 6276b63eb5bd6c1c |
| tests-db/T01_matriz_comportamental.bloqueado.sql | ALTERADO | 77e32ddcbcd9042e | 3736c98d96a927f3 |
| tools/R05_entrada_0000.sh | NOVO | — | b5a824cd7639d0a3 |
| tools/R10_arranque_controlado.sh | ALTERADO | f8025f2699de7135 | 215f9f7d196b26c1 |
| tools/R20_verificar_processo.sh | ALTERADO | e76569ba76103b99 | 3fb261c685fca5a1 |
| tools/R40_ligar_cliente.sh | RETIRADO | 9e664e5209b83274 | — |
| tools/R40_sessao.sh | NOVO | — | eb9bc8eb495a636b |
| tools/R41_processo_cliente.sh | ALTERADO | 0294459e6969f66c | 1679e9034b7f7c40 |
| tools/R90_descartar.sh | ALTERADO | 503375277786824d | b4e95500c1b5f422 |
| tools/lib_ensaio.sh | ALTERADO | 05aadb68ec14fb4f | c5ac44d00fc88e45 |
| tools/parse_check.mjs | ALTERADO | 110dadab32748f94 | 1114892ecec580e2 |

## P02 por verificação (P1, P2): P02-14 substituída, P02-16 nova

| Id | Estado | Verificação |
|---|---|---|
| P02-01 | idêntica | dono histórico identificado |
| P02-02 | idêntica | CREATE no schema public |
| P02-03 | idêntica | USAGE no schema auth e EXECUTE em auth.uid() (barreira e políticas) |
| P02-04 | idêntica | REFERENCES em auth.users (só profiles_id_fkey) |
| P02-05 | idêntica | dono (ou membro do dono) de public.app_role (ADD VALUE) |
| P02-06 | idêntica | BYPASSRLS ou superutilizador (8 tabelas com FORCE RLS escritas por funções SECURITY DEFINER do dono) |
| P02-07 | idêntica | unaccent: estado discriminado = INSTALADA (em extensions) ou NOVA (não instalada; versão por omissão disponível). INSTALADA NOUTRO SCHEMA ou INDISPONÍVEL => FALHA (o S4-00 usa IF NOT EXISTS e o S4-01 chama extensions.unaccent) |
| P02-08 | idêntica | service_role com USAGE em extensions (colunas geradas usam extensions.unaccent) |
| P02-09 | idêntica | papéis anon, authenticated e service_role existem |
| P02-10 | idêntica | só INSTALADA (n.a. se NOVA): assinaturas extensions.unaccent(regdictionary, text) e extensions.unaccent(text) devolvem text, pertencem à extensão, e o dicionário extensions.unaccent existe |
| P02-11 | idêntica | só INSTALADA (n.a. se NOVA): service_role (colunas geradas via public.text_norm) e o dono histórico com EXECUTE em extensions.unaccent(regdictionary, text) |
| P02-12 | idêntica | só NOVA (n.a. se INSTALADA): nenhum objeto solto unaccent/unaccent_init/unaccent_lexize, dicionário ou modelo unaccent em extensions (o CREATE EXTENSION colidiria) |
| P02-13 | idêntica | só NOVA (n.a. se INSTALADA): o dono histórico pode criar a extensão — superutilizador, OU versão por omissão trusted + CREATE na base atual + CREATE no schema extensions (exigência conservadora). Camadas da plataforma (ex.: lista de extensões permitidas) não são visíveis no catálogo |
| P02-14 | SUBSTITUÍDA | só NOVA (n.a. se INSTALADA): nenhum privilégio por omissão global do dono histórico NEM do superutilizador de arranque (lido como dono de pg_catalog, sem supor o OID 10) retira EXECUTE a PUBLIC e a service_role nas funções que a extensão vai criar |
| P02-15 | idêntica | dono histórico com USAGE em extensions (o S4-01 cria public.text_norm, que referencia extensions.unaccent) |
| P02-16 | NOVA | só INSTALADA (n.a. se NOVA): o dicionário extensions.unaccent pertence à extensão, usa o modelo extensions.unaccent (init/lexize de extensions, também da extensão), tem as opções do script da extensão (RULES = 'unaccent') e o mesmo dono que extensions.unaccent(regdictionary, text), que é o dono da extensão ou o superutilizador de arranque |

Verificações: P02 15 → 16. Todas as outras consultas P/Q mantêm o mesmo número e o mesmo texto.
