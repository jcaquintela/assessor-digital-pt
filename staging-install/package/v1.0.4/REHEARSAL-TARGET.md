# Alvo do ensaio descartável — v1.0.4

**Estado: preparado, NÃO executado. Nenhum ensaio está autorizado** (nem descartável) e o ensaio **não tem GO**. G1–G4 NO-GO.

Princípio: **os scripts sozinhos não provam isolamento.** Provam o que o *processo* vê: o executável, os ficheiros, os sockets, a configuração, o namespace de rede, a unidade/cgroup, o ambiente e as montagens. O que só o anfitrião vê — a máquina, o hipervisor, a rede física, o que a plataforma liga por fora — são **obrigações externas E1–E10** do **operador**. Nenhuma frase deste pacote promete isolamento absoluto.

## 1. Obrigações externas do operador (E1–E10)

**Falha fechada:**

- O operador regista a evidência de **cada** obrigação na ficha `operador/E-EVIDENCIA.modelo` e entrega uma cópia preenchida ao R10.
- O R10 **recusa arrancar** se faltar uma linha, se houver repetidas ou desconhecidas, ou se alguma estiver vazia, curta ou disser `PENDENTE`.
- Sem a ficha completa, nada arranca.
- O R10 só confere a **forma** da ficha. A **verdade** da evidência é do operador (B13).

| # | Obrigação | Evidência exigida (referência na ficha; nunca valores de segredos) | O que os scripts confirmam por si | Se falhar |
|---|---|---|---|---|
| E1 | Máquina/VM/contentor **criado de novo** só para este ensaio, **destruído no fim e SEMPRE que o R90 termine com INCERTEZA** (código 3) | identificador e hora de criação; registo da destruição | nada (fora do processo) | não arrancar; se já arrancou: destruir |
| E2 | Sem credenciais: nenhuma chave, token, `.env`, `.pgpass`, `.pg_service.conf`, perfil de nuvem, agente SSH ou variável de projeto (produção, V1 ou staging) | listagem de **nomes** do ambiente e da pasta pessoal (nunca valores) | nomes do ambiente de R10, R20, R40, R41 e dos processos servidor/sessão/psql; HOME vazia | REPROVADO |
| E3 | Rede: servidor **e** cliente num namespace **sem entrada nem saída** (só `lo`; ex.: `unshare --net` ou contentor `--network none`) | comando de criação; interfaces e rotas do namespace | só `lo`, sem rotas IPv4/IPv6 fora de `lo`, sem sockets TCP/UDP/RAW, sem `/dev/vsock` para R10, servidor, wrapper e psql | REPROVADO |
| E4 | Servidor, wrapper e psql no **mesmo** namespace de rede e de PIDs | `readlink /proc/<pid>/ns/{net,pid}` dos processos | R40/R41 comparam com o namespace registado do postmaster | REPROVADO |
| E5 | Montagens revistas por completo: nenhuma pasta de segredos, partilha de rede, FUSE, socket de motor de contentores, volume de produção ou do staging | lista completa de montagens | só padrões conhecidos (tipos de rede/FUSE, pastas de segredos, sockets de contentores) | REPROVADO; o resto é do operador |
| E6 | Sem serviços externos: nenhum agente de backup, monitorização, sincronização, proxy, túnel ou VPN | lista de processos | o R90 varre os processos do utilizador do ensaio; o R20 exige uma unidade só com o servidor | não arrancar |
| E7 | Binários PostgreSQL 17 de origem conhecida | origem e sha256 de `postgres` e `psql` | o R10 regista sha256 e dispositivo:inode; R20/R41 comparam com os processos em execução | REPROVADO |
| E8 | Utilizador sem privilégios (não root), dono só de `<ROOT>` | `id`; dono de `<ROOT>` | R10 recusa root e `<ROOT>` de outro dono | REPROVADO |
| E9 | Pacote conferido e sem dados reais; `<ROOT>` nova e vazia | `sha256sum -c SHA256SUMS`; listagem de `<ROOT>` | R10 e cada sessão do R40 conferem o pacote inteiro (nenhum ficheiro a mais); R10 exige `<ROOT>` vazia | REPROVADO |
| E10 | **Unidade/cgroup v2 dedicada** ao servidor, criada só para o ensaio, com `cgroup.kill` delegado ao utilizador do ensaio; R10 corre lá dentro; R40, R41 (psql) e R90 correm **fora** dela (ex.: `systemd-run --user --scope --unit=afonso-ensaio-<ref>`) | comando de criação da unidade; caminho do cgroup | R10: cgroup v2, não a raiz, `cgroup.kill` gravável, só o próprio R10 lá dentro; R20: só o postmaster e filhos dele; R41/R40/R90: fora da unidade; R90: espera que a unidade fique vazia | não arrancar; no fim: INCERTEZA ⇒ destruir (E1) |

