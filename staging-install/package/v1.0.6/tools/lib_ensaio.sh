# shellcheck shell=sh
# AFONSO V2 · pacote v1.0.6 · funções comuns dos passos R05–R90 do ensaio DESCARTÁVEL.
# ESTADO: PREPARADO, NUNCA EXECUTADO. Só é carregado (". lib_ensaio.sh") pelos scripts R*.
#
# Regras de todos os passos:
#  - falha fechada SEM depender de "set -e" (V4): nenhuma pipeline numa verificação; cada leitura
#    (cat, sed, awk, readlink, stat, sha256sum, tr) é UM comando com "|| fail" e o valor lido é validado
#    pelo formato; grep passa sempre por "procura" (0 = encontrou, 1 = não encontrou, >= 2 = REPROVADO);
#  - fail escreve no stderr e termina com código 2; o stdout só leva o veredito final de cada passo;
#  - identidade de processos (V5) só por factos do núcleo que o processo não muda: /proc/<pid>/stat
#    (início, pai), /proc/<pid>/exe (caminho + dispositivo:inode), cwd, namespaces e cgroup. A linha de
#    comando (/proc/<pid>/cmdline) é mutável pelo próprio processo: fica só como evidência, nunca decide;
#  - nunca imprime VALORES de variáveis de ambiente (só nomes); não usa rede; não lê ~/.pgpass;
#  - (X1) o estado de saída de um ciclo "while/for … done … || fail" é o do ÚLTIMO comando do corpo: o corpo
#    nunca termina numa lista "[ … ] && …" (que devolve 1 quando o teste falha); usa-se "if … then … fi";
#  - (X2) unidade/cgroup: só cgroup v2 unificado montado em /sys/fs/cgroup com raiz "/"; "vazia" decide-se
#    por cgroup.events (populated, cobre os descendentes), nunca só por cgroup.procs; sem subcgroups;
#  - (X3, Y1) nenhum sinal sem a identidade COMPLETA relida imediatamente antes: o ÚNICO "kill" do pacote está
#    em sinaliza_se_mesmo (R10, R40 e R90 só sinalizam por ela); identidade não confirmada => nada enviado, código 3;
#  - um passo de cada vez em <ROOT>: trinco global <ROOT>/.trinco (R10, R05, R40; o R90 assume órfãos);
#  - (Y3) sequência única: E1–E10 -> R10 -> R20 -> R05 -> R40 R30 … R40 T01 -> R90, imposta pelos próprios scripts;
#  - prova o que o PROCESSO vê. Anfitrião, hipervisor e plataforma ficam fora: obrigações E1–E10.

LC_ALL=C
export LC_ALL
# shellcheck disable=SC2034 # usadas pelos scripts que carregam esta biblioteca
VERSAO_PACOTE=1.0.6
# shellcheck disable=SC2034
MARCA=.afonso-ensaio

# CODIGO_FALHA=3 (só o R90, depois de o descarte começar): toda a falha passa a INCERTEZA, código 3 (X3).
CODIGO_FALHA=2
fail() {
  if [ "$CODIGO_FALHA" = 3 ]; then printf 'INCERTEZA: %s\n' "$1" >&2; exit 3; fi
  printf 'REPROVADO: %s\n' "$1" >&2; exit 2
}
ok() { printf 'OK: %s\n' "$1" >&2; }

# grep com código de erro tratado: devolve 0/1; >= 2 (ficheiro ilegível, padrão inválido) => REPROVADO.
procura() { grep "$@" && _rc=0 || _rc=$?; [ "$_rc" -le 1 ] || fail "grep falhou (código $_rc): $*"; return "$_rc"; }

