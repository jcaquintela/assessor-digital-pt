#!/bin/sh
# AFONSO V2 · pacote v1.0.3 · R20 · PROVA DO PROCESSO SERVIDOR sem SQL (R1/R2/R3). Falha fechada.
# ESTADO: PREPARADO, NUNCA EXECUTADO. Correr depois do R10 e de novo antes de S4 e antes de T01.
# Uso: env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C sh tools/R20_verificar_processo.sh AUTORIZADO:<ref> <ROOT>
#
# Prova, a partir de /proc e do sistema de ficheiros (sem ligar à base):
#  R1  PID registado = linha 1 do postmaster.pid = linha 1 do .lock do socket; executável real
#      (/proc/<pid>/exe) = PG_BIN/postgres com o sha256 registado; pasta de trabalho = PGDATA;
#      argumentos = exatamente os do R10; postmaster.pid: PGDATA, porta, socket, sem endereço TCP, "ready";
#      o socket que o cliente vai usar é um descritor DESTE processo.
#  R2  rede vista pelo processo: só lo, sem rotas, sem sockets TCP/UDP; montagens sem segredos.
#  R3  configuração lida por completo (postgresql.conf, postgresql.auto.conf, pg_hba.conf, pg_ident.conf):
#      ilegível => falha; nenhuma diretiva include; nenhuma relocalização de ficheiros; sem ALTER SYSTEM;
#      pg_hba só local (host* só reject); nonce externo REALMENTE fora de PGDATA; ambiente e HOME do servidor.
# LIMITE: prova o que o processo vê. Não substitui as precondições E1–E9 do operador.
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
ROOT=${2:?indicar ROOT}
ROOT=$(cd "$ROOT" && pwd -P); exige_caminho_simples "$ROOT" ROOT
EV="$ROOT/evidencia"; PGDATA="$ROOT/pgdata"; SOCK="$ROOT/sock"
for f in postmaster.pid.registado pg_bin porta sysid postgres.sha256 argumentos.esperados; do [ -s "$EV/$f" ] || fail "falta evidencia/$f (correr R10)"; done
PID=$(cat "$EV/postmaster.pid.registado"); PG_BIN=$(cat "$EV/pg_bin"); PORT=$(cat "$EV/porta")
case "$PID" in ""|*[!0-9]*) fail "PID registado inválido" ;; esac
[ -d "/proc/$PID" ] || fail "processo $PID não existe"

