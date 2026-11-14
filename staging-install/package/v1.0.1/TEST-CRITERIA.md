# Critérios de teste — v1.0.1

## Já verificado (sem base de dados)

| Verificação | Onde | Critério |
|---|---|---|
| Reprodutibilidade | `package-v101.test.ts` | Os ficheiros derivados (SQL, consultas, quarentena, matriz, diferenças) são byte a byte iguais à montagem a partir das fontes presas por sha256 |
| Integridade | idem | `SHA256SUMS` cobre todos os ficheiros e confere; `MANIFEST.json` tem os mesmos hashes |
| Só DDL aditivo | idem + `evidence/parse-check.txt` | Parser oficial do PostgreSQL 17: só CREATE TYPE/FUNCTION/TABLE/INDEX/TRIGGER/POLICY/EXTENSION, ALTER TYPE ADD VALUE, ALTER TABLE (ADD CONSTRAINT, ENABLE/FORCE RLS, ADD COLUMN IF NOT EXISTS), COMMENT, GRANT/REVOKE. 0 DML, DO, SELECT, SET, DROP, RENAME, CREATE OR REPLACE |
| Deny-by-default | idem | Cada CREATE TABLE seguido, na mesma migração, de ENABLE RLS, barreira e REVOKE/GRANT; cada CREATE FUNCTION seguido de REVOKE/GRANT; GRANT só a `service_role` |
| Matriz anon / sem papel / tester / admin / servidor | idem (`ACCESS-MATRIX.md`) | Pior caso: 0 tabelas e 0 funções para os 4 papéis de cliente; 104 tabelas sob barreira; se uma tabela fosse aberta, anon e sem papel continuam a 0; servidor 104/41 |
| Testes negativos | idem | A auditoria e o modelo **apanham** cada mutação injetada: INSERT, DROP COLUMN, GRANT a anon, política PUBLIC, chave para auth.users, barreira retirada, REVOKE de função retirado, CREATE OR REPLACE de `has_role` |
| Chaves para auth.users | idem | Só `profiles_id_fkey`; 84 retiradas listadas em QZ-05 |
| Objetos do staging | idem | Nenhum CREATE/ALTER/POLICY/GRANT sobre `has_role`, `has_staging_access`, `staging_notes`, `user_roles`, exceto `ADD COLUMN IF NOT EXISTS created_by uuid` |
| Envios | idem | 6 valores por omissão a `false`; nenhum outro texto de tabela alterado em relação ao estado final; 0 `cron`/`net`/`vault`/`dblink` |
| Quarentena não executável | idem + parser | Única instrução ativa = guarda que aborta; todas as outras linhas começam por `--Q| `; contém as 90 instruções de dados da v1.0.0 |
| Consultas que falham de verdade | idem + parser | 1 SELECT só de leitura; sem palavras de escrita; veredito com erro; ids únicos; nenhum `ok` constante; marcadores presentes |
| Sem dados reais | idem | 0 emails (fora de `.invalid`), telefones, UUIDs, endereços ou referências de produção em todos os ficheiros |
| Coerência com o ensaio | idem | 106 tabelas, 1259 colunas, 43 funções, 297 índices, 8 enums, 72 gatilhos em public (iguais ao ensaio da v1.0.0) |

## Por verificar (exige autorização separada)

| Verificação | Como | Critério de aprovação |
|---|---|---|
| Aplicação real | Base descartável isolada: S3-00 → S3-05, um por transação | 0 erros |
| Posflight | Q00–Q05 nessa base e depois no staging | Todos `APROVADO` |
| Matriz comportamental | `tests-db/T01` (ROLLBACK) | M1–M6 OK |
| Privilégios do executor real | P01/P02 no staging | `APROVADO` (prova inferida; ver EXECUTOR-PRIVILEGES.md) |
