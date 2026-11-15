# AFONSO V2 · pacote de instalação para o AFONSO Staging — v1.0.5 (CORRETIVA DO PROCEDIMENTO DE ENSAIO: X1–X3)

**Estado: só para auditoria. Nada deste pacote foi executado.**

- Não correu SQL, nem no staging, nem na V1, nem em nenhuma base descartável.
- Não correu nenhum script nem guião psql do ensaio.
- **Nenhum ensaio está autorizado e o ensaio não tem GO.** G1–G4 continuam NO-GO.

| | |
|---|---|
| Destino único | Projeto **AFONSO Staging** (`8d741542-70d9-4078-bfc6-64e3d047396a`) |
| Nunca aplicar | à V1 (produção) nem a nenhum outro projeto |
| Substitui | v1.0.4 (commit `a4f275c0`). Auditoria independente da v1.0.4: NO-GO ao procedimento de ensaio (X1–X3); S4 e 0000 sem alteração |
| Gerado por | montador do repositório de desenvolvimento (mesmas fontes presas por sha256); o pacote não depende dele |
| Integridade | `sha256sum -c SHA256SUMS` dentro desta pasta |
| Regressão estática | `node verificacao/V01_regressao_estatica.mjs .` dentro desta pasta (só lê ficheiros; saída registada em `evidence/regressao-estatica.txt`) |

## O que NÃO muda

- **S4-00…S4-05: byte a byte iguais** à v1.0.4/v1.0.3/v1.0.2 (os 6 sha256 estão presos no gerador e na V01).
- Todos os REVOKE e o acesso **só pelo servidor**; as APIs de servidor continuam a **não existir** (B3).
- **F1 `pg_get_userbyid(oid)`**: válido, não alterado.
- Quarentena, `ACCESS-MATRIX.md`, todas as P/Q, R30/R31/R32, B00–B02, T01, `ensaio/R40_sessao.psql`, `tools/R41_processo_cliente.sh`, `tools/parse_check.mjs` e `entradas/0000/`: iguais à v1.0.4.
- **Entrada 0000 do staging: AUTENTICADA como input histórico, byte a byte igual à v1.0.4.** Conferida antes de marcar AUTENTICADO: sha256 integral `a87578e5…aecd2`, blob Git `24c38a52`, 2303 bytes, 44 linhas, sem LF final. Cópia byte a byte em `entradas/0000/0000_staging_access_control.sql`; prova em `evidence/entrada-0000-check.txt`. Nada foi reconstruído a partir de texto. **Ressalva:** correspondência com a base de dados real do staging **não verificada**; contém 3 INSERTs sintéticos (B14 continua aberto por isso).

## O que muda (detalhe em `FINDINGS-RESOLUTION.md`, medido em `DIFF-v1.0.4.md`)

| Achado | Correção |
|---|---|
| **X1** | Ciclo de HOME (`lib_ensaio.sh`) já não devolve erro quando a última linha não é HOME; exige exatamente uma HOME igual à pasta do ensaio. Nenhum ciclo `done … \|\|` termina numa lista `&&` |
| **X2** | cgroup v2 unificado em `/sys/fs/cgroup` (raiz `/`, sem v1) confirmado em R10, R20 e R90; R10/R20 exigem a unidade sem subcgroups; o R90 decide "vazia" por `cgroup.events` `populated 0`, que cobre os descendentes. E10 reescrita |
| **X3** | Nenhum sinal sem a identidade completa relida imediatamente antes (`sinaliza_se_mesmo`); trap do R10 com identidade registada ou provisória e código 3 em dúvida; no R90 qualquer falha depois de o descarte começar dá código 3. Corrida residual RR1 documentada |
| **Ficha E1–E10** | Cada obrigação aponta para um artefacto com sha256 que confere e uma descrição real; oito caracteres quaisquer já não passam |
| **Trinco global** | `<ROOT>/.trinco`: um passo de cada vez (R05, R10, R40); o R90 assume órfãos |
| **Campos-token** | O R40 valida os 7 campos de cada passo e cada nome-token, e exige que cada token cubra um campo da fonte |
| **Teste de regressão** | `verificacao/V01_regressao_estatica.mjs` incluído no pacote, com controlos negativos; os documentos já não citam como prova testes que não estão no pacote |

