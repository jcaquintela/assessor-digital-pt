# Diferenças v1.0.2 → v1.0.3 (gerado; nada executado)

Comparação ficheiro a ficheiro com o `SHA256SUMS` da v1.0.2 (commit `09f7e48b`). MANIFEST, SHA256SUMS e este ficheiro ficam de fora.

- **Migrações S4-00…S4-05: 6/6 idênticas byte a byte** (com os REVOKE e o acesso só pelo servidor). Os cabeçalhos dizem "v1.0.2" de propósito: mudá-los mudaria os hashes auditados.
- Idênticos: 27 · alterados: 10 · novos: 14 · retirados: 2.
- F1 (`pg_get_userbyid(oid)`): falso positivo confirmado pela auditoria; **não alterado** (P05, Q02 e P01 iguais à v1.0.2).

| Ficheiro | Estado | sha256 v1.0.2 (16) | sha256 v1.0.3 (16) |
|---|---|---|---|
| ACCESS-MATRIX.md | idêntico | 7181fa2caded1846 | 7181fa2caded1846 |
| BLOCKERS.md | ALTERADO | ec184e269eb80a0c | aea6f6bcd928ef23 |
| BOOTSTRAP-SINTETICO.md | NOVO | — | 7630e8ee9bbcfd7c |
| COLLISIONS.md | idêntico | 4874a3fb6ee9a5b2 | 4874a3fb6ee9a5b2 |
| DIFF-v1.0.1.md | RETIRADO | 53648b13068209e9 | — |
| EXECUTOR-PRIVILEGES.md | ALTERADO | ad28ffd7f40f23b8 | 894c457bebc5b47c |
| FINDINGS-RESOLUTION.md | ALTERADO | bce99d497643cb93 | 68ce28c1b6ef78ce |
| OWNER-ACCOUNT.md | idêntico | ccecb316555e682a | ccecb316555e682a |
| README.md | ALTERADO | c9bebebc5b62eaa0 | 0a65e6cbeeef1d97 |
| REHEARSAL-PLAN.md | NOVO | — | 24b544223c18469d |
| REHEARSAL-TARGET.md | ALTERADO | 36bd9809172d45b8 | 8ce8fba5c18be32a |
| TEST-CRITERIA.md | ALTERADO | 7c094dc042df7a02 | 801d8d4aa926ffc5 |
| ensaio/B00_papeis_e_base.bloqueado.sql | NOVO | — | 467589ccc5efa4a3 |
| ensaio/B01_plataforma_sintetica.bloqueado.sql | NOVO | — | ac7f2d57307e7651 |
| ensaio/B01b_unaccent_instalada.bloqueado.sql | NOVO | — | ed89bfc952a8e87e |
| ensaio/B02_papel_admin_sintetico.bloqueado.sql | NOVO | — | a1d285ccc9d5c670 |
| ensaio/R30_sessao_alvo.sql | NOVO | — | 189db43b044477df |
| ensaio/R40_ligacao.psql | NOVO | — | 587640447a91618b |
| evidence/parse-check.txt | ALTERADO | c7706938a957c0fa | 65e7e2e9b6fc094a |
| posflight/Q00_alvo.sql | idêntico | 194005d58f83da71 | 194005d58f83da71 |
| posflight/Q01_estrutura.sql | idêntico | e70797606a43ab11 | e70797606a43ab11 |
| posflight/Q02_seguranca.sql | idêntico | 09d1bc27a1f4ffb8 | 09d1bc27a1f4ffb8 |
| posflight/Q03_conta_proprietario.sql | idêntico | 9de4246c8a376685 | 9de4246c8a376685 |
| posflight/Q04_acesso_staging.sql | idêntico | 9a1665072f0fddb6 | 9a1665072f0fddb6 |
| posflight/Q05_matriz_acesso.sql | idêntico | faaa0cf67587bec1 | faaa0cf67587bec1 |
| preflight/P00_alvo.sql | idêntico | 89eaf34725d66bbf | 89eaf34725d66bbf |
| preflight/P01_dono_historico.sql | idêntico | b26f5f878eed2c91 | b26f5f878eed2c91 |
| preflight/P02_privilegios_dono_historico.sql | ALTERADO | f1ccd059c9e33a36 | 880fd8ecd4da120c |
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
| tests-db/T01_matriz_comportamental.bloqueado.sql | ALTERADO | f5b1b0d1532c5df2 | 77e32ddcbcd9042e |
| tools/R10_arranque_controlado.sh | NOVO | — | f8025f2699de7135 |
| tools/R20_verificar_processo.sh | NOVO | — | e76569ba76103b99 |
| tools/R40_ligar_cliente.sh | NOVO | — | 9e664e5209b83274 |
| tools/R41_processo_cliente.sh | NOVO | — | 0294459e6969f66c |
| tools/R90_descartar.sh | NOVO | — | 503375277786824d |
| tools/lib_ensaio.sh | NOVO | — | 05aadb68ec14fb4f |
| tools/parse_check.mjs | ALTERADO | a59296618f42bc39 | 110dadab32748f94 |
| tools/rehearsal_target_check.sh | RETIRADO | bfa8253a5939eb6f | — |

