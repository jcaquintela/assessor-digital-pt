# Diferenças v1.0.4 → v1.0.5 (gerado; nada executado)

Comparação ficheiro a ficheiro com o `SHA256SUMS` da v1.0.4 (commit `a4f275c0`). MANIFEST, SHA256SUMS e os ficheiros DIFF ficam de fora.

- **Migrações S4-00…S4-05: 6/6 idênticas byte a byte** (com os REVOKE e o acesso só pelo servidor).
- **Entrada 0000 autenticada: idêntica byte a byte**.
- Idênticos: 46 · alterados: 14 · novos: 2 · retirados: 0.

| Ficheiro | Estado | sha256 v1.0.4 (16) | sha256 v1.0.5 (16) |
|---|---|---|---|
| ACCESS-MATRIX.md | idêntico | 7181fa2caded1846 | 7181fa2caded1846 |
| BLOCKERS.md | ALTERADO | 2ec2abe9f134e67a | a1dfbc1023e29bef |
| BOOTSTRAP-SINTETICO.md | idêntico | 2abdc045102578bd | 2abdc045102578bd |
| COLLISIONS.md | idêntico | 4874a3fb6ee9a5b2 | 4874a3fb6ee9a5b2 |
| EXECUTOR-PRIVILEGES.md | idêntico | b0dd8ee82f0ebd38 | b0dd8ee82f0ebd38 |
| FINDINGS-RESOLUTION.md | ALTERADO | 97a2140849dd8697 | 47676be35e6b0b56 |
| OWNER-ACCOUNT.md | idêntico | ccecb316555e682a | ccecb316555e682a |
| README.md | ALTERADO | 188a9c5701534af9 | 5297dfff6e787e0c |
| REHEARSAL-PLAN.md | ALTERADO | 70f8cb1ec0a2360e | 0164f9c7388e1222 |
| REHEARSAL-TARGET.md | ALTERADO | e0a081c96ff05001 | e670df19c4c144f2 |
| TEST-CRITERIA.md | ALTERADO | 85ab97a17f77958c | 5fcfd64dc1ffbf01 |
| ensaio/B00_papeis_e_base.bloqueado.sql | idêntico | c200892c26f6c0d6 | c200892c26f6c0d6 |
| ensaio/B01_plataforma_sintetica.bloqueado.sql | idêntico | f2d5565a5f066bb8 | f2d5565a5f066bb8 |
| ensaio/B01b_unaccent_instalada.bloqueado.sql | idêntico | f0be1e2cc36b39b5 | f0be1e2cc36b39b5 |
| ensaio/B02_papel_admin_sintetico.bloqueado.sql | idêntico | 4b793a30fdaff2e1 | 4b793a30fdaff2e1 |
| ensaio/R30_sessao_alvo.sql | idêntico | 14224f2ff798f131 | 14224f2ff798f131 |
| ensaio/R31_sessao_passo.sql | idêntico | 4e4a6222437a812e | 4e4a6222437a812e |
| ensaio/R32_instancia_super.sql | idêntico | 2babc1d7f9fdf5ce | 2babc1d7f9fdf5ce |
| ensaio/R40_sessao.psql | idêntico | 9fed4d048e1db21a | 9fed4d048e1db21a |
| entradas/0000/0000_staging_access_control.sql | idêntico | a87578e560f0c97f | a87578e560f0c97f |
| entradas/0000/ESPERADO | idêntico | f979e3347530c39f | f979e3347530c39f |
| entradas/0000/README.md | idêntico | 43892674910a1ea3 | 43892674910a1ea3 |
| evidence/entrada-0000-check.txt | idêntico | 21bab853b78205f4 | 21bab853b78205f4 |
| evidence/parse-check.txt | idêntico | 56d47aeffde118bc | 56d47aeffde118bc |
| evidence/regressao-estatica.txt | NOVO | — | 29a52bc050957dc0 |
| evidence/shell-check.txt | ALTERADO | a28df6e38dad9d72 | cfc24d2caabbff8a |
| operador/E-EVIDENCIA.modelo | ALTERADO | 37d43a97f25d8d0b | 6055b4a000c110ec |
| posflight/Q00_alvo.sql | idêntico | 194005d58f83da71 | 194005d58f83da71 |
| posflight/Q01_estrutura.sql | idêntico | e70797606a43ab11 | e70797606a43ab11 |
| posflight/Q02_seguranca.sql | idêntico | 09d1bc27a1f4ffb8 | 09d1bc27a1f4ffb8 |
| posflight/Q03_conta_proprietario.sql | idêntico | 9de4246c8a376685 | 9de4246c8a376685 |
| posflight/Q04_acesso_staging.sql | idêntico | 9a1665072f0fddb6 | 9a1665072f0fddb6 |
| posflight/Q05_matriz_acesso.sql | idêntico | faaa0cf67587bec1 | faaa0cf67587bec1 |
| preflight/P00_alvo.sql | idêntico | 89eaf34725d66bbf | 89eaf34725d66bbf |
| preflight/P01_dono_historico.sql | idêntico | b26f5f878eed2c91 | b26f5f878eed2c91 |
| preflight/P02_privilegios_dono_historico.sql | idêntico | e5b7505100e22368 | e5b7505100e22368 |
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
| tests-db/T01_matriz_comportamental.bloqueado.sql | idêntico | 3736c98d96a927f3 | 3736c98d96a927f3 |
| tools/R05_entrada_0000.sh | ALTERADO | 1ecc55be13c700cf | 237e9197e55b3c5c |
| tools/R10_arranque_controlado.sh | ALTERADO | 215f9f7d196b26c1 | dee88c8d13a320c5 |
| tools/R20_verificar_processo.sh | ALTERADO | 3fb261c685fca5a1 | db6cdf254574dec1 |
| tools/R40_sessao.sh | ALTERADO | 02b093954bdd215c | 4af2061f0ffcb919 |
| tools/R41_processo_cliente.sh | idêntico | 1679e9034b7f7c40 | 1679e9034b7f7c40 |
| tools/R90_descartar.sh | ALTERADO | b4e95500c1b5f422 | 81c4f09d5553f62d |
| tools/lib_ensaio.sh | ALTERADO | c5ac44d00fc88e45 | 68d29023dc0f30f7 |
| tools/parse_check.mjs | idêntico | 1114892ecec580e2 | 1114892ecec580e2 |
| verificacao/V01_regressao_estatica.mjs | NOVO | — | 9327254015caa84a |
