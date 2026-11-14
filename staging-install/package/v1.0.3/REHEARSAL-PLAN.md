# Plano de ensaio — v1.0.3

**PLANO. NÃO AUTORIZADO. NÃO EXECUTADO.** Nenhum passo pode começar sem uma autorização **separada** do proprietário que cite este ficheiro e o sha256 do `MANIFEST.json`. Só numa instância PostgreSQL 17 **descartável**; nunca no AFONSO Staging, na V1 ou em produção. G1–G4 continuam NO-GO, aprove ou não o ensaio.

## Regra de paragem (vale para todas as fases)

Qualquer erro, `REPROVADO`, resultado inesperado, aviso que não esteja previsto ou dúvida ⇒ **ABORTAR**: correr `R90` (descartar a instância inteira), arquivar `<ROOT>/evidencia/` e reportar. **Nunca** corrigir à mão e continuar, nunca saltar uma fase, nunca reutilizar a instância. Um novo ensaio recomeça em E1 com um `<ROOT>` novo.

Todo o SQL corre com `psql -X -v ON_ERROR_STOP=1`, pelo socket provado, dentro do namespace isolado; cada ficheiro de migração numa transação própria (`psql -1`).

## Fases

| Fase | Passos | Papel / base | Critério para seguir |
|---|---|---|---|
| E | E1–E9 (operador, `REHEARSAL-TARGET.md` §1) | — | evidência de todas registada |
| A | `R10` → `R20` → `R40` (inclui `R41` e `R30`) | `ensaio_super` / `postgres` | `R20 APROVADO`, `R40 APROVADO` |
| B | `B00`; `B01`; `B01b` **só** na variante INSTALADA; 0000 do staging (sha256 integral conferido, B14); `B02` | ver `BOOTSTRAP-SINTETICO.md` | cada ficheiro sem erro; verificações internas dos B* |
| A' | `R20` outra vez | — | `R20 APROVADO` (mesmo PID, mesma configuração) |
| P | `P00` → `P04` → `P05` | `postgres` / `afonso_ensaio` | `APROVADO` (P01/P02: "aprovado só como dono histórico"); P05 `REGISTO VÁLIDO`, 7 impressões guardadas em `evidencia/` |
| S | `S4-00` → `S4-05`, um ficheiro por transação | `postgres` / `afonso_ensaio` | 0 erros |
| Q | `Q00` → `Q05` com os marcadores do P05, **na mesma ferramenta e sessão-tipo** do P05 | `postgres` / `afonso_ensaio` | todos `APROVADO` |
| A'' | `R20` outra vez | — | `R20 APROVADO` |
| T | `T01` (cópia com a 1.ª guarda retirada e `__R_NONCE_SHA256__` substituído), **separado**, numa sessão própria | `ensaio_super` / `afonso_ensaio` | M1–M7 OK e `ROLLBACK` final |
| Z | `R90` | — | `R90 DESCARTADO`; depois o operador destrói a máquina (E1) |

### Variantes de unaccent (R4)

O P02 classifica o estado em **INSTALADA** ou **NOVA**. Enquanto o P02 não correr no staging (só leitura), o estado de lá é **desconhecido** (B16): ensaiar **as duas** variantes em **duas instâncias descartáveis independentes** (com e sem `B01b`). Em NOVA, P02-12…14 aplicam-se e P02-10/11 dão `n.a.`; em INSTALADA, o contrário. O executor real do staging continua **PENDENTE** (B2): o ensaio avalia o `postgres` sintético.

### O que o ensaio, se aprovado, provaria — e o que não provaria

- Provaria: as 6 migrações aplicam-se sem erro sobre este bootstrap; P/Q dão o resultado esperado; a matriz T01 comporta-se como a `ACCESS-MATRIX.md`; o SQL não depende de nada fora do pacote além da 0000.
- **Não** provaria: o executor real do staging (B2), a leitura de `auth.identities` no staging (B11), a plataforma Supabase (B15, L1–L10), o isolamento do anfitrião (E1–E9 são do operador), nem segurança funcional das APIs (B3).

## Evidência a guardar (só sintética)

`evidencia/`: `sysid`, `postgres.sha256`, `psql.sha256`, `argumentos.*`, `R40.out`, `R41.pids`, saídas de cada fase, impressões do P05, `initdb.log`, `postgres.log`. Nunca valores de ambiente, nunca o nonce (só o sha256), nunca nada do staging ou da V1.