exige_num() { case "$1" in ""|*[!0-9]*) fail "$2: valor não numérico" ;; esac; }
exige_hex64() { case "$1" in *[!0-9a-f]*) fail "$2: não é um sha256" ;; esac; [ "${#1}" -eq 64 ] || fail "$2: não é um sha256"; }
# Caminhos sem espaços, aspas, ":" nem "`": são substituídos em cópias e passados ao psql como texto literal.
exige_caminho_simples() {
  case "$1" in /*) ;; *) fail "caminho não absoluto: $2" ;; esac
  case "$1" in *[!A-Za-z0-9/._-]*) fail "caminho com caracteres não permitidos: $2" ;; esac
  case "$1" in */./*|*/../*|*/.|*/..|*//*) fail "caminho não canónico: $2" ;; esac
}
exige_cgroup() { case "$1" in /*) ;; *) fail "cgroup inválido: $2" ;; esac; case "$1" in *[!A-Za-z0-9/._@-]*) fail "cgroup com caracteres não permitidos: $2" ;; esac; }

# 1.º argumento obrigatório de cada passo: AUTORIZADO:<referência da autorização do proprietário>.
exige_autorizacao() {
  case "${1:-}" in
    AUTORIZADO:*) ref=${1#AUTORIZADO:} ;;
    *) fail "falta o 1.º argumento AUTORIZADO:<referência> (o ensaio exige autorização separada)" ;;
  esac
  case "$ref" in ""|*[!A-Za-z0-9._-]*) fail "referência de autorização inválida" ;; esac
  [ "${#ref}" -ge 6 ] || fail "referência de autorização demasiado curta"
}

# Lê um ficheiro de EXATAMENTE uma linha não vazia (valor registado por outro passo). Uso: v=$(ler1 f) || exit 2
ler1() {
  [ -f "$1" ] && [ ! -L "$1" ] && [ -r "$1" ] || fail "não legível ou não é ficheiro normal: $1"
  _l=0; _v=
  while IFS= read -r _x || [ -n "$_x" ]; do _l=$((_l + 1)); _v=$_x; done < "$1" || fail "leitura falhou: $1"
  [ "$_l" -eq 1 ] || fail "esperada 1 linha em $1 (obtidas $_l)"
  [ -n "$_v" ] || fail "valor vazio em $1"
  printf '%s\n' "$_v"
}

# Valor de "chave=valor" num ficheiro de registo (exatamente uma ocorrência). Uso: v=$(chave f k) || exit 2
chave() {
  [ -f "$1" ] && [ -r "$1" ] || fail "não legível: $1"
  _r=$(awk -v k="$2" 'index($0, k "=") == 1 { n++; v = substr($0, length(k) + 2) } END { if (n == 1 && v != "") print v; else print "\001" n }' "$1") || fail "awk falhou: $1"
  case "$_r" in "$(printf '\001')"*) fail "chave $2 em falta ou repetida em $1" ;; esac
  printf '%s\n' "$_r"
}

sha_de() { _s=$(sha256sum -- "$1") || fail "sha256sum falhou: $1"; _s=${_s%% *}; exige_hex64 "$_s" "sha256 de $1"; printf '%s\n' "$_s"; }

# Conta linhas de dados (depois de N linhas de cabeçalho) de um ficheiro de /proc. Uso: n=$(linhas_dados f N) || exit 2
linhas_dados() { _n=$(awk -v h="$2" 'NR > h { n++ } END { print n + 0 }' "$1") || fail "não legível: $1"; exige_num "$_n" "$1"; printf '%s\n' "$_n"; }

# Campos estáveis de /proc/<pid>/stat: pai e início (em ticks desde o arranque da máquina). O nome do comando
# (campo 2) pode ter espaços e parênteses: os campos contam-se depois do ÚLTIMO ") ". Uso: x=$(stat_de pid) || exit 2
stat_de() {
  _s=$(cat -- "/proc/$1/stat") || fail "não legível: /proc/$1/stat"
  _r=${_s##*) }
  [ "$_r" != "$_s" ] || fail "formato inesperado de /proc/$1/stat"
  set -f
  # shellcheck disable=SC2086 # divisão em campos intencional (sem expansão de nomes: set -f)
  set -- $_r
  set +f
  [ "$#" -ge 20 ] || fail "campos insuficientes em /proc/<pid>/stat"
  _pai=$2; shift 19; _ini=$1
  exige_num "$_pai" "pai"; exige_num "$_ini" "início"
  printf '%s %s\n' "$_pai" "$_ini"
}
pai_de() { _x=$(stat_de "$1") || exit 2; printf '%s\n' "${_x%% *}"; }
inicio_de() { _x=$(stat_de "$1") || exit 2; printf '%s\n' "${_x##* }"; }

# Executável REAL de um processo: caminho e dispositivo:inode (o núcleo mantém-nos; o processo não os muda).
exe_caminho() { _p=$(readlink -- "/proc/$1/exe") || fail "não legível: /proc/$1/exe"; case "$_p" in *" (deleted)") fail "executável do processo $1 foi apagado" ;; esac; printf '%s\n' "$_p"; }
exe_id() { _i=$(stat -L -c '%d:%i' -- "/proc/$1/exe") || fail "stat falhou: /proc/$1/exe"; printf '%s\n' "$_i"; }
ficheiro_id() { _i=$(stat -L -c '%d:%i' -- "$1") || fail "stat falhou: $1"; printf '%s\n' "$_i"; }
ns_de() { _n=$(readlink -- "/proc/$1/ns/$2") || fail "não legível: /proc/$1/ns/$2"; printf '%s\n' "$_n"; }
cwd_de() { _c=$(readlink -- "/proc/$1/cwd") || fail "não legível: /proc/$1/cwd"; printf '%s\n' "$_c"; }
uid_de() { _u=$(awk '$1 == "Uid:" { print $2 }' "/proc/$1/status") || fail "não legível: /proc/$1/status"; exige_num "$_u" "uid"; printf '%s\n' "$_u"; }

# cgroup v2 unificado (E10): uma só linha "0::/caminho". Uso: cg=$(cgroup_de pid) || exit 2
cgroup_de() {
  _n=0; _cg=
  while IFS= read -r _l; do _n=$((_n + 1)); _cg=$_l; done < "/proc/$1/cgroup" || fail "não legível: /proc/$1/cgroup"
  [ "$_n" -eq 1 ] || fail "cgroup v1 ou híbrido no processo $1 (E10 exige cgroup v2 unificado)"
  case "$_cg" in 0::/*) _cg=${_cg#0::} ;; *) fail "cgroup v2 não reconhecido no processo $1" ;; esac
  exige_cgroup "$_cg" "cgroup do processo $1"
  printf '%s\n' "$_cg"
}

# Identidade canónica de um processo (V5). Escreve linhas chave=valor em $2.
identidade_para() {
  _st=$(stat_de "$1") || exit 2
  _ec=$(exe_caminho "$1") || exit 2
  _ei=$(exe_id "$1") || exit 2
  _cw=$(cwd_de "$1") || exit 2
  _nn=$(ns_de "$1" net) || exit 2
  _pn=$(ns_de "$1" pid) || exit 2
  _cg=$(cgroup_de "$1") || exit 2
  printf 'pid=%s\ninicio=%s\nexe=%s\nexe_id=%s\ncwd=%s\nnetns=%s\npidns=%s\ncgroup=%s\n' \
    "$1" "${_st##* }" "$_ec" "$_ei" "$_cw" "$_nn" "$_pn" "$_cg" > "$2" || fail "escrita falhou: $2"
}
# O postmaster registado pelo R10 continua a ser o MESMO processo (não apenas o mesmo número de PID).
postmaster_igual_ou_falha() {
  [ -d "/proc/$1" ] || fail "o postmaster $1 já não existe"
  identidade_para "$1" "$2" || exit 2
  cmp -s -- "$3" "$2" || fail "o processo $1 já não é o postmaster registado pelo R10 (início, executável, cwd, namespaces ou cgroup diferentes)"
}

# Nomes das variáveis de ambiente de um processo (nunca os valores). $1 = PID, $2 = nomes extra (padrão case), $3 = pasta temporária.
ambiente_limpo_ou_falha() {
  _pid=$1; _extra=${2:-__nenhum__}; _t=$3
  [ -r "/proc/$_pid/environ" ] || fail "ambiente do processo $_pid não legível"
  tr '\012\000' '\034\012' < "/proc/$_pid/environ" > "$_t/env.$_pid" || fail "leitura do ambiente do processo $_pid falhou"
  _bad=
  while IFS= read -r _e; do
    _nm=${_e%%=*}
    # shellcheck disable=SC2254 # $_extra é um padrão de nomes permitidos, de propósito
    case "$_nm" in
      PATH|HOME|PWD|SHLVL|_|OLDPWD|LANG|LC_ALL|LC_CTYPE|LC_COLLATE|LC_MESSAGES|TZ) ;;
      *) case "$_nm" in $_extra) ;; *) _bad="$_bad ${_nm:-<vazio>}" ;; esac ;;
    esac
  done < "$_t/env.$_pid" || fail "leitura falhou: ambiente do processo $_pid"
  [ -z "$_bad" ] || { rm -f -- "$_t/env.$_pid"; fail "variáveis de ambiente não permitidas no processo $_pid:$_bad"; }
}
# $1 = PID, $2 = valor esperado de HOME (comparado, nunca impresso), $3 = pasta temporária (com env.<pid> do passo anterior).
# X1: o corpo do ciclo termina sempre com código 0 (case/if), por isso o "|| fail" só apanha falhas de leitura;
# exige EXATAMENTE uma definição HOME e que seja a pasta do ensaio.
home_controlada_ou_falha() {
  _nh=0; _achou=nao
  while IFS= read -r _e || [ -n "$_e" ]; do
    case "$_e" in
      HOME=*) _nh=$((_nh + 1)); if [ "$_e" = "HOME=$2" ]; then _achou=sim; fi ;;
    esac
  done < "$3/env.$1" || fail "leitura falhou: ambiente do processo $1"
  rm -f -- "$3/env.$1"
  [ "$_nh" -eq 1 ] || fail "o processo $1 tem $_nh definições de HOME (exigida exatamente 1)"
  [ "$_achou" = sim ] || fail "HOME do processo $1 não é a pasta do ensaio"
  [ -d "$2" ] && [ ! -L "$2" ] || fail "HOME do ensaio não existe"
  _c=$(ls -A -- "$2") || fail "HOME do ensaio ilegível"
  [ -z "$_c" ] || fail "HOME do ensaio não está vazia (sem .pgpass, .psqlrc, .pg_service.conf, .ssh, …)"
}

# Rede vista pelo processo $1 (o /proc/<pid>/net/* mostra o namespace DESSE processo): só lo, nenhuma rota
# IPv4, rotas IPv6 só em lo, nenhum socket TCP/UDP/RAW. Sem interfaces nem rotas não há tráfego IP a entrar nem a sair.
rede_isolada_ou_falha() {
  _d=/proc/$1/net
  for _f in dev route tcp udp unix; do [ -r "$_d/$_f" ] || fail "não legível: $_d/$_f"; done
  _ifs=$(awk -F: 'NR > 2 { gsub(/[[:space:]]/, "", $1); printf "%s ", $1 }' "$_d/dev") || fail "não legível: $_d/dev"
  [ "$_ifs" = "lo " ] || fail "interfaces de rede além de lo no processo $1: $_ifs"
  _n=$(linhas_dados "$_d/route" 1) || exit 2
  [ "$_n" -eq 0 ] || fail "rotas IPv4 no namespace do processo $1"
  if [ -e "$_d/ipv6_route" ]; then
    _n=$(awk '$10 != "lo" { n++ } END { print n + 0 }' "$_d/ipv6_route") || fail "não legível: $_d/ipv6_route"
    exige_num "$_n" ipv6_route; [ "$_n" -eq 0 ] || fail "rotas IPv6 fora de lo no processo $1"
  fi
  for _p in tcp tcp6 udp udp6 raw raw6 udplite udplite6; do
    [ -e "$_d/$_p" ] || continue
    _n=$(linhas_dados "$_d/$_p" 1) || exit 2
    [ "$_n" -eq 0 ] || fail "sockets $_p no namespace do processo $1"
  done
  if [ -e /dev/vsock ]; then fail "/dev/vsock presente (canal para o anfitrião)"; fi
}

# Montagens vistas pelo processo $1: nada de rede/FUSE/partilhas nem pastas de segredos; nenhum socket de
# motor de contentores. A revisão COMPLETA das montagens é a obrigação E5. $2 = pasta temporária.
montagens_ou_falha() {
  _mi=/proc/$1/mountinfo
  [ -r "$_mi" ] || fail "não legível: $_mi"
  awk '{ for (i = 7; i <= NF; i++) if ($i == "-") { print $(i + 1); break } }' "$_mi" > "$2/mt.$1" || fail "não legível: $_mi"
  _bad=
  while IFS= read -r _t; do
    case "$_t" in nfs|nfs4|cifs|smb3|smbfs|9p|ceph|glusterfs|fuse|fuse.*|fuseblk|sshfs|davfs|afs|virtiofs) _bad="$_bad $_t" ;; esac
  done < "$2/mt.$1" || fail "leitura falhou: $2/mt.$1"
  [ -z "$_bad" ] || fail "sistemas de ficheiros de rede/FUSE/partilhados no processo $1:$_bad"
  awk '{ print $5 }' "$_mi" > "$2/mp.$1" || fail "não legível: $_mi"
  while IFS= read -r _m; do
    case "$_m" in /run/secrets*|/var/run/secrets*|*/.aws|*/.aws/*|*/.ssh|*/.ssh/*|*/.kube|*/.kube/*|*/.docker|*/.docker/*|*/.config/gcloud*|*/.azure*|*/.supabase*) _bad="$_bad $_m" ;; esac
  done < "$2/mp.$1" || fail "leitura falhou: $2/mp.$1"
  rm -f -- "$2/mt.$1" "$2/mp.$1"
  [ -z "$_bad" ] || fail "montagens de segredos/credenciais no processo $1:$_bad"
  for _s in /var/run/docker.sock /run/docker.sock /run/containerd/containerd.sock /run/podman/podman.sock /var/run/crio/crio.sock /run/k3s/containerd/containerd.sock; do
    if [ -e "$_s" ]; then fail "socket de motor de contentores presente: $_s"; fi
  done
}

