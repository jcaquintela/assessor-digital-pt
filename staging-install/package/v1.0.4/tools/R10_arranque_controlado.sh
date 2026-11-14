#!/bin/sh
# AFONSO V2 · pacote v1.0.4 · R10 · ARRANQUE CONTROLADO da instância PostgreSQL 17 DESCARTÁVEL.
# ESTADO: PREPARADO, NUNCA EXECUTADO. Só com autorização separada e com as obrigações E1–E10 cumpridas.
#
# Uso (dentro da unidade/cgroup DEDICADA ao servidor, E10, e do namespace de rede isolado, E3):
#   env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C \
#     sh tools/R10_arranque_controlado.sh AUTORIZADO:<ref> <ROOT> <PG_BIN> <PORTA> <INSTALADA|NOVA> <FICHA_E>
# <ROOT>    pasta VAZIA criada para este ensaio (caminho absoluto simples), do utilizador que corre o R10.
# <PG_BIN>  pasta com postgres, initdb, pg_controldata, psql da versão 17.
# <FICHA_E> ficha do operador com a evidência de E1–E10 (modelo: operador/E-EVIDENCIA.modelo).
#
# Ordem: (1) marca a pasta como do ensaio e regista a unidade/cgroup ANTES de criar qualquer processo, para o
# R90 conseguir limpar qualquer preparação parcial (V6); (2) recusa sem ficha E completa e com a entrada 0000
# PENDENTE (B14); (3) verifica o próprio ambiente/rede/montagens; (4) nonce FORA de PGDATA; (5) initdb só local;
# (6) arranca o postmaster DIRETAMENTE (sem pg_ctl, $! = PID do postmaster); (7) regista a identidade estável
# do processo (início, executável dispositivo:inode, cwd, namespaces, cgroup).
# Em erro ou interrupção depois de arrancar: pede paragem rápida ao SEU postmaster (só se a identidade
# confere) e manda correr o R90 FORA da unidade. NÃO prova isolamento sozinho (E1–E10).
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
PKG=$(cd "$TOOLS/.." && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
AUT=$1
[ "$#" -eq 6 ] || fail "uso: R10 AUTORIZADO:<ref> <ROOT> <PG_BIN> <PORTA> <INSTALADA|NOVA> <FICHA_E>"
ROOT=$2; PG_BIN=$3; PORT=$4; VARIANTE=$5; FICHA=$6
exige_num "$PORT" porta
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "porta fora de 1024–65535"
case "$VARIANTE" in INSTALADA|NOVA) ;; *) fail "variante tem de ser INSTALADA ou NOVA" ;; esac
EU=$(id -u) || fail "id falhou"
[ "$EU" != 0 ] || fail "não correr como root (E8)"
[ -d "$ROOT" ] && [ ! -L "$ROOT" ] || fail "ROOT não existe ou é ligação simbólica"
ROOT=$(cd "$ROOT" && pwd -P) || fail "ROOT ilegível"; exige_caminho_simples "$ROOT" ROOT
exige_caminho_simples "$PKG" pacote
[ -d "$PG_BIN" ] || fail "PG_BIN não existe"
PG_BIN=$(cd "$PG_BIN" && pwd -P) || fail "PG_BIN ilegível"; exige_caminho_simples "$PG_BIN" PG_BIN
DONO=$(stat -c %u -- "$ROOT") || fail "stat falhou: ROOT"
[ "$DONO" = "$EU" ] || fail "ROOT não pertence ao utilizador do ensaio (E8)"
CONTEUDO=$(ls -A -- "$ROOT") || fail "ROOT ilegível"
[ -z "$CONTEUDO" ] || fail "ROOT tem de estar vazia (criada para este ensaio)"

# 1. Unidade/cgroup dedicada (E10): v2 unificado, não a raiz, com cgroup.kill; neste momento só este shell lá dentro.
CG=$(cgroup_de "$$") || exit 2
[ "$CG" != / ] || fail "o R10 corre no cgroup raiz: exige uma unidade/cgroup dedicada (E10)"
CGD=/sys/fs/cgroup$CG
[ -r "$CGD/cgroup.procs" ] || fail "cgroup.procs ilegível em $CGD (E10)"
[ -w "$CGD/cgroup.kill" ] || fail "cgroup.kill indisponível em $CGD (E10 exige cgroup v2 com cgroup.kill delegado)"
NPROC=0; ALHEIO=
while IFS= read -r p; do NPROC=$((NPROC + 1)); [ "$p" = "$$" ] || ALHEIO="$ALHEIO $p"; done < "$CGD/cgroup.procs" || fail "leitura falhou: cgroup.procs"
[ "$NPROC" -ge 1 ] && [ -z "$ALHEIO" ] || fail "a unidade do servidor tem outros processos ($ALHEIO): não é dedicada (E10)"

