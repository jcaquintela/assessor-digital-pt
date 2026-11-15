#!/bin/sh
# AFONSO V2 · pacote v1.0.5 · R20 · PROVA DO PROCESSO SERVIDOR sem SQL. Falha fechada.
# ESTADO: PREPARADO, NUNCA EXECUTADO. O wrapper R40 corre-o no início de CADA sessão; pode correr-se à mão.
# Uso: env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C sh tools/R20_verificar_processo.sh AUTORIZADO:<ref> <ROOT>
# Stdout: só "R20 APROVADO" (o R40 compara a linha exata). Mensagens no stderr.
#
#  Identidade (V5): o postmaster é o MESMO processo do R10 — início em /proc/<pid>/stat, executável
#      (caminho + dispositivo:inode) e sha256, cwd = PGDATA, namespaces e cgroup; postmaster.pid (PID, PGDATA,
#      início, porta, socket, sem TCP, ready) e .lock do socket; o socket em escuta é descritor DESTE processo.
#      A linha de comando é guardada como evidência e NÃO decide (o processo pode reescrevê-la).
#  Unidade (E10, X2): cgroup v2 unificado em /sys/fs/cgroup (raiz "/") para o servidor e para o próprio R20;
#      a unidade NÃO tem subcgroups (antes e depois da leitura), por isso cgroup.procs lista todos os processos;
#      populated = 1; todos são o postmaster ou filhos diretos dele com o mesmo executável.
#  Só leitura: o R20 nunca segura o trinco global (corre dentro do R40, que o segura).
#  Rede/ambiente: só lo, sem rotas, sem sockets IP; montagens; ambiente e HOME do servidor.
#  Configuração: ficheiros lidos por completo (ilegível = falha), sem include*, sem relocalização, sem
#      ALTER SYSTEM, pg_hba só local (host* só reject), pg_ident vazio; nonce externo fora de PGDATA; sysid.
# LIMITE: prova o que o processo vê. Não substitui as obrigações E1–E10 do operador.
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
[ "$#" -eq 2 ] || fail "uso: R20 AUTORIZADO:<ref> <ROOT>"
ROOT=$(cd "$2" && pwd -P) || fail "ROOT ilegível"; exige_caminho_simples "$ROOT" ROOT
EV=$ROOT/evidencia; PGDATA=$ROOT/pgdata; SOCK=$ROOT/sock
[ -f "$ROOT/$MARCA" ] || fail "ROOT sem a marca do ensaio"
[ "$(ler1 "$EV/autorizacao")" = "$1" ] || fail "autorização diferente da registada pelo R10"
[ "$(ler1 "$EV/fase")" = pronto ] || fail "o R10 não terminou (fase diferente de pronto)"
T=$(mktemp -d "$ROOT/.tmp/R20.XXXXXX") || fail "mktemp falhou"
trap 'rm -rf -- "$T"' EXIT
PID=$(ler1 "$EV/postmaster.pid.registado") || exit 2; exige_num "$PID" PID
PG_BIN=$(ler1 "$EV/pg_bin") || exit 2; PORT=$(ler1 "$EV/porta") || exit 2
CG=$(ler1 "$EV/cgroup") || exit 2
EXEID=$(ler1 "$EV/postgres.exe_id") || exit 2

