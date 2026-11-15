# Auditoria independente do ZIP v1.0.6 → correção na v1.0.7 → prova

A auditoria independente do ZIP v1.0.6 deu NO-GO **ao procedimento de ensaio** (dois bloqueios, ambos no trinco global: Z1, Z2). A v1.0.7 corrige só o procedimento: **S4-00…S4-05 e a entrada 0000 autenticada estão byte a byte iguais** à v1.0.6.

- "Prova estática" = `verificacao/V01_regressao_estatica.mjs` (no pacote; saída em `evidence/regressao-estatica.txt`) e `evidence/shell-check.txt`. Os ids entre parênteses são as linhas da V01.
- Cada bloqueio tem um **controlo negativo**: o texto defeituoso da v1.0.6, copiado byte a byte, está embutido na V01 e o detetor tem de o reprovar. A única variante sintética (Z2) está marcada como tal na V01.
- **Nada foi executado.** Nenhuma correção abaixo foi observada a funcionar.

| # | Achado | Causa | Correção (v1.0.7) | Prova estática | Estado |
|---|---|---|---|---|---|
| Z1 | `tools/R90_descartar.sh:61-75`: a recuperação do trinco órfão julgava o dono e, depois, fazia `rm -rf` de `<ROOT>/.trinco`. Um trinco adquirido entretanto por um passo vivo podia ser apagado. A libertação (`lib_ensaio.sh:302-308`, `R90:160-161`) também apagava no caminho partilhado, e o R05/R10 ignoravam uma libertação falhada | verificação e remoção separadas sobre o **mesmo caminho** (TOCTOU), sem confirmar qual instância foi apagada | **Nenhum** script apaga no caminho partilhado. Aquisição só por `mkdir(2)`; o dono (PID, início, namespace de PIDs, `boot_id`, nonce único, passo, `fim=1`) é escrito em `dono.tmp` e posto no lugar por rename, por isso aparece completo ou não aparece. **Libertar** (`trinco_liberta`) e **assumir um órfão** (`trinco_assume_orfao`, só o R90, só TERMINADO) = `rename(2)` (`mv -T`) para um nome privado `<ROOT>/.trinco.<lib\|orfao>.<pid>.<início>` e, **depois**, confirmação de que o que saiu é a instância adquirida/julgada (dispositivo:inode do diretório, dono byte a byte com o nonce, e de novo TERMINADO no caso do órfão). Só então se apaga a cópia privada. Não confirmado ⇒ nada apagado, a cópia fica como evidência, código 3. Libertação falhada ⇒ código 3 em R10, R05, R40 e R90, **antes** da linha `PRONTO`/`APROVADO`/`DESCARTADO`. O R90 recusa restos `.trinco.*` (3) | Z1-0 (controlo negativo), Z1-1…Z1-7, T1, T2, Y2-1…Y2-3 | Corrigido, **não executado**; RR3, RR6 e RR7 residuais |
| Z2 | `tools/lib_ensaio.sh:309-317`: `trinco_vivo` tinha dois valores; uma falha de leitura do dono dava "não vivo" e o R90 tratava o trinco como órfão | ausência de um estado "não sei" | `trinco_estado` com **três** valores. **TERMINADO** só com prova: dono completo (7 linhas, cada chave uma vez), o mesmo namespace de PIDs e o mesmo arranque do leitor, o `/proc` do leitor legível, e então PID ausente, PID com outro início (reutilizado) ou o próprio dono em Z/X. **VIVO**: mesmo PID e mesmo início num estado de execução conhecido. **INDETERMINADO**: tudo o resto, incluindo qualquer falha de leitura. No R90, antes de qualquer alteração: VIVO ⇒ 2, nada tocado; INDETERMINADO ou saída inesperada ⇒ INCERTEZA 3, o trinco **não** é removido; só TERMINADO segue. Só o R90 julga e assume trincos | Z2-0 (controlo negativo), Z2-1…Z2-3 | Corrigido, **não executado** |

**Revisão de coerência de todos os pontos de aquisição e libertação** (pedida na auditoria):

