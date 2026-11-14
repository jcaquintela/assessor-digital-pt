-- P04 · Estado da conta do proprietário ANTES da instalação. Só leitura.
-- Substituir __EMAIL_AUTORIZADO__ pelo email autorizado no momento da execução
-- (não fica escrito neste pacote). Guardar as duas impressões digitais: o
-- posflight Q03 tem de devolver exatamente os mesmos valores.
WITH alvo AS (SELECT lower('__EMAIL_AUTORIZADO__') AS email),
u AS (
  SELECT au.id, lower(au.email) AS email, au.email_confirmed_at, au.created_at, to_jsonb(au) AS j
    FROM auth.users au, alvo WHERE lower(au.email) = alvo.email
),
r AS (SELECT ur.* FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u))
SELECT 'contas com o email autorizado' AS verificacao, (SELECT count(*) FROM u)::text AS valor, (SELECT count(*) FROM u) = 1 AS ok
UNION ALL SELECT 'email confirmado', (SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u)::text,
       coalesce((SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u), false)
UNION ALL SELECT 'não bloqueada', (SELECT max(j ->> 'banned_until') FROM u),
       coalesce((SELECT bool_and(j ->> 'banned_until' IS NULL OR (j ->> 'banned_until')::timestamptz < now()) FROM u), false)
UNION ALL SELECT 'não apagada', (SELECT max(j ->> 'deleted_at') FROM u), coalesce((SELECT bool_and(j ->> 'deleted_at' IS NULL) FROM u), false)
UNION ALL SELECT 'não anónima', (SELECT max(j ->> 'is_anonymous') FROM u),
       coalesce((SELECT bool_and(coalesce(j ->> 'is_anonymous', 'false') = 'false') FROM u), false)
UNION ALL SELECT 'papéis da conta = exatamente {admin}', (SELECT string_agg(role::text, ',' ORDER BY role::text) FROM r),
       coalesce((SELECT array_agg(role::text ORDER BY role::text) FROM r), '{}') = ARRAY['admin']
UNION ALL SELECT 'um único admin no staging', (SELECT count(*) FROM public.user_roles WHERE role::text = 'admin')::text,
       (SELECT count(*) FROM public.user_roles WHERE role::text = 'admin') = 1
UNION ALL SELECT 'total de contas (informativo)', (SELECT count(*) FROM auth.users)::text, true
UNION ALL SELECT 'contas sem nenhum papel (receberiam consultant no preenchimento da V2)',
       (SELECT count(*) FROM auth.users x WHERE NOT EXISTS (SELECT 1 FROM public.user_roles y WHERE y.user_id = x.id))::text,
       (SELECT count(*) FROM auth.users x WHERE NOT EXISTS (SELECT 1 FROM public.user_roles y WHERE y.user_id = x.id)) = 0
UNION ALL SELECT 'impressão digital da identidade (GUARDAR)',
       (SELECT md5(id::text || '|' || email || '|' || extract(epoch FROM email_confirmed_at)::text || '|' || extract(epoch FROM created_at)::text) FROM u),
       (SELECT count(*) FROM u) = 1
UNION ALL SELECT 'impressão digital dos papéis (GUARDAR)',
       (SELECT md5(string_agg(id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM r),
       EXISTS (SELECT 1 FROM r)
UNION ALL SELECT 'impressão digital alargada (informativo; pode mudar com um início de sessão)',
       (SELECT md5(coalesce(j -> 'raw_app_meta_data', 'null')::text || '|' || coalesce(j ->> 'is_sso_user', '') || '|' || coalesce(j ->> 'phone', '')) FROM u),
       true;
