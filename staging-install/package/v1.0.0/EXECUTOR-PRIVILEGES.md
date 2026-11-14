# Permissões do papel REAL que aplica as migrações no staging

## Problema

O papel que corre consultas de leitura no staging **não** é o que aplica as migrações. O próprio staging registou, em `docs/staging-access-proofs.md`, que a leitura administrativa foi recusada ao chamar `has_staging_access`.

Por isso, perguntar "tenho TRIGGER?" com a sessão de leitura não diz nada sobre o executor.

## Método sem escrita (P01 + P02)

**P01: identificar o executor pela propriedade dos objetos.** A migração 0000 do staging foi aplicada pela ferramenta de migrações. Os objetos que ela criou têm como dono o papel que a executou:
- `user_roles`, `staging_notes`, `app_role`, `has_role`, `has_staging_access`;
- se estiver visível, também o registo `drizzle.__drizzle_migrations`.

O P01 lê esses donos no catálogo (`pg_class`, `pg_type`, `pg_proc`, `pg_namespace`). O resultado é:
- **um só dono:** o executor fica identificado;
- **vários donos:** `AMBÍGUO`;
- **nada visível:** `NÃO VISÍVEL`.

**P02: avaliar os privilégios desse papel, e não os da sessão.** As funções `has_table_privilege(oid_do_papel, oid_da_tabela, 'TRIGGER')`, `has_schema_privilege`, `has_function_privilege` e `pg_has_role` respondem sobre **qualquer papel indicado**, a partir das permissões e da pertença a papéis no catálogo. Não escrevem nada.

O P02 verifica estes requisitos:

| Requisito | Porquê |
|---|---|
| TRIGGER em `auth.users` | `CREATE TRIGGER on_auth_user_created` |
| REFERENCES em `auth.users` | 88 chaves estrangeiras para utilizadores |
| BYPASSRLS ou superutilizador | 8 tabelas com FORCE RLS escritas por funções SECURITY DEFINER do dono (por exemplo `handle_new_user` → `profiles`). Sem isto, a criação de contas novas falharia |
| dono, ou membro do dono, de `storage.objects` | `CREATE POLICY` exige ser dono |
| dono da publicação `supabase_realtime` | `ALTER PUBLICATION` |
| dono de `has_role` | `CREATE OR REPLACE FUNCTION` |
| dono de `app_role` | `ALTER TYPE … ADD VALUE` |
| CREATE em `public` | criar as tabelas e funções |
| CREATE em `extensions` | instalar `unaccent`, se ainda não estiver |
| USAGE em `auth` e `storage` | aceder aos objetos da plataforma |
| EXECUTE em `auth.uid()` e `storage.foldername()` | usados nas políticas |

**Ensaio na base descartável:**
- **Papel de teste sem privilégios:** o P02 marcou como falhados 4 requisitos obrigatórios (BYPASSRLS, TRIGGER, dono de `storage.objects`, dono da publicação). A verificação distingue um executor sem permissões.
- **Executor com tudo:** todos os requisitos deram verdadeiro (ver `evidence/`).

## O que esta leitura NÃO prova

1. **Que a ferramenta corre hoje com esse papel.** É uma inferência: foi o dono dos objetos quando a 0000 foi aplicada.
2. **Proteções da plataforma além das permissões** (por exemplo, extensões de controlo ou gatilhos de eventos) que possam recusar uma operação mesmo com permissão no catálogo.
3. **Uma mudança de papel durante a sessão** de migração.

## Regra de decisão

| Resultado | Decisão |
|---|---|
| P01 `AMBÍGUO` ou `NÃO VISÍVEL` | **BLOQUEIO** |
| qualquer linha obrigatória do P02 = false | **BLOQUEIO**. Não alargar permissões sem autorização |
| tudo verdadeiro | **Evidência forte, não prova definitiva** |

Com tudo verdadeiro, o risco que sobra é limitado. Cada migração é atómica: se falhar, a ferramenta reverte essa migração inteira.

A única consequência possível é parcial. Se o S2-00 já estiver aplicado e o S2-01 falhar, ficam os 3 valores novos de `app_role` e a coluna opcional `created_by`. São inofensivos e o S2-01 pode ser repetido.

## Prova definitiva sem escrita persistente (NÃO autorizada, não incluída como passo)

Seria possível uma "migração-sonda" que só lê o papel corrente e termina sempre com erro. A ferramenta reverte-a e nada fica aplicado.

Mesmo assim, é uma execução de SQL pelo canal de migrações. Exige autorização expressa à parte e **não faz parte deste pacote**.

## Estado atual

**NÃO COMPROVADO.** Nesta etapa não foi executado nada no staging. Fica como **BLOQUEIO da instalação** até o staging correr o P01 e o P02 e devolver os resultados.
