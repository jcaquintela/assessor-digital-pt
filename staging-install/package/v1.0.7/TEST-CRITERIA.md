# Critérios de teste — v1.0.7

**Nada foi executado.** Não correu SQL, base de dados (nem descartável), script de ensaio, guião psql nem o R10/R20/R05/R40/R41/R90. Tudo abaixo é estático e **está no pacote**: quem audita reproduz cada resultado só com esta pasta.

## Reproduzir (só leitura)

| Verificação | Comando, dentro desta pasta | Registo guardado |
|---|---|---|
| Integridade | `sha256sum -c SHA256SUMS` | — |
| Regressão estática (Z1, Z2, Y1, Y2, Y3, X1, X2, X3, ficha, trinco, campos-token, S4, 0000, documentos) | `node verificacao/V01_regressao_estatica.mjs .` | `evidence/regressao-estatica.txt` (RESULTADO: 0 falhas) |
| Sintaxe SQL | `bun tools/parse_check.mjs .` numa pasta com `libpg-query@17` | `evidence/parse-check.txt` (igual à v1.0.6: o SQL não mudou) |
| Sintaxe e análise de shell | `sh -n`, `bash -n`, `dash -n` e `shellcheck -s sh -x -P SCRIPTDIR -S style tools/*.sh` (a partir de `tools/`) | `evidence/shell-check.txt` |
| Entrada 0000 | ver `entradas/0000/README.md` | `evidence/entrada-0000-check.txt` (igual à v1.0.6) |

A V01 só lê ficheiros; se houver `sh`, corre `sh -n` (análise de sintaxe, nada é executado). Termina com código 0 só com 0 falhas.

**Sequência única:** `E1–E10 → R10 → R20 → R05 → R40 R30 → R40 B00 → R40 B01 → [R40 B01b] → R40 0000 → R40 B02 → R40 P00…P05 → R40 S4-00…S4-05 → R40 Q00…Q05 → R40 T01 → R90` (a V01 confere-a no `MANIFEST.json`, nos documentos e nos scripts: Y3-*).

## O que a V01 confere

