#!/bin/sh
# AFONSO V2 · pacote v1.0.4 · R05 · ENTRADA 0000 do staging (interface; hoje RECUSA: estado PENDENTE, B14).
# ESTADO: PREPARADO, NUNCA EXECUTADO.
# Uso: env -i PATH="<PG_BIN>:/usr/bin:/bin" HOME=<ROOT>/home LANG=C sh tools/R05_entrada_0000.sh AUTORIZADO:<ref> <ROOT> <FICHEIRO>
#
# Aceita APENAS um de dois caminhos, ambos fixados em entradas/0000/ESPERADO DESTA versão do pacote
# (coberto pelo SHA256SUMS: mudar o estado exige uma NOVA versão auditada; nada se substitui em silêncio):
#   estado=AUTENTICADO          -> o ficheiro histórico do repositório do staging, com o sha256 INTEGRAL
#                                  registado (e o prefixo conhecido a87578e560f0c97f a coincidir) e ainda
#                                  tamanho em bytes, número de linhas, LF final e blob Git conferidos;
#   estado=ALTERNATIVO_AUDITADO -> um bootstrap alternativo com sha256 integral e referência de auditoria
#                                  SEPARADA registados.
# Qualquer outro estado (hoje: PENDENTE) => REPROVADO, sem tocar em nada. Nenhum conteúdo é inventado.
# Se aceite: cópia para evidencia/entradas/0000.sql e sha256 registado; o passo 0000 do R40 só usa essa cópia.
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
ROOT=$(cd "$2" && pwd -P) || fail "ROOT ilegível"; exige_caminho_simples "$ROOT" ROOT
EV=$ROOT/evidencia
[ -f "$ROOT/$MARCA" ] || fail "ROOT sem a marca do ensaio"
[ "$(ler1 "$EV/autorizacao")" = "$1" ] || fail "autorização diferente da registada pelo R10"
[ ! -e "$EV/entradas" ] || fail "entrada 0000 já preparada nesta instância (nada se substitui)"
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
echo "R05 APROVADO: entrada 0000 ($ESTADO) conferida"
