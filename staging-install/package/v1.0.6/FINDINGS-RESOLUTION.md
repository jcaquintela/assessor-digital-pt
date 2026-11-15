# Auditoria independente do ZIP v1.0.5 → correção na v1.0.6 → prova

A auditoria independente do ZIP v1.0.5 deu NO-GO **ao procedimento de ensaio** (três bloqueios: Y1, Y2, Y3). A v1.0.6 corrige só o procedimento: **S4-00…S4-05 e a entrada 0000 autenticada estão byte a byte iguais** à v1.0.5.

- "Prova estática" = `verificacao/V01_regressao_estatica.mjs` (no pacote; saída em `evidence/regressao-estatica.txt`) e `evidence/shell-check.txt`. Os ids entre parênteses são as linhas da V01.
- Cada bloqueio tem um **controlo negativo**: o texto defeituoso da v1.0.5 está embutido na V01 e o detetor tem de o reprovar. As variantes sintéticas estão marcadas como tal na V01.
- **Nada foi executado.** Nenhuma correção abaixo foi observada a funcionar.

| # | Achado | Causa | Correção (v1.0.6) | Prova estática | Estado |
|---|---|---|---|---|---|
| Y1 | `tools/R40_sessao.sh:112`: em interrupção, o wrapper enviava SIGTERM ao cliente psql sem reconfirmar a identidade imediatamente antes | `kill -TERM "$CPID"` direto, só pelo número do PID | O único `kill` do pacote fica em `sinaliza_se_mesmo` (lib). Novo `cliente_termina` no EXIT trap do R40. A referência é a identidade lida no momento, aceite só com: início lido logo após o lançamento, executável = psql registado pelo R10 (dispositivo:inode, reconferido antes do lançamento), namespaces de rede/PIDs do servidor, cgroup do wrapper e pai = wrapper. `sinaliza_se_mesmo` relê-a e compara-a byte a byte antes do `kill`. Processo terminado ou zombie: nada a fazer (`terminou`). Vivo e não confirmado: **nada enviado**, trinco não libertado e **código 3** (R40 INCERTEZA). Os sinais INT/TERM/HUP só marcam e saem; decide o EXIT trap | Y1-0 (controlo negativo), Y1-1…Y1-5, X3-1 | Corrigido, **não executado**; RR1 e RR5 residuais |
| Y2 | `tools/R90_descartar.sh:60-68`: o trinco órfão era removido e adquirido **antes** de `DESCARTE=1`, por isso uma falha em `trinco_adquire` saía com 2 depois de o R90 já ter alterado `<ROOT>` | o marcador de início estava depois da 1.ª alteração | `DESCARTE=1`/`CODIGO_FALHA=3` ficam **imediatamente antes** da 1.ª alteração. Antes deles o R90 só lê (e recusa com 2 sem tocar em nada se o dono do trinco ainda corre). Depois deles: `fail` dá 3 (`CODIGO_FALHA`), `incerteza` dá 3, `exit 2` de uma função da biblioteca dá 3 (EXIT trap), erro de `set -e` dá 3. A linha final `R90 DESCARTADO` é escrita com o EXIT trap ainda ativo (`|| exit 3`) e só depois o trap é retirado | Y2-0 (controlo negativo), Y2-1…Y2-4, X3-4, X3-5 | Corrigido, **não executado** |
| Y3 | `REHEARSAL-PLAN.md:57-58,66`: a tabela de fases punha a fase do R05 antes da do R10, e a frase da linha 66 dizia o contrário | duas descrições da ordem, sem verificação | Uma só sequência, `rehearsal_sequence` no `MANIFEST.json`, escrita igual em `README.md`, `REHEARSAL-PLAN.md`, `REHEARSAL-TARGET.md` e `TEST-CRITERIA.md`. A tabela de fases e a tabela de passos seguem-na. Os scripts impõem-na: o R05 exige o R10 terminado, corre o R20 completo, recusa sessões do R40 e grava `evidencia/R05.aprovado`; o R40 recusa qualquer passo sem esse registo | Y3-0 (controlo negativo), Y3-1…Y3-4, T1 | Corrigido, **não executado** |

As correções da v1.0.5 (X1, X2, X3, ficha E1–E10, trinco global, campos-token, teste no pacote) mantêm-se e continuam conferidas pela V01 (X1-*, X2-*, X3-*, F1, F2, T1, T2, K1…K4, D1).

## Riscos residuais (assumidos, não elimináveis por scripts sh)

| Id | Risco | Cobertura |
|---|---|---|
| RR1 | Entre a releitura da identidade e o `kill(2)` o processo pode terminar e o PID ser reutilizado; em `sh` não há `pidfd`. Vale para o postmaster (R10, R90) e para o psql (R40): o shell pode recolher o psql sozinho, por isso o zombie não prende o PID | Janela mínima; E1 (destruir a máquina) |
| RR2 | Um subcgroup criado entre as duas verificações do R20 só é visto no R20 seguinte | O R90 decide por `populated`, que cobre os descendentes |
| RR3 | O trinco é cooperativo; um trinco sem dono registado é tratado como órfão pelo R90 | Só os scripts do pacote correm em `<ROOT>` (E8/E9) |
| RR4 | A ficha prova forma e integridade dos artefactos, não a verdade | B13: responsabilidade do operador |
| RR5 | Entre o lançamento e o `exec` do psql a identidade não pode ser confirmada | Fecho por excesso: nada é enviado e o R40 sai com 3 (destruir a máquina, E1) |

B13, B14 e B19 continuam **ABERTOS**. O ensaio continua **sem GO**; G1–G4 continuam NO-GO.
