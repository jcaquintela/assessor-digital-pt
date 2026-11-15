#!/bin/sh
# AFONSO V2 · pacote v1.0.7 · R05 · ENTRADA 0000 do staging (estado registado: AUTENTICADO; ficheiro no pacote).
# ESTADO: PREPARADO, NUNCA EXECUTADO.
# Uso: env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C sh tools/R05_entrada_0000.sh AUTORIZADO:<ref> <ROOT> <FICHEIRO>
#   <FICHEIRO> = <pacote>/entradas/0000/0000_staging_access_control.sql (cópia byte a byte do original, no SHA256SUMS).
#
# Aceita APENAS um de dois caminhos, ambos fixados em entradas/0000/ESPERADO DESTA versão do pacote
# (coberto pelo SHA256SUMS: mudar o estado exige uma NOVA versão auditada; nada se substitui em silêncio):
#   estado=AUTENTICADO          -> o ficheiro histórico do repositório do staging, com o sha256 INTEGRAL
#                                  registado (e o prefixo conhecido a87578e560f0c97f a coincidir) e ainda
#                                  tamanho em bytes, número de linhas, LF final e blob Git conferidos;
#   estado=ALTERNATIVO_AUDITADO -> um bootstrap alternativo com sha256 integral e referência de auditoria
#                                  SEPARADA registados.
# No estado AUTENTICADO a cópia histórica do pacote (ficheiro_no_pacote) tem de estar no SHA256SUMS com o MESMO
# sha256 registado e de conferir no disco; o ficheiro entregue tem de ser byte a byte essa cópia.
# Qualquer outro estado => REPROVADO, sem tocar em nada. Nenhum conteúdo é inventado.
# Se aceite: cópia para evidencia/entradas/0000.sql e sha256 registado; o passo 0000 do R40 só usa essa cópia.
# Trinco global: o R05 segura <ROOT>/.trinco enquanto prepara a entrada (um passo de cada vez). Ocupado => REPROVADO
# sem lhe tocar. Liberta-o SÓ por trinco_liberta_ou_incerteza (Z1), no EXIT trap e ANTES da linha de aprovação:
# não libertado com segurança => código 3 (INCERTEZA: correr o R90 e destruir a máquina, E1).
# Sequência única (Y3): E1–E10 -> R10 -> R20 -> R05 -> R40 R30 … R40 T01 -> R90. Imposta aqui: o R10 tem de ter
# terminado (fase pronto), o R20 completo corre de novo dentro do R05 e tem de dar "R20 APROVADO", e nenhuma
# sessão do R40 pode ter começado. No fim grava evidencia/R05.aprovado, sem o qual o R40 recusa qualquer passo.
# Uso FORA da unidade do servidor, como o R40 (E10).
set -eu
umask 077
TOOLS=$(cd "$(dirname "$0")" && pwd -P)
PKG=$(cd "$TOOLS/.." && pwd -P)
. "$TOOLS/lib_ensaio.sh"
exige_autorizacao "${1:-}"
[ "$#" -eq 3 ] || fail "uso: R05 AUTORIZADO:<ref> <ROOT> <FICHEIRO>"
ESP=$PKG/entradas/0000/ESPERADO
[ "$(sha_de "$ESP")" = "$(sha_registado "$PKG" entradas/0000/ESPERADO)" ] || fail "entradas/0000/ESPERADO não confere com o SHA256SUMS"
ESTADO=$(chave "$ESP" estado) || exit 2
PREF=$(chave "$ESP" sha256_prefixo) || exit 2
case "$ESTADO" in
  AUTENTICADO) H=$(chave "$ESP" sha256) || exit 2 ;;
  ALTERNATIVO_AUDITADO) H=$(chave "$ESP" alternativo_sha256) || exit 2; AUD=$(chave "$ESP" auditoria) || exit 2; [ "$AUD" != NENHUMA ] || fail "bootstrap alternativo sem auditoria separada registada" ;;
  *) fail "entrada 0000 em estado $ESTADO (B14): falta o ficheiro histórico autenticado (sha256 integral) ou um bootstrap alternativo auditado; nada é inventado nem substituído" ;;
