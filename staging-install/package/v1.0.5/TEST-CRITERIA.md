# Critérios de teste — v1.0.5

**Nada foi executado.** Não correu SQL, base de dados (nem descartável), script de ensaio, guião psql nem o R05/R10/R20/R40/R41/R90. Tudo abaixo é estático e **está no pacote**: quem audita reproduz cada resultado só com esta pasta.

## Reproduzir (só leitura)

| Verificação | Comando, dentro desta pasta | Registo guardado |
|---|---|---|
| Integridade | `sha256sum -c SHA256SUMS` | — |
| Regressão estática (X1, X2, X3, ficha, trinco, campos-token, S4, 0000, documentos) | `node verificacao/V01_regressao_estatica.mjs .` | `evidence/regressao-estatica.txt` (RESULTADO: 0 falhas) |
| Sintaxe SQL | `bun tools/parse_check.mjs .` numa pasta com `libpg-query@17` | `evidence/parse-check.txt` (igual à v1.0.4: o SQL não mudou) |
| Sintaxe e análise de shell | `sh -n`, `bash -n`, `dash -n` e `shellcheck -s sh -x -P SCRIPTDIR -S style tools/*.sh` (a partir de `tools/`) | `evidence/shell-check.txt` |
| Entrada 0000 | ver `entradas/0000/README.md` | `evidence/entrada-0000-check.txt` (igual à v1.0.4) |

A V01 só lê ficheiros; se houver `sh`, corre `sh -n` (análise de sintaxe, nada é executado). Termina com código 0 só com 0 falhas.

## O que a V01 confere

| Id | Critério |
|---|---|
| A1, A2 | Todos os ficheiros do `SHA256SUMS` conferem; nenhum ficheiro fora dele |
| B1–B4 | S4-00…S4-05 com os 6 sha256 auditados; exatamente 6 migrações; entrada 0000 com sha256, blob Git, 2303 bytes, 44 linhas, sem LF final; `ESPERADO` = AUTENTICADO |
| X1-0 | **Controlo negativo:** o detetor reprova o ciclo defeituoso da v1.0.4 (uma linha e várias linhas) |
| X1-1, X1-2 | Nenhum ciclo `done … \|\|` termina numa lista `&&`, em nenhum script; HOME contada, exatamente 1 e igual à pasta do ensaio |
| X2-1…X2-6 | Montagem cgroup v2 única com raiz `/` e sem v1; `populated_de` por `cgroup.events`; `sem_descendentes_ou_falha` por `cgroup.stat`; R10, R20 (antes e depois) e R90 usam-nos; o R90 não decide por `cgroup.procs` |
| X3-0 | **Controlo negativo:** o detetor encontra o `kill` direto da v1.0.4 |
| X3-1…X3-7 | Só dois `kill` no pacote (`sinaliza_se_mesmo` e o psql filho do R40); identidade relida e comparada antes de cada sinal; R90: EXIT trap e `CODIGO_FALHA=3` dão 3 a partir de `DESCARTE=1`; trap do R10 com identidade completa e código 3 em dúvida |
| F1, F2 | Modelo da ficha no formato novo; o R10 exige artefacto com sha256 que confere, descrição ≥ 30 caracteres e ≥ 5 palavras, sem repetições, 10 artefactos |
| T1, T2 | Trinco em R05, R10, R40; não em R20/R41; R90 recusa dono vivo e assume órfãos |
| K1–K4 | 25 passos pela ordem do `ORDEM`; cada linha com 7 campos válidos, igual ao `MANIFEST.json`; cada token cobre um campo da fonte e nenhum campo fica sem token; o R40 valida tudo isto antes de copiar |
| D1 | `README.md`, `TEST-CRITERIA.md` e `FINDINGS-RESOLUTION.md` não citam como prova nada que esteja fora do pacote |
| S0, S1 | `sh -n` em todos os scripts |

## NÃO incluído (dito explicitamente)

- **Nenhum teste com base de dados** (nem descartável): S4, P/Q, R30/R31/R32, bootstrap, T01.
- **Nenhum script nem guião psql executado.** O comportamento real não foi observado em:
  - `\gset`, `\if`, `\g (…)` no psql 17;
  - `/proc/<pid>/stat`, `cgroup.events`, `cgroup.stat`, `cgroup.procs`, `cgroup.kill`;
  - o EXIT trap e o `exit` dentro dele em `dash`/`bash`; o trinco em concorrência real;
  - `sha256sum --strict`, `mktemp`, `stat -L`, `readlink -f`, `date -u` na máquina do ensaio.
- A V01 confere **estrutura** (padrões e chamadas no código), não comportamento. Um erro de lógica que mantenha a estrutura não é apanhado.
- **Isolamento**: nenhuma prova; os scripts sozinhos **não** o provam (E1–E10 são do operador).
- **Executor real do staging**, leitura de `auth.identities` no staging, estado de `unaccent` no staging: nada lido.
- **Entrada 0000**: AUTENTICADA só como ficheiro do repositório do staging; correspondência com a base real **não** verificada.
- O repositório de desenvolvimento tem testes próprios do montador; estão fora do pacote e **não** são apresentados aqui como prova.

## Por verificar (exige autorização separada; nenhuma dada)

Ver `REHEARSAL-PLAN.md`. O ensaio continua **sem GO**: hoje o R10 recusa (B13: sem ficha E1–E10).
