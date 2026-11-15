#!/bin/sh
# AFONSO V2 · pacote v1.0.7 · R90 · DESCARTAR a instância — fim do ensaio, QUALQUER erro, preparação parcial
# ou interrupção (V6, V7, X2, X3, Y2, Z1, Z2). ESTADO: PREPARADO, NUNCA EXECUTADO.
# Uso (FORA da unidade do servidor): env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C \
#        sh tools/R90_descartar.sh AUTORIZADO:<ref> <ROOT>
# Códigos: 0 = DESCARTADO · 2 = REPROVADO SÓ ANTES de o descarte começar, isto é, antes de QUALQUER alteração
#          (recusa sem tocar em nada: ROOT não é do ensaio, R90 dentro da unidade, dono do trinco VIVO) ·
#          3 = INCERTEZA => DESTRUIR a máquina/VM/contentor (E1, E10) e não reutilizar nada.
# X3: a partir de "DESCARTE=1" TODA a falha (fail, erro de set -e, sinal, saída inesperada) termina com 3.
# Y2: "DESCARTE=1" fica IMEDIATAMENTE antes da 1.ª alteração (assumir o trinco órfão); antes dele o R90 só lê.
#     Assim também as operações de trinco (rename do órfão, mkdir, escrita do dono, libertação) saem com 3.
#     A linha final DESCARTADO é escrita com o EXIT trap ainda ativo (falha na escrita => 3).
# Z1: o R90 NUNCA apaga o caminho partilhado <ROOT>/.trinco. Um órfão só é assumido por trinco_assume_orfao (rename
#     atómico para um nome privado e confirmação posterior de que é a instância julgada; só então se apaga a cópia
#     privada); o trinco do próprio R90 só sai por trinco_liberta (o mesmo protocolo). Sem garantia atómica de
#     "verificar e apagar" em sh: o que não se confirma não é apagado e dá 3 (RR6).
# Z2: o dono do trinco tem TRÊS estados (trinco_estado): VIVO => 2, nada tocado; INDETERMINADO (dono ausente,
#     ilegível, incompleto, outro namespace de PIDs ou outro arranque, …) => 3, o trinco NÃO é removido;
#     só TERMINADO (término comprovado) permite assumi-lo. Uma falha de leitura nunca é término.
# Funciona com QUALQUER estado deixado pelo R10 (só a marca; cgroup sem processos; initdb a meio; postmaster
# arrancado sem identidade registada; pronto) e é idempotente. Só sinaliza um processo cuja identidade COMPLETA,
# relida imediatamente antes de CADA sinal, é a registada (X3; corrida residual RR1 em lib_ensaio.sh).
# Considera o servidor parado só quando cgroup.events diz populated 0 (a unidade E TODOS os descendentes, X2)
# ou a unidade foi removida, E nenhum processo do utilizador corre o postgres registado ou trabalha em ROOT.
# Se não o conseguir confirmar: INCERTEZA, nunca "provavelmente".
set -eu
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
DESCARTE=0
incerteza() { trap - INT TERM HUP; printf 'R90 INCERTEZA: %s — DESTRUIR a máquina/VM/contentor do ensaio (E1, E10); não reutilizar nada\n' "$1"; exit 3; }
saida_r90() {
  rc=$?
  trap - EXIT INT TERM HUP
  if [ "$DESCARTE" = 1 ] && [ "$rc" -ne 0 ]; then
    [ "$rc" -eq 3 ] || printf 'R90 INCERTEZA: falha inesperada (código %s) depois de o descarte começar — DESTRUIR a máquina/VM/contentor do ensaio (E1, E10); não reutilizar nada\n' "$rc"
    exit 3
  fi
  exit "$rc"
}
trap saida_r90 EXIT
trap 'incerteza "R90 interrompido"' INT TERM HUP
exige_autorizacao "${1:-}"
[ "$#" -eq 2 ] || fail "uso: R90 AUTORIZADO:<ref> <ROOT>"
[ -d "$2" ] && [ ! -L "$2" ] || fail "ROOT não existe ou é ligação simbólica"
ROOT=$(cd "$2" && pwd -P) || fail "ROOT ilegível"; exige_caminho_simples "$ROOT" ROOT
EV=$ROOT/evidencia; EU=$(id -u) || fail "id falhou"
# 1. Só uma pasta criada pelo R10 desta versão (marca), do próprio utilizador, com entradas conhecidas.
[ -f "$ROOT/$MARCA" ] && [ ! -L "$ROOT/$MARCA" ] || fail "ROOT sem a marca do ensaio: não é uma pasta do R10, nada tocado"
[ "$(chave "$ROOT/$MARCA" versao)" = "$VERSAO_PACOTE" ] || fail "marca de outra versão do pacote: nada tocado"
[ "$(chave "$ROOT/$MARCA" autorizacao)" = "$1" ] || fail "autorização diferente da registada pelo R10: nada tocado"
[ "$(stat -c %u -- "$ROOT")" = "$EU" ] || fail "ROOT de outro utilizador: nada tocado"
for e in "$ROOT"/* "$ROOT"/.[!.]*; do
  if [ ! -e "$e" ]; then continue; fi
  case "${e##*/}" in
    "$MARCA"|.tmp|.trinco|pgdata|sock|home|nonce-externo|evidencia) ;;
    .trinco.*) incerteza "resto de uma libertação ou assunção de trinco que não se confirmou (${e##*/}): nada é apagado" ;;
    *) incerteza "entrada desconhecida em ROOT: ${e##*/}" ;;
  esac
