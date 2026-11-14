#!/bin/sh
# AFONSO V2 · pacote v1.0.4 · R40 · WRAPPER ÚNICO de sessão (S1, S2): o ÚNICO caminho para abrir uma sessão
# na instância descartável, para TODOS os passos (R30, B*, 0000, P*, S4-*, Q*, T01).
# ESTADO: PREPARADO, NUNCA EXECUTADO.
# Uso (FORA da unidade do servidor, no mesmo namespace de rede e de PIDs, E3/E4/E10):
#   env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C sh tools/R40_sessao.sh AUTORIZADO:<ref> <ROOT> <PASSO>
#
# Por sessão, sempre e pela mesma ordem (falha fechada; nada é reutilizado):
#  1. integridade do pacote (sha256sum -c SHA256SUMS, sem ficheiros a mais) e ordem do plano: o passo
#     anterior tem de estar APROVADO e este nunca ter corrido;
#  2. R20 completo (processo, unidade, rede, configuração) e o próprio wrapper (ambiente, rede, namespaces);
#  3. CÓPIAS DETERMINÍSTICAS (S2) em evidencia/sessoes/<PASSO>/: fonte conferida contra o SHA256SUMS (ou, no
#     passo 0000, contra o sha256 registado pelo R05), só os marcadores declarados para o passo, valores
#     validados por formato, desbloqueio = remover EXATAMENTE a 1.ª linha de guarda, nenhum marcador restante,
#     sha256 da fonte e da cópia registados em evidencia/copias.sha256 e reconferidos antes de ligar;
#  4. psql -X pelo socket provado, com base e papel do passo; dentro da sessão (guião R40_sessao.psql):
#     R41 (processo da sessão filho do postmaster; psql identificado) -> R31 (base, papel, sem SET ROLE,
#     socket, porta, arranque, exclusividade) [-> R32 PGDATA/sysid/nonce/socket se superutilizador] ->
#     ficheiro do passo -> R31 outra vez -> mesmo PID;
#  5. aprovação só com código 0 do psql E as linhas exatas esperadas; P05: as 7 impressões são extraídas
#     para os marcadores do Q03/Q04 (sem edição à mão).
# Qualquer falha => REPROVADO (código 2): ABORTAR o ensaio e correr o R90 (nunca repetir nem continuar).
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
PKG=$(cd "$TOOLS/.." && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
AUT=$1
[ "$#" -eq 3 ] || fail "uso: R40 AUTORIZADO:<ref> <ROOT> <PASSO>"
ROOT=$(cd "$2" && pwd -P) || fail "ROOT ilegível"; exige_caminho_simples "$ROOT" ROOT; exige_caminho_simples "$PKG" pacote
PASSO=$3
EV=$ROOT/evidencia
[ -f "$ROOT/$MARCA" ] || fail "ROOT sem a marca do ensaio"
[ "$(ler1 "$EV/autorizacao")" = "$AUT" ] || fail "autorização diferente da registada pelo R10"
[ "$(ler1 "$EV/fase")" = pronto ] || fail "o R10 não terminou"
EMAIL=proprietario.sintetico@afonso-staging.invalid

# Tabela dos passos (espelho de SESSION_STEPS em src/lib/staging/v104/rules.ts; o teste compara as duas).
# passo|ficheiro|base|papel|super|tx|desbloquear|marcadores
passo_def() {
  case "$1" in
    R30)  echo "ensaio/R30_sessao_alvo.sql|postgres|ensaio_super|sim|nao|nao|INST" ;;
    B00)  echo "ensaio/B00_papeis_e_base.bloqueado.sql|postgres|ensaio_super|sim|nao|sim|INST" ;;
    B01)  echo "ensaio/B01_plataforma_sintetica.bloqueado.sql|afonso_ensaio|ensaio_super|sim|sim|sim|INST" ;;
    B01b) echo "ensaio/B01b_unaccent_instalada.bloqueado.sql|afonso_ensaio|ensaio_super|sim|sim|sim|INST" ;;
    0000) echo "ENTRADA_0000|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    B02)  echo "ensaio/B02_papel_admin_sintetico.bloqueado.sql|afonso_ensaio|ensaio_super|sim|sim|sim|INST" ;;
    P00)  echo "preflight/P00_alvo.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    P01)  echo "preflight/P01_dono_historico.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    P02)  echo "preflight/P02_privilegios_dono_historico.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    P03)  echo "preflight/P03_colisoes.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    P04)  echo "preflight/P04_conta_proprietario.sql|afonso_ensaio|postgres|nao|sim|nao|EMAIL" ;;
    P05)  echo "preflight/P05_registo_base.sql|afonso_ensaio|postgres|nao|sim|nao|EMAIL" ;;
    S4-00) echo "sql/S4-00_prelude_aditivo.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    S4-01) echo "sql/S4-01_tipos_tabelas_a.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    S4-02) echo "sql/S4-02_tabelas_b_restricoes.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    S4-03) echo "sql/S4-03_funcoes.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    S4-04) echo "sql/S4-04_indices_chaves_gatilhos.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    S4-05) echo "sql/S4-05_politicas.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    Q00)  echo "posflight/Q00_alvo.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    Q01)  echo "posflight/Q01_estrutura.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    Q02)  echo "posflight/Q02_seguranca.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    Q03)  echo "posflight/Q03_conta_proprietario.sql|afonso_ensaio|postgres|nao|sim|nao|EMAIL,P05A" ;;
    Q04)  echo "posflight/Q04_acesso_staging.sql|afonso_ensaio|postgres|nao|sim|nao|P05B" ;;
    Q05)  echo "posflight/Q05_matriz_acesso.sql|afonso_ensaio|postgres|nao|sim|nao|-" ;;
    T01)  echo "tests-db/T01_matriz_comportamental.bloqueado.sql|afonso_ensaio|ensaio_super|sim|nao|sim|INST" ;;
    *) fail "passo desconhecido: $1" ;;
  esac
}
ORDEM="R30 B00 B01 B01b 0000 B02 P00 P01 P02 P03 P04 P05 S4-00 S4-01 S4-02 S4-03 S4-04 S4-05 Q00 Q01 Q02 Q03 Q04 Q05 T01"
DEF=$(passo_def "$PASSO") || exit 2
IFS='|' read -r FICH BASE PAPEL SUPER TX DESBL MARC <<FIM
$DEF
FIM
VARIANTE=$(ler1 "$EV/variante") || exit 2
[ "$PASSO" != B01b ] || [ "$VARIANTE" = INSTALADA ] || fail "B01b só na variante INSTALADA (esta instância é $VARIANTE)"
ANT=
for p in $ORDEM; do
  [ "$p" = B01b ] && [ "$VARIANTE" != INSTALADA ] && continue
  [ "$p" = "$PASSO" ] && break
  ANT=$p