# Marca + cgroup registados ANTES de qualquer processo do ensaio (o R90 depende disto para preparações parciais).
printf 'versao=%s\nautorizacao=%s\n' "$VERSAO_PACOTE" "$AUT" > "$ROOT/$MARCA" || fail "escrita falhou: marca"
mkdir -- "$ROOT/.tmp" "$ROOT/evidencia" || fail "mkdir falhou"
EV=$ROOT/evidencia; T=$ROOT/.tmp
printf '%s\n' "$CG" > "$EV/cgroup" || fail "escrita falhou"
printf '%s\n' "$AUT" > "$EV/autorizacao" || fail "escrita falhou"
printf 'criada\n' > "$EV/fase" || fail "escrita falhou"

PID=
falhou() {
  rc=$?
  trap - EXIT INT TERM HUP
  if [ -n "$PID" ] && [ -f "$EV/postgres.exe_id" ] && [ -d "/proc/$PID" ]; then
    e=$(exe_id "$PID" 2>/dev/null || true); c=$(cwd_de "$PID" 2>/dev/null || true)
    if [ "$e" = "$(cat -- "$EV/postgres.exe_id" 2>/dev/null || true)" ] && [ "$c" = "$ROOT/pgdata" ]; then kill -INT "$PID" 2>/dev/null || true; fi
  fi
  printf 'R10 FALHOU (código %s, fase %s): correr o R90 FORA da unidade do servidor; se o R90 não disser DESCARTADO, destruir a máquina (E1)\n' "$rc" "$(cat -- "$EV/fase" 2>/dev/null || echo '?')" >&2
  exit "$rc"
}
trap falhou EXIT
trap 'exit 130' INT TERM HUP

# 2. Recusas antecipadas (falha fechada): ficha de evidência E1–E10 e entrada 0000.
[ -f "$FICHA" ] && [ ! -L "$FICHA" ] && [ -r "$FICHA" ] || fail "ficha E ilegível ou não é ficheiro normal"
cp -- "$FICHA" "$EV/E-evidencia" || fail "cópia da ficha E falhou"
RES=$(awk -v lista="E1 E2 E3 E4 E5 E6 E7 E8 E9 E10" '
  BEGIN { n = split(lista, L, " "); for (j = 1; j <= n; j++) ok[L[j]] = 1; ok["operador"] = 1; ok["data"] = 1 }
  /^[[:space:]]*(#|$)/ { next }
  { i = index($0, "="); if (i < 2) { bad = bad " linha" NR; next } k = substr($0, 1, i - 1); v = substr($0, i + 1); c[k]++; val[k] = v; if (!(k in ok)) bad = bad " " k "(desconhecida)" }
  END {
    for (j = 1; j <= n; j++) { k = L[j]; if (c[k] != 1) bad = bad " " k "(em falta ou repetida)"; else if (length(val[k]) < 8 || toupper(val[k]) ~ /PENDENTE|POR VERIFICAR|TODO|N\/A/) bad = bad " " k "(sem evidência)" }
    if (c["operador"] != 1 || length(val["operador"]) < 2 || toupper(val["operador"]) ~ /PENDENTE/) bad = bad " operador"
    if (c["data"] != 1 || val["data"] !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/) bad = bad " data"
    print (bad == "" ? "OK" : "FALHA" bad)
  }' "$EV/E-evidencia") || fail "ficha E ilegível"
[ "$RES" = OK ] || fail "ficha E1–E10 incompleta: $RES (o R10 só confere a forma; a verdade é do operador)"
sha_de "$EV/E-evidencia" > "$EV/E-evidencia.sha256" || exit 2
E0000=$(chave "$PKG/entradas/0000/ESPERADO" estado) || exit 2
case "$E0000" in
  AUTENTICADO|ALTERNATIVO_AUDITADO) ;;
  *) fail "entrada 0000 do staging em estado $E0000 (B14): sem ficheiro histórico autenticado nem bootstrap alternativo auditado, o ensaio não arranca" ;;
