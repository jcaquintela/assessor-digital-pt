#!/bin/sh
# Ensaio do esquema V2 numa instância PostgreSQL 17 DESCARTÁVEL (ver README).
# Só fala com o socket local /tmp/afonso-disposable-pg/sock; cliente sem rede e sem
# variáveis herdadas. Aborta se o identificador da instância não for o confirmado.
set -u
B=/tmp/afonso-disposable-pg
EXPECTED_SYSID="${1:?indicar o system_identifier confirmado}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_0000="${STAGING_0000:?caminho para 0000_staging_access_control.sql do staging (só leitura)}"
P="$B/psql.sh -d afonso_disposable"
SYSID=$($P -At -c "select system_identifier from pg_control_system()")
LISTEN=$($P -At -c "select current_setting('listen_addresses')")
[ "$SYSID" = "$EXPECTED_SYSID" ] || { echo "ABORTAR: instância $SYSID != $EXPECTED_SYSID"; exit 2; }
[ -z "$LISTEN" ] || { echo "ABORTAR: listen_addresses='$LISTEN' (devia ser vazio)"; exit 2; }
echo "alvo confirmado: sysid=$SYSID socket=$B/sock base=afonso_disposable"
run() { # etapa ficheiro
  start=$(date +%s.%N)
  $P -1 -v VERBOSITY=verbose -f "$2" > "$B/log/$1.out" 2> "$B/log/$1.err"; rc=$?
  end=$(date +%s.%N)
  printf '%s rc=%s %.2fs %s\n' "$1" "$rc" "$(echo "$end - $start" | bc)" "$(sha256sum "$2" | cut -c1-16)"
  [ $rc -eq 0 ] || { head -20 "$B/log/$1.err"; exit 1; }
}
run E0_shim        "$ROOT/rehearsal/00_supabase_shim.sql"
run E1_staging0000 "$STAGING_0000"
run E2_S2-00       "$ROOT/migrations/S2-00_staging_roles_prelude.sql"
run E3_S2-01       "$ROOT/migrations/S2-01_v2_schema_part1.sql"
run E4_S2-02       "$ROOT/migrations/S2-02_v2_schema_part2.sql"
run E5_S2-99       "$ROOT/migrations/S2-99_staging_safety_checks.sql"
echo "todas as etapas aplicadas"
# E6: ensaio funcional sintético (termina em ROLLBACK)
$P -f "$ROOT/rehearsal/10_synthetic_smoke.sql" > "$B/log/E6_smoke.out" 2>&1
n=$(grep -c "NOTICE:  OK T" "$B/log/E6_smoke.out"); echo "E6_smoke $n/8 verificações OK"; [ "$n" -eq 8 ] || { grep -i error "$B/log/E6_smoke.out"; exit 1; }
# E7: casos negativos do S2-99 (N2 e N3 têm de abortar)
$P -At -f "$ROOT/rehearsal/20_safety_checks_negative.sql" > "$B/log/E7_negative.out" 2>&1
grep -q "N1 interruptores ligados depois do S2-99: 0" "$B/log/E7_negative.out" && grep -q "ativações individuais" "$B/log/E7_negative.out" && grep -q "administradores V2" "$B/log/E7_negative.out" \
  && echo "E7_negative 3/3 casos negativos com o resultado esperado" || { cat "$B/log/E7_negative.out"; exit 1; }
# Esquema final, para comparação reprodutível
unshare -n env -i PATH=/tmp/pg17/bin:/usr/bin:/bin /tmp/pg17/bin/pg_dump -h "$B/sock" -p 54329 -U postgres -d afonso_disposable --schema-only --no-owner -n public -f "$B/log/schema_public.sql"
echo "esquema public: $(grep -c '^CREATE TABLE' "$B/log/schema_public.sql") tabelas, sha256 $(sha256sum "$B/log/schema_public.sql" | cut -c1-16)"