## P02 por verificação (R4): P02-07 substituída, P02-10, P02-11, P02-12, P02-13, P02-14, P02-15 novas

| Id | Estado | Verificação |
|---|---|---|
| P02-01 | idêntica | dono histórico identificado |
| P02-02 | idêntica | CREATE no schema public |
| P02-03 | idêntica | USAGE no schema auth e EXECUTE em auth.uid() (barreira e políticas) |
| P02-04 | idêntica | REFERENCES em auth.users (só profiles_id_fkey) |
| P02-05 | idêntica | dono (ou membro do dono) de public.app_role (ADD VALUE) |
| P02-06 | idêntica | BYPASSRLS ou superutilizador (8 tabelas com FORCE RLS escritas por funções SECURITY DEFINER do dono) |
| P02-07 | SUBSTITUÍDA | unaccent: estado discriminado = INSTALADA (em extensions) ou NOVA (não instalada; versão por omissão disponível). INSTALADA NOUTRO SCHEMA ou INDISPONÍVEL => FALHA (o S4-00 usa IF NOT EXISTS e o S4-01 chama extensions.unaccent) |
| P02-08 | idêntica | service_role com USAGE em extensions (colunas geradas usam extensions.unaccent) |
| P02-09 | idêntica | papéis anon, authenticated e service_role existem |
| P02-10 | NOVA | só INSTALADA (n.a. se NOVA): assinaturas extensions.unaccent(regdictionary, text) e extensions.unaccent(text) devolvem text, pertencem à extensão, e o dicionário extensions.unaccent existe |
| P02-11 | NOVA | só INSTALADA (n.a. se NOVA): service_role (colunas geradas via public.text_norm) e o dono histórico com EXECUTE em extensions.unaccent(regdictionary, text) |
| P02-12 | NOVA | só NOVA (n.a. se INSTALADA): nenhum objeto solto unaccent/unaccent_init/unaccent_lexize, dicionário ou modelo unaccent em extensions (o CREATE EXTENSION colidiria) |
| P02-13 | NOVA | só NOVA (n.a. se INSTALADA): o dono histórico pode criar a extensão — superutilizador, OU versão por omissão trusted + CREATE na base atual + CREATE no schema extensions (exigência conservadora). Camadas da plataforma (ex.: lista de extensões permitidas) não são visíveis no catálogo |
| P02-14 | NOVA | só NOVA (n.a. se INSTALADA): nenhum privilégio por omissão global (dono histórico ou superutilizador de arranque) retira EXECUTE a PUBLIC e a service_role nas funções que a extensão vai criar |
| P02-15 | NOVA | dono histórico com USAGE em extensions (o S4-01 cria public.text_norm, que referencia extensions.unaccent) |

Verificações: P02 9 → 15. Todas as outras consultas P/Q mantêm o mesmo número e o mesmo texto.
