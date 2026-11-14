#!/bin/sh
# AFONSO V2 · pacote v1.0.3 · R40 · LIGAÇÃO DO CLIENTE ao processo provado por R20 (R1/R2/R3).
# ESTADO: PREPARADO, NUNCA EXECUTADO. Correr só depois de "R20 APROVADO".
# Uso: env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C sh tools/R40_ligar_cliente.sh AUTORIZADO:<ref> <ROOT>
#
# O cliente (psql) liga-se APENAS pelo socket de <ROOT>/sock (host=<pasta>, sem TCP, sem serviço,
# sem .psqlrc, HOME vazia). Na MESMA sessão:
#   1. lê pg_backend_pid();
#   2. R41 (fora do SQL) prova que esse processo é filho do postmaster do R20, com o mesmo executável,
#      e que o psql corre no MESMO namespace de rede (isolado) e com ambiente/HOME/montagens controlados;
#   3. R30 (SQL só de leitura) confere data_directory, system identifier, nonce, opções efetivas e a
#      sua origem, ficheiros de configuração e pg_hba;
#   4. confirma que a sessão não mudou.
# Qualquer falha => erro do psql (ON_ERROR_STOP) => REPROVADO. Nenhum valor secreto é impresso.
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
PKG=$(cd "$TOOLS/.." && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
AUT=$1
ROOT=${2:?indicar ROOT}
ROOT=$(cd "$ROOT" && pwd -P); exige_caminho_simples "$ROOT" ROOT; exige_caminho_simples "$PKG" pacote
EV="$ROOT/evidencia"
for f in postmaster.pid.registado pg_bin porta sysid netns.servidor; do [ -s "$EV/$f" ] || fail "falta evidencia/$f (correr R10 e R20)"; done
PID=$(cat "$EV/postmaster.pid.registado"); PG_BIN=$(cat "$EV/pg_bin"); PORT=$(cat "$EV/porta"); SYSID=$(cat "$EV/sysid")
kill -0 "$PID" 2>/dev/null || fail "postmaster $PID não está a correr"
[ "$(sed -n 1p "$ROOT/pgdata/postmaster.pid")" = "$PID" ] || fail "postmaster.pid mudou desde o R20"
ambiente_limpo_ou_falha "$$"
rede_isolada_ou_falha "$$"
[ "$(readlink "/proc/$$/ns/net")" = "$(cat "$EV/netns.servidor")" ] || fail "o cliente não está no namespace de rede do servidor"
NONCE_SHA=$(sha256sum "$ROOT/nonce-externo/afonso-rehearsal.nonce" | cut -d' ' -f1)
mkdir -p "$EV/sql"
sed -e "s#__R_PGDATA__#$ROOT/pgdata#g" -e "s#__R_SOCKDIR__#$ROOT/sock#g" -e "s#__R_SYSID__#$SYSID#g" \
    -e "s#__R_PORT__#$PORT#g" -e "s#__R_NONCE_SHA256__#$NONCE_SHA#g" \
    "$PKG/ensaio/R30_sessao_alvo.sql" > "$EV/sql/R30.sql"
if grep -q '__R_' "$EV/sql/R30.sql"; then fail "marcador __R_…__ por substituir no R30"; fi
set +e
env -i PATH="$PG_BIN:/usr/bin:/bin" HOME="$ROOT/home" LANG=C \
  "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 \
  -v r40_aut="$AUT" -v r40_root="$ROOT" -v r40_tools="$TOOLS" -v r40_r30="$EV/sql/R30.sql" \
  -d "host=$ROOT/sock port=$PORT dbname=postgres user=ensaio_super sslmode=disable connect_timeout=5" \
  -f "$PKG/ensaio/R40_ligacao.psql" > "$EV/R40.out" 2>&1
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "R40 reprovado (psql rc=$rc; ver evidencia/R40.out)"
grep -q 'R41 APROVADO' "$EV/R40.out" || fail "R41 sem aprovação"
grep -q 'R30 APROVADO' "$EV/R40.out" || fail "R30 sem aprovação"
grep -q 'MESMA SESSÃO' "$EV/R40.out" || fail "sessão mudou durante o R40"
echo "R40 APROVADO: cliente ligado ao processo $PID pelo socket provado. Isto NÃO prova sozinho o isolamento: ver E1–E9."
