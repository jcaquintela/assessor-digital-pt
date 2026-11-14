# Alvo do ensaio descartável — v1.0.3 (R1, R2, R3)

**Estado: preparado, NÃO executado. Nenhum ensaio está autorizado** (nem descartável). G1–G4 NO-GO.

Princípio: **os scripts sozinhos não provam isolamento.** Provam o que o *processo* vê (o seu executável, ficheiros, sockets, configuração, namespace de rede, ambiente e montagens). Aquilo que só o anfitrião vê — a máquina, o hipervisor, a rede física, o que a plataforma liga por fora — são **precondições externas E1–E9**, verificadas e registadas pelo **operador** antes do R10. Sem a evidência de todas: **não arrancar** (B13). Nenhuma frase deste pacote promete isolamento absoluto.

## 1. Precondições externas (operador; fora dos scripts)

| # | Precondição | Evidência mínima a registar |
|---|---|---|
| E1 | Máquina/VM/contentor **criado de novo** só para este ensaio e destruído no fim | identificador e hora de criação; registo da destruição |
| E2 | Sem credenciais: nenhuma chave, token, `.env`, `.pgpass`, `.pg_service.conf`, perfil de nuvem, agente SSH ou variável de projeto (produção, V1 ou staging) | listagem de **nomes** do ambiente e da pasta pessoal (nunca valores) |
| E3 | Rede: servidor **e** cliente num namespace sem interfaces além de `lo`, **sem entrada nem saída** (criado sem rede: ex. `unshare --net` ou contentor `--network none`) | comando de criação e listagem de interfaces/rotas do namespace |
| E4 | Servidor e cliente no **mesmo** namespace de rede e de PIDs (o R41 tem de ver o processo servidor da sessão) | `readlink /proc/<pid>/ns/{net,pid}` dos dois |
| E5 | Montagens revistas: nenhuma pasta de segredos, partilha de rede, FUSE, socket de motor de contentores, volume de produção ou do staging | lista completa de montagens do processo |
| E6 | Sem serviços externos: nenhum agente de backup, monitorização, sincronização, proxy, túnel ou VPN a correr | lista de processos |
| E7 | Binários PostgreSQL 17 de origem conhecida | origem e sha256 de `postgres` e `psql` (o R10 regista o sha256; o R20/R41 comparam com o processo em execução) |
| E8 | Utilizador sem privilégios (não root), dono só de `<ROOT>` | `id` |
| E9 | Nenhum segredo nem dado real em `<ROOT>` e nos ficheiros do pacote copiados para lá | `sha256sum -c SHA256SUMS` + listagem de `<ROOT>` |

## 2. Passos preparados (cada um falha fechado; exigem `AUTORIZADO:<referência>` como 1.º argumento)

| Passo | Ficheiro | Prova |
|---|---|---|
| R10 | `tools/R10_arranque_controlado.sh` | Arranque **controlado**: ambiente mínimo do próprio processo, rede só `lo`, montagens; nonce gravado **primeiro fora** de PGDATA e só depois copiado; `initdb` com autenticação só local e TCP `reject`; `postgres` arrancado **diretamente** (sem `pg_ctl`, para `$!` ser o PID do postmaster) com `listen_addresses=` vazio, socket em pasta 0700, sem bibliotecas pré-carregadas, sem replicação/arquivo/SSL/JIT, todas na **linha de comando**; regista PID, system identifier e sha256 de `postgres`/`psql` |
| R20 | `tools/R20_verificar_processo.sh` | Sem SQL. **R1**: PID registado = `postmaster.pid` = `.lock` do socket; `/proc/<pid>/exe` = `postgres` registado (mesmo sha256); pasta de trabalho = PGDATA; argumentos exatamente os do R10; `postmaster.pid` sem endereço TCP e `ready`; o socket em escuta é um **descritor deste processo**. **R2**: namespace de rede do servidor com só `lo`, sem rotas IPv4/IPv6 fora de `lo`, sem sockets TCP/UDP/RAW, sem `/dev/vsock`; montagens sem rede/FUSE/segredos; ambiente só com nomes permitidos; HOME = pasta vazia do ensaio. **R3**: `postgresql.conf`, `postgresql.auto.conf`, `pg_hba.conf`, `pg_ident.conf`, `postmaster.opts` lidos por completo (ilegível = falha); nenhum `include*`; nenhuma relocalização (`data_directory`, `config_file`, `hba_file`, `ident_file`, `external_pid_file`); `postgresql.auto.conf` sem valores; `pg_hba` só `local` (e `host*` só `reject`); `pg_ident` vazio; nonce externo **fora de PGDATA por caminho real**, ficheiro normal, sem ligações, inode diferente e conteúdo igual; system identifier igual |
| R40 | `tools/R40_ligar_cliente.sh` + `ensaio/R40_ligacao.psql` | Cliente `psql -X` (sem `.psqlrc`), HOME vazia, ambiente mínimo, **mesmo namespace de rede** do servidor, ligação **só** por `host=<ROOT>/sock` (sem TCP, sem serviço). Na mesma sessão: `pg_backend_pid()` → **R41** → **R30** → confirmação de que a sessão não mudou |
| R41 | `tools/R41_processo_cliente.sh` | O processo da sessão é **filho do postmaster** do R20, com o mesmo executável e namespace; o processo `psql` antepassado tem o sha256 registado, o mesmo namespace de rede e de PIDs, ambiente/HOME/rede/montagens controlados |
| R30 | `ensaio/R30_sessao_alvo.sql` (1 SELECT, gerado) | `data_directory`, system identifier e sha256 do nonce iguais aos provados fora do SQL; `listen_addresses`, socket e porta com origem `command line`; sessão sem endereço de rede; sem pré-carregamento, replicação, arquivo ou restauro; ficheiros de configuração = os de PGDATA, `pg_file_settings` só desse ficheiro e sem erros (logo sem includes nem `ALTER SYSTEM` aplicados); `pg_hba`/`pg_ident`; sem definições vindas do ambiente nem por base/papel; sem SSL e `dynamic_library_path` por omissão; só `plpgsql`, sem servidores externos/subscrições/slots; só as bases do `initdb`; superutilizador do ensaio |
| R90 | `tools/R90_descartar.sh` | Para o postmaster **só se ainda for o do ensaio**, confirma que terminou e apaga PGDATA, socket, HOME e nonce |

Os marcadores `__R_…__` só são substituídos em **cópias** dentro de `<ROOT>/evidencia/sql/`; os ficheiros do pacote nunca mudam (os hashes continuam a conferir).

## 3. Limites (ditos, não escondidos)

- `/proc` mostra o que o núcleo diz ao processo. Um anfitrião comprometido ou uma camada fora do sistema operativo (hipervisor, rede da plataforma) **não é detetável** pelos scripts → E1, E3, E6.
- "Só `lo`, sem rotas, sem sockets IP" exclui tráfego IP de entrada e saída desse namespace; não exclui canais que não são IP (memória partilhada, ficheiros montados, `vsock` se o dispositivo aparecer com outro nome) → E5.
- O R20 lista padrões conhecidos de montagens de segredos; não conhece todos os nomes possíveis → E5 é a revisão completa.
- Ambiente: só são impressos **nomes**. Um nome permitido (`PATH`, `HOME`, `LANG`, …) com um valor estranho não é detetado, exceto `HOME`, que é comparado.
- Falsos negativos são possíveis (ex.: um binário instalado por ligação simbólica numa pasta diferente). Uma falha manda **descartar e recomeçar**, nunca contornar.