# --- X2: cgroup v2 ---------------------------------------------------------------------------------------
# O processo $1 vê UMA montagem em /sys/fs/cgroup, do tipo cgroup2, com raiz "/" (senão /sys/fs/cgroup<cg> não
# seria a unidade do processo), e nenhuma montagem cgroup v1 (híbrido). Falha fechada.
cgroup2_ou_falha() {
  _mi=/proc/$1/mountinfo
  [ -r "$_mi" ] || fail "não legível: $_mi"
  _r=$(awk '{ t = ""; for (i = 7; i <= NF; i++) if ($i == "-") { t = $(i + 1); break }
              if (t == "cgroup") v1++
              if ($5 == "/sys/fs/cgroup") { n++; ft = t; rt = $4 } }
            END { if (v1 > 0) print "FALHA cgroup v1 montado"; else if (n != 1) print "FALHA " n + 0 " montagens em /sys/fs/cgroup"; else if (ft != "cgroup2") print "FALHA /sys/fs/cgroup é " ft; else if (rt != "/") print "FALHA raiz da montagem cgroup2 diferente de /"; else print "OK" }' "$_mi") || fail "não legível: $_mi"
  [ "$_r" = OK ] || fail "cgroup v2 unificado em /sys/fs/cgroup exigido no processo $1 (E10): ${_r#FALHA }"
}
# Valor de "populated" em <dir>/cgroup.events (1 = há processos na unidade OU em qualquer descendente).
# Uso: v=$(populated_de dir) || exit 2
populated_de() {
  [ -f "$1/cgroup.events" ] && [ -r "$1/cgroup.events" ] || fail "não legível: $1/cgroup.events (E10)"
  _n=0; _v=
  while IFS=' ' read -r _k _x || [ -n "$_k" ]; do
    if [ "$_k" = populated ]; then _n=$((_n + 1)); _v=$_x; fi
  done < "$1/cgroup.events" || fail "leitura falhou: $1/cgroup.events"
  [ "$_n" -eq 1 ] || fail "cgroup.events sem exatamente uma linha populated: $1"
  case "$_v" in 0|1) ;; *) fail "valor populated inválido em $1/cgroup.events" ;; esac
  printf '%s\n' "$_v"
}
# A unidade <dir> não tem cgroups descendentes (cgroup.stat nr_descendants = 0 e nenhuma subpasta): só assim
# cgroup.procs lista TODOS os processos da unidade.
sem_descendentes_ou_falha() {
  [ -f "$1/cgroup.stat" ] && [ -r "$1/cgroup.stat" ] || fail "não legível: $1/cgroup.stat (E10)"
  _n=0; _d=
  while IFS=' ' read -r _k _x || [ -n "$_k" ]; do
    if [ "$_k" = nr_descendants ]; then _n=$((_n + 1)); _d=$_x; fi
  done < "$1/cgroup.stat" || fail "leitura falhou: $1/cgroup.stat"
  [ "$_n" -eq 1 ] || fail "cgroup.stat sem exatamente uma linha nr_descendants: $1"
  exige_num "$_d" nr_descendants
  [ "$_d" -eq 0 ] || fail "a unidade $1 tem $_d cgroups descendentes: os processos deles não aparecem em cgroup.procs (E10)"
  for _s in "$1"/*; do
    if [ -d "$_s" ] && [ ! -L "$_s" ]; then fail "subcgroup na unidade $1: ${_s##*/} (E10)"; fi
  done
}

