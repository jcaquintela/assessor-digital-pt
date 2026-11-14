# Bootstrap 100% sintético da instância descartável — v1.0.3 (R5)

**Estado: especificação + ficheiros BLOQUEADOS. Nada executado. Não autorizado.**

O ensaio precisa de uma base que se pareça com o AFONSO Staging **antes** das S4: papéis da plataforma, `auth.users`/`auth.identities`/`auth.uid()`, schema `extensions`, `storage.buckets`, a migração 0000 do staging e **uma** conta sintética com papel `admin`. Tudo é criado do zero, com dados inventados; **nada é copiado** do staging, da V1 ou de produção.

## Ficheiros (todos com 2 guardas: `BLOQUEADO` + `SÓ DESCARTÁVEL`, que exige o superutilizador do ensaio e o nonce desta instância)

| Ordem | Ficheiro | Base / papel | O quê |
|---|---|---|---|
| B00 | `ensaio/B00_papeis_e_base.bloqueado.sql` | `postgres` / `ensaio_super`, sem transação | Papéis `postgres` (**não** superutilizador; CREATEDB, CREATEROLE, BYPASSRLS), `anon`, `authenticated`, `service_role` (BYPASSRLS), `authenticator`, `supabase_auth_admin`, `supabase_storage_admin`; base `afonso_ensaio` (dono `postgres`) |
| B01 | `ensaio/B01_plataforma_sintetica.bloqueado.sql` | `afonso_ensaio` / `ensaio_super`, 1 transação | Privilégios da base; `search_path`; **privilégios por omissão no pior caso** (tudo a anon/authenticated/service_role, para provar que os REVOKE das S4 limpam); schema `extensions` (dono `postgres`); `auth` (dono `supabase_auth_admin`) com `users`, `identities`, `uid()`; `storage.buckets` vazia; **1 conta** `proprietario.sintetico@afonso-staging.invalid` com 1 identidade `email`, id gerado na hora, sem palavra-passe nem tokens |
| B01b | `ensaio/B01b_unaccent_instalada.bloqueado.sql` | idem | **Só** variante INSTALADA (R4): `CREATE EXTENSION unaccent WITH SCHEMA extensions` pelo superutilizador, como se a plataforma a tivesse pré-instalado. Variante NOVA: não aplicar (o S4-00 cria-a como `postgres`) |
| 0000 | `drizzle/migrations/0000_staging_access_control.sql` **do repositório do staging** | `afonso_ensaio` / `postgres` | Entrada externa: `app_role`, `user_roles`, `staging_notes` (3 notas), `has_role`, `has_staging_access`. **Não incluída** neste pacote; só se conhece o prefixo sha256 `a87578e560f0c97f` → B14: sem o sha256 integral registado, o ensaio não arranca |
| B02 | `ensaio/B02_papel_admin_sintetico.bloqueado.sql` | `afonso_ensaio` / `ensaio_super`, 1 transação | Exige 0000 aplicada e `user_roles` vazia; insere **1** linha `admin` para a conta sintética; confirma 1 linha e 3 notas |

Depois do B02, P00–P05 e Q00–Q05 correm **como `postgres`** (o dono histórico) com `__EMAIL_AUTORIZADO__` = `proprietario.sintetico@afonso-staging.invalid`.

## Limites face ao Supabase real (L1–L10)

| # | Diferença | Consequência |
|---|---|---|
| L1 | Sem GoTrue, PostgREST, Storage API, Realtime, Edge, pg_net, pg_cron, vault, supautils, gatilhos de evento da plataforma | Só se prova o SQL e as verificações, não o comportamento da plataforma |
| L2 | `auth.users`/`auth.identities` só com as colunas que o pacote lê; sem `sessions`, `refresh_tokens`, `mfa_*`, `sso_*` | Q03 compara só os campos estáveis; outras tabelas de auth não são cobertas |
| L3 | Atributos e pertenças dos papéis aproximados (o `postgres` real tem outras pertenças e o Supabase pode alterar defaults) | P01/P02 no ensaio avaliam este `postgres`, não o executor real (B2) |
| L4 | Privilégios por omissão escolhidos no **pior caso**, não copiados | Prova que os REVOKE retiram tudo; não prova quais são os defaults reais |
| L5 | Privilégios em `auth.*` atribuídos à mão (`REFERENCES`/`SELECT` a `postgres`, `SELECT` em `auth.users` a `service_role`) | No staging, a leitura de `auth.identities` continua por confirmar (B11) |
| L6 | unaccent: o caminho INSTALADA usa o superutilizador do ensaio; no staging a plataforma pode instalar de outra forma | P02 no staging decide o estado; B16 |
| L7 | Sem lista de extensões permitidas da plataforma | Um CREATE EXTENSION que passa no ensaio pode ser recusado no staging |
| L8 | `ensaio_super` existe só aqui; T01 e B* dependem dele | No staging as guardas abortam (intencional) |
| L9 | Versão menor do PostgreSQL 17 e colação `C` | Texto deparsado (políticas, tipos) pode diferir; P05/Q03/Q04 comparam na mesma instância |
| L10 | A 0000 vem de fora; o corpo de `has_role` e as notas comparados no P03/Q04 só conferem se for o ficheiro autêntico | B14 |

Um ensaio aprovado **não** transfere automaticamente para o staging (B15).