esac
pacote_integro_ou_falha "$PKG" "$T" || exit 2

# 3. O próprio processo: ambiente mínimo, rede isolada, montagens sem segredos.
ambiente_limpo_ou_falha "$$" "" "$T"
rede_isolada_ou_falha "$$"
montagens_ou_falha "$$" "$T"
ok "R10 ambiente/rede/montagens/unidade do arranque"

for b in postgres initdb pg_controldata psql; do [ -x "$PG_BIN/$b" ] && [ -f "$PG_BIN/$b" ] || fail "falta $PG_BIN/$b"; done
V=$("$PG_BIN/postgres" -V) || fail "postgres -V falhou"
case "$V" in *" 17."[0-9]*) ;; *) fail "esperado PostgreSQL 17" ;; esac
printf '%s\n' "$VARIANTE" > "$EV/variante" || fail "escrita falhou"
printf '%s\n' "$PG_BIN" > "$EV/pg_bin" || fail "escrita falhou"
printf '%s\n' "$PORT" > "$EV/porta" || fail "escrita falhou"
sha_de "$PG_BIN/postgres" > "$EV/postgres.sha256" || exit 2
sha_de "$PG_BIN/psql" > "$EV/psql.sha256" || exit 2
ficheiro_id "$PG_BIN/postgres" > "$EV/postgres.exe_id" || exit 2
ficheiro_id "$PG_BIN/psql" > "$EV/psql.exe_id" || exit 2

mkdir -- "$ROOT/pgdata" "$ROOT/sock" "$ROOT/home" "$ROOT/nonce-externo" || fail "mkdir falhou"
chmod 700 -- "$ROOT/pgdata" "$ROOT/sock" "$ROOT/home" "$ROOT/nonce-externo" "$EV" "$T" || fail "chmod falhou"

# 4. Nonce gravado PRIMEIRO fora de PGDATA (referência externa), só depois copiado para dentro.
od -An -N32 -tx1 /dev/urandom > "$T/nonce.od" || fail "leitura de /dev/urandom falhou"
tr -d ' \n' < "$T/nonce.od" > "$ROOT/nonce-externo/afonso-rehearsal.nonce" || fail "nonce falhou"
rm -f -- "$T/nonce.od"
N=$(ler1 "$ROOT/nonce-externo/afonso-rehearsal.nonce") || exit 2
exige_hex64 "$N" nonce
chmod 400 -- "$ROOT/nonce-externo/afonso-rehearsal.nonce" || fail "chmod falhou"
sha_de "$ROOT/nonce-externo/afonso-rehearsal.nonce" > "$EV/nonce.sha256" || exit 2

# 5. initdb: superutilizador só do ensaio, autenticação local trust (socket em pasta 0700), TCP rejeitado.
printf 'initdb\n' > "$EV/fase" || fail "escrita falhou"
env -i PATH="$PG_BIN:/usr/bin:/bin" HOME="$ROOT/home" LANG=C \
  "$PG_BIN/initdb" -D "$ROOT/pgdata" -U ensaio_super --auth-local=trust --auth-host=reject \
  -E UTF8 --locale=C --no-instructions > "$EV/initdb.log" 2>&1 || fail "initdb falhou (evidencia/initdb.log)"
cp -- "$ROOT/nonce-externo/afonso-rehearsal.nonce" "$ROOT/pgdata/afonso-rehearsal.nonce" || fail "cópia do nonce falhou"
chmod 400 -- "$ROOT/pgdata/afonso-rehearsal.nonce" || fail "chmod falhou"
"$PG_BIN/pg_controldata" "$ROOT/pgdata" > "$T/controldata" || fail "pg_controldata falhou"
SYSID=$(awk -F: '$1 == "Database system identifier" { gsub(/[[:space:]]/, "", $2); print $2 }' "$T/controldata") || fail "pg_controldata ilegível"
exige_num "$SYSID" "system identifier"
printf '%s\n' "$SYSID" > "$ROOT/pgdata/afonso-rehearsal.sysid" || fail "escrita falhou"
printf '%s\n' "$SYSID" > "$EV/sysid" || fail "escrita falhou"

