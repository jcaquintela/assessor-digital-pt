# AFONSO V2 · pacote de instalação para o AFONSO Staging — v1.0.1 (CORRIGIDO)

**Estado: só para auditoria. Nada deste pacote foi executado** — nem no staging, nem na V1, nem em nenhuma base descartável. G1–G4 continuam NO-GO.

| | |
|---|---|
| Destino único | Projeto **AFONSO Staging** (`8d741542-70d9-4078-bfc6-64e3d047396a`) |
| Nunca aplicar | à V1 (produção) nem a nenhum outro projeto |
| Substitui | v1.0.0 (commit `cc20a982`), reprovada na auditoria do staging |
| Origem | Estado final do esquema V2: `staging-install/rehearsal/results/schema_public.sql` (sha256 `e047c2e1…`, ensaio descartável autorizado, commit `84f428ce`). Gerado por `scripts/staging/build-staging-package-v101.ts` |
| Integridade | `sha256sum -c SHA256SUMS` dentro desta pasta |

## O que mudou em relação à v1.0.0

A v1.0.0 reproduzia o histórico de 184 migrações (dados, reparos, DROP, RENAME, DROP NOT NULL). A v1.0.1 **cria diretamente o estado final**, só com DDL aditivo. Resumo por achado da auditoria em `FINDINGS-RESOLUTION.md`; números em `DIFF-v1.0.0.md`.

- **0** INSERT/UPDATE/DELETE/DO/SELECT/SET no topo; **0** DROP, RENAME, DROP NOT NULL ou CREATE OR REPLACE.
- **Deny-by-default**: cada tabela nasce, na mesma migração, com RLS, a barreira `staging_gate_admin_tester` (RESTRICTIVE, `has_staging_access(auth.uid())`) e `REVOKE ALL … FROM PUBLIC, anon, authenticated`. Só `service_role` recebe permissões. Cada função perde EXECUTE para PUBLIC/anon/authenticated logo a seguir à criação.
- **Nenhuma configuração de envio ativa em nenhuma etapa**: nenhuma linha é escrita (sem interruptores, ligações, preferências ou perfis) e 6 valores por omissão de envio/sincronização passam a `false`.
- **Sem chaves para `auth.users`** fora de `profiles` (84 retiradas).
- **Sem gatilho em `auth.users`, sem storage, sem Realtime** (quarentena).
- **Objetos do staging intactos**: `has_role`, `has_staging_access`, `staging_notes` e as políticas/permissões de `user_roles` não são tocados. Só se acrescentam 3 valores a `app_role` e a coluna nula `user_roles.created_by`.
- **Verificações que falham de verdade**: cada consulta P/Q dá **erro** (`REPROVADO: …`) se uma verificação falhar ou der NULL; os valores guardados no P03/P04 são comparados pela própria consulta no Q03/Q04.

## Conteúdo

| Caminho | O quê |
|---|---|
| `sql/S3-00 … S3-05` | 6 migrações só-DDL, por ordem, **uma por migração** |
| `preflight/P00 … P04` | Só leitura, ANTES: alvo, executor, privilégios, colisões, conta do proprietário |
| `posflight/Q00 … Q05` | Só leitura, DEPOIS: alvo, estrutura, segurança, conta, acesso do staging, matriz de acesso |
| `quarantine/` | Dados, gatilho, Realtime, storage e chaves retiradas — **não executável** |
| `tests-db/T01…bloqueado.sql` | Teste comportamental da matriz — **bloqueado** (escreve dados sintéticos em ROLLBACK) |
| `ACCESS-MATRIX.md` | Matriz anon / sem papel / tester / admin / servidor (análise estática, pior caso) |
| `DIFF-v1.0.0.md` | Diferenças medidas v1.0.0 → v1.0.1 |
| `FINDINGS-RESOLUTION.md` | Cada achado da auditoria → correção → prova |
| `TEST-CRITERIA.md` | Critérios de teste e o que já foi verificado |
| `COLLISIONS.md`, `OWNER-ACCOUNT.md`, `EXECUTOR-PRIVILEGES.md` | Colisões com o staging, conta do proprietário, privilégios do executor |
| `BLOCKERS.md` | Bloqueios e ambiguidades (não simulados) |
| `tools/parse_check.mjs`, `evidence/parse-check.txt` | Verificação de sintaxe com o parser oficial do PostgreSQL 17, sem base |
| `MANIFEST.json`, `SHA256SUMS` | Inventário e hashes de todos os ficheiros |

## Sequência (cada passo com a autorização indicada)

1. **Integridade** (sem autorização extra): `sha256sum -c SHA256SUMS`.
2. **Preflight** (só leitura): correr P00 → P04 no staging. Todos têm de dar `APROVADO`. Guardar P03-15 e P04-09…P04-12.
3. **Ensaio descartável** (autorização separada): aplicar S3-00…S3-05 numa base descartável isolada e correr Q00–Q05 e T01. **Ainda não feito** (B1).
4. **Instalação no staging** (autorização separada): S3-00 → S3-05 com a ferramenta de migrações do staging, um ficheiro por migração, sem alterar nada.
5. **Posflight** (só leitura): Q00 → Q05, com os marcadores substituídos. Todos `APROVADO`. Qualquer erro => parar e reportar, **não corrigir à mão**.

A quarentena e o T01 ficam fora desta sequência.

## O que enviar ao staging para auditoria

O ZIP deste pacote inteiro. Pedir **apenas**: verificar o SHA256 do ZIP, `sha256sum -c SHA256SUMS` e correr P00–P04 (só leitura). **Não aplicar** S3-00…S3-05.