done
[ -z "$ANT" ] || [ -f "$EV/sessoes/$ANT/APROVADO" ] || fail "o passo anterior ($ANT) não está APROVADO: ordem do plano"
[ ! -e "$EV/sessoes/$PASSO" ] || fail "o passo $PASSO já foi tentado nesta instância: nada se repete (abortar e R90)"
# A pasta da sessão nasce JÁ: qualquer falha a partir daqui deixa o passo marcado como tentado.
S=$EV/sessoes/$PASSO
mkdir -p -- "$EV/sessoes" || fail "mkdir falhou"
mkdir -- "$S" || fail "a pasta da sessão já existe"
exige_caminho_simples "$S" sessão

T=$(mktemp -d "$ROOT/.tmp/R40.XXXXXX") || fail "mktemp falhou"
CPID=
interrompido() { trap - INT TERM HUP; [ -z "$CPID" ] || kill -TERM "$CPID" 2>/dev/null || true; fail "R40 interrompido no passo $PASSO: abortar e correr o R90"; }
trap 'rm -rf -- "$T"' EXIT
trap interrompido INT TERM HUP

# 1. Pacote íntegro.
pacote_integro_ou_falha "$PKG" "$T"

# 2. Servidor (R20 completo) e o próprio wrapper.
R20OUT=$(sh "$TOOLS/R20_verificar_processo.sh" "$AUT" "$ROOT" 2> "$EV/R20.antes-$PASSO.err") || fail "R20 reprovado antes do passo $PASSO (ver evidencia/R20.antes-$PASSO.err)"
[ "$R20OUT" = "R20 APROVADO" ] || fail "R20 sem a linha de aprovação exata"
NETNS=$(chave "$EV/identidade.postmaster" netns) || exit 2
PIDNS=$(chave "$EV/identidade.postmaster" pidns) || exit 2
CG=$(chave "$EV/identidade.postmaster" cgroup) || exit 2
[ "$(ns_de "$$" net)" = "$NETNS" ] || fail "o wrapper não está no namespace de rede do servidor (E4)"
[ "$(ns_de "$$" pid)" = "$PIDNS" ] || fail "o wrapper não está no namespace de PIDs do servidor (E4)"
[ "$(cgroup_de "$$")" != "$CG" ] || fail "o wrapper corre DENTRO da unidade do servidor (E10)"
ambiente_limpo_ou_falha "$$" "" "$T"
home_controlada_ou_falha "$$" "$ROOT/home" "$T"
rede_isolada_ou_falha "$$"
montagens_ou_falha "$$" "$T"

