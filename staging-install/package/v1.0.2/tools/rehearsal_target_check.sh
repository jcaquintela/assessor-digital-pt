#!/bin/sh
# AFONSO V2 · pacote v1.0.2 · verificação do ALVO do ensaio descartável FORA do SQL.
# ESTADO: PREPARADO, NUNCA EXECUTADO. Correr só com autorização separada, ANTES de qualquer SQL.
#
# Porquê fora do SQL: P00/Q00 leem marcas DENTRO da base (ex.: staging_notes); uma base qualquer
# pode ter essas marcas. Aqui verifica-se a instância pelo sistema de ficheiros e pelo próprio
# binário do PostgreSQL, sem abrir ligações, sem credenciais e sem rede.
#
# Regras: não lê nem imprime VALORES de variáveis de ambiente (só nomes), não usa rede, não liga
# a nenhuma base, não lê ~/.pgpass. Correr num ambiente limpo, por exemplo:
#   env -i PATH="/caminho/pg17/bin:/usr/bin:/bin" HOME=/tmp/ensaio sh tools/rehearsal_target_check.sh <PGDATA> <nonce>
# <PGDATA>: pasta da instância descartável criada (initdb) para ESTE ensaio.
# <nonce>:  ficheiro guardado FORA de PGDATA, com o valor aleatório que o operador gravou em
#           <PGDATA>/afonso-rehearsal.nonce logo a seguir ao initdb (e o system identifier em
#           <PGDATA>/afonso-rehearsal.sysid).
set -eu
PGDATA_DIR="${1:?indicar a pasta PGDATA da instância descartável}"
NONCE_FILE="${2:?indicar o ficheiro do nonce guardado fora de PGDATA}"
fail() { echo "REPROVADO: $1"; exit 2; }

# 1. Ambiente sem credenciais nem integrações (só nomes; valores nunca lidos).
for n in $(env | sed 's/=.*//'); do
  case "$n" in
    PATH|HOME|PWD|SHLVL|_|OLDPWD|LANG|LC_*|TERM|TZ) ;;
    *) fail "variável de ambiente não permitida no ensaio: $n" ;;
  esac
done
for f in "$HOME/.pgpass" "$HOME/.pg_service.conf" "$HOME/.psqlrc"; do
  [ ! -e "$f" ] || fail "ficheiro de credenciais/serviço presente: $f"
done

# 2. A instância foi criada para este ensaio (nonce gravado pelo operador na criação).
[ -d "$PGDATA_DIR" ] || fail "PGDATA não existe"
[ -f "$PGDATA_DIR/afonso-rehearsal.nonce" ] || fail "sem afonso-rehearsal.nonce em PGDATA"
[ -s "$NONCE_FILE" ] || fail "ficheiro do nonce vazio ou inexistente"
cmp -s "$PGDATA_DIR/afonso-rehearsal.nonce" "$NONCE_FILE" || fail "nonce diferente: não é a instância criada para este ensaio"

# 3. Identificador do sistema lido do ficheiro de controlo (pg_controldata não usa SQL).
SYSID=$(pg_controldata "$PGDATA_DIR" | sed -n 's/^Database system identifier: *//p')
[ -n "$SYSID" ] || fail "pg_controldata sem system identifier"
[ -f "$PGDATA_DIR/afonso-rehearsal.sysid" ] || fail "sem afonso-rehearsal.sysid gravado na criação"
[ "$SYSID" = "$(cat "$PGDATA_DIR/afonso-rehearsal.sysid")" ] || fail "system identifier diferente do gravado na criação"

# 4. Sem TCP e sem bibliotecas de rede/agendamento (lido da configuração pelo binário, sem ligação).
LISTEN=$(postgres -D "$PGDATA_DIR" -C listen_addresses)
[ -z "$LISTEN" ] || fail "listen_addresses='$LISTEN' (tem de ser vazio: só socket local)"
PRELOAD=$(postgres -D "$PGDATA_DIR" -C shared_preload_libraries)
case "$PRELOAD" in *pg_net*|*pg_cron*|*http*|*dblink*|*postgres_fdw*) fail "biblioteca de rede/agendamento pré-carregada: $PRELOAD" ;; esac

# 5. Nenhum ficheiro de configuração aponta para servidores remotos.
if grep -Eqs '^[[:space:]]*(primary_conninfo|restore_command|archive_command)[[:space:]]*=' "$PGDATA_DIR/postgresql.conf" "$PGDATA_DIR/postgresql.auto.conf"; then
  fail "configuração com ligação/arquivo remoto"
fi

echo "APROVADO: alvo descartável verificado fora do SQL (system identifier $SYSID, só socket local, sem credenciais)."
echo "Seguinte: correr o cliente sem rede (ex.: unshare -n) e só pelo socket desta instância."
