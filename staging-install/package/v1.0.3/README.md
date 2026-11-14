# AFONSO V2 · pacote de instalação para o AFONSO Staging — v1.0.3 (CORRETIVA DO PROCEDIMENTO DE ENSAIO)

**Estado: só para auditoria. Nada deste pacote foi executado** — nem no staging, nem na V1, nem em nenhuma base descartável; nenhum script do ensaio foi corrido. **Nenhum ensaio está autorizado.** G1–G4 continuam NO-GO.

| | |
|---|---|
| Destino único | Projeto **AFONSO Staging** (`8d741542-70d9-4078-bfc6-64e3d047396a`) |
| Nunca aplicar | à V1 (produção) nem a nenhum outro projeto |
| Substitui | v1.0.2 (commit `09f7e48b`). Auditoria final: **nenhum defeito demonstrado nas seis migrações**; NO-GO só para o procedimento de ensaio |
| Gerado por | `scripts/staging/build-staging-package-v103.ts` (mesmas fontes presas por sha256) |
| Integridade | `sha256sum -c SHA256SUMS` dentro desta pasta |

## O que NÃO muda

- **S4-00…S4-05: byte a byte iguais à v1.0.2** (os 6 sha256 estão presos no gerador e no teste). Os cabeçalhos dizem "v1.0.2" de propósito.
- Todos os REVOKE e o acesso **só pelo servidor**; as APIs de servidor continuam a **não existir** (B3).
- **F1 `pg_get_userbyid(oid)`: falso positivo**, por decisão do proprietário — **não alterado**.
- Quarentena, `ACCESS-MATRIX.md`, P00, P01, P03–P05, Q00–Q05: iguais à v1.0.2.

## O que muda (R1–R5; detalhe em `FINDINGS-RESOLUTION.md`, medido em `DIFF-v1.0.2.md`)

- **R1** · Arranque controlado (`R10`) e prova do processo **sem SQL** (`R20`): PID, executável real e sha256, PGDATA, argumentos efetivos, `postmaster.pid`, socket que é descritor do processo; cliente ligado só a esse socket (`R40`), e o processo da sessão provado filho desse postmaster (`R41`).
- **R2** · Rede de **entrada e saída** isolada para **servidor e cliente** (mesmo namespace, só `lo`, sem rotas, sem sockets IP), sem segredos montados nem serviços externos; o que os scripts não veem passa a **precondições externas E1–E9** do operador.
- **R3** · Configuração completa (todos os ficheiros, includes proibidos, relocalizações, `ALTER SYSTEM`, `pg_hba`/`pg_ident`, opções de execução e a sua origem) com leitura que **falha fechada**; nonce gravado **fora de PGDATA** e provado por caminho real/inode; HOME vazia, ambiente mínimo, montagens revistas. Sem promessas absolutas.
- **R4** · P02 discrimina `unaccent` **INSTALADA** vs **NOVA** (assinatura, pertença à extensão, EXECUTE; ou objetos soltos, superutilizador/trusted + CREATE na base e no schema, privilégios por omissão). O executor real do staging continua **PENDENTE** (B2, B16).
- **R5** · Bootstrap **100% sintético** especificado e bloqueado (`B00`, `B01`, `B01b`, `B02`), com limites L1–L10 face ao Supabase real.
- **Plano** · `REHEARSAL-PLAN.md`: E → R10/R20/R40 → bootstrap → P00–P05 → S4-00…05 → Q00–Q05 → T01 **separado e só descartável** → R90; qualquer erro ⇒ **abortar e descartar**. **Não autorizado.**

## Conteúdo

| Caminho | O quê |
|---|---|
| `sql/S4-00 … S4-05` | 6 migrações só-DDL (iguais à v1.0.2) |
| `preflight/P00 … P05`, `posflight/Q00 … Q05` | Verificações só de leitura (só o P02 mudou) |
| `ensaio/R30_sessao_alvo.sql`, `ensaio/R40_ligacao.psql` | Verificação da sessão na instância descartável (só leitura) e guião do cliente |
| `ensaio/B00 … B02 *.bloqueado.sql` | Bootstrap sintético — **bloqueado** (2 guardas) |
| `tests-db/T01…bloqueado.sql` | Matriz comportamental — **bloqueada**, agora **só descartável** (2.ª guarda) |
| `tools/R10 R20 R40 R41 R90 *.sh`, `tools/lib_ensaio.sh` | Passos do alvo — **não executados**; exigem `AUTORIZADO:<ref>` |
| `tools/parse_check.mjs`, `evidence/parse-check.txt` | Sintaxe com o parser oficial do PostgreSQL 17, sem base |
| `quarantine/` | Igual à v1.0.2 — não executável |
| `REHEARSAL-TARGET.md`, `REHEARSAL-PLAN.md`, `BOOTSTRAP-SINTETICO.md`, `EXECUTOR-PRIVILEGES.md`, `FINDINGS-RESOLUTION.md`, `TEST-CRITERIA.md` | Escritos à mão para a v1.0.3 |
| `OWNER-ACCOUNT.md`, `COLLISIONS.md`, `quarantine/README.md` | Copiados da v1.0.2 (continuam válidos: S4 e Q iguais) |
| `ACCESS-MATRIX.md`, `DIFF-v1.0.2.md`, `BLOCKERS.md`, `MANIFEST.json`, `SHA256SUMS` | Gerados |

## Sequência no staging (cada passo com a autorização indicada; nenhuma dada)

1. **Integridade**: `sha256sum -c SHA256SUMS`.
2. **Preflight só de leitura**: P00 → P04 `APROVADO` (P01/P02 "só como dono histórico"; o P02 diz INSTALADA ou NOVA); P05 `REGISTO VÁLIDO`.
3. **Executor efetivo** (externo, B2): obrigatório. **Pendente.**
4. **Ensaio descartável** (autorização separada): `REHEARSAL-PLAN.md`, com E1–E9 verificadas. **Não feito** (B1, B12, B13, B14).
5. **Instalação** (autorização separada): S4-00 → S4-05, um ficheiro por migração.
6. **Posflight só de leitura**: Q00 → Q05 com os marcadores do P05. Qualquer erro ⇒ parar e reportar.

Os ficheiros `ensaio/`, `tools/R*` e `tests-db/` **nunca** correm no staging nem na V1 (as guardas abortam lá). Não há ZIP desta versão (não pedido).
