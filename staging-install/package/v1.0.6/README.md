# AFONSO V2 · pacote de instalação para o AFONSO Staging — v1.0.6 (CORRETIVA DO PROCEDIMENTO DE ENSAIO: Y1–Y3)

**Estado: só para auditoria. Nada deste pacote foi executado.**

- Não correu SQL, nem no staging, nem na V1, nem em nenhuma base descartável.
- Não correu nenhum script nem guião psql do ensaio.
- **Nenhum ensaio está autorizado e o ensaio não tem GO.** G1–G4 continuam NO-GO.

| | |
|---|---|
| Destino único | Projeto **AFONSO Staging** (`8d741542-70d9-4078-bfc6-64e3d047396a`) |
| Nunca aplicar | à V1 (produção) nem a nenhum outro projeto |
| Substitui | v1.0.5 (commit `db6297dd`). Auditoria independente do ZIP v1.0.5: NO-GO ao procedimento de ensaio (Y1–Y3); S4 e 0000 sem alteração |
| Gerado por | montador do repositório de desenvolvimento (mesmas fontes presas por sha256); o pacote não depende dele |
| Integridade | `sha256sum -c SHA256SUMS` dentro desta pasta |
| Regressão estática | `node verificacao/V01_regressao_estatica.mjs .` dentro desta pasta (só lê ficheiros; saída registada em `evidence/regressao-estatica.txt`) |

## O que NÃO muda

- **S4-00…S4-05: byte a byte iguais** à v1.0.5/v1.0.4/v1.0.3/v1.0.2 (os 6 sha256 estão presos no gerador e na V01).
- Todos os REVOKE e o acesso **só pelo servidor**; as APIs de servidor continuam a **não existir** (B3).
- **F1 `pg_get_userbyid(oid)`**: válido, não alterado.
- Quarentena, `ACCESS-MATRIX.md`, todas as P/Q, R30/R31/R32, B00–B02, T01, `ensaio/R40_sessao.psql`, `tools/R10_arranque_controlado.sh`, `tools/R20_verificar_processo.sh`, `tools/R41_processo_cliente.sh`, `tools/parse_check.mjs`, `operador/` e `entradas/0000/`: iguais à v1.0.5. Os scripts sem alteração mantêm o cabeçalho da versão em que mudaram pela última vez.
- **Entrada 0000 do staging: AUTENTICADA como input histórico, byte a byte igual à v1.0.5 e à v1.0.4.** Conferida antes de marcar AUTENTICADO: sha256 integral `a87578e5…aecd2`, blob Git `24c38a52`, 2303 bytes, 44 linhas, sem LF final. Cópia byte a byte em `entradas/0000/0000_staging_access_control.sql`; prova em `evidence/entrada-0000-check.txt`. Nada foi reconstruído a partir de texto. **Ressalva:** correspondência com a base de dados real do staging **não verificada**; contém 3 INSERTs sintéticos (B14 continua aberto por isso).

## O que muda (detalhe em `FINDINGS-RESOLUTION.md`, medido em `DIFF-v1.0.5.md`)

| Achado | Correção |
|---|---|
| **Y1** | `tools/R40_sessao.sh` já não envia o SIGTERM ao psql sem reconfirmar a identidade. O único `kill` do pacote fica em `sinaliza_se_mesmo`, que relê a identidade completa imediatamente antes. A referência do psql exige: início lido logo após o lançamento, executável do psql registado pelo R10, namespaces e cgroup do wrapper, pai = wrapper. Se o psql está vivo e a identidade não se confirma, nada é enviado, o trinco fica com o R90 e o R40 sai com **3**. Janela residual RR1/RR5 documentada |
| **Y2** | No `tools/R90_descartar.sh`, `DESCARTE=1` passa para **antes** da 1.ª alteração (assumir o trinco órfão). Antes dele o R90 só lê. Depois dele qualquer falha dá **3**, incluindo `rm`/`mkdir`/escrita do trinco e a escrita da linha final, que agora sai com o EXIT trap ainda ativo |
| **Y3** | Uma única sequência, igual no `MANIFEST.json` e nos documentos, e imposta pelos scripts: o R05 exige o R10 terminado, corre o R20, recusa sessões do R40 e grava `evidencia/R05.aprovado`; o R40 recusa qualquer passo sem esse registo |
| **Teste de regressão** | `verificacao/V01_regressao_estatica.mjs` ganha os detetores Y1-*, Y2-* e Y3-*. Cada um tem um controlo negativo com o texto defeituoso copiado da v1.0.5 auditada, mais variantes sintéticas marcadas como tal |

