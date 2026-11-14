#!/bin/sh
# Compara o esquema da base descartável com o que a app espera: descrição gerada
# (src/integrations/supabase/types.ts) e chamadas .from()/.rpc() do código. Só leitura.
set -eu
B=/tmp/afonso-disposable-pg; C=$B/cmp; mkdir -p $C; ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
P="$B/psql.sh -d afonso_disposable -At"
$P -F "$(printf '\t')" -c "select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' order by 1,2" > $C/db_columns.tsv
$P -c "select distinct proname from pg_proc where pronamespace='public'::regnamespace order by 1" > $C/db_functions.txt
$P -F "$(printf '\t')" -c "select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace order by 1, e.enumsortorder" > $C/db_enums.tsv
cd "$ROOT"
rg -o -N --no-filename '\.rpc\(\s*"([a-z0-9_]+)"' -r '$1' src | sort -u > $C/code_rpcs.txt
{ rg -o -N --no-filename '\.from\(\s*"([a-z0-9_]+)"' -r '$1' src; rg -o -N --no-filename "\.from\(\s*'([a-z0-9_]+)'" -r '$1' src || true; } | sort -u > $C/code_from.txt
python3 "$ROOT/staging-install/rehearsal/compare_schema.py" "$ROOT/src/integrations/supabase/types.ts" "$C"