done
CWD=$(pwd -P) || fail "pwd falhou"
case "$CWD/" in "$ROOT"/*) fail "correr o R90 fora de ROOT" ;; esac

# 2. Unidade do servidor (registada pelo R10 antes de qualquer processo).
SCG=
if [ -f "$EV/cgroup" ]; then SCG=$(ler1 "$EV/cgroup") || incerteza "registo do cgroup ilegível"; exige_cgroup "$SCG" cgroup
elif [ -e "$ROOT/pgdata" ] || [ -e "$EV/postmaster.pid.registado" ]; then incerteza "há dados do servidor mas a unidade não foi registada"
fi
MEU=$(cgroup_de "$$") || incerteza "cgroup do próprio R90 ilegível"
if [ -n "$SCG" ]; then case "$MEU/" in "$SCG"/*) fail "o R90 corre DENTRO da unidade do servidor: correr fora dela (E10)" ;; esac; fi
EXEID=; if [ -f "$EV/postgres.exe_id" ]; then EXEID=$(ler1 "$EV/postgres.exe_id") || incerteza "registo do executável ilegível"; fi

# 2b. Trinco global, SÓ LEITURA (Z2): estado do dono em três valores. Nada foi alterado até aqui.
#     VIVO => recusa (código 2); INDETERMINADO ou qualquer outra saída => INCERTEZA (código 3), o trinco NÃO é
#     removido; só TERMINADO segue para a assunção (depois de DESCARTE=1).
ORFAO=
if [ -e "$ROOT/.trinco" ] || [ -L "$ROOT/.trinco" ]; then
  EST=$(trinco_estado "$ROOT/.trinco") || EST=INDETERMINADO
  case "$EST" in
    VIVO) fail "outro passo do ensaio ainda corre (trinco $ROOT/.trinco, dono VIVO): interrompê-lo primeiro; nada tocado" ;;
    TERMINADO) ORFAO=sim ;;
    *) incerteza "estado do dono do trinco $ROOT/.trinco INDETERMINADO (não se prova que terminou): o trinco NÃO é removido; nada tocado" ;;
  esac
fi

# ===== INÍCIO EFETIVO DO DESCARTE (Y2): a próxima instrução já altera ROOT. Qualquer falha => código 3. =====
DESCARTE=1
CODIGO_FALHA=3
# 2c. (Z1) Assumir o trinco órfão SÓ se foi julgado TERMINADO: trinco_assume_orfao volta a julgá-lo, move-o por
#     rename atómico para um nome privado, confirma que é a MESMA instância (dispositivo:inode + dono com nonce, de
#     novo TERMINADO) e só então apaga a cópia privada. Não confirmado => nada apagado, código 3.
#     Depois, aquisição normal por mkdir (atómico): se outro passo criou o trinco entretanto, falha com 3 sem tocar
#     no trinco dele. fail => 3 (CODIGO_FALHA); "exit 2" de uma função => 3 (EXIT trap).
if [ -n "$ORFAO" ]; then
  trinco_assume_orfao "$ROOT" || incerteza "o trinco órfão não se confirmou como a instância julgada TERMINADA (mudou entre a leitura e o rename, ou o rename falhou): nada foi apagado; a cópia privada, se existir, fica como evidência"
fi
trinco_adquire "$ROOT" R90
TR=$ROOT/.trinco/R90
mkdir -- "$TR" || incerteza "mkdir falhou: pasta temporária do R90"

# 3. Paragem rápida (SIGINT, depois SIGQUIT) de cada candidato cuja identidade COMPLETA é a do ensaio, relida
#    imediatamente antes de CADA sinal (sinaliza_se_mesmo). Referência: a identidade registada pelo R10 ou, se o
#    R10 falhou antes de a registar, uma identidade provisória tirada na 1.ª observação, aceite só se o início é
#    o lido pelo R10 logo após o arranque (quando existe), o executável é PG_BIN/postgres e o cwd é PGDATA.
cand=
if [ -f "$EV/postmaster.pid.registado" ]; then cand=$(ler1 "$EV/postmaster.pid.registado") || incerteza "PID registado ilegível"; fi
if [ -f "$ROOT/pgdata/postmaster.pid" ]; then l1=$(sed -n 1p "$ROOT/pgdata/postmaster.pid") || incerteza "postmaster.pid ilegível"; cand="$cand $l1"; fi
INI0=; if [ -f "$EV/postmaster.inicio.arranque" ]; then INI0=$(ler1 "$EV/postmaster.inicio.arranque") || incerteza "início registado ilegível"; fi
for p in $cand; do
  case "$p" in ""|*[!0-9]*) incerteza "PID candidato inválido" ;; esac
  if [ ! -d "/proc/$p" ]; then continue; fi
  REF=
  if [ -f "$EV/identidade.postmaster" ]; then
    REF=$EV/identidade.postmaster
  else
    if ( identidade_para "$p" "$TR/prov.$p" ) 2>/dev/null; then :; else
      if [ -d "/proc/$p" ]; then incerteza "identidade do candidato $p ilegível"; fi
      continue
    fi
    e=$(chave "$TR/prov.$p" exe_id) || incerteza "identidade provisória ilegível"
    c=$(chave "$TR/prov.$p" cwd) || incerteza "identidade provisória ilegível"
    i=$(chave "$TR/prov.$p" inicio) || incerteza "identidade provisória ilegível"
    if [ -n "$EXEID" ] && [ "$e" = "$EXEID" ] && [ "$c" = "$ROOT/pgdata" ] && { [ -z "$INI0" ] || [ "$i" = "$INI0" ]; }; then REF=$TR/prov.$p; fi
  fi
  if [ -z "$REF" ]; then continue; fi
  # 1.ª leitura: um candidato que não é o processo registado (ex.: PID antigo reutilizado) não é sinalizado aqui;
  # a varredura do passo 5 confirma que nada do ensaio ficou a correr.
  if ( identidade_para "$p" "$TR/agora.$p" ) 2>/dev/null; then :; else
    if [ -d "/proc/$p" ]; then incerteza "identidade do candidato $p ilegível"; fi
    continue
  fi
  if cmp -s -- "$TR/agora.$p" "$REF"; then :; else continue; fi
  if sinaliza_se_mesmo "$p" INT "$REF" "$TR"; then :; else continue; fi
  k=0; while [ -d "/proc/$p" ] && [ "$k" -lt 60 ]; do sleep 1; k=$((k + 1)); done
  if [ -d "/proc/$p" ]; then
    if sinaliza_se_mesmo "$p" QUIT "$REF" "$TR"; then :; fi
  fi
done

# 4. TODOS os processos da unidade E dos descendentes têm de terminar (V7, X2): decide cgroup.events
#    (populated 0) — cgroup.procs só lista os da própria unidade e fica só como evidência. Montagem cgroup v2
#    confirmada no próprio R90. Se não esvaziar: cgroup.kill (mata a unidade e os descendentes); se mesmo assim
#    não: INCERTEZA.
unidade_vazia() {
  D=/sys/fs/cgroup$SCG
  if [ ! -d "$D" ]; then return 0; fi
  if pv=$(populated_de "$D" 2>/dev/null); then :; else
    if [ -d "$D" ]; then incerteza "cgroup.events da unidade ilegível"; fi
    return 0
  fi
  if cat -- "$D/cgroup.procs" > "$TR/procs.evidencia" 2>/dev/null; then :; fi
  [ "$pv" = 0 ]
}
if [ -n "$SCG" ]; then
  cgroup2_ou_falha "$$"
  k=0; while ! unidade_vazia && [ "$k" -lt 30 ]; do sleep 1; k=$((k + 1)); done
  if ! unidade_vazia; then
    [ -w "/sys/fs/cgroup$SCG/cgroup.kill" ] || incerteza "a unidade do servidor (ou um descendente) ainda tem processos e cgroup.kill não está disponível"
    printf '1\n' > "/sys/fs/cgroup$SCG/cgroup.kill" || incerteza "escrita em cgroup.kill falhou"
    k=0; while ! unidade_vazia && [ "$k" -lt 15 ]; do sleep 1; k=$((k + 1)); done
    unidade_vazia || incerteza "a unidade do servidor (ou um descendente) continua com processos depois de cgroup.kill"
  fi
fi

# 5. Varredura de confirmação: nenhum processo do utilizador corre o postgres registado nem trabalha em ROOT.
for d in /proc/[0-9]*; do
  p=${d#/proc/}
  if [ "$p" = "$$" ]; then continue; fi
  u=$(uid_de "$p" 2>/dev/null) || { [ ! -d "$d" ] || incerteza "estado do processo $p ilegível"; continue; }
  if [ "$u" != "$EU" ]; then continue; fi
  e=$(exe_id "$p" 2>/dev/null) || { [ ! -d "$d" ] || incerteza "executável do processo $p (do utilizador do ensaio) ilegível"; continue; }
  [ -z "$EXEID" ] || [ "$e" != "$EXEID" ] || incerteza "o processo $p ainda corre o postgres do ensaio"
  c=$(cwd_de "$p" 2>/dev/null) || { [ ! -d "$d" ] || incerteza "pasta de trabalho do processo $p ilegível"; continue; }
  case "$c/" in "$ROOT"/*) incerteza "o processo $p trabalha dentro de ROOT" ;; esac
done

# 6. Apagar e confirmar. evidencia/ e a marca ficam para o operador arquivar; depois destrói a máquina (E1).
if [ -f "$TR/procs.evidencia" ] && [ -d "$EV" ]; then cp -- "$TR/procs.evidencia" "$EV/R90.procs" || incerteza "cópia da evidência falhou"; fi
rm -rf -- "${ROOT:?}/pgdata" "${ROOT:?}/sock" "${ROOT:?}/home" "${ROOT:?}/nonce-externo" "${ROOT:?}/.tmp" || incerteza "apagar falhou"
for x in pgdata sock home nonce-externo .tmp; do [ ! -e "$ROOT/$x" ] || incerteza "não foi possível apagar $x"; done
if [ -d "$EV" ]; then printf 'descartado\n' > "$EV/fase" || incerteza "escrita falhou"; fi
# Z1: o trinco do R90 só sai por trinco_liberta (rename para nome privado + confirmação + apagar a cópia privada).
trinco_liberta || incerteza "o trinco do R90 não foi libertado com segurança (não é comprovadamente o deste processo, ou a cópia privada não foi apagada): nada de outro passo foi apagado"
# Y2: a linha final é escrita com o EXIT trap AINDA ativo: se a escrita falhar, a saída é 3, nunca 0, 1 ou 2.
echo "R90 DESCARTADO: a unidade e todos os descendentes ficaram sem processos e a instância foi apagada; evidencia/ fica para arquivar; destruir a máquina (E1) na mesma" || exit 3
trap - EXIT INT TERM HUP