esac
exige_hex64 "$H" "sha256 registado da entrada 0000"
[ "$ESTADO" != AUTENTICADO ] || case "$H" in "$PREF"*) ;; *) fail "o sha256 integral registado não começa pelo prefixo conhecido $PREF" ;; esac
if [ "$ESTADO" = AUTENTICADO ]; then
  PF=$(chave "$ESP" ficheiro_no_pacote) || exit 2
  case "$PF" in entradas/0000/*.sql) ;; *) fail "ficheiro_no_pacote fora de entradas/0000/: $PF" ;; esac
  case "$PF" in *[!A-Za-z0-9/._-]*|*..*) fail "ficheiro_no_pacote com caracteres não permitidos" ;; esac
  [ "$(sha_registado "$PKG" "$PF")" = "$H" ] || fail "cópia histórica do pacote não está no SHA256SUMS com o sha256 registado"
  [ -f "$PKG/$PF" ] && [ ! -L "$PKG/$PF" ] || fail "cópia histórica do pacote em falta ou não é ficheiro normal"
  [ "$(sha_de "$PKG/$PF")" = "$H" ] || fail "cópia histórica do pacote alterada desde o SHA256SUMS"
fi
ROOT=$(cd "$2" && pwd -P) || fail "ROOT ilegível"; exige_caminho_simples "$ROOT" ROOT
EV=$ROOT/evidencia
[ -f "$ROOT/$MARCA" ] || fail "ROOT sem a marca do ensaio"
[ "$(ler1 "$EV/autorizacao")" = "$1" ] || fail "autorização diferente da registada pelo R10"
[ "$(ler1 "$EV/fase")" = pronto ] || fail "o R10 não terminou: sequência única E1–E10 -> R10 -> R20 -> R05 -> R40"
saida_r05() {
  rc=$?
  trap - EXIT INT TERM HUP
  trinco_liberta_ou_incerteza R05
  exit "$rc"
}
trap saida_r05 EXIT
trap 'exit 2' INT TERM HUP
trinco_adquire "$ROOT" R05
[ ! -e "$EV/sessoes" ] || fail "já há sessões do R40 nesta instância: o R05 vem antes de qualquer R40 (abortar e correr o R90)"
[ ! -e "$EV/R05.aprovado" ] || fail "o R05 já aprovou nesta instância (nada se repete)"
[ ! -e "$EV/entradas" ] || fail "entrada 0000 já preparada nesta instância (nada se substitui)"
# R20 completo (só leitura) antes de preparar a entrada: o servidor é o do R10 (Y3: R20 antes do R05).
R20OUT=$(sh "$TOOLS/R20_verificar_processo.sh" "$1" "$ROOT" 2> "$EV/R20.antes-R05.err") || fail "R20 reprovado antes do R05 (ver evidencia/R20.antes-R05.err)"
[ "$R20OUT" = "R20 APROVADO" ] || fail "R20 sem a linha de aprovação exata"
[ -f "$3" ] && [ ! -L "$3" ] && [ -r "$3" ] || fail "ficheiro da entrada 0000 ilegível ou não é ficheiro normal"
mkdir -- "$EV/entradas" || fail "mkdir falhou"
cat -- "$3" > "$EV/entradas/0000.sql" || fail "cópia falhou"
G=$(sha_de "$EV/entradas/0000.sql") || exit 2
[ "$G" = "$H" ] || fail "sha256 da entrada 0000 diferente do registado nesta versão do pacote"
if [ "$ESTADO" = AUTENTICADO ]; then
  NB=$(chave "$ESP" bytes) || exit 2; exige_num "$NB" "bytes registados"
  NL=$(chave "$ESP" linhas) || exit 2; exige_num "$NL" "linhas registadas"
  LF=$(chave "$ESP" lf_final) || exit 2
  GB=$(chave "$ESP" git_blob) || exit 2
  case "$GB" in *[!0-9a-f]*) fail "git_blob registado inválido" ;; esac; [ "${#GB}" -eq 40 ] || fail "git_blob registado inválido"
  T=$(wc -c < "$EV/entradas/0000.sql") || fail "wc -c falhou"; T=${T##* }
  exige_num "$T" "tamanho"; [ "$T" -eq "$NB" ] || fail "tamanho da entrada 0000 ($T) diferente do registado ($NB)"
  N=$(wc -l < "$EV/entradas/0000.sql") || fail "wc -l falhou"; N=${N##* }
  exige_num "$N" "fins de linha"
  U=$(tail -c 1 -- "$EV/entradas/0000.sql") || fail "tail falhou"
  case "$LF" in
    nao) [ -n "$U" ] || fail "a entrada 0000 termina com LF, registado sem LF final"; [ $((N + 1)) -eq "$NL" ] || fail "linhas da entrada 0000 diferentes das registadas ($NL)" ;;
    sim) [ -z "$U" ] || fail "a entrada 0000 não termina com LF, registado com LF final"; [ "$N" -eq "$NL" ] || fail "linhas da entrada 0000 diferentes das registadas ($NL)" ;;
    *) fail "lf_final registado inválido: $LF" ;;
  esac
  printf 'blob %s\000' "$T" > "$EV/entradas/0000.blob" || fail "escrita falhou"
  cat -- "$EV/entradas/0000.sql" >> "$EV/entradas/0000.blob" || fail "escrita falhou"
  B=$(sha1sum -- "$EV/entradas/0000.blob") || fail "sha1sum falhou"; B=${B%% *}
  rm -f -- "$EV/entradas/0000.blob" || fail "rm falhou"
  [ "$B" = "$GB" ] || fail "blob Git da entrada 0000 diferente do registado"
fi
printf '%s\n' "$G" > "$EV/entradas/0000.sha256" || fail "escrita falhou"
printf 'estado=%s\n' "$ESTADO" > "$EV/entradas/0000.estado" || fail "escrita falhou"
printf 'estado=%s\nsha256=%s\n' "$ESTADO" "$G" > "$EV/R05.aprovado" || fail "escrita falhou"
# Z1: o trinco sai ANTES da linha de aprovação; não libertado com segurança => código 3 e a linha não é escrita.
trinco_liberta_ou_incerteza R05
echo "R05 APROVADO: entrada 0000 ($ESTADO) conferida"
