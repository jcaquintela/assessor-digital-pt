#!/bin/sh
# AFONSO V2 · pacote v1.0.5 · R90 · DESCARTAR a instância — fim do ensaio, QUALQUER erro, preparação parcial
# ou interrupção (V6, V7, X2, X3). ESTADO: PREPARADO, NUNCA EXECUTADO.
# Uso (FORA da unidade do servidor): env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C \
#        sh tools/R90_descartar.sh AUTORIZADO:<ref> <ROOT>
# Códigos: 0 = DESCARTADO · 2 = REPROVADO SÓ ANTES de o descarte começar (recusa sem tocar em nada: ROOT não é
#          do ensaio, R90 dentro da unidade, outro passo ainda a correr) · 3 = INCERTEZA => DESTRUIR a
#          máquina/VM/contentor (E1, E10) e não reutilizar nada.
# X3: a partir de "DESCARTE=1" TODA a falha (fail, erro de set -e, sinal, saída inesperada) termina com 3.
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
  case "${e##*/}" in "$MARCA"|.tmp|.trinco|pgdata|sock|home|nonce-externo|evidencia) ;; *) incerteza "entrada desconhecida em ROOT: ${e##*/}" ;; esac
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

# 2b. Trinco global: se o dono registado AINDA corre (mesmo PID e início), recusa sem tocar em nada; se é órfão
#     (passo interrompido) o R90 assume-o. A partir daqui nenhum outro passo pode começar em ROOT.
if [ -d "$ROOT/.trinco" ]; then
  if trinco_vivo "$ROOT/.trinco"; then fail "outro passo do ensaio ainda corre (trinco $ROOT/.trinco): interrompê-lo primeiro; nada tocado"; fi
  rm -rf -- "${ROOT:?}/.trinco" || incerteza "não foi possível assumir o trinco órfão"
fi
trinco_adquire "$ROOT" R90

# ===== A PARTIR DAQUI O DESCARTE COMEÇOU: qualquer falha => código 3 (INCERTEZA). =====
DESCARTE=1
CODIGO_FALHA=3
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
rm -rf -- "${ROOT:?}/.trinco" || incerteza "não foi possível libertar o trinco"
[ ! -e "$ROOT/.trinco" ] || incerteza "não foi possível libertar o trinco"
trap - EXIT INT TERM HUP
echo "R90 DESCARTADO: a unidade e todos os descendentes ficaram sem processos e a instância foi apagada; evidencia/ fica para arquivar; destruir a máquina (E1) na mesma"
