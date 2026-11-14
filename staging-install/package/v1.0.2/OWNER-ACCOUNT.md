# Conta do proprietário no staging — v1.0.2

**Objetivo:** a conta autorizada (email confirmado, papel `admin`) fica **exatamente** igual. Sem identidade recriada, sem perfil, sem conta nova, sem papel novo ou alterado. O staging tem de ter **exatamente 1 conta** antes e depois.

O email **não** está neste pacote: P04, P05 e Q03 usam `__EMAIL_AUTORIZADO__`, substituído pelo operador ao executar.

## O que é comparado (P05 → Q03)

| Impressão | Fonte | Campos |
|---|---|---|
| B01 conta | `auth.users` | `id, email, phone, aud, role, is_sso_user, is_anonymous, raw_app_meta_data` + instantes (em época, independentes do fuso da sessão) `email_confirmed_at, phone_confirmed_at, created_at, banned_until, deleted_at` |
| B02 identidades | `auth.identities` | `id, provider, provider_id, user_id, created_at`, `identity_data.sub`, `identity_data.email` |
| B03 papéis | `public.user_roles` | todas as linhas: `id, user_id, role, created_at` (o `created_by` novo verifica-se à parte: tem de ser nulo) |

**Fora da impressão, de propósito** (mudam com cada sessão ou são segredos): `last_sign_in_at`, `updated_at`, `encrypted_password`, todos os `*_token`, `*_sent_at`, `raw_user_meta_data`, `confirmed_at` (coluna gerada), e `last_sign_in_at`/`updated_at` das identidades. Um login entre o P05 e o Q03 não deve dar falso REPROVADO por isso; qualquer outra diferença dá.

Verificações absolutas, além das comparações: exatamente 1 conta no total (P04-01, Q03-01); é a do email autorizado; confirmada, não bloqueada, não apagada, não anónima (P04-03…06, Q03-04); papéis `{admin}` e 1 linha em `user_roles` (P04-07/08, Q03-06/07); identidades todas desta conta (P04-10, Q03-05); sem perfis, estado de acesso nem categorias (Q03-09/10).

## Limite: leitura de `auth.identities` (B11)

Não se sabe se a sessão de leitura do staging pode ler `auth.identities`. Se não puder, P04/P05/Q03 dão **erro de permissão**. Isso é **BLOQUEIO**: a comparação de identidades fica por fazer e a conta não conta como verificada. Não retirar a verificação para a fazer passar.

## Porque a instalação não pode tocar na conta

Nenhuma instrução de dados; nenhum gatilho em `auth.users` (QZ-02); `handle_new_user`, que escrevia `consultant` em `user_roles`, não é instalada (QZ-06); `merge_accounts_apply`, que podia mover/apagar o papel admin, não é instalada (QZ-06); `user_roles` só ganha a coluna nula `created_by`.

## O admin do staging não é admin V2

Fica assim de propósito e **não é elevado automaticamente**. Dar `super_admin`/`support_admin`, ou criar-lhe perfil V2, exige autorização própria (B4/B5).

Se o Q03 reprovar: **parar e reportar; não corrigir à mão**.
