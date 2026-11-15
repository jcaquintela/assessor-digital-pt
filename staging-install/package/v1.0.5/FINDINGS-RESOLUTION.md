# Auditoria independente da v1.0.4 → correção na v1.0.5 → prova

A auditoria independente da v1.0.4 deu NO-GO **ao procedimento de ensaio** (X1–X3, mais quatro reforços). A v1.0.5 corrige só o procedimento: **S4-00…S4-05 e a entrada 0000 autenticada estão byte a byte iguais** à v1.0.4.

- "Prova estática" = `verificacao/V01_regressao_estatica.mjs` (no pacote; saída em `evidence/regressao-estatica.txt`) e `evidence/shell-check.txt`. Os ids entre parênteses são as linhas da V01.
- **Nada foi executado.** Nenhuma correção abaixo foi observada a funcionar.

| # | Achado | Causa | Correção (v1.0.5) | Prova estática | Estado |
|---|---|---|---|---|---|
| X1 | `lib_ensaio.sh:145`: o ciclo de HOME devolvia erro quando a última linha do ambiente não era HOME, e o R20/R40 reprovavam sempre | o estado de um ciclo é o do último comando do corpo; `[ … ] && _achou=sim` devolve 1 quando o teste falha, e o `\|\| fail` apanhava-o | Corpo com `case` e `if … then … fi` (código 0); conta as definições `HOME`, exige **exatamente uma**, igual à pasta do ensaio; lê a última linha mesmo sem LF. Regra para todo o pacote: nenhum ciclo `done … \|\|` termina numa lista `&&` (o R10 e o R20 foram ajustados no mesmo sentido) | X1-0 (controlo negativo), X1-1, X1-2 | Corrigido, **não executado** |
| X2 (ALTA) | R90:66-79, R10:49-51, R20:68-80: `cgroup.procs` não cobre processos em subcgroups descendentes | `cgroup.procs` lista só os processos do próprio cgroup | `cgroup2_ou_falha`: uma montagem `cgroup2` em `/sys/fs/cgroup`, raiz `/`, nenhuma v1. R10 e R20: `sem_descendentes_ou_falha` (`cgroup.stat` `nr_descendants 0` e nenhuma subpasta; no R20 antes **e** depois de ler `cgroup.procs`) e `populated 1`. R90: "vazia" só por `cgroup.events` `populated 0` (cobre os descendentes); `cgroup.kill` mata a subárvore; leitura impossível com a unidade presente ⇒ INCERTEZA. E10 exige a montagem e a unidade sem subcgroups | X2-1…X2-6 | Corrigido, **não executado** |
| X3 | R90:55-62 e trap do R10: a identidade não era relida imediatamente antes dos sinais (o SIGQUIT saía sem nova verificação; o trap só via executável e cwd); falhas depois de o descarte começar podiam sair com 2 | verificação feita uma vez, longe do `kill`; `fail` comum com código 2 | `sinaliza_se_mesmo` relê a identidade **completa** (pid, início, executável, dispositivo:inode, cwd, namespaces, cgroup) e compara byte a byte **imediatamente antes de cada** sinal. Trap do R10: identidade registada ou provisória (início lido logo após o arranque, pai = R10, executável, cwd, cgroup); qualquer dúvida com o processo vivo ⇒ nada enviado e **código 3**. R90: a partir de `DESCARTE=1`, `CODIGO_FALHA=3` faz `fail` sair com 3 e o EXIT trap converte qualquer saída ≠ 0 em 3. Corrida residual RR1 documentada | X3-0 (controlo negativo), X3-1…X3-7 | Corrigido, **não executado**; RR1 residual |
| F-E | A ficha E1–E10 aceitava oito caracteres quaisquer | só comprimento e palavras proibidas | `En = artefacto\|sha256\|descrição`; artefacto na pasta da ficha (fora do pacote e de `<ROOT>`), ≥ 64 bytes, sem ligações simbólicas, com sha256 que confere; descrição ≥ 30 caracteres e ≥ 5 palavras, sem marcadores de "por fazer"; nada repetido entre obrigações; data válida e não futura; artefactos copiados para `evidencia/E-artefactos/` | F1, F2 | Corrigido, **não executado**; continua a ser só forma (B13) |
| F-T | Sem trinco global | — | `<ROOT>/.trinco` (mkdir atómico, dono PID + início): R05, R10 e R40 seguram-no; R20 e R41 só leem; o R90 recusa se o dono ainda corre, assume órfãos e liberta-o no fim | T1, T2 | Corrigido, **não executado**; RR3 residual |
| F-K | Campos-token da tabela de passos sem cobertura | um nome mal escrito era ignorado em silêncio | O R40 exige 7 campos e valida cada um; nomes-token só da lista, sem repetidos; cada token tem de cobrir ≥ 1 campo `__…__` da fonte; a V01 confere tabela, `ORDEM`, `MANIFEST.json` e fontes | K1…K4 | Corrigido, **não executado** |
| F-R | Alegações de testes que não estão no pacote | a prova da v1.0.4 apontava para testes do repositório de desenvolvimento | V01 incluída no pacote, com controlos negativos e saída registada; os documentos só citam o que está no pacote | D1 e a própria V01 | Corrigido |

## Riscos residuais (assumidos, não elimináveis por scripts sh)

| Id | Risco | Cobertura |
|---|---|---|
| RR1 | Entre a releitura da identidade e o `kill(2)` o processo pode terminar e o PID ser reutilizado; em `sh` não há `pidfd` | Janela mínima; E1 (destruir a máquina) |
| RR2 | Um subcgroup criado entre as duas verificações do R20 só é visto no R20 seguinte | O R90 decide por `populated`, que cobre os descendentes |
| RR3 | O trinco é cooperativo; um trinco sem dono registado é tratado como órfão pelo R90 | Só os scripts do pacote correm em `<ROOT>` (E8/E9) |
| RR4 | A ficha prova forma e integridade dos artefactos, não a verdade | B13: responsabilidade do operador |

O ensaio continua **sem GO**; G1–G4 continuam NO-GO.
