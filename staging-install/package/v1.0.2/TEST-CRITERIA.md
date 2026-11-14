# Critérios de teste — v1.0.2

## Já verificado (estático, sem base de dados)

| Verificação | Onde | Critério |
|---|---|---|
| Reprodutibilidade | `src/lib/staging/v102/package-v102.test.ts` | Ficheiros derivados byte a byte iguais à montagem; v1.0.1 continua byte a byte igual (`package-v101.test.ts`) |
| Integridade | idem | `SHA256SUMS` cobre todos os ficheiros e confere; `MANIFEST.json` com os mesmos hashes |
| Só DDL aditivo | idem + `evidence/parse-check.txt` | Parser oficial do PostgreSQL 17: só tipos DDL permitidos; 0 DML, DO, SELECT, SET, DROP, RENAME, CREATE OR REPLACE |
| A · funções perigosas | idem | `merge_accounts_apply`, `merge_accounts_preview`, `handle_new_user` ausentes do SQL e presentes em QZ-06; nenhuma função instalada escreve em `user_roles`/`staging_notes` nem faz SQL dinâmico sobre tabelas descobertas; a mesma regra sobre a v1.0.1 dá 3 violações; reintroduzir a função é apanhado |
| B · só servidor | idem | 0 GRANT a cliente; matriz 0/0 para anon, sem papel, tester, admin |
| C · executor | idem | P01/P02 rotulados "dono histórico"; manifesto com estado PENDENTE |
| D · ACL do servidor | idem | Cada REVOKE inclui service_role; cada GRANT exato; modelo pior caso: 104/104 tabelas com exatamente SELECT/INSERT/UPDATE/DELETE e 38/38 funções com EXECUTE; retirar um REVOKE de service_role ou dar TRUNCATE é apanhado |
| E · verificações | idem | Nenhuma linha testa só a forma de um hash calculado; md5 só contra constantes; exatamente 1 conta; `auth.identities` presente em P04/P05/Q03; cada impressão do P05 tem cobertura exigida e é comparada no Q03/Q04; P05 é registo, não verificação |
| F · alvo fora do SQL | idem + `sh -n`/`bash -n` | O script não lê valores de variáveis, não usa cliente SQL nem rede |
| G · nada ligado | idem | 6 valores por omissão a false; 0 linhas escritas; 0 cron/net/vault/dblink |
| Quarentena | idem + parser | Única instrução ativa = guarda que aborta |
| Sem dados reais | idem | 0 emails reais, telefones, UUIDs, endereços ou referências de produção |

## Limites conhecidos das verificações na base

- P05, Q03 e Q04 têm de correr **na mesma ferramenta/sessão**: o texto de USING/WITH CHECK e dos tipos depende do `search_path`. Uma diferença dá REPROVADO (falso negativo possível), **nunca** um falso APROVADO.
- Sem permissão de leitura em `auth.identities`, P04/P05/Q03 dão erro: BLOQUEIO (B11).

## Por verificar (exige autorização separada; nenhuma dada)

| Verificação | Como | Critério |
|---|---|---|
| Alvo do ensaio | `tools/rehearsal_target_check.sh` | APROVADO antes de qualquer SQL |
| Aplicação real | Base descartável: S4-00 → S4-05, um por transação | 0 erros |
| Pré/posflight | P00–P05 e Q00–Q05 nessa base e depois no staging | Todos APROVADO / REGISTO VÁLIDO |
| Matriz comportamental | `tests-db/T01` (ROLLBACK) | M1–M7 OK |
| Executor efetivo | Evidência independente (EXECUTOR-PRIVILEGES.md) | Papel identificado e com os requisitos |
