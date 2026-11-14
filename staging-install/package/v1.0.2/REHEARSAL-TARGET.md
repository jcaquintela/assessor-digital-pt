# Alvo do ensaio descartável — verificação FORA do SQL (achado F)

**Estado: procedimento preparado, NÃO executado.** Nenhum ensaio está autorizado.

## Porque não chega o P00

P00/Q00 leem marcas **dentro** da base (por exemplo, a tabela `staging_notes`). Qualquer base pode ter essas marcas; ler `current_setting('listen_addresses')` por SQL também depende de já estar ligado à base certa. A identidade do alvo tem de ser confirmada antes, por meios que não dependam da própria base.

## Procedimento (com autorização separada)

1. Criar uma instância PostgreSQL 17 nova (`initdb`) numa pasta própria, **sem rede** (`listen_addresses = ''`, só socket local), sem `pg_net`, `pg_cron`, `dblink`, `http` ou `postgres_fdw`.
2. Logo a seguir ao `initdb`: gravar um valor aleatório em `<PGDATA>/afonso-rehearsal.nonce` e uma cópia **fora** de PGDATA; gravar o system identifier (`pg_controldata`) em `<PGDATA>/afonso-rehearsal.sysid`.
3. Correr `tools/rehearsal_target_check.sh <PGDATA> <cópia-do-nonce>` num ambiente limpo (`env -i PATH=… HOME=…`). O script:
   - falha se existir **qualquer** variável de ambiente fora de uma lista mínima (só nomes; valores nunca lidos), ou `~/.pgpass`/`~/.pg_service.conf`/`~/.psqlrc`;
   - confirma o nonce e o system identifier **sem SQL**;
   - confirma `listen_addresses` vazio e bibliotecas pré-carregadas com `postgres -C` (lê a configuração, não abre ligação);
   - falha se a configuração tiver ligações ou arquivo remotos.
4. Só depois, com o cliente sem rede (ex.: `unshare -n`) e apenas pelo socket dessa instância: aplicar S4-00…S4-05 e correr P/Q/T01.
5. Dados: **só sintéticos** (`@afonso-staging.invalid`), uma conta sintética de proprietário com papel `admin` e as 3 notas da migração 0000 do staging, para reproduzir o estado que P03/P04 exigem. Nunca dados reais, credenciais, segredos ou integrações.

## Verificação estática feita

- `sh -n` e `bash -n` sem erros (só sintaxe; o script não foi executado).
- Teste automático: o script não imprime valores de variáveis, não usa `psql`/`curl`/`wget`/`nc` e não abre ligações.