As correções X1–X3 da v1.0.5 mantêm-se e continuam conferidas pela V01 (X1-*, X2-*, X3-*).

**Sequência única:** `E1–E10 → R10 → R20 → R05 → R40 R30 → R40 B00 → R40 B01 → [R40 B01b] → R40 0000 → R40 B02 → R40 P00…P05 → R40 S4-00…S4-05 → R40 Q00…Q05 → R40 T01 → R90`

## Conteúdo

| Caminho | O quê |
|---|---|
| `sql/S4-00 … S4-05` | 6 migrações só-DDL (iguais) |
| `preflight/P00 … P05`, `posflight/Q00 … Q05` | Verificações só de leitura (só o P02 mudou) |
| `ensaio/R30`, `R31`, `R32` (`.sql`, gerados) | Verificações de sessão/instância, só de leitura, só no ensaio |
| `ensaio/R40_sessao.psql` | Guião de cada sessão (usado só pelo wrapper) |
| `ensaio/B00 … B02 *.bloqueado.sql`, `tests-db/T01…bloqueado.sql` | Bootstrap sintético e matriz comportamental — **bloqueados** (2 guardas) |
| `tools/R10 R20 R05 R40 R41 R90 *.sh`, `tools/lib_ensaio.sh` | Passos do ensaio — **não executados**; exigem `AUTORIZADO:<ref>` (o R41 lê-a do registo) |
| `entradas/0000/` | Entrada 0000: `ESPERADO` (**AUTENTICADO**), cópia histórica byte a byte e interface |
| `operador/E-EVIDENCIA.modelo` | Ficha das obrigações E1–E10 (modelo, tudo PENDENTE; formato artefacto\|sha256\|descrição) |
| `verificacao/V01_regressao_estatica.mjs`, `evidence/regressao-estatica.txt` | Teste de regressão estático reproduzível e a sua saída registada |
| `tools/parse_check.mjs`, `evidence/parse-check.txt`, `evidence/shell-check.txt`, `evidence/entrada-0000-check.txt` | Verificação estática (parser oficial do PostgreSQL 17; `sh/bash/dash -n`, `shellcheck`) |
| `quarantine/` | Igual — não executável |
| `REHEARSAL-TARGET.md`, `REHEARSAL-PLAN.md`, `FINDINGS-RESOLUTION.md`, `TEST-CRITERIA.md` | Atualizados para a v1.0.6 |
| `BOOTSTRAP-SINTETICO.md`, `EXECUTOR-PRIVILEGES.md` | Copiados da v1.0.5 (continuam válidos) |
| `OWNER-ACCOUNT.md`, `COLLISIONS.md`, `quarantine/README.md` | Copiados (continuam válidos) |
| `ACCESS-MATRIX.md`, `DIFF-v1.0.5.md`, `BLOCKERS.md`, `MANIFEST.json`, `SHA256SUMS` | Gerados |

## Sequência no staging (cada passo com a autorização indicada; nenhuma dada)

1. **Integridade**: `sha256sum -c SHA256SUMS` e `node verificacao/V01_regressao_estatica.mjs .` (0 falhas).
2. **Preflight só de leitura**: P00 → P04 `APROVADO` (P01/P02 "só como dono histórico"; o P02 diz INSTALADA ou NOVA); P05 `REGISTO VÁLIDO`.
3. **Executor efetivo** (externo, B2): obrigatório. **Pendente.**
4. **Entrada 0000** (B14): bytes originais incluídos e conferidos estaticamente; no ensaio o R05 reconfere-os, depois do R10 e do R20 e antes de qualquer R40. **Falta** a conferência só de leitura de que a base real do staging corresponde a esta 0000.
5. **Ensaio descartável** (autorização separada): `REHEARSAL-PLAN.md`, pela sequência única acima, com E1–E10 cumpridas. **Não feito; sem GO.**
6. **Instalação** (autorização separada): S4-00 → S4-05, um ficheiro por migração.
7. **Posflight só de leitura**: Q00 → Q05 com as impressões do P05. Qualquer erro ⇒ parar e reportar.

Os ficheiros `ensaio/`, `tools/R*`, `entradas/`, `operador/` e `tests-db/` **nunca** correm no staging nem na V1 (as guardas abortam lá). Não há ZIP desta versão (só depois de instrução posterior).