# 3. Valores das substituições (validados por formato; nenhum contém # & \ nem espaço).
PG_BIN=$(ler1 "$EV/pg_bin") || exit 2
PORT=$(ler1 "$EV/porta") || exit 2; exige_num "$PORT" porta
SYSID=$(ler1 "$EV/sysid") || exit 2; exige_num "$SYSID" sysid
NSHA=$(ler1 "$EV/nonce.sha256") || exit 2; exige_hex64 "$NSHA" "sha256 do nonce"
PGSTART=$(ler1 "$EV/postmaster.inicio") || exit 2; exige_num "$PGSTART" "início do postmaster"
case "$SUPER" in sim) SB=true ;; nao) SB=false ;; *) fail "tabela de passos inválida" ;; esac
P05B=false; [ "$PASSO" = P05 ] && P05B=true

# Fonte do passo, conferida.
if [ "$FICH" = ENTRADA_0000 ]; then
  SRC=$EV/entradas/0000.sql
  [ -f "$SRC" ] && [ ! -L "$SRC" ] || fail "entrada 0000 não preparada: correr o R05 (hoje PENDENTE, B14)"
  SRCSHA=$(sha_de "$SRC") || exit 2
  [ "$SRCSHA" = "$(ler1 "$EV/entradas/0000.sha256")" ] || fail "entrada 0000 mudou desde o R05"
else
  SRC=$PKG/$FICH
  SRCSHA=$(sha_de "$SRC") || exit 2
  [ "$SRCSHA" = "$(sha_registado "$PKG" "$FICH")" ] || fail "$FICH não confere com o SHA256SUMS do pacote"
fi

# copia_det <fonte> <destino> <marcadores> <desbloquear>: cópia determinística = f(bytes da fonte, valores).
copia_det() {
  _orig=$1; _src=$1; _dst=$2; _m=$3; _desbl=$4
  if [ "$_desbl" = sim ]; then
    _n=$(awk '/^DO \$bloqueado\$ BEGIN RAISE EXCEPTION '"'"'BLOQUEADO/ { n++ } END { print n + 0 }' "$_src") || fail "awk falhou"
    [ "$_n" -eq 1 ] || fail "esperada exatamente 1 linha de guarda BLOQUEADO em $_src (obtidas $_n)"
    _f=$(awk '!/^[[:space:]]*(--|$)/ { print; exit }' "$_src") || fail "awk falhou"
    case "$_f" in "DO \$bloqueado\$ BEGIN RAISE EXCEPTION 'BLOQUEADO"*) ;; *) fail "a 1.ª instrução de $_src não é a guarda BLOQUEADO" ;; esac
    awk '!/^DO \$bloqueado\$ BEGIN RAISE EXCEPTION '"'"'BLOQUEADO/' "$_src" > "$T/desbloqueado" || fail "awk falhou"
    _src=$T/desbloqueado
  fi
  set --
  case ",$_m," in *,INST,*) set -- "$@" -e "s#__R_PGDATA__#$ROOT/pgdata#g" -e "s#__R_SOCKDIR__#$ROOT/sock#g" -e "s#__R_SYSID__#$SYSID#g" -e "s#__R_PORT__#$PORT#g" -e "s#__R_NONCE_SHA256__#$NSHA#g" ;; esac
  case ",$_m," in *,EMAIL,*) set -- "$@" -e "s#__EMAIL_AUTORIZADO__#$EMAIL#g" ;; esac
  case ",$_m," in *,R31,*) set -- "$@" -e "s#__R_DB__#$BASE#g" -e "s#__R_ROLE__#$PAPEL#g" -e "s#__R_SUPER__#$SUPER#g" -e "s#__R_PORT__#$PORT#g" -e "s#__R_PGSTART__#$PGSTART#g" ;; esac
  case ",$_m," in *,GUIAO,*) set -- "$@" -e "s#__R_SESS__#$S#g" -e "s#__R_TOOLS__#$TOOLS#g" -e "s#__R_ROOT__#$ROOT#g" -e "s#__R_PASSO__#$PASSO#g" ;; esac
  case ",$_m," in *,P05A,*|*,P05B,*)
    _imp=$EV/sessoes/P05/impressoes
    for _k in B01:CONTA B02:IDENTIDADES B03:PAPEIS B04:POLITICAS B05:FUNCOES B06:TABELAS B07:TIPO; do
      _h=$(chave "$_imp" "${_k%%:*}") || exit 2; exige_hex64 "$_h" "impressão ${_k%%:*} do P05"
      set -- "$@" -e "s#__P05_${_k%%:*}_${_k##*:}__#$_h#g"
    done ;;
  esac
  if [ "$#" -gt 0 ]; then sed "$@" "$_src" > "$_dst" || fail "sed falhou"; else cat -- "$_src" > "$_dst" || fail "cópia falhou"; fi
  if procura -Eq '__[A-Z][A-Z0-9_]*__' "$_dst"; then fail "marcador por substituir em $(basename "$_dst") (a cópia não é usada)"; fi
  _hs=$(sha_de "$_orig") || exit 2; _hd=$(sha_de "$_dst") || exit 2; _b=${_dst##*/}
  printf '%s %s %s %s\n' "$PASSO" "$_b" "$_hs" "$_hd" >> "$EV/copias.sha256" || fail "registo de cópias falhou"
}
for f in ensaio/R31_sessao_passo.sql ensaio/R32_instancia_super.sql ensaio/R40_sessao.psql; do
  [ "$(sha_de "$PKG/$f")" = "$(sha_registado "$PKG" "$f")" ] || fail "$f não confere com o SHA256SUMS"
