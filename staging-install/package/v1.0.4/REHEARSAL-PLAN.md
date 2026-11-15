# Plano de ensaio — v1.0.4

**PLANO. NÃO AUTORIZADO. NÃO EXECUTADO. SEM GO.** Nenhum passo pode começar sem uma autorização **separada** do proprietário que cite este ficheiro e o sha256 do `MANIFEST.json`. Só numa instância PostgreSQL 17 **descartável**; nunca no AFONSO Staging, na V1 ou em produção. G1–G4 continuam NO-GO, aprove ou não o ensaio. **Hoje o R10 recusa arrancar** porque não há ficha E1–E10 preenchida (B13). A entrada 0000 está AUTENTICADA como input histórico, mas a correspondência com a base real do staging não foi verificada (B14).

## 1. Regra de paragem (vale para todas as fases)

Qualquer erro, `REPROVADO`, resultado inesperado, aviso que não esteja previsto, interrupção ou dúvida ⇒ **ABORTAR**:

1. Correr o `R90` **fora** da unidade do servidor.
2. Se der `R90 DESCARTADO`: arquivar `<ROOT>/evidencia/` e destruir a máquina (E1).
3. Se der `R90 INCERTEZA` (código 3) ou não terminar: **destruir a máquina** sem reutilizar nada.

**Nunca** corrigir à mão e continuar, nunca repetir nem saltar um passo, nunca reutilizar a instância: o R40 recusa um passo já tentado. Um novo ensaio recomeça em E1 com uma máquina e um `<ROOT>` novos.

## 2. Wrapper único de sessão (S1, S2)

Todo o SQL passa por `tools/R40_sessao.sh AUTORIZADO:<ref> <ROOT> <PASSO>`. Não há outra forma prevista de abrir uma sessão. Cada chamada:

1. Confere o pacote inteiro (`SHA256SUMS`, nenhum ficheiro a mais) e a **ordem**: o passo anterior tem de estar `APROVADO` e este nunca ter sido tentado. A pasta da sessão nasce logo, para nada se poder repetir.
2. Corre o **R20 completo** e verifica o próprio wrapper: ambiente, HOME, rede, mesmo namespace de rede e de PIDs do servidor, fora da unidade.
3. Faz **cópias determinísticas** em `evidencia/sessoes/<PASSO>/` (S2). Cada cópia depende só dos bytes da fonte e dos valores registados, sem datas. Regras:
   - fonte conferida contra o `SHA256SUMS` ou, no passo 0000, contra o registo do R05;
   - só os marcadores declarados para o passo, com valores validados por formato;
   - desbloqueio = remover **exatamente** a linha de guarda `BLOQUEADO`, que tem de ser a 1.ª instrução;
   - **nenhum** marcador `__…__` pode restar;
   - sha256 da fonte e da cópia em `evidencia/copias.sha256`, reconferidos antes de ligar.
4. Abre o `psql -X` com a **base** e o **papel** do passo, só pelo socket provado. Dentro da sessão, pelo guião `R40_sessao.psql`:
   - **R41**, fora do SQL, prova o processo da sessão e o psql;
   - **R31** confere base, papel, sem `SET ROLE`, superutilizador sim/não, socket local, porta, arranque e exclusividade;
   - **R32** só se for o superutilizador: PGDATA, sysid, nonce e socket;
   - depois o **ficheiro do passo**, de novo o **R31**, e por fim confirma que o PID da sessão não mudou.
   Cada decisão é um `\if` sobre um booleano de `\gset`, e uma falha é `RAISE EXCEPTION`, que dá um código diferente de zero (V3).
5. Aprova só com código 0 do psql **e** as linhas exatas `R41 APROVADO`, `MESMA SESSÃO` e `R40 SESSÃO APROVADA <PASSO>` (a última linha). No P05, extrai as 7 impressões (B01…B07) para os marcadores do Q03/Q04, sem edição à mão.

