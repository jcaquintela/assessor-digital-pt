# Critérios de teste — v1.0.4

**Nada foi executado.** Não correu SQL, base de dados (nem descartável), script de ensaio, guião psql nem o R05/R10/R20/R40/R41/R90. Tudo abaixo é estático.

## Já verificado (estático)

| Verificação | Onde | Critério |
|---|---|---|
| Migrações preservadas | `src/lib/staging/v104/package-v104.test.ts` | S4-00…S4-05 com os 6 sha256 auditados e iguais byte a byte à v1.0.3 (e à v1.0.2) |
| Só o P02 muda entre as P/Q | idem + `DIFF-v1.0.3.md` | Todas as outras P/Q, quarentena, `ACCESS-MATRIX.md` e documentos copiados iguais à v1.0.3; F1 intacto |
| P1/P2 | idem | P02-16 nova (dicionário: pertença, modelo, opções, dono), condicional INSTALADA; P02-14 sem `10::oid`, superutilizador de arranque lido do catálogo; veredito "só como dono histórico" |
| V1 | idem | Nenhuma fonte de passo tem marcadores fora dos declarados; a cópia simulada de cada passo (mesmas regras do wrapper) não deixa nenhum `__…__`; R30 com as 17 verificações da v1.0.3 |
| V2 | idem | A linha `\set r41` do guião só tem texto literal (sem `:`, aspas nem variáveis); caminhos validados; R41 sem argumento de autorização |
| V3 | idem | Guiões `.psql` sem `::int`; decisões por `\if`; falhas por `RAISE EXCEPTION`; R31/R32 sem conversões constantes para int |
| V4 | idem + `evidence/shell-check.txt` | Sem pipelines nas verificações; `grep` só dentro de `procura`; `fail` no stderr; `shellcheck` sem avisos de severidade `warning` ou superior |
| V5 | idem | R20/R41/R90 decidem pela identidade estável (`identidade.postmaster`), nunca pela `cmdline` |
| V6/V7 | idem | R90 com marca, fases, `trap`, `cgroup.kill`, código 3 INCERTEZA, sem `kill -KILL`; R10 regista marca e unidade antes de qualquer processo |
| S1/S2 | idem | Tabela de passos do `R40_sessao.sh` = `SESSION_STEPS`; ordem; guião R41→R31→[R32]→passo→R31→PID; cópias registadas e reconferidas |
| B1/B2 | idem + parser | 1.ª instrução = guarda `BLOQUEADO`, 2.ª = guarda `SÓ DESCARTÁVEL` com superutilizador, papel, base, sem TCP, `data_directory`, sysid, nonce; B01/B02 com provider/email/sub; corpo T01 (M1–M7) = v1.0.2 |
| E1–E10 | idem | 10 obrigações no documento, no modelo da ficha e no R10 |
| 0000 | idem | `entradas/0000/ESPERADO` diz AUTENTICADO; a cópia no pacote tem sha256 integral, blob Git, 2303 bytes, 44 linhas e nenhum LF final iguais aos registados; md5 do corpo de `has_role`/`has_staging_access` e das 3 notas iguais às constantes do P03/Q04; o R05 reconfere a cópia contra o `SHA256SUMS` |
| Sintaxe SQL | `evidence/parse-check.txt` | Parser oficial do PostgreSQL 17 (libpg-query 17.8.3): 0 falhas |
| Sintaxe shell | `evidence/shell-check.txt` | `sh -n`, `bash -n`, `dash -n`; `shellcheck` |
| Integridade | idem | `SHA256SUMS` cobre todos os ficheiros e confere; `MANIFEST.json` com os mesmos hashes; v1.0.1, v1.0.2 e v1.0.3 continuam byte a byte iguais |
| Sem dados reais | idem | Só emails `@afonso-staging.invalid`; nenhum telefone, UUID (exceto o id do projeto staging), endereço ou referência de produção nos ficheiros novos |

## NÃO incluído (dito explicitamente)

- **Nenhum teste com base de dados** (nem descartável): S4, P/Q, R30/R31/R32, bootstrap, T01.
- **Nenhum script nem guião psql executado.** O comportamento real não foi observado em:
  - `\gset`, `\if`, `\g (…)` e da expansão dos acentos graves no psql 17;
  - `/proc/<pid>/stat`, `cgroup.procs` e `cgroup.kill`;
  - `sha256sum --strict`, `mktemp` e `stat -L` na máquina do ensaio.
- **Isolamento**: nenhuma prova; os scripts sozinhos **não** o provam (E1–E10 são do operador).
- **Executor real do staging**, leitura de `auth.identities` no staging, estado de `unaccent` no staging: nada lido.
- **Entrada 0000**: AUTENTICADA só como ficheiro do repositório do staging; a correspondência com a base de dados real do staging **não** foi verificada; nenhum bootstrap alternativo.
- Formato exato de `pg_ts_dict.dictinitoption` e de `postmaster.opts` nesta versão do PostgreSQL: só documentado. Uma diferença dá REPROVADO (falso negativo), nunca APROVADO.
- APIs de servidor, Storage, Realtime, GoTrue: não existem / não cobertos.

## Limites das impressões (P05 → Q03/Q04)

Iguais à v1.0.3 (as consultas não mudaram):

- cobrem só o que está listado;
- são sha256 de texto deparsado, por isso P05 e Q03/Q04 têm de correr na mesma sessão-tipo. O wrapper garante isso: mesmo papel `postgres` e mesma base, com psql `-X`;
- detetam mudança, não correção;
- `md5` só contra constantes da 0000;
- sem leitura de `auth.identities` dão erro (B11).

Na v1.0.4 as 7 impressões são extraídas pelo wrapper e não copiadas à mão. Se não forem exatamente 7 (B01…B07) com sha256 válido e `REGISTO VÁLIDO`: REPROVADO.

## Por verificar (exige autorização separada; nenhuma dada)

Ver `REHEARSAL-PLAN.md`. O ensaio continua **sem GO**: hoje o R10 recusa (B13: sem ficha E1–E10).
