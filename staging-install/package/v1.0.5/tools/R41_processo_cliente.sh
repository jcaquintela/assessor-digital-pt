#!/bin/sh
# AFONSO V2 · pacote v1.0.4 · R41 · o processo servidor DESTA sessão e o processo CLIENTE.
# ESTADO: PREPARADO, NUNCA EXECUTADO. Chamado SÓ pela cópia do guião ensaio/R40_sessao.psql (por \set `…`).
# Uso interno: sh R41_processo_cliente.sh <ROOT> <PASTA_DA_SESSÃO>   (os dois são caminhos simples já validados)
# A autorização NÃO vem por argumento (para nada passar pela linha de comando do psql): é lida de
# <sessão>/autorizacao e tem de ser igual à registada pelo R10. O PID da sessão é lido de <sessão>/bpid.
# Stdout: UMA linha, só "R41 APROVADO" em caso de sucesso. Qualquer falha: mensagem no stderr, stdout
# vazio, código 2 — o guião compara a linha exata e transforma tudo o resto num erro (RAISE).
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
[ "$#" -eq 2 ] || fail "uso interno: R41 <ROOT> <SESSÃO>"
exige_caminho_simples "$1" ROOT; exige_caminho_simples "$2" sessão
ROOT=$1; SESS=$2; EV=$ROOT/evidencia
case "$SESS" in "$EV/sessoes/"*) ;; *) fail "pasta da sessão fora de evidencia/sessoes" ;; esac
AUT=$(ler1 "$SESS/autorizacao") || exit 2
exige_autorizacao "$AUT"
[ "$AUT" = "$(ler1 "$EV/autorizacao")" ] || fail "autorização da sessão diferente da registada pelo R10"
T=$SESS/tmp.R41
mkdir -- "$T" || fail "mkdir falhou (R41 já correu nesta sessão?)"
BPID=$(ler1 "$SESS/bpid") || exit 2; exige_num "$BPID" "PID da sessão"
PID=$(ler1 "$EV/postmaster.pid.registado") || exit 2
EXEID=$(ler1 "$EV/postgres.exe_id") || exit 2
PSQLID=$(ler1 "$EV/psql.exe_id") || exit 2

# 1. O postmaster continua a ser o do R10 (identidade estável, V5).
postmaster_igual_ou_falha "$PID" "$T/identidade" "$EV/identidade.postmaster"
NETNS=$(chave "$EV/identidade.postmaster" netns) || exit 2
PIDNS=$(chave "$EV/identidade.postmaster" pidns) || exit 2
CG=$(chave "$EV/identidade.postmaster" cgroup) || exit 2
INI=$(chave "$EV/identidade.postmaster" inicio) || exit 2

# 2. O processo servidor desta sessão: filho direto do postmaster, mesmo executável, nascido depois dele,
#    mesmos namespaces e mesma unidade.
[ -d "/proc/$BPID" ] || fail "processo da sessão invisível: cliente e servidor têm de partilhar o namespace de PIDs (E4)"
[ "$(pai_de "$BPID")" = "$PID" ] || fail "o processo da sessão não é filho do postmaster provado por R20"
[ "$(exe_id "$BPID")" = "$EXEID" ] || fail "o processo da sessão corre outro executável"
BI=$(inicio_de "$BPID") || exit 2
[ "$BI" -ge "$INI" ] || fail "o processo da sessão é anterior ao postmaster (PID reutilizado?)"
[ "$(ns_de "$BPID" net)" = "$NETNS" ] || fail "processo da sessão noutro namespace de rede"
[ "$(cgroup_de "$BPID")" = "$CG" ] || fail "processo da sessão fora da unidade do servidor"

# 3. O cliente: o psql lançado pelo R40 (PID registado) é antepassado deste script (psql -> sh -c -> sh R41)
#    e é identificado pelo executável (dispositivo:inode), não pela linha de comando.
i=0
while [ ! -s "$SESS/psql.pid" ] && [ "$i" -lt 5 ]; do sleep 1; i=$((i + 1)); done
CPID=$(ler1 "$SESS/psql.pid") || exit 2; exige_num "$CPID" "PID do psql"
p=$$; CLI=; i=0
while [ "$i" -lt 4 ]; do
  p=$(pai_de "$p") || exit 2
  [ "$p" -gt 1 ] || break
  if [ "$(exe_id "$p")" = "$PSQLID" ]; then CLI=$p; break; fi
  i=$((i + 1))
done
[ -n "$CLI" ] || fail "processo psql do cliente não encontrado entre os antepassados"
[ "$CLI" = "$CPID" ] || fail "o psql antepassado não é o lançado pelo R40 para esta sessão"
[ "$(sha_de "/proc/$CLI/exe")" = "$(ler1 "$EV/psql.sha256")" ] || fail "sha256 do psql em execução difere do registado"
[ "$(ns_de "$CLI" net)" = "$NETNS" ] || fail "cliente noutro namespace de rede"
[ "$(ns_de "$CLI" pid)" = "$PIDNS" ] || fail "cliente noutro namespace de PIDs"
[ "$(cgroup_de "$CLI")" != "$CG" ] || fail "o cliente corre DENTRO da unidade do servidor (E10: só o servidor lá dentro)"
ambiente_limpo_ou_falha "$CLI" "" "$T"
home_controlada_ou_falha "$CLI" "$ROOT/home" "$T"
rede_isolada_ou_falha "$CLI"
montagens_ou_falha "$CLI" "$T"
printf 'sessao=%s\npostmaster=%s\npsql=%s\n' "$BPID" "$PID" "$CLI" > "$SESS/R41.pids" || fail "escrita falhou"
rm -rf -- "$T"
echo "R41 APROVADO"
