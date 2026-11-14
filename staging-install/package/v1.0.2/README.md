# AFONSO V2 · pacote de instalação para o AFONSO Staging — v1.0.2 (CORRETIVA)

**Estado: só para auditoria. Nada deste pacote foi executado** — nem no staging, nem na V1, nem em nenhuma base descartável. Nenhuma autorização para aplicar migrações nem correr testes de base. G1–G4 continuam NO-GO.

| | |
|---|---|
| Destino único | Projeto **AFONSO Staging** (`8d741542-70d9-4078-bfc6-64e3d047396a`) |
| Nunca aplicar | à V1 (produção) nem a nenhum outro projeto |
| Substitui | v1.0.1 (commit `a444f846`): integridade aprovada pelo staging, mas NO-GO para ensaio descartável |
| Origem | As MESMAS fontes da v1.0.1, presas por sha256 (estado final `staging-install/rehearsal/results/schema_public.sql`, sha256 `e047c2e1…`). Gerado por `scripts/staging/build-staging-package-v102.ts` |
| Integridade | `sha256sum -c SHA256SUMS` dentro desta pasta |

## O que muda em relação à v1.0.1 (achados A–G)

Detalhe e prova por achado em `FINDINGS-RESOLUTION.md`; números medidos em `DIFF-v1.0.1.md`.

- **A** · `merge_accounts_apply` (e o par `merge_accounts_preview`) **em quarentena** (QZ-06), não instalados: descobriam todas as tabelas com `user_id`, incluindo `user_roles`, e podiam mover ou apagar o papel admin. `handle_new_user` (escreve em `user_roles`) também. A auditoria estática passa a recusar qualquer função que escreva em `user_roles`/`staging_notes` ou use SQL dinâmico sobre tabelas descobertas no catálogo.
- **B** · Acesso V2 continua **só pelo servidor**: todos os REVOKE mantidos, nenhum acesso de cliente aberto. **As APIs de servidor com verificação de sessão + `has_staging_access` ainda não existem**: o pacote **não** afirma segurança funcional (B3).
- **C** · P01/P02 passam a chamar-se *dono histórico*: não provam o executor efetivo. Exige-se evidência independente, **PENDENTE** (`EXECUTOR-PRIVILEGES.md`, B2).
- **D** · `service_role` perde **tudo** antes de receber só `SELECT, INSERT, UPDATE, DELETE` (tabelas) ou `EXECUTE` (funções): sem TRUNCATE, REFERENCES, TRIGGER nem GRANT OPTION. O Q02 audita a ACL final entrada a entrada.
- **E** · Sem tautologias: as 4 linhas "é um hash, logo passa" da v1.0.1 desapareceram. Exatamente **1 conta**. Comparação de `auth.users` (campos estáveis), **`auth.identities`**, estado da conta, **predicados e papéis das políticas** e **atributos das funções** do staging. O registo de base (P05) está **separado** das verificações substantivas e exige cobertura concreta.
- **F** · O alvo do ensaio verifica-se **fora do SQL**, sem credenciais nem integrações (`REHEARSAL-TARGET.md`, `tools/rehearsal_target_check.sh`, não executado).
- **G** · Valores por omissão de envio continuam desligados, mas o esquema **não impede** ativações futuras; ensaio só com dados sintéticos (B9).

## Conteúdo

| Caminho | O quê |
|---|---|
| `sql/S4-00 … S4-05` | 6 migrações só-DDL, por ordem, **uma por migração** |
| `preflight/P00 … P04` | Verificações só de leitura, ANTES: marcas do alvo, dono histórico, privilégios do dono histórico, colisões, conta do proprietário |
| `preflight/P05_registo_base.sql` | **Registo** de base (não é verificação): 7 impressões sha256 com cobertura exigida, para o Q03/Q04 |
| `posflight/Q00 … Q05` | Verificações só de leitura, DEPOIS: alvo, estrutura, segurança e ACL final, conta, acesso do staging, matriz |
| `quarantine/` | Dados, gatilho, Realtime, storage, chaves retiradas e funções retiradas — **não executável** |
| `tests-db/T01…bloqueado.sql` | Teste comportamental — **bloqueado** (escreve dados sintéticos em ROLLBACK) |
| `tools/rehearsal_target_check.sh` | Verificação do alvo do ensaio fora do SQL — **não executado** |
| `tools/parse_check.mjs`, `evidence/parse-check.txt` | Sintaxe com o parser oficial do PostgreSQL 17, sem base |
| `ACCESS-MATRIX.md`, `DIFF-v1.0.1.md`, `BLOCKERS.md` | Gerados: matriz, diferenças medidas, bloqueios |
| `FINDINGS-RESOLUTION.md`, `TEST-CRITERIA.md`, `EXECUTOR-PRIVILEGES.md`, `REHEARSAL-TARGET.md`, `OWNER-ACCOUNT.md`, `COLLISIONS.md` | Escritos à mão |
| `MANIFEST.json`, `SHA256SUMS` | Inventário e hashes de todos os ficheiros |

## Sequência (cada passo com a autorização indicada)

1. **Integridade** (sem autorização extra): `sha256sum -c SHA256SUMS`.
2. **Preflight** (só leitura): P00 → P04 têm de dar `APROVADO` (P01/P02: "aprovado só como dono histórico"). Depois **P05**: tem de dar `REGISTO VÁLIDO`; guardar as 7 impressões.
3. **Evidência do executor efetivo** (externa ao SQL, B2): obrigatória antes de qualquer aplicação. **Pendente.**
4. **Ensaio descartável** (autorização separada): primeiro `tools/rehearsal_target_check.sh` (fora do SQL); depois S4-00…S4-05, P/Q e T01 com dados sintéticos. **Não feito** (B1, B12).
5. **Instalação no staging** (autorização separada): S4-00 → S4-05 com a ferramenta de migrações do staging, um ficheiro por migração.
6. **Posflight** (só leitura): Q00 → Q05, com os marcadores substituídos pelo P05, na mesma ferramenta/sessão. Qualquer erro => parar e reportar, **não corrigir à mão**.

A quarentena e o T01 ficam fora desta sequência. Não há ZIP desta versão (não pedido).