# --- R1: identidade do processo
[ -r "$PGDATA/postmaster.pid" ] || fail "postmaster.pid ilegível"
[ "$(sed -n 1p "$PGDATA/postmaster.pid")" = "$PID" ] || fail "postmaster.pid não pertence ao PID registado"
[ "$(sed -n 2p "$PGDATA/postmaster.pid")" = "$PGDATA" ] || fail "postmaster.pid com outro PGDATA"
[ "$(sed -n 4p "$PGDATA/postmaster.pid")" = "$PORT" ] || fail "postmaster.pid com outra porta"
[ "$(sed -n 5p "$PGDATA/postmaster.pid")" = "$SOCK" ] || fail "postmaster.pid com outra pasta de socket"
[ -z "$(sed -n 6p "$PGDATA/postmaster.pid" | tr -d ' ')" ] || fail "postmaster.pid declara endereço TCP"
[ "$(sed -n 8p "$PGDATA/postmaster.pid" | tr -d ' ')" = ready ] || fail "servidor não está ready"
[ "$(exe_de "$PID")" = "$(readlink -f "$PG_BIN/postgres")" ] || fail "executável real do processo não é PG_BIN/postgres"
[ "$(sha256sum "/proc/$PID/exe" | cut -d' ' -f1)" = "$(cat "$EV/postgres.sha256")" ] || fail "sha256 do executável em execução difere do registado"
[ "$(readlink -f "/proc/$PID/cwd")" = "$PGDATA" ] || fail "pasta de trabalho do processo não é PGDATA"
tr '\000' '\012' < "/proc/$PID/cmdline" > "$EV/argumentos.obtidos"
cmp -s "$EV/argumentos.esperados" "$EV/argumentos.obtidos" || fail "argumentos do processo diferentes dos do R10"
[ "$(id -u)" = "$(sed -n 's/^Uid:[[:space:]]*\([0-9]*\).*/\1/p' "/proc/$PID/status")" ] || fail "processo servidor com outro utilizador"
S="$SOCK/.s.PGSQL.$PORT"
[ -S "$S" ] || fail "socket $S inexistente"
[ "$(sed -n 1p "$S.lock")" = "$PID" ] || fail "lock do socket não pertence ao PID"
INODE=$(awk -v p="$S" '$8 == p && $4 == "00010000" { print $7 }' "/proc/$PID/net/unix" | head -n 1)
[ -n "$INODE" ] || fail "socket em escuta não encontrado no namespace do processo"
found=no
for fd in /proc/"$PID"/fd/*; do
  if [ "$(readlink "$fd" 2>/dev/null || true)" = "socket:[$INODE]" ]; then found=yes; break; fi
done
[ "$found" = yes ] || fail "o socket $S não é um descritor do processo $PID"
ok "R1 processo $PID: executável, PGDATA, argumentos, socket (inode $INODE)"

# --- R2: rede, montagens, ambiente e HOME do servidor
rede_isolada_ou_falha "$PID"
montagens_ou_falha "$PID"
ambiente_limpo_ou_falha "$PID"
home_controlada_ou_falha "$PID" "$ROOT/home"
readlink "/proc/$PID/ns/net" > "$EV/netns.servidor"
readlink "/proc/$PID/ns/pid" > "$EV/pidns.servidor"
ok "R2 rede (só lo, sem rotas, sem sockets IP), montagens, ambiente e HOME do servidor"

# --- R3: configuração completa e nonce externo
for f in postgresql.conf postgresql.auto.conf pg_hba.conf pg_ident.conf postmaster.opts; do
  [ -r "$PGDATA/$f" ] || fail "não legível: $f"
done
C="$PGDATA/postgresql.conf $PGDATA/postgresql.auto.conf $PGDATA/pg_hba.conf $PGDATA/pg_ident.conf"
# shellcheck disable=SC2086
if grep -Eiq '^[[:space:]]*(include|include_if_exists|include_dir)([[:space:]=]|$)' $C; then fail "diretiva include ativa na configuração"; fi
if grep -Eiq '^[[:space:]]*(data_directory|config_file|hba_file|ident_file|external_pid_file)[[:space:]]*=' "$PGDATA/postgresql.conf" "$PGDATA/postgresql.auto.conf"; then fail "configuração relocaliza ficheiros"; fi
if grep -Ev '^[[:space:]]*(#|$)' "$PGDATA/postgresql.auto.conf" | grep -q .; then fail "postgresql.auto.conf com valores (ALTER SYSTEM)"; fi
n=$(awk '!/^[[:space:]]*(#|$)/ { if ($1 == "local") next; if ($1 ~ /^host/ && $NF == "reject") next; print }' "$PGDATA/pg_hba.conf" | wc -l)
[ "$n" -eq 0 ] || fail "pg_hba.conf com regras além de local / host reject"
n=$(grep -Evc '^[[:space:]]*(#|$)' "$PGDATA/pg_ident.conf" || true)
[ "$n" -eq 0 ] || fail "pg_ident.conf com mapeamentos"
grep -Fq '"listen_addresses="' "$PGDATA/postmaster.opts" || fail "postmaster.opts sem listen_addresses vazio"
EXT="$ROOT/nonce-externo/afonso-rehearsal.nonce"; IN="$PGDATA/afonso-rehearsal.nonce"
for f in "$EXT" "$IN"; do
  [ -f "$f" ] && [ ! -L "$f" ] || fail "nonce não é um ficheiro normal: $f"
  [ "$(stat -c %h "$f")" = 1 ] || fail "nonce com ligações físicas: $f"
done
E=$(readlink -f "$EXT")
case "$E/" in "$PGDATA"/*) fail "o nonce externo está dentro de PGDATA" ;; esac
[ "$(stat -c %d:%i "$EXT")" != "$(stat -c %d:%i "$IN")" ] || fail "nonce externo e interno são o mesmo ficheiro"
cmp -s "$EXT" "$IN" || fail "nonce diferente: não é a instância criada pelo R10"
SYSID=$("$PG_BIN/pg_controldata" "$PGDATA" | sed -n 's/^Database system identifier: *//p')
[ -n "$SYSID" ] && [ "$SYSID" = "$(cat "$EV/sysid")" ] && [ "$SYSID" = "$(cat "$PGDATA/afonso-rehearsal.sysid")" ] || fail "system identifier diferente do registado"
ok "R3 configuração (sem includes, sem relocalização, sem ALTER SYSTEM, hba só local), nonce externo fora de PGDATA, sysid"
echo "R20 APROVADO (PID $PID). Isto NÃO prova sozinho o isolamento: ver E1–E9."