| Passo | Adquire | Liberta | Falha a libertar | Trinco ocupado |
|---|---|---|---|---|
| R10 | `trinco_adquire "$ROOT" R10`, depois do EXIT trap `falhou` | no `falhou` (`if trinco_liberta; then … else inc=…`) e no fim (`trinco_liberta_ou_incerteza R10`, antes de `R10 PRONTO`) | `R10 INCERTEZA`, código 3 | não acontece: o R10 exige `<ROOT>` vazia |
| R05 | `trinco_adquire "$ROOT" R05`, depois do EXIT trap `saida_r05` e do trap de sinais | no `saida_r05` e antes de `R05 APROVADO` (`trinco_liberta_ou_incerteza R05`) | `R05 INCERTEZA`, código 3 | REPROVADO (2), sem lhe tocar |
| R40 | `trinco_adquire "$ROOT" "R40:$PASSO"`, depois do EXIT trap `saida_r40` | no `saida_r40` e antes de `R40 <passo> APROVADO`; **não** liberta se o psql estiver vivo e por confirmar (Y1) | `R40 INCERTEZA`, código 3 | REPROVADO (2), sem lhe tocar |
| R90 | juízo só de leitura → (TERMINADO) `trinco_assume_orfao` → `trinco_adquire "$ROOT" R90`, tudo depois de `DESCARTE=1` | `trinco_liberta \|\| incerteza`, antes de `R90 DESCARTADO` | INCERTEZA, código 3 | VIVO ⇒ 2; INDETERMINADO ⇒ 3; aparecido entre o juízo e o `mkdir` ⇒ 3, sem lhe tocar |
| R20, R41 | nunca | nunca | — | — |

A sequência do ensaio não muda. As correções X1–X3 (v1.0.5) e Y1–Y3 (v1.0.6) mantêm-se e continuam conferidas pela V01 (X1-*, X2-*, X3-*, Y1-*, Y2-*, Y3-*, F1, F2, T1, T2, K1…K4, D1).

## Riscos residuais (assumidos, não elimináveis por scripts sh)

| Id | Risco | Cobertura |
|---|---|---|
| RR1 | Entre a releitura da identidade e o `kill(2)` o processo pode terminar e o PID ser reutilizado; em `sh` não há `pidfd`. Vale para o postmaster (R10, R90) e para o psql (R40) | Janela mínima; E1 (destruir a máquina) |
| RR2 | Um subcgroup criado entre as duas verificações do R20 só é visto no R20 seguinte | O R90 decide por `populated`, que cobre os descendentes |
| RR3 | O trinco é cooperativo: um processo que o ignore, ou que apague ou mova `<ROOT>/.trinco`, não é travado. (Já não vale: "um trinco sem dono é órfão" — agora é INDETERMINADO) | Só os scripts do pacote correm em `<ROOT>` (E8/E9) |
| RR4 | A ficha prova forma e integridade dos artefactos, não a verdade | B13: responsabilidade do operador |
| RR5 | Entre o lançamento e o `exec` do psql a identidade não pode ser confirmada | Fecho por excesso: nada é enviado e o R40 sai com 3 (E1) |
| RR6 | Dois R90 em simultâneo: entre o juízo TERMINADO e o rename, o outro pode assumir o órfão e adquirir o trinco; o rename move então o trinco vivo dele. Detetado **depois** (dispositivo:inode e nonce diferentes): nada é apagado, ambos saem com 3, mas o outro corre sem trinco no caminho partilhado até libertar. Não há verificar-e-apagar atómico em `sh`, e o pacote não o declara | Um só R90 de cada vez (operador); E1 |
| RR7 | TERMINADO assenta no `/proc` do mesmo namespace de PIDs e no `boot_id`; um `/proc` que não mostre o namespace do leitor não é detetável. `mkdir(2)`/`rename(2)` só são atómicos num sistema de ficheiros local | E4 (mesmo namespace de PIDs); E5 e as montagens recusadas pelo R10/R20/R40 |

B13, B14, B18 e B19 continuam **ABERTOS**. O ensaio continua **sem GO**; G1–G4 continuam NO-GO.