# --- X3: sinais só com identidade completa relida imediatamente antes ------------------------------------
# Envia o sinal $2 ao processo $1 SÓ se a identidade COMPLETA (identidade_para: pid, início, executável,
# dispositivo:inode, cwd, namespaces, cgroup), relida imediatamente antes, é byte a byte igual ao ficheiro $3.
# $4 = pasta temporária. Códigos: 0 = sinal enviado · 1 = o processo já não existe (nada enviado) ·
# fail = identidade diferente/ilegível com o processo vivo, ou kill falhou (nada enviado).
# CORRIDA RESIDUAL (RR1): entre a releitura e o kill(2) o processo pode terminar e o PID ser reutilizado; em sh
# não há pidfd que a elimine. A janela é de microssegundos; o E1 (destruir a máquina) cobre o resto.
sinaliza_se_mesmo() {
  [ -d "/proc/$1" ] || return 1
  if ( identidade_para "$1" "$4/sinal.$1" ) 2>/dev/null; then :; else
    [ -d "/proc/$1" ] || return 1
    fail "identidade do processo $1 ilegível imediatamente antes do sinal $2: nada enviado"
  fi
  if cmp -s -- "$4/sinal.$1" "$3"; then :; else
    [ -d "/proc/$1" ] || return 1
    fail "o processo $1 já não tem a identidade registada: sinal $2 NÃO enviado"
  fi
  if kill "-$2" "$1" 2>/dev/null; then rm -f -- "$4/sinal.$1"; return 0; fi
  [ -d "/proc/$1" ] || return 1
  fail "não foi possível enviar $2 ao processo $1"
}