| Id | Critério |
|---|---|
| A1, A2 | Todos os ficheiros do `SHA256SUMS` conferem; nenhum ficheiro fora dele |
| B1–B4 | S4-00…S4-05 com os 6 sha256 auditados; exatamente 6 migrações; entrada 0000 com sha256, blob Git, 2303 bytes, 44 linhas, sem LF final; `ESPERADO` = AUTENTICADO |
| X1-0 | **Controlo negativo:** o detetor reprova o ciclo defeituoso da v1.0.4 (uma linha e várias linhas) |
| X1-1, X1-2 | Nenhum ciclo `done … \|\|` termina numa lista `&&`, em nenhum script; HOME contada, exatamente 1 e igual à pasta do ensaio |
| X2-1…X2-6 | Montagem cgroup v2 única com raiz `/` e sem v1; `populated_de` por `cgroup.events`; `sem_descendentes_ou_falha` por `cgroup.stat`; R10, R20 (antes e depois) e R90 usam-nos; o R90 não decide por `cgroup.procs` |
| X3-0 | **Controlo negativo:** o detetor encontra o `kill` direto da v1.0.4 |
| X3-1…X3-7 | Só **um** `kill` no pacote (o de `sinaliza_se_mesmo`); identidade relida e comparada antes de cada sinal; R90: EXIT trap e `CODIGO_FALHA=3` dão 3 a partir de `DESCARTE=1`, e o trap só sai depois da linha final; trap do R10 com identidade completa e código 3 em dúvida |
| Y1-0 | **Controlo negativo:** o detetor reprova o `kill -TERM "$CPID"` direto do R40 da v1.0.5 (linha 112) |
| Y1-1…Y1-5 | Nenhum `kill` fora de `sinaliza_se_mesmo`, em nenhum script. `cliente_termina` do R40 aceita a referência só com início do lançamento, executável do psql do R10, namespaces, cgroup e pai = wrapper, e sinaliza só por `sinaliza_se_mesmo`. Vivo e não confirmado ⇒ 3, sem libertar o trinco. EXIT trap antes do trinco; sinais só marcam e saem. Início do psql lido logo após o lançamento; `terminou` só lê `/proc` |
| Y2-0 | **Controlo negativo:** o detetor reprova as linhas 60-68 da v1.0.5 (`rm` do trinco órfão e `trinco_adquire` antes de `DESCARTE=1`) e o fim da v1.0.5 (trap retirado antes da linha final); variante sintética com `exit 2` depois do início |
| Y2-1…Y2-4 | R90: nenhuma alteração antes de `DESCARTE=1`/`CODIGO_FALHA=3`; a assunção do órfão (`trinco_assume_orfao`) e a aquisição do trinco vêm depois. **Todos os caminhos** depois do início dão 3: cada `incerteza`, cada `fail` (`CODIGO_FALHA=3`), cada `exit` (só `exit 3`), e cada função da biblioteca usada (só sai com 2 ou 3; o EXIT trap converte ≠ 0 em 3). A linha final é escrita com o trap ativo |
| Y3-0 | **Controlo negativo:** o detetor reprova a tabela de fases da v1.0.5 (linhas 57-58: fase do R05 antes da do R10); variantes sintéticas de frase e seta contrárias; aceita a frase correta |
| Y3-1…Y3-4 | Nenhuma seta nem "antes/depois" contrária à ordem única em nenhum documento `.md`. Tabelas de fases e de passos por ordem. Sequência do `MANIFEST.json` escrita igual em 4 documentos. Scripts impõem-na: R05 exige a fase `pronto`, corre o R20, recusa sessões do R40 e grava `R05.aprovado`; R40 recusa sem ele |
| F1, F2 | Modelo da ficha no formato novo; o R10 exige artefacto com sha256 que confere, descrição ≥ 30 caracteres e ≥ 5 palavras, sem repetições, 10 artefactos |
| T1, T2 | Trinco em R10, R05, R40 e R90; R20/R41 não lhe tocam. O R90 decide pelo estado em três valores e assume só TERMINADO; `trinco_vivo` (dois valores) já não existe |
| Z1-0 | **Controlo negativo:** o detetor reprova o texto da v1.0.6 copiado byte a byte — `R90:61-75` (`rm -rf` do `.trinco` depois do juízo), `R90:160-161` (`rm` do próprio trinco), `lib:302-308` (`rm`/`rmdir` no caminho partilhado) — e as libertações ignoradas do R05 (EXIT trap) e do R10 (`falhou`) |
| Z1-1…Z1-7 | Nenhum `rm`/`rmdir` no caminho partilhado do trinco, em nenhum script. `mv -T` só nas três funções do protocolo. `trinco_assume_orfao`: juízo TERMINADO com o dono igual antes/depois, depois rename para nome privado, depois mesmo dispositivo:inode, mesmo dono (nonce) e de novo TERMINADO, depois só então apaga a cópia; nenhuma falha apaga. `trinco_liberta`: `trinco_e_meu`, depois rename, depois `trinco_e_meu`, depois apagar a cópia; nunca `fail`/`exit`. `trinco_adquire`: nonce, arranque, início e namespace antes do `mkdir`; dono por rename. R90: juízo antes de `DESCARTE=1`, assunção e `mkdir` depois, restos `.trinco.*` ⇒ 3, libertação antes da linha final. R10, R05, R40: nenhuma libertação ignorada, falha ⇒ 3, a linha `PRONTO`/`APROVADO` só sai depois de libertar |
| Z2-0 | **Controlo negativo:** o detetor reprova o `trinco_vivo` da v1.0.6 (`lib:309-318`: dois valores, leitura falhada ⇒ "não vivo") e uma variante **sintética** de três estados em que uma leitura falhada dá TERMINADO |
| Z2-1…Z2-3 | `trinco_estado`: três estados; toda a falha de leitura ou alternativa ⇒ INDETERMINADO; TERMINADO só nas três provas (PID ausente, PID com outro início, dono em Z/X), depois de confirmar dono completo, mesmo namespace de PIDs, mesmo arranque e `/proc` legível; por omissão INDETERMINADO. R90: VIVO ⇒ 2; INDETERMINADO ⇒ 3 antes de alterar e sem remover; só TERMINADO segue. Só o R90 julga e assume trincos |
| K1–K4 | 25 passos pela ordem do `ORDEM`; cada linha com 7 campos válidos, igual ao `MANIFEST.json`; cada token cobre um campo da fonte e nenhum campo fica sem token; o R40 valida tudo isto antes de copiar |
| D1 | `README.md`, `TEST-CRITERIA.md` e `FINDINGS-RESOLUTION.md` não citam como prova nada que esteja fora do pacote |
| S0, S1 | `sh -n` em todos os scripts |

## NÃO incluído (dito explicitamente)

- **Nenhum teste com base de dados** (nem descartável): S4, P/Q, R30/R31/R32, bootstrap, T01.
- **Nenhum script nem guião psql executado.** O comportamento real não foi observado em:
  - `\gset`, `\if`, `\g (…)` no psql 17;
  - `/proc/<pid>/stat`, `cgroup.events`, `cgroup.stat`, `cgroup.procs`, `cgroup.kill`;
  - o EXIT trap e o `exit` dentro dele em `dash`/`bash`; o trinco em concorrência real (`mkdir`/`rename` concorrentes, `mv -T`, `boot_id`, `uuid`; RR6, RR7); a recolha do psql pelo shell (RR1/RR5);
  - `sha256sum --strict`, `mktemp`, `stat -L`, `readlink -f`, `date -u` na máquina do ensaio.
- A V01 confere **estrutura** (padrões e chamadas no código), não comportamento. Um erro de lógica que mantenha a estrutura não é apanhado.
- **Isolamento**: nenhuma prova; os scripts sozinhos **não** o provam (E1–E10 são do operador).
- **Executor real do staging**, leitura de `auth.identities` no staging, estado de `unaccent` no staging: nada lido.
- **Entrada 0000**: AUTENTICADA só como ficheiro do repositório do staging; correspondência com a base real **não** verificada.
- O repositório de desenvolvimento tem testes próprios do montador; estão fora do pacote e **não** são apresentados aqui como prova.

## Por verificar (exige autorização separada; nenhuma dada)

Ver `REHEARSAL-PLAN.md`. O ensaio continua **sem GO**: hoje o R10 recusa (B13: sem ficha E1–E10).