# --- Identidade estável do processo
postmaster_igual_ou_falha "$PID" "$T/identidade" "$EV/identidade.postmaster"
[ "$(exe_caminho "$PID")" = "$PG_BIN/postgres" ] || fail "executável real do processo não é PG_BIN/postgres"
[ "$(ficheiro_id "$PG_BIN/postgres")" = "$EXEID" ] || fail "PG_BIN/postgres foi substituído desde o R10"
[ "$(sha_de "/proc/$PID/exe")" = "$(ler1 "$EV/postgres.sha256")" ] || fail "sha256 do executável em execução difere do registado"
[ "$(uid_de "$PID")" = "$(id -u)" ] || fail "processo servidor com outro utilizador"
F=$PGDATA/postmaster.pid
[ -f "$F" ] && [ -r "$F" ] || fail "postmaster.pid ilegível"
L1=$(sed -n 1p "$F") || fail "postmaster.pid ilegível"
L2=$(sed -n 2p "$F") || fail "postmaster.pid ilegível"
L3=$(sed -n 3p "$F") || fail "postmaster.pid ilegível"
L4=$(sed -n 4p "$F") || fail "postmaster.pid ilegível"
L5=$(sed -n 5p "$F") || fail "postmaster.pid ilegível"
L6=$(sed -n 6p "$F") || fail "postmaster.pid ilegível"
L8=$(sed -n 8p "$F") || fail "postmaster.pid ilegível"
{ [ "$L1" = "$PID" ] && [ "$L2" = "$PGDATA" ] && [ "$L3" = "$(ler1 "$EV/postmaster.inicio")" ] && [ "$L4" = "$PORT" ] && [ "$L5" = "$SOCK" ]; } || fail "postmaster.pid não corresponde ao processo/PGDATA/início/porta/socket do R10"
v6=$L6; v6=${v6#"${v6%%[! ]*}"}; [ -z "$v6" ] || fail "postmaster.pid declara endereço TCP"
case "$L8" in *ready*) ;; *) fail "servidor não está ready" ;; esac
cat -- "/proc/$PID/cmdline" > "$EV/argumentos.obtidos.bin" || fail "cmdline ilegível"
S=$SOCK/.s.PGSQL.$PORT
[ -S "$S" ] || fail "socket $S inexistente"
[ "$(sed -n 1p "$S.lock")" = "$PID" ] || fail "lock do socket não pertence ao PID"
INODE=$(awk -v p="$S" '$8 == p && $4 == "00010000" { print $7; n++ } END { if (n != 1) print "x" }' "/proc/$PID/net/unix") || fail "não legível: /proc/$PID/net/unix"
exige_num "$INODE" "inode do socket em escuta (0 ou vários => falha)"
found=no
for fd in /proc/"$PID"/fd/*; do
  l=$(readlink -- "$fd" 2>/dev/null) || continue
  if [ "$l" = "socket:[$INODE]" ]; then found=yes; break; fi
done
[ "$found" = yes ] || fail "o socket $S não é um descritor do processo $PID"
ok "identidade do postmaster $PID (início, executável, cwd, namespaces, cgroup) e socket (inode $INODE)"

# --- Unidade dedicada (X2): cgroup v2, sem subcgroups, só o postmaster e filhos dele, com o mesmo executável
cgroup2_ou_falha "$PID"
cgroup2_ou_falha "$$"
CGD=/sys/fs/cgroup$CG
[ -d "$CGD" ] && [ ! -L "$CGD" ] || fail "unidade $CGD inexistente (E10)"
sem_descendentes_ou_falha "$CGD"
[ "$(populated_de "$CGD")" = 1 ] || fail "cgroup.events: unidade do servidor sem processos (E10)"
cat -- "$CGD/cgroup.procs" > "$T/procs" || fail "cgroup.procs ilegível (E10)"
n=0
while IFS= read -r p; do
  exige_num "$p" "PID na unidade"; n=$((n + 1))
  if [ "$p" = "$PID" ]; then continue; fi
  # Um filho que termina entre a listagem e a leitura (ex.: autovacuum worker) já não está na unidade: ignora-se
  # SÓ se /proc/<pid> desapareceu; qualquer outra falha de leitura reprova.
  pai=$(pai_de "$p" 2>/dev/null) || { [ ! -d "/proc/$p" ] || fail "processo $p na unidade ilegível"; continue; }
  eid=$(exe_id "$p" 2>/dev/null) || { [ ! -d "/proc/$p" ] || fail "executável do processo $p ilegível"; continue; }
  [ "$pai" = "$PID" ] || fail "processo $p na unidade do servidor não é filho do postmaster (unidade não dedicada, E10)"
  [ "$eid" = "$EXEID" ] || fail "processo $p na unidade do servidor corre outro executável"
done < "$T/procs" || fail "leitura falhou: cgroup.procs"
[ "$n" -ge 1 ] || fail "unidade do servidor vazia: o postmaster não está nela"
procura -Fxq "$PID" "$T/procs" || fail "o postmaster não está em cgroup.procs da unidade"
sem_descendentes_ou_falha "$CGD"
ok "unidade $CG: $n processos, todos do servidor"

# --- Rede, montagens, ambiente e HOME do servidor
rede_isolada_ou_falha "$PID"
montagens_ou_falha "$PID" "$T"
ambiente_limpo_ou_falha "$PID" "" "$T"
home_controlada_ou_falha "$PID" "$ROOT/home" "$T"
ok "rede (só lo, sem rotas, sem sockets IP), montagens, ambiente e HOME do servidor"

# --- Configuração completa e nonce externo
for f in postgresql.conf postgresql.auto.conf pg_hba.conf pg_ident.conf postmaster.opts; do
  [ -f "$PGDATA/$f" ] && [ ! -L "$PGDATA/$f" ] && [ -r "$PGDATA/$f" ] || fail "não legível ou não é ficheiro normal: $f"
done
for f in postgresql.conf postgresql.auto.conf pg_hba.conf pg_ident.conf; do
  if procura -Eiq '^[[:space:]]*(include|include_if_exists|include_dir)([[:space:]=]|$)' "$PGDATA/$f"; then fail "diretiva include ativa em $f"; fi
done
for f in postgresql.conf postgresql.auto.conf; do
  if procura -Eiq '^[[:space:]]*(data_directory|config_file|hba_file|ident_file|external_pid_file)[[:space:]]*=' "$PGDATA/$f"; then fail "$f relocaliza ficheiros"; fi
done
n=$(awk '!/^[[:space:]]*(#|$)/ { n++ } END { print n + 0 }' "$PGDATA/postgresql.auto.conf") || fail "postgresql.auto.conf ilegível"
[ "$n" -eq 0 ] || fail "postgresql.auto.conf com valores (ALTER SYSTEM)"
n=$(awk '!/^[[:space:]]*(#|$)/ { if ($1 == "local") next; if ($1 ~ /^host/ && $NF == "reject") next; n++ } END { print n + 0 }' "$PGDATA/pg_hba.conf") || fail "pg_hba.conf ilegível"
[ "$n" -eq 0 ] || fail "pg_hba.conf com regras além de local / host reject"
n=$(awk '!/^[[:space:]]*(#|$)/ { n++ } END { print n + 0 }' "$PGDATA/pg_ident.conf") || fail "pg_ident.conf ilegível"
[ "$n" -eq 0 ] || fail "pg_ident.conf com mapeamentos"
for o in "listen_addresses=" "unix_socket_directories=$SOCK" "port=$PORT" "shared_preload_libraries=" "ssl=off" "archive_mode=off"; do
  procura -Fq "\"$o\"" "$PGDATA/postmaster.opts" || fail "postmaster.opts sem a opção $o"
done
EXT=$ROOT/nonce-externo/afonso-rehearsal.nonce; IN=$PGDATA/afonso-rehearsal.nonce
for f in "$EXT" "$IN"; do
  [ -f "$f" ] && [ ! -L "$f" ] || fail "nonce não é um ficheiro normal: $f"
  [ "$(stat -c %h -- "$f")" = 1 ] || fail "nonce com ligações físicas: $f"
done
E=$(readlink -f -- "$EXT") || fail "readlink falhou"
case "$E/" in "$PGDATA"/*) fail "o nonce externo está dentro de PGDATA" ;; esac
[ "$(ficheiro_id "$EXT")" != "$(ficheiro_id "$IN")" ] || fail "nonce externo e interno são o mesmo ficheiro"
cmp -s -- "$EXT" "$IN" || fail "nonce diferente: não é a instância criada pelo R10"
[ "$(sha_de "$EXT")" = "$(ler1 "$EV/nonce.sha256")" ] || fail "nonce externo mudou desde o R10"
"$PG_BIN/pg_controldata" "$PGDATA" > "$T/controldata" || fail "pg_controldata falhou"
SYSID=$(awk -F: '$1 == "Database system identifier" { gsub(/[[:space:]]/, "", $2); print $2 }' "$T/controldata") || fail "pg_controldata ilegível"
exige_num "$SYSID" "system identifier"
{ [ "$SYSID" = "$(ler1 "$EV/sysid")" ] && [ "$SYSID" = "$(ler1 "$PGDATA/afonso-rehearsal.sysid")" ]; } || fail "system identifier diferente do registado"
ok "configuração, nonce externo fora de PGDATA, sysid"
echo "R20 APROVADO"