# 6. Arranque direto do postmaster com as opções críticas na linha de comando. A lista fica em
#    evidencia/argumentos.esperados SÓ como evidência: a origem efetiva das opções é confirmada pelo R30
#    (pg_settings.source = 'command line'), não pela linha de comando do processo (mutável, V5).
# shellcheck disable=SC2016 # $libdir é literal para o PostgreSQL
{
  printf '%s\n' "$PG_BIN/postgres" -D "$ROOT/pgdata"
  for o in "listen_addresses=" "unix_socket_directories=$ROOT/sock" "port=$PORT" \
           "shared_preload_libraries=" "session_preload_libraries=" "local_preload_libraries=" \
           "wal_level=minimal" "max_wal_senders=0" "archive_mode=off" "ssl=off" \
           "logging_collector=off" "log_destination=stderr" 'dynamic_library_path=$libdir' "jit=off"; do
    printf '%s\n' -c "$o"
  done
} > "$EV/argumentos.esperados" || fail "escrita falhou"
printf 'arranque\n' > "$EV/fase" || fail "escrita falhou"
# shellcheck disable=SC2016 # $libdir é literal para o PostgreSQL
env -i PATH="$PG_BIN:/usr/bin:/bin" HOME="$ROOT/home" LANG=C \
  "$PG_BIN/postgres" -D "$ROOT/pgdata" \
  -c listen_addresses= -c "unix_socket_directories=$ROOT/sock" -c "port=$PORT" \
  -c shared_preload_libraries= -c session_preload_libraries= -c local_preload_libraries= \
  -c wal_level=minimal -c max_wal_senders=0 -c archive_mode=off -c ssl=off \
  -c logging_collector=off -c log_destination=stderr -c 'dynamic_library_path=$libdir' -c jit=off \
  > "$EV/postgres.log" 2>&1 &
PID=$!
printf '%s\n' "$PID" > "$EV/postmaster.pid.registado" || fail "escrita falhou"
printf 'arrancado\n' > "$EV/fase" || fail "escrita falhou"

i=0; PRONTO=nao
while [ "$i" -lt 30 ]; do
  [ -d "/proc/$PID" ] || fail "o servidor terminou no arranque (evidencia/postgres.log)"
  if [ -f "$ROOT/pgdata/postmaster.pid" ]; then
    L8=$(sed -n 8p "$ROOT/pgdata/postmaster.pid") || fail "postmaster.pid ilegível"
    case "$L8" in *ready*) PRONTO=sim; break ;; esac
  fi
  sleep 1; i=$((i + 1))
done
[ "$PRONTO" = sim ] || fail "o servidor não ficou pronto em 30 s"

# 7. Identidade estável do postmaster (V5): é esta, e não a linha de comando, que R20/R41/R90 comparam.
identidade_para "$PID" "$EV/identidade.postmaster" || exit 2
[ "$(chave "$EV/identidade.postmaster" exe_id)" = "$(ler1 "$EV/postgres.exe_id")" ] || fail "o processo arrancado não corre PG_BIN/postgres"
[ "$(chave "$EV/identidade.postmaster" cwd)" = "$ROOT/pgdata" ] || fail "pasta de trabalho do postmaster não é PGDATA"
[ "$(chave "$EV/identidade.postmaster" cgroup)" = "$CG" ] || fail "o postmaster não ficou na unidade dedicada (E10)"
L1=$(sed -n 1p "$ROOT/pgdata/postmaster.pid") || fail "postmaster.pid ilegível"
[ "$L1" = "$PID" ] || fail "postmaster.pid não pertence ao PID arrancado"
L3=$(sed -n 3p "$ROOT/pgdata/postmaster.pid") || fail "postmaster.pid ilegível"
exige_num "$L3" "início no postmaster.pid"
printf '%s\n' "$L3" > "$EV/postmaster.inicio" || fail "escrita falhou"
printf 'pronto\n' > "$EV/fase" || fail "escrita falhou"
rm -f -- "$T/controldata"
trap - EXIT INT TERM HUP
echo "R10 PRONTO (PID $PID): seguir para R20; nenhum SQL antes de R20 e do passo R30 do R40"