# O processo $1 já terminou: /proc/<pid> ausente, ou estado Z/X (zombie: o PID não pode ser reutilizado enquanto o
# pai não o recolher, e um sinal já não tem efeito). 0 = terminou · 1 = ainda corre (ou estado ilegível com /proc presente).
terminou() {
  if [ ! -d "/proc/$1" ]; then return 0; fi
  if _te=$(cat -- "/proc/$1/stat" 2>/dev/null); then :; else
    if [ -d "/proc/$1" ]; then return 1; fi
    return 0
  fi
  _te=${_te##*) }
  case "$_te" in "Z "*|"X "*) return 0 ;; esac
  return 1
}

# --- Trinco global: um passo de cada vez em <ROOT> -------------------------------------------------------
# mkdir atómico de <ROOT>/.trinco, com o dono (PID + início + passo). Ocupado => REPROVADO (outro passo em curso,
# ou um passo interrompido deixou-o: abortar e correr o R90, que assume trincos órfãos).
TRINCO_MEU=
trinco_adquire() {
  mkdir -- "$1/.trinco" 2>/dev/null || fail "trinco do ensaio ocupado ($1/.trinco): outro passo em curso ou um passo interrompido; não continuar (abortar e correr o R90)"
  TRINCO_MEU=$1/.trinco
  _ti=$(inicio_de "$$") || exit 2
  printf 'pid=%s\ninicio=%s\npasso=%s\n' "$$" "$_ti" "$2" > "$1/.trinco/dono" || fail "escrita falhou: trinco"
}
# Liberta o trinco SÓ se for deste processo (dono com o mesmo PID). Nunca falha.
trinco_liberta() {
  [ -n "$TRINCO_MEU" ] || return 0
  _tp=$(chave "$TRINCO_MEU/dono" pid 2>/dev/null) || _tp=
  if [ "$_tp" = "$$" ]; then rm -f -- "$TRINCO_MEU/dono"; rmdir -- "$TRINCO_MEU" 2>/dev/null || true; fi
  TRINCO_MEU=
}
# O dono registado do trinco $1 ainda corre (mesmo PID E mesmo início)? 0 = sim, 1 = não ou sem registo.
trinco_vivo() {
  [ -f "$1/dono" ] || return 1
  _tp=$(chave "$1/dono" pid 2>/dev/null) || return 1
  _ti=$(chave "$1/dono" inicio 2>/dev/null) || return 1
  case "$_tp" in ""|*[!0-9]*) return 1 ;; esac
  [ -d "/proc/$_tp" ] || return 1
  _ta=$(inicio_de "$_tp" 2>/dev/null) || return 1
  [ "$_ta" = "$_ti" ]
}

