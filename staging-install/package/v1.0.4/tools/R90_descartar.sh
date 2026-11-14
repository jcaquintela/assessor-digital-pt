#!/bin/sh
# AFONSO V2 · pacote v1.0.4 · R90 · DESCARTAR a instância — fim do ensaio, QUALQUER erro, preparação parcial
# ou interrupção (V6, V7). ESTADO: PREPARADO, NUNCA EXECUTADO.
# Uso (FORA da unidade do servidor): env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C \
#        sh tools/R90_descartar.sh AUTORIZADO:<ref> <ROOT>
# Códigos: 0 = DESCARTADO · 2 = REPROVADO (recusa sem tocar em nada: ROOT não é do ensaio, R90 dentro da
#          unidade) · 3 = INCERTEZA => DESTRUIR a máquina/VM/contentor (E1, E10) e não reutilizar nada.
# Funciona com QUALQUER estado deixado pelo R10 (só a marca; cgroup sem processos; initdb a meio; postmaster
# arrancado sem PID registado; pronto) e é idempotente. Só sinaliza um processo cuja identidade estável
# confere com o ensaio. Considera o servidor parado só quando TODOS os processos da unidade terminaram
# (cgroup.procs vazio ou unidade removida) E nenhum processo do utilizador corre o postgres registado ou
# tem a pasta de trabalho dentro de ROOT. Se não o conseguir confirmar: INCERTEZA, nunca "provavelmente".
set -eu
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
incerteza() { trap - INT TERM HUP; printf 'R90 INCERTEZA: %s — DESTRUIR a máquina/VM/contentor do ensaio (E1, E10); não reutilizar nada\n' "$1"; exit 3; }
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
  [ -e "$e" ] || continue
  case "${e##*/}" in "$MARCA"|.tmp|pgdata|sock|home|nonce-externo|evidencia) ;; *) incerteza "entrada desconhecida em ROOT: ${e##*/}" ;; esac
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
EXEID=; [ ! -f "$EV/postgres.exe_id" ] || EXEID=$(ler1 "$EV/postgres.exe_id") || incerteza "registo do executável ilegível"

# 3. Paragem rápida (SIGINT) de cada candidato cuja identidade estável confere com o ensaio.
cand=
[ ! -f "$EV/postmaster.pid.registado" ] || cand=$(ler1 "$EV/postmaster.pid.registado") || incerteza "PID registado ilegível"
if [ -f "$ROOT/pgdata/postmaster.pid" ]; then l1=$(sed -n 1p "$ROOT/pgdata/postmaster.pid") || incerteza "postmaster.pid ilegível"; cand="$cand $l1"; fi
for p in $cand; do
  case "$p" in ""|*[!0-9]*) incerteza "PID candidato inválido" ;; esac
  [ -d "/proc/$p" ] || continue
  e=$(exe_id "$p" 2>/dev/null) || { [ -d "/proc/$p" ] && incerteza "executável do candidato $p ilegível"; continue; }
  c=$(cwd_de "$p" 2>/dev/null) || { [ -d "/proc/$p" ] && incerteza "pasta de trabalho do candidato $p ilegível"; continue; }
  meu=nao
  if [ -f "$EV/identidade.postmaster" ]; then
    i=$(inicio_de "$p" 2>/dev/null) || i=
    [ "$i" = "$(chave "$EV/identidade.postmaster" inicio)" ] && [ "$e" = "$(chave "$EV/identidade.postmaster" exe_id)" ] && meu=sim
  elif [ -n "$EXEID" ] && [ "$e" = "$EXEID" ] && [ "$c" = "$ROOT/pgdata" ]; then meu=sim
  fi
  [ "$meu" = sim ] || continue
  kill -INT "$p" 2>/dev/null || [ ! -d "/proc/$p" ] || incerteza "não foi possível sinalizar o postmaster $p"
  k=0; while [ -d "/proc/$p" ] && [ "$k" -lt 60 ]; do sleep 1; k=$((k + 1)); done
  [ ! -d "/proc/$p" ] || kill -QUIT "$p" 2>/dev/null || true
done

# 4. TODOS os processos da unidade têm de terminar (V7). Se não, cgroup.kill; se mesmo assim não: INCERTEZA.
vazio_ou_ausente() {
  D=/sys/fs/cgroup$SCG
  [ -d "$D" ] || return 0
  cat -- "$D/cgroup.procs" > "$EV/R90.procs" 2>/dev/null || { [ -d "$D" ] && incerteza "cgroup.procs ilegível"; return 0; }
  n=$(linhas_dados "$EV/R90.procs" 0) || incerteza "contagem da unidade falhou"
  [ "$n" -eq 0 ]
}
if [ -n "$SCG" ]; then
  k=0; while ! vazio_ou_ausente && [ "$k" -lt 30 ]; do sleep 1; k=$((k + 1)); done
  if ! vazio_ou_ausente; then
    [ -w "/sys/fs/cgroup$SCG/cgroup.kill" ] || incerteza "a unidade do servidor ainda tem processos e cgroup.kill não está disponível"
    printf '1\n' > "/sys/fs/cgroup$SCG/cgroup.kill" || incerteza "escrita em cgroup.kill falhou"
    k=0; while ! vazio_ou_ausente && [ "$k" -lt 15 ]; do sleep 1; k=$((k + 1)); done
    vazio_ou_ausente || incerteza "a unidade do servidor continua com processos depois de cgroup.kill"
  fi
fi

# 5. Varredura de confirmação: nenhum processo do utilizador corre o postgres registado nem trabalha em ROOT.
for d in /proc/[0-9]*; do
  p=${d#/proc/}
  [ "$p" = "$$" ] && continue
  u=$(uid_de "$p" 2>/dev/null) || { [ ! -d "$d" ] || incerteza "estado do processo $p ilegível"; continue; }
  [ "$u" = "$EU" ] || continue
  e=$(exe_id "$p" 2>/dev/null) || { [ ! -d "$d" ] || incerteza "executável do processo $p (do utilizador do ensaio) ilegível"; continue; }
  [ -z "$EXEID" ] || [ "$e" != "$EXEID" ] || incerteza "o processo $p ainda corre o postgres do ensaio"
  c=$(cwd_de "$p" 2>/dev/null) || { [ ! -d "$d" ] || incerteza "pasta de trabalho do processo $p ilegível"; continue; }
  case "$c/" in "$ROOT"/*) incerteza "o processo $p trabalha dentro de ROOT" ;; esac
done

# 6. Apagar e confirmar. evidencia/ e a marca ficam para o operador arquivar; depois destrói a máquina (E1).
rm -rf -- "${ROOT:?}/pgdata" "${ROOT:?}/sock" "${ROOT:?}/home" "${ROOT:?}/nonce-externo" "${ROOT:?}/.tmp" || incerteza "apagar falhou"
for x in pgdata sock home nonce-externo .tmp; do [ ! -e "$ROOT/$x" ] || incerteza "não foi possível apagar $x"; done
if [ -d "$EV" ]; then printf 'descartado\n' > "$EV/fase" || incerteza "escrita falhou"; fi
trap - INT TERM HUP
echo "R90 DESCARTADO: todos os processos da unidade terminaram e a instância foi apagada; evidencia/ fica para arquivar; destruir a máquina (E1) na mesma"