| Passo | Ficheiro | Base / papel | Transação | Marcadores |
|---|---|---|---|---|
| R30 | `ensaio/R30_sessao_alvo.sql` | `postgres` / `ensaio_super` (super) | não | instância |
| B00 | `ensaio/B00…bloqueado.sql` | `postgres` / `ensaio_super` | não (CREATE DATABASE) | instância |
| B01 | `ensaio/B01…bloqueado.sql` | `afonso_ensaio` / `ensaio_super` | sim | instância |
| B01b | `ensaio/B01b…bloqueado.sql` (**só** variante INSTALADA) | `afonso_ensaio` / `ensaio_super` | sim | instância |
| 0000 | `evidencia/entradas/0000.sql` (do R05, a partir de `entradas/0000/0000_staging_access_control.sql`) | `afonso_ensaio` / `postgres` | sim | — |
| B02 | `ensaio/B02…bloqueado.sql` | `afonso_ensaio` / `ensaio_super` | sim | instância |
| P00–P05 | `preflight/` | `afonso_ensaio` / `postgres` | sim | P04, P05: email sintético |
| S4-00…S4-05 | `sql/` (iguais byte a byte) | `afonso_ensaio` / `postgres` | sim, um ficheiro por transação | — |
| Q00–Q05 | `posflight/` | `afonso_ensaio` / `postgres` | sim | Q03: email + B01–B03 do P05; Q04: B04–B07 |
| T01 | `tests-db/T01…bloqueado.sql` | `afonso_ensaio` / `ensaio_super` | não (BEGIN…ROLLBACK próprio) | instância |

## 3. Fases

| Fase | Passos | Critério para seguir |
|---|---|---|
| E | E1–E10 cumpridas; ficha preenchida (`REHEARSAL-TARGET.md` §1) | ficha completa; sem ela o R10 recusa |
| 0 | `R05` com o ficheiro 0000 aceite pelo `ESPERADO` desta versão | `R05 APROVADO` (estado AUTENTICADO; nunca executado) |
| A | `R10` (dentro da unidade) → `R20` | `R10 PRONTO`, `R20 APROVADO` |
| B | `R40 R30` → `R40 B00` → `R40 B01` → [`R40 B01b`] → `R40 0000` → `R40 B02` | cada `R40 <passo> APROVADO` |
| P | `R40 P00` … `R40 P05` | idem; P05 grava `sessoes/P05/impressoes` |
| S | `R40 S4-00` … `R40 S4-05` | idem |
| Q | `R40 Q00` … `R40 Q05` | idem |
| T | `R40 T01` (separado, último; M1–M7 e `ROLLBACK` final) | idem |
| Z | `R90` (fora da unidade) e destruição da máquina (E1) | `R90 DESCARTADO`; `INCERTEZA` ⇒ destruir na mesma |

Ordem do R05: corre depois do R10, porque precisa de `<ROOT>/evidencia`, e antes do passo 0000. O R10 já recusa se o `ESPERADO` não estiver num estado aceite.

### Variantes de unaccent (R4)

O estado no staging é **desconhecido** (B16). Ensaiar **as duas** variantes em **duas máquinas descartáveis independentes**: R10 com `INSTALADA` (corre o B01b) e R10 com `NOVA` (o R40 recusa o B01b). O executor real do staging continua **PENDENTE** (B2).

### O que o ensaio, se um dia for autorizado e aprovado, provaria — e o que não provaria

- Provaria que as 6 migrações se aplicam sem erro sobre este bootstrap, que P/Q dão o resultado esperado, que o T01 se comporta como a `ACCESS-MATRIX.md` e que os scripts funcionam no `/proc` real.
- **Não** provaria:
  - o executor real (B2);
  - a leitura de `auth.identities` no staging (B11);
  - a plataforma Supabase (B15);
  - o isolamento do anfitrião (E1–E10 são do operador);
  - a segurança funcional das APIs (B3).

## 4. Evidência a guardar (só sintética)

Tudo fica em `evidencia/`:

- `identidade.postmaster`, `cgroup`, `sysid`, `postgres.*`, `psql.*`, `nonce.sha256` (só o sha256, nunca o nonce), `postmaster.inicio`;
- `E-evidencia` e o seu sha256;
- `argumentos.*` (só como evidência);
- `copias.sha256`;
- `sessoes/<PASSO>/` (cópias, saída, erros, `R41.pids`, `APROVADO`);
- `initdb.log`, `postgres.log`, `R20.antes-*.err`.

Nunca valores de ambiente, nunca nada do staging ou da V1.