done
MP=$MARC; [ "$MP" = - ] && MP=
copia_det "$SRC" "$S/passo.sql" "$MP" "$DESBL"
copia_det "$PKG/ensaio/R31_sessao_passo.sql" "$S/R31.sql" R31 nao
copia_det "$PKG/ensaio/R32_instancia_super.sql" "$S/R32.sql" INST nao
copia_det "$PKG/ensaio/R40_sessao.psql" "$S/sessao.psql" GUIAO nao
printf '%s\n' "$AUT" > "$S/autorizacao" || fail "escrita falhou"
# Reconferência imediatamente antes de ligar (as cópias vivem numa pasta 0700 do utilizador do ensaio).
for c in passo.sql R31.sql R32.sql sessao.psql; do
  h=$(awk -v p="$PASSO" -v f="$c" '$1 == p && $2 == f { h = $4; n++ } END { if (n == 1) print h; else print "x" }' "$EV/copias.sha256") || fail "registo de cópias ilegível"
  [ "$(sha_de "$S/$c")" = "$h" ] || fail "a cópia $c mudou depois de registada"
done

# 4. Sessão: psql -X (sem .psqlrc), HOME vazia, ambiente mínimo, só pelo socket provado.
if [ "$TX" = sim ]; then set -- -1; else set --; fi
env -i PATH="$PG_BIN:/usr/bin:/bin" HOME="$ROOT/home" LANG=C \
  "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 "$@" -v "r40_super=$SB" -v "r40_p05=$P05B" \
  -d "host=$ROOT/sock port=$PORT dbname=$BASE user=$PAPEL sslmode=disable connect_timeout=5 application_name=afonso_ensaio" \
  -f "$S/sessao.psql" > "$S/sessao.out" 2> "$S/sessao.err" &
CPID=$!
printf '%s\n' "$CPID" > "$S/psql.pid" || fail "escrita falhou"
wait "$CPID" && rc=0 || rc=$?
CPID=
[ "$rc" -eq 0 ] || fail "passo $PASSO REPROVADO (psql código $rc; ver $S/sessao.err)"

# 5. Linhas exatas esperadas (linha inteira, não substring).
procura -Fxq 'R41 APROVADO' "$S/sessao.out" || fail "sem 'R41 APROVADO'"
procura -Fxq 'MESMA SESSÃO' "$S/sessao.out" || fail "sem 'MESMA SESSÃO'"
ULT=$(awk 'END { print }' "$S/sessao.out") || fail "saída ilegível"
[ "$ULT" = "R40 SESSÃO APROVADA $PASSO" ] || fail "a última linha da sessão não é a aprovação do passo $PASSO"
if procura -q 'REPROVADO' "$S/sessao.out"; then fail "a saída contém REPROVADO"; fi
if [ "$PASSO" = P05 ]; then
  [ -s "$S/P05.dados" ] || fail "P05 sem dados"
  US=$(printf '\037')
  tr '\000' '\037' < "$S/P05.dados" > "$T/P05.us" || fail "tr falhou"
  awk -F "$US" -v ok='REGISTO VÁLIDO (copiar as impressões para o Q03/Q04)' '
    { n++; if (NF != 6 || $1 !~ /^B0[1-7]$/ || $3 !~ /^[0-9a-f]+$/ || length($3) != 64 || $6 != ok || ($1 in v)) bad = 1; v[$1] = $3 }
    END { if (n != 7 || bad) { print "INVALIDO"; exit } for (i = 1; i <= 7; i++) print "B0" i "=" v["B0" i] }' "$T/P05.us" > "$S/impressoes" || fail "awk falhou"
  if procura -Fxq INVALIDO "$S/impressoes"; then fail "impressões do P05 inválidas (7 linhas B01…B07, sha256, REGISTO VÁLIDO)"; fi
  sha_de "$S/impressoes" > "$S/impressoes.sha256" || exit 2
fi
H=$(sha_de "$S/sessao.out") || exit 2
printf 'passo=%s\nsaida_sha256=%s\n' "$PASSO" "$H" > "$S/APROVADO" || fail "escrita falhou"
echo "R40 $PASSO APROVADO"