# --- Campos-token da tabela de passos e das cópias -------------------------------------------------------
# $1 = lista de marcadores separados por vírgulas; $2 = nomes permitidos (separados por espaços).
# Cada nome tem de ser permitido, não vazio e não repetido (um nome mal escrito já não é ignorado em silêncio).
marcadores_ou_falha() {
  _vis=,; _resto=$1,
  while [ -n "$_resto" ]; do
    _k=${_resto%%,*}; _resto=${_resto#*,}
    case " $2 " in *" $_k "*) ;; *) fail "marcador desconhecido ou vazio: '$_k'" ;; esac
    case "$_vis" in *",$_k,"*) fail "marcador repetido: $_k" ;; esac
    _vis="$_vis$_k,"
  done
}

# Integridade do pacote (todos os ficheiros listados conferem; nenhum ficheiro a mais nem a menos).
pacote_integro_ou_falha() {
  ( cd "$1" && sha256sum --quiet --strict -c SHA256SUMS ) > "$2/sums.out" 2>&1 || fail "o pacote não confere com SHA256SUMS (ver $2/sums.out)"
  _n1=$(linhas_dados "$1/SHA256SUMS" 0) || exit 2
  find "$1" -type f > "$2/lista.pacote" || fail "find falhou no pacote"
  _n2=$(linhas_dados "$2/lista.pacote" 0) || exit 2
  [ "$((_n1 + 1))" -eq "$_n2" ] || fail "o pacote tem ficheiros fora do SHA256SUMS ($_n2 ficheiros, $_n1 listados)"
}
# sha256 registado no SHA256SUMS do pacote para um caminho relativo. Uso: h=$(sha_registado pkg rel) || exit 2
sha_registado() {
  _h=$(awk -v p="$2" 'substr($0, 67) == p { n++; h = substr($0, 1, 64) } END { if (n == 1) print h; else print "x" }' "$1/SHA256SUMS") || fail "SHA256SUMS ilegível"
  exige_hex64 "$_h" "SHA256SUMS para $2"
  printf '%s\n' "$_h"
}