## Conteúdo

| Caminho | O quê |
|---|---|
| `sql/S4-00 … S4-05` | 6 migrações só-DDL (iguais) |
| `preflight/P00 … P05`, `posflight/Q00 … Q05` | Verificações só de leitura (só o P02 mudou) |
| `ensaio/R30`, `R31`, `R32` (`.sql`, gerados) | Verificações de sessão/instância, só de leitura, só no ensaio |
| `ensaio/R40_sessao.psql` | Guião de cada sessão (usado só pelo wrapper) |
| `ensaio/B00 … B02 *.bloqueado.sql`, `tests-db/T01…bloqueado.sql` | Bootstrap sintético e matriz comportamental — **bloqueados** (2 guardas) |
| `tools/R05 R10 R20 R40 R41 R90 *.sh`, `tools/lib_ensaio.sh` | Passos do ensaio — **não executados**; exigem `AUTORIZADO:<ref>` (o R41 lê-a do registo) |
| `entradas/0000/` | Entrada 0000: `ESPERADO` (**AUTENTICADO**), cópia histórica byte a byte e interface |
| `operador/E-EVIDENCIA.modelo` | Ficha das obrigações E1–E10 (modelo, tudo PENDENTE; formato artefacto\|sha256\|descrição) |
| `verificacao/V01_regressao_estatica.mjs`, `evidence/regressao-estatica.txt` | Teste de regressão estático reproduzível e a sua saída registada |
| `tools/parse_check.mjs`, `evidence/parse-check.txt`, `evidence/shell-check.txt`, `evidence/entrada-0000-check.txt` | Verificação estática (parser oficial do PostgreSQL 17; `sh/bash/dash -n`, `shellcheck`) |
| `quarantine/` | Igual — não executável |
| `REHEARSAL-TARGET.md`, `REHEARSAL-PLAN.md`, `FINDINGS-RESOLUTION.md`, `TEST-CRITERIA.md` | Atualizados para a v1.0.5 |
| `BOOTSTRAP-SINTETICO.md`, `EXECUTOR-PRIVILEGES.md` | Copiados da v1.0.4 (continuam válidos) |
| `OWNER-ACCOUNT.md`, `COLLISIONS.md`, `quarantine/README.md` | Copiados (continuam válidos) |
| `ACCESS-MATRIX.md`, `DIFF-v1.0.4.md`, `BLOCKERS.md`, `MANIFEST.json`, `SHA256SUMS` | Gerados |

## Sequência no staging (cada passo com a autorização indicada; nenhuma dada)

1. **Integridade**: `sha256sum -c SHA256SUMS` e `node verificacao/V01_regressao_estatica.mjs .` (0 falhas).
2. **Preflight só de leitura**: P00 → P04 `APROVADO` (P01/P02 "só como dono histórico"; o P02 diz INSTALADA ou NOVA); P05 `REGISTO VÁLIDO`.
3. **Executor efetivo** (externo, B2): obrigatório. **Pendente.**
4. **Entrada 0000** (B14): bytes originais incluídos e conferidos estaticamente; no ensaio o R05 reconfere-os. **Falta** a conferência só de leitura de que a base real do staging corresponde a esta 0000.
5. **Ensaio descartável** (autorização separada): `REHEARSAL-PLAN.md`, com E1–E10 cumpridas. **Não feito; sem GO.**
6. **Instalação** (autorização separada): S4-00 → S4-05, um ficheiro por migração.
7. **Posflight só de leitura**: Q00 → Q05 com as impressões do P05. Qualquer erro ⇒ parar e reportar.

Os ficheiros `ensaio/`, `tools/R*`, `entradas/`, `operador/` e `tests-db/` **nunca** correm no staging nem na V1 (as guardas abortam lá). Não há ZIP desta versão (não pedido).
