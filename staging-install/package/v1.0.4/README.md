# AFONSO V2 · pacote de instalação para o AFONSO Staging — v1.0.4 (CORRETIVA DO PROCEDIMENTO DE ENSAIO)

**Estado: só para auditoria. Nada deste pacote foi executado.**

- Não correu SQL, nem no staging, nem na V1, nem em nenhuma base descartável.
- Não correu nenhum script nem guião psql do ensaio.
- **Nenhum ensaio está autorizado e o ensaio não tem GO.** G1–G4 continuam NO-GO.

| | |
|---|---|
| Destino único | Projeto **AFONSO Staging** (`8d741542-70d9-4078-bfc6-64e3d047396a`) |
| Nunca aplicar | à V1 (produção) nem a nenhum outro projeto |
| Substitui | v1.0.3 (commit `fd4fdaca`). Auditoria final: **nenhum defeito demonstrado nas S4**; NO-GO ao procedimento de ensaio |
| Gerado por | `scripts/staging/build-staging-package-v104.ts` (mesmas fontes presas por sha256) |
| Integridade | `sha256sum -c SHA256SUMS` dentro desta pasta |

## O que NÃO muda

- **S4-00…S4-05: byte a byte iguais** à v1.0.3/v1.0.2 (os 6 sha256 estão presos no gerador e no teste).
- Todos os REVOKE e o acesso **só pelo servidor**; as APIs de servidor continuam a **não existir** (B3).
- **F1 `pg_get_userbyid(oid)`**: válido, não alterado.
- Quarentena, `ACCESS-MATRIX.md`, P00, P01, P03–P05, Q00–Q05: iguais à v1.0.3.
- **Entrada 0000 do staging: continua PENDENTE.** Metadados localizados no código do staging e registados (commit `ab518782`, blob `24c38a52`, sha256 integral `a87578e5…aecd2`, 2303 bytes, 44 linhas, sem LF final); os **bytes originais não foram obtidos** e o ficheiro não está no pacote. Nada foi inventado nem substituído; só existe a interface `entradas/0000/` (B14).

## O que muda (detalhe em `FINDINGS-RESOLUTION.md`, medido em `DIFF-v1.0.3.md`)

| Achado | Correção |
|---|---|
| **V1** | O R30 já não tem texto parecido com um marcador; cada cópia é verificada pelo padrão completo |
| **V2** | O comando do R41 é texto literal com caminhos validados; nenhuma expansão psql dentro do shell; o PID da sessão vai por ficheiro |
| **V3** | Decisões com `\if`/`\else` sobre `\gset`; a falha é `RAISE EXCEPTION`, com código ≠ 0. Acabam as conversões constantes para int, que o planeador avaliava sempre |
| **V4** | Leituras, `grep` e `read` falham fechadas; sem pipelines nas verificações |
| **V5** | Identidade estável dos processos (início, executável dispositivo:inode, cwd, namespaces, cgroup), nunca pela linha de comando |
| **V6/V7** | O R90 trata preparação parcial e interrupções, e espera que **todos** os processos da unidade terminem (`cgroup.kill` se preciso); senão dá **INCERTEZA ⇒ destruir a máquina** |
| **S1/S2** | **Wrapper único** `tools/R40_sessao.sh` para todos os passos, com verificação de cluster, processo, base, papel e socket por sessão. As cópias são determinísticas, com hashes e marcadores registados |
| **B1/B2** | Guardas do bootstrap com base, papel e identidade da instância; conta sintética com provider/email/sub coerentes |
| **P1/P2** | P02-16 (dicionário `unaccent`: dono, modelo, opções); P02-14 sem supor o OID 10 |
| **E1–E10** | Obrigações com evidência e falha fechada (ficha do operador). Nova E10: unidade/cgroup dedicada |

## Conteúdo

| Caminho | O quê |
|---|---|
| `sql/S4-00 … S4-05` | 6 migrações só-DDL (iguais) |
| `preflight/P00 … P05`, `posflight/Q00 … Q05` | Verificações só de leitura (só o P02 mudou) |
| `ensaio/R30`, `R31`, `R32` (`.sql`, gerados) | Verificações de sessão/instância, só de leitura, só no ensaio |
| `ensaio/R40_sessao.psql` | Guião de cada sessão (usado só pelo wrapper) |
| `ensaio/B00 … B02 *.bloqueado.sql`, `tests-db/T01…bloqueado.sql` | Bootstrap sintético e matriz comportamental — **bloqueados** (2 guardas) |
| `tools/R05 R10 R20 R40 R41 R90 *.sh`, `tools/lib_ensaio.sh` | Passos do ensaio — **não executados**; exigem `AUTORIZADO:<ref>` (o R41 lê-a do registo) |
| `entradas/0000/` | Interface da entrada 0000 (**PENDENTE**) |
| `operador/E-EVIDENCIA.modelo` | Ficha das obrigações E1–E10 (modelo, tudo PENDENTE) |
| `tools/parse_check.mjs`, `evidence/parse-check.txt`, `evidence/shell-check.txt` | Verificação estática (parser oficial do PostgreSQL 17; `sh/bash/dash -n`, `shellcheck`) |
| `quarantine/` | Igual — não executável |
| `REHEARSAL-TARGET.md`, `REHEARSAL-PLAN.md`, `BOOTSTRAP-SINTETICO.md`, `EXECUTOR-PRIVILEGES.md`, `FINDINGS-RESOLUTION.md`, `TEST-CRITERIA.md` | Escritos para a v1.0.4 |
| `OWNER-ACCOUNT.md`, `COLLISIONS.md`, `quarantine/README.md` | Copiados (continuam válidos) |
| `ACCESS-MATRIX.md`, `DIFF-v1.0.3.md`, `BLOCKERS.md`, `MANIFEST.json`, `SHA256SUMS` | Gerados |

## Sequência no staging (cada passo com a autorização indicada; nenhuma dada)

1. **Integridade**: `sha256sum -c SHA256SUMS`.
2. **Preflight só de leitura**: P00 → P04 `APROVADO` (P01/P02 "só como dono histórico"; o P02 diz INSTALADA ou NOVA); P05 `REGISTO VÁLIDO`.
3. **Executor efetivo** (externo, B2): obrigatório. **Pendente.**
4. **Entrada 0000** (B14): transferência autorizada dos bytes originais (metadados já registados) e conferência pelo R05; ou bootstrap alternativo auditado. **Pendente.**
5. **Ensaio descartável** (autorização separada): `REHEARSAL-PLAN.md`, com E1–E10 cumpridas. **Não feito; sem GO.**
6. **Instalação** (autorização separada): S4-00 → S4-05, um ficheiro por migração.
7. **Posflight só de leitura**: Q00 → Q05 com as impressões do P05. Qualquer erro ⇒ parar e reportar.

Os ficheiros `ensaio/`, `tools/R*`, `entradas/`, `operador/` e `tests-db/` **nunca** correm no staging nem na V1 (as guardas abortam lá). Não há ZIP desta versão (não pedido).
