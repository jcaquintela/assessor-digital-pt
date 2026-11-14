#!/bin/sh
# AFONSO V2 · pacote v1.0.3 · R10 · ARRANQUE CONTROLADO da instância PostgreSQL 17 DESCARTÁVEL (R1/R3).
# ESTADO: PREPARADO, NUNCA EXECUTADO. Só com autorização separada, depois das precondições E1–E9.
#
# Uso (dentro do namespace de rede isolado preparado pelo operador, E3):
#   env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C \
#     sh tools/R10_arranque_controlado.sh AUTORIZADO:<ref> <ROOT> <PG_BIN> <PORTA>
# <ROOT>   pasta VAZIA criada para este ensaio (caminho absoluto simples). Fica com:
#          pgdata/ sock/ home/ nonce-externo/ evidencia/
# <PG_BIN> pasta com postgres, initdb, pg_controldata, psql da versão 17.
#
# O que faz: verifica o próprio ambiente/rede/montagens; grava um nonce FORA de PGDATA; initdb
# com autenticação só local; copia o nonce para PGDATA; regista system identifier e sha256 do
# executável; arranca o postmaster DIRETAMENTE (sem pg_ctl, para que $! seja o PID do postmaster)
# com TODAS as opções críticas na linha de comando; espera "ready" no postmaster.pid.
# NÃO prova isolamento sozinho: R20/R40/R41 verificam o processo; E1–E9 o anfitrião.
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
ROOT=${2:?indicar ROOT}; PG_BIN=${3:?indicar PG_BIN}; PORT=${4:?indicar PORTA}
case "$PORT" in ""|*[!0-9]*) fail "porta inválida" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "porta fora de 1024–65535"
[ "$(id -u)" != 0 ] || fail "não correr como root"
[ -d "$ROOT" ] || fail "ROOT não existe"
ROOT=$(cd "$ROOT" && pwd -P); exige_caminho_simples "$ROOT" ROOT
[ -d "$PG_BIN" ] || fail "PG_BIN não existe"
PG_BIN=$(cd "$PG_BIN" && pwd -P); exige_caminho_simples "$PG_BIN" PG_BIN
[ -z "$(ls -A "$ROOT")" ] || fail "ROOT tem de estar vazia (criada para este ensaio)"
for b in postgres initdb pg_controldata psql; do [ -x "$PG_BIN/$b" ] || fail "falta $PG_BIN/$b"; done
"$PG_BIN/postgres" -V | grep -Eq ' 17\.[0-9]+' || fail "esperado PostgreSQL 17"

# 0. O próprio processo: ambiente mínimo, rede isolada, montagens sem segredos.
ambiente_limpo_ou_falha "$$"
rede_isolada_ou_falha "$$"
montagens_ou_falha "$$"
ok "R10 ambiente/rede/montagens do arranque"

mkdir "$ROOT/pgdata" "$ROOT/sock" "$ROOT/home" "$ROOT/nonce-externo" "$ROOT/evidencia"
chmod 700 "$ROOT/pgdata" "$ROOT/sock" "$ROOT/home" "$ROOT/nonce-externo" "$ROOT/evidencia"

# 1. Nonce gravado PRIMEIRO fora de PGDATA (referência externa), só depois copiado para dentro.
od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$ROOT/nonce-externo/afonso-rehearsal.nonce"
[ "$(wc -c < "$ROOT/nonce-externo/afonso-rehearsal.nonce" | tr -d ' ')" -eq 64 ] || fail "nonce inválido"
chmod 400 "$ROOT/nonce-externo/afonso-rehearsal.nonce"

# 2. initdb: superutilizador só do ensaio, autenticação local trust (socket em pasta 0700), TCP rejeitado.
env -i PATH="$PG_BIN:/usr/bin:/bin" HOME="$ROOT/home" LANG=C \
  "$PG_BIN/initdb" -D "$ROOT/pgdata" -U ensaio_super --auth-local=trust --auth-host=reject \
  -E UTF8 --locale=C --no-instructions > "$ROOT/evidencia/initdb.log" 2>&1 || fail "initdb falhou (evidencia/initdb.log)"
cp "$ROOT/nonce-externo/afonso-rehearsal.nonce" "$ROOT/pgdata/afonso-rehearsal.nonce"
chmod 400 "$ROOT/pgdata/afonso-rehearsal.nonce"
SYSID=$("$PG_BIN/pg_controldata" "$ROOT/pgdata" | sed -n 's/^Database system identifier: *//p')
case "$SYSID" in ""|*[!0-9]*) fail "pg_controldata sem system identifier" ;; esac
printf '%s\n' "$SYSID" > "$ROOT/pgdata/afonso-rehearsal.sysid"
printf '%s\n' "$SYSID" > "$ROOT/evidencia/sysid"
printf '%s\n' "$PG_BIN" > "$ROOT/evidencia/pg_bin"
printf '%s\n' "$PORT" > "$ROOT/evidencia/porta"
sha256sum "$PG_BIN/postgres" | cut -d' ' -f1 > "$ROOT/evidencia/postgres.sha256"
sha256sum "$PG_BIN/psql" | cut -d' ' -f1 > "$ROOT/evidencia/psql.sha256"

# 3. Arranque direto do postmaster, com as opções críticas na linha de comando (R30 confirma a origem).
#    A lista exata fica em evidencia/argumentos.esperados e o R20 compara-a com /proc/<pid>/cmdline.
{
  printf '%s\n' "$PG_BIN/postgres" -D "$ROOT/pgdata"
  for o in "listen_addresses=" "unix_socket_directories=$ROOT/sock" "port=$PORT" \
           "shared_preload_libraries=" "session_preload_libraries=" "local_preload_libraries=" \
           "wal_level=minimal" "max_wal_senders=0" "archive_mode=off" "ssl=off" \
           "logging_collector=off" "log_destination=stderr" 'dynamic_library_path=$libdir' "jit=off"; do
    printf '%s\n' -c "$o"
  done
} > "$ROOT/evidencia/argumentos.esperados"
env -i PATH="$PG_BIN:/usr/bin:/bin" HOME="$ROOT/home" LANG=C \
  "$PG_BIN/postgres" -D "$ROOT/pgdata" \
  -c listen_addresses= -c "unix_socket_directories=$ROOT/sock" -c "port=$PORT" \
  -c shared_preload_libraries= -c session_preload_libraries= -c local_preload_libraries= \
  -c wal_level=minimal -c max_wal_senders=0 -c archive_mode=off -c ssl=off \
  -c logging_collector=off -c log_destination=stderr -c 'dynamic_library_path=$libdir' -c jit=off \
  > "$ROOT/evidencia/postgres.log" 2>&1 &
PID=$!
printf '%s\n' "$PID" > "$ROOT/evidencia/postmaster.pid.registado"

i=0
while [ "$i" -lt 30 ]; do
  if ! kill -0 "$PID" 2>/dev/null; then fail "o servidor terminou no arranque (evidencia/postgres.log)"; fi
  if [ -f "$ROOT/pgdata/postmaster.pid" ] && [ "$(sed -n 8p "$ROOT/pgdata/postmaster.pid" | tr -d ' ')" = ready ]; then break; fi
  sleep 1; i=$((i + 1))
done
if [ "$i" -ge 30 ]; then kill -TERM "$PID" 2>/dev/null || true; fail "o servidor não ficou pronto em 30 s"; fi
ok "R10 postmaster PID $PID pronto; seguir para R20 (nenhum SQL antes de R20 e R40 aprovados)"
