#!/bin/sh
# AFONSO V2 · pacote v1.0.3 · R90 · DESCARTAR a instância (fim do ensaio OU qualquer erro).
# ESTADO: PREPARADO, NUNCA EXECUTADO.
# Uso: env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C sh tools/R90_descartar.sh AUTORIZADO:<ref> <ROOT>
# Para o postmaster provado (só se ainda for o mesmo processo), confirma que terminou e apaga
# pgdata/, sock/, home/ e nonce-externo/. Deixa evidencia/ (só resultados sintéticos) para o operador
# arquivar e depois apagar <ROOT>. Nunca "reparar e continuar": um ensaio que falhou recomeça do zero.
set -eu
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
ROOT=${2:?indicar ROOT}
ROOT=$(cd "$ROOT" && pwd -P); exige_caminho_simples "$ROOT" ROOT
EV="$ROOT/evidencia"
[ -s "$EV/postmaster.pid.registado" ] && [ -d "$ROOT/nonce-externo" ] || fail "ROOT não parece uma pasta de ensaio criada pelo R10"
PID=$(cat "$EV/postmaster.pid.registado"); PG_BIN=$(cat "$EV/pg_bin")
if kill -0 "$PID" 2>/dev/null; then
  [ "$(exe_de "$PID")" = "$(readlink -f "$PG_BIN/postgres")" ] && [ "$(readlink -f "/proc/$PID/cwd")" = "$ROOT/pgdata" ] || fail "o PID $PID já não é o postmaster do ensaio: não matar; parar à mão"
  kill -TERM "$PID"
  i=0; while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 30 ]; do sleep 1; i=$((i + 1)); done
  if kill -0 "$PID" 2>/dev/null; then kill -KILL "$PID"; sleep 1; fi
  if kill -0 "$PID" 2>/dev/null; then fail "o postmaster $PID não terminou"; fi
fi
rm -rf "$ROOT/pgdata" "$ROOT/sock" "$ROOT/home" "$ROOT/nonce-externo"
for d in pgdata sock home nonce-externo; do [ ! -e "$ROOT/$d" ] || fail "não foi possível apagar $d"; done
echo "R90 DESCARTADO: instância parada e apagada; evidencia/ fica para arquivar."
