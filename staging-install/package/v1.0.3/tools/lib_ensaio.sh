# shellcheck shell=sh
# AFONSO V2 · pacote v1.0.3 · funções comuns dos passos R10–R90 do ensaio DESCARTÁVEL.
# ESTADO: PREPARADO, NUNCA EXECUTADO. Só é carregado (". lib_ensaio.sh") pelos scripts R*.
#
# Regras de todos os passos:
#  - falha fechada: qualquer verificação que não se consiga fazer conta como REPROVADA;
#  - nunca imprime VALORES de variáveis de ambiente (só nomes); compara valores esperados sem os mostrar;
#  - não usa rede, não lê ~/.pgpass, não liga a nenhuma base (só o R40, pelo socket provado);
#  - o que estes passos verificam é o que o PROCESSO vê. O anfitrião, o hipervisor e a plataforma
#    ficam fora: são as precondições E1–E9 do operador (REHEARSAL-TARGET.md).

fail() { echo "REPROVADO: $1"; exit 2; }
ok() { echo "OK: $1"; }

# Primeiro argumento obrigatório de cada passo: AUTORIZADO:<referência da autorização do proprietário>.
exige_autorizacao() {
  case "${1:-}" in
    AUTORIZADO:*) ref=${1#AUTORIZADO:} ;;
    *) fail "falta o 1.º argumento AUTORIZADO:<referência> (o ensaio exige autorização separada)" ;;
  esac
  case "$ref" in ""|*[!A-Za-z0-9._-]*) fail "referência de autorização inválida" ;; esac
  [ "${#ref}" -ge 6 ] || fail "referência de autorização demasiado curta"
}

# Caminhos sem espaços nem caracteres especiais (são passados a -c, a sed e a psql).
exige_caminho_simples() {
  case "$1" in /*) ;; *) fail "caminho não absoluto: $2" ;; esac
  case "$1" in *[!A-Za-z0-9/._-]*) fail "caminho com caracteres não permitidos: $2" ;; esac
}

# Nomes das variáveis de ambiente de um processo (NUL -> linha; quebras de linha DENTRO de valores
# passam a \034 antes, para nunca aparecerem como "nomes"). Só o nome é impresso.
nomes_ambiente() { tr '\012\000' '\034\012' < "/proc/$1/environ" | sed 's/=.*//'; }

# $1 = PID ("self" para o próprio), $2 = nomes extra permitidos (padrão de case, ex.: "R40_*")
ambiente_limpo_ou_falha() {
  [ -r "/proc/$1/environ" ] || fail "ambiente do processo $1 não legível"
  extra=${2:-__nenhum__}
  bad=$(nomes_ambiente "$1" | while IFS= read -r n; do
    case "$n" in
      PATH|HOME|PWD|SHLVL|_|OLDPWD|LANG|LC_ALL|LC_CTYPE|LC_COLLATE|LC_MESSAGES|TZ|"") ;;
      *) case "$n" in $extra) ;; *) printf '%s ' "$n" ;; esac ;;
    esac
  done)
  [ -z "$bad" ] || fail "variáveis de ambiente não permitidas no processo $1: $bad"
}

# $1 = PID, $2 = valor esperado de HOME (comparado, nunca impresso)
home_controlada_ou_falha() {
  tr '\012\000' '\034\012' < "/proc/$1/environ" | grep -Fxq "HOME=$2" || fail "HOME do processo $1 não é a pasta do ensaio"
  [ -d "$2" ] || fail "HOME do ensaio não existe"
  [ -z "$(ls -A "$2")" ] || fail "HOME do ensaio não está vazia (sem .pgpass, .psqlrc, .pg_service.conf, .ssh, …)"
}

# Rede vista pelo processo $1 (o ficheiro /proc/<pid>/net/* mostra o namespace DESSE processo).
# Entrada e saída: só a interface lo, nenhuma rota IPv4, rotas IPv6 só em lo, e nenhum socket
# TCP/UDP/RAW no namespace. Sem interfaces nem rotas não há pacotes a entrar nem a sair por IP.
rede_isolada_ou_falha() {
  d=/proc/$1/net
  for f in dev route tcp udp unix; do [ -r "$d/$f" ] || fail "não legível: $d/$f"; done
  ifs=$(sed -n '3,$p' "$d/dev" | cut -d: -f1 | tr -d ' ' | sort | tr '\n' ' ')
  [ "$ifs" = "lo " ] || fail "interfaces de rede além de lo no processo $1: $ifs"
  n=$(sed -n '2,$p' "$d/route" | wc -l)
  [ "$n" -eq 0 ] || fail "rotas IPv4 no namespace do processo $1"
  if [ -e "$d/ipv6_route" ]; then
    n=$(awk '$10 != "lo"' "$d/ipv6_route" | wc -l)
    [ "$n" -eq 0 ] || fail "rotas IPv6 fora de lo no processo $1"
  fi
  for p in tcp tcp6 udp udp6 raw raw6 udplite udplite6; do
    [ -e "$d/$p" ] || continue
    n=$(sed -n '2,$p' "$d/$p" | wc -l)
    [ "$n" -eq 0 ] || fail "sockets $p no namespace do processo $1"
  done
  if [ -e /dev/vsock ]; then fail "/dev/vsock presente (canal para o anfitrião)"; fi
}

# Montagens vistas pelo processo $1: nada de sistemas de ficheiros de rede/FUSE nem de pastas de
# segredos; nenhum socket de motor de contentores. A revisão COMPLETA das montagens é a E5.
montagens_ou_falha() {
  mi=/proc/$1/mountinfo
  [ -r "$mi" ] || fail "não legível: $mi"
  bad=$(sed 's/.* - //' "$mi" | cut -d' ' -f1 | while IFS= read -r t; do
    case "$t" in nfs|nfs4|cifs|smb3|smbfs|9p|ceph|glusterfs|fuse|fuse.*|fuseblk|sshfs|davfs|afs|virtiofs) printf '%s ' "$t" ;; esac
  done)
  [ -z "$bad" ] || fail "sistemas de ficheiros de rede/FUSE/partilhados no processo $1: $bad"
  bad=$(cut -d' ' -f5 "$mi" | while IFS= read -r m; do
    case "$m" in /run/secrets*|/var/run/secrets*|*/.aws|*/.aws/*|*/.ssh|*/.ssh/*|*/.kube|*/.kube/*|*/.docker|*/.docker/*|*/.config/gcloud*|*/.azure*|*/.supabase*) printf '%s ' "$m" ;; esac
  done)
  [ -z "$bad" ] || fail "montagens de segredos/credenciais no processo $1: $bad"
  for s in /var/run/docker.sock /run/docker.sock /run/containerd/containerd.sock /run/podman/podman.sock /var/run/crio/crio.sock /run/k3s/containerd/containerd.sock; do
    if [ -e "$s" ]; then fail "socket de motor de contentores presente: $s"; fi
  done
}

# Caminho real de /proc/<pid>/exe (o executável que o processo está de facto a correr).
exe_de() { readlink -f "/proc/$1/exe"; }
ppid_de() { sed -n 's/^PPid:[[:space:]]*//p' "/proc/$1/status"; }
