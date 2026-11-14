#!/bin/sh
# AFONSO V2 · pacote v1.0.3 · R41 · O processo servidor DESTA sessão e o processo CLIENTE (R1/R2).
# ESTADO: PREPARADO, NUNCA EXECUTADO. Chamado SÓ pelo R40 (de dentro da sessão psql, por \set `…`).
# Uso interno: sh R41_processo_cliente.sh AUTORIZADO:<ref> <ROOT> <PID do processo servidor da sessão>
# Imprime UMA linha: "R41 APROVADO" ou "REPROVADO: …" (o R40 transforma a segunda num erro SQL).
set -eu
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
ROOT=${2:?}; BPID=${3:?}
case "$BPID" in ""|*[!0-9]*) fail "PID da sessão inválido" ;; esac
EV="$ROOT/evidencia"
PID=$(cat "$EV/postmaster.pid.registado"); PG_BIN=$(cat "$EV/pg_bin")
[ -d "/proc/$BPID" ] || fail "processo da sessão invisível: cliente e servidor têm de partilhar o namespace de PIDs (E4)"
[ "$(ppid_de "$BPID")" = "$PID" ] || fail "o processo da sessão não é filho do postmaster provado por R20"
[ "$(exe_de "$BPID")" = "$(readlink -f "$PG_BIN/postgres")" ] || fail "o processo da sessão corre outro executável"
[ "$(readlink "/proc/$BPID/ns/net")" = "$(cat "$EV/netns.servidor")" ] || fail "processo da sessão noutro namespace de rede"
# Antepassado psql deste script (psql -> sh -c -> sh R41): no máximo 6 níveis.
p=$$; CLI=; i=0
while [ "$i" -lt 6 ] && [ "$p" -gt 1 ]; do
  p=$(ppid_de "$p")
  if [ "$(exe_de "$p")" = "$(readlink -f "$PG_BIN/psql")" ]; then CLI=$p; break; fi
  i=$((i + 1))
done
[ -n "$CLI" ] || fail "processo psql do cliente não encontrado"
[ "$(sha256sum "/proc/$CLI/exe" | cut -d' ' -f1)" = "$(cat "$EV/psql.sha256")" ] || fail "sha256 do psql em execução difere do registado"
[ "$(readlink "/proc/$CLI/ns/net")" = "$(cat "$EV/netns.servidor")" ] || fail "cliente noutro namespace de rede"
[ "$(readlink "/proc/$CLI/ns/pid")" = "$(cat "$EV/pidns.servidor")" ] || fail "cliente noutro namespace de PIDs"
ambiente_limpo_ou_falha "$CLI"
home_controlada_ou_falha "$CLI" "$ROOT/home"
rede_isolada_ou_falha "$CLI"
montagens_ou_falha "$CLI"
printf '%s %s %s\n' "$BPID" "$PID" "$CLI" > "$EV/R41.pids"
echo "R41 APROVADO"