## 2. Passos preparados (cada um falha fechado; todos exigem `AUTORIZADO:<referência>` exceto o R41, que a lê do registo)

| Passo | Ficheiro | Prova |
|---|---|---|
| R05 | `tools/R05_entrada_0000.sh` | Entrada 0000. Só aceita o estado registado em `entradas/0000/ESPERADO`: `AUTENTICADO` (sha256 integral) ou `ALTERNATIVO_AUDITADO`. **Hoje recusa (PENDENTE, B14)** |
| R10 | `tools/R10_arranque_controlado.sh` | Marca a pasta e regista a unidade **antes** de qualquer processo. Recusa sem ficha E1–E10, com a 0000 pendente ou com o pacote alterado. Depois: nonce **fora** de PGDATA primeiro; `initdb` só local; postmaster arrancado **diretamente** com as opções críticas na linha de comando. Regista a **identidade estável**: início, executável (dispositivo:inode, sha256), cwd, namespaces, cgroup e início no `postmaster.pid`. Se falhar depois de arrancar, faz paragem rápida do **seu** postmaster e manda correr o R90 |
| R20 | `tools/R20_verificar_processo.sh` | Sem SQL. O postmaster é o **mesmo processo** do R10, provado pela identidade estável e não pela linha de comando (V5). Confere o `postmaster.pid` e o `.lock` do socket, e que o socket em escuta é descritor do processo. A unidade só tem o postmaster e filhos dele. Rede, montagens, ambiente e HOME. Configuração completa sem pipelines (V4). Nonce fora de PGDATA e sysid |
| R40 | `tools/R40_sessao.sh` + `ensaio/R40_sessao.psql` | **Wrapper único** (S1/S2), ver `REHEARSAL-PLAN.md` §2 |
| R41 | `tools/R41_processo_cliente.sh` | Chamado pela cópia do guião, só com caminhos literais validados (V2). O processo da sessão é **filho direto** do postmaster, com o mesmo executável, nascido depois dele, no mesmo namespace e na mesma unidade. O psql antepassado é o lançado pelo R40, identificado pelo executável, com o sha256 registado, fora da unidade e com ambiente, HOME, rede e montagens controlados |
| R30 | `ensaio/R30_sessao_alvo.sql` (1 SELECT, gerado; passo `R30` do R40) | Instância e configuração vistas de dentro, antes do bootstrap (as 17 verificações da v1.0.3; cabeçalho corrigido, V1) |
| R31 | `ensaio/R31_sessao_passo.sql` (1 SELECT, gerado) | Antes **e** depois de cada ficheiro: base, papel, sem `SET ROLE`, atributo de superutilizador, socket local, porta, arranque do postmaster (±2 s), nenhuma outra sessão de cliente |
| R32 | `ensaio/R32_instancia_super.sql` (1 SELECT, gerado) | Só nas sessões do superutilizador do ensaio: `data_directory`, system identifier, nonce, pasta do socket, sem TCP |
| R90 | `tools/R90_descartar.sh` | Qualquer estado (parcial, interrompido, completo), idempotente. Só sinaliza processos com a identidade do ensaio. Espera que **todos** os processos da unidade terminem; se não, usa `cgroup.kill`. Confirma por varredura e só então apaga. Se não conseguir confirmar: **INCERTEZA, destruir a máquina** (V6/V7) |

## 3. Limites (ditos, não escondidos)

- `/proc` e `/sys/fs/cgroup` mostram o que o núcleo diz ao processo. Um anfitrião comprometido ou uma camada fora do sistema operativo não é detetável → E1, E3, E6.
- "Só `lo`, sem rotas, sem sockets IP" exclui tráfego IP desse namespace. Não exclui canais que não são IP (memória partilhada, ficheiros montados, dispositivos com outro nome) → E5.
- A identidade estável usa o início em ticks e o executável por dispositivo:inode. Um executável substituído no mesmo inode por quem tenha escrita na pasta dos binários não é distinguível só por isso. O sha256 do executável em execução é comparado em cada R20 e R41 → E7.
- Sessões do papel `postgres` (não superutilizador) não conseguem ler `data_directory`, `pg_control_system()` nem o nonce. Para elas a instância é provada **fora do SQL**: o R41 confirma que o processo da sessão é filho do postmaster provado. O R31-07 só corrobora.
- O wrapper não protege contra um operador que edite as cópias entre a reconferência e o `psql` dentro da pasta 0700 do próprio utilizador do ensaio. Isso é E8/E9.
- Ambiente: só se imprimem **nomes**. Um nome permitido (`PATH`, `LANG`, …) com um valor estranho não é detetado, exceto `HOME`, que é comparado.
- Falsos negativos são possíveis. Uma falha manda **descartar e recomeçar**, nunca contornar.
