#!/bin/sh
# Valida este pacote numa instância PostgreSQL 17 DESCARTÁVEL (ver ../../rehearsal/README.md):
# simula o staging atual (0000 + conta de proprietário SINTÉTICA com papel admin), corre o
# preflight em modo só de leitura, aplica os 4 SQL e corre o posflight em modo só de leitura.
# NUNCA apontar para uma base gerida: só fala com /tmp/afonso-disposable-pg/sock.
set -eu
B=/tmp/afonso-disposable-pg; PKG="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_0000="${STAGING_0000:?caminho para 0000_staging_access_control.sql do staging (só leitura)}"
EM=proprietario.sintetico@afonso-staging.invalid; DB=afonso_pkg_check; OUT="${OUT:-$PKG/evidence}"
[ "$($B/psql.sh -d postgres -At -c "select current_setting('listen_addresses')")" = "" ] || { echo "ABORTAR: instância com TCP"; exit 2; }
$B/psql.sh -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null 2>&1
sed "s/ALTER DATABASE afonso_disposable/ALTER DATABASE $DB/" "$PKG/../../rehearsal/00_supabase_shim.sql" > /tmp/shim_pkg.sql
$B/psql.sh -d $DB -1 -f /tmp/shim_pkg.sql >/dev/null 2>&1
$B/psql.sh -d $DB -1 -f "$STAGING_0000" >/dev/null
$B/psql.sh -d $DB -c "INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data, created_at) VALUES ('00000000-0000-4000-8000-0000000000e1', '$EM', now() - interval '2 hours', '{\"provider\":\"email\"}', now() - interval '3 hours'); INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-0000000000e1', 'admin');" >/dev/null
ro() { sed "s/__EMAIL_AUTORIZADO__/$EM/" "$1" > /tmp/q_pkg.sql; $B/psql.sh -d $DB -A -F ' | ' -c "SET default_transaction_read_only = on" -f /tmp/q_pkg.sql; }
: > "$OUT/preflight-disposable.txt"; for f in "$PKG"/preflight/*.sql; do echo "##### $(basename "$f")" >> "$OUT/preflight-disposable.txt"; ro "$f" >> "$OUT/preflight-disposable.txt" 2>&1; done
( cd "$PKG/sql" && for f in S2-00_*.sql S2-01_*.sql S2-02_*.sql S2-99_*.sql; do $B/psql.sh -d $DB -1 -f "$f" >/dev/null 2>/tmp/pkg_err.txt || { echo "FALHOU $f"; cat /tmp/pkg_err.txt; exit 1; }; echo "aplicado $f"; done ) > "$OUT/apply-disposable.txt"
: > "$OUT/posflight-disposable.txt"; for f in "$PKG"/posflight/*.sql; do echo "##### $(basename "$f")" >> "$OUT/posflight-disposable.txt"; ro "$f" >> "$OUT/posflight-disposable.txt" 2>&1; done
$B/psql.sh -d postgres -c "DROP DATABASE $DB" >/dev/null
err=$(grep -h "ERROR" "$OUT"/*-disposable.txt || true)
[ -z "$err" ] || { echo "ERROS:"; echo "$err"; exit 1; }
python3 "$PKG/tools/check_results.py" "$OUT/preflight-disposable.txt" "$OUT/posflight-disposable.txt"
echo "todas as verificações obrigatórias = true; aplicação dos 4 SQL OK"
