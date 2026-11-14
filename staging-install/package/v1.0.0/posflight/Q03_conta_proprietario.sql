-- Q03 · Conta do proprietário DEPOIS da instalação. Só leitura.
-- Substituir __EMAIL_AUTORIZADO__ como em P04. As impressões digitais têm de ser
-- IGUAIS às guardadas em P04. Qualquer diferença => parar e reportar (não corrigir à mão).
WITH alvo AS (SELECT lower('__EMAIL_AUTORIZADO__') AS email),
u AS (
  SELECT au.id, lower(au.email) AS email, au.email_confirmed_at, au.created_at, to_jsonb(au) AS j
    FROM auth.users au, alvo WHERE lower(au.email) = alvo.email
),
r AS (SELECT ur.* FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u))
SELECT 'contas com o email autorizado' AS verificacao, (SELECT count(*) FROM u)::text AS valor, (SELECT count(*) FROM u) = 1 AS ok
UNION ALL SELECT 'email continua confirmado', (SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u)::text,
       coalesce((SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u), false)
UNION ALL SELECT 'papéis continuam exatamente {admin} (sem consultant acrescentado)', (SELECT string_agg(role::text, ',' ORDER BY role::text) FROM r),
       coalesce((SELECT array_agg(role::text ORDER BY role::text) FROM r), '{}') = ARRAY['admin']
UNION ALL SELECT 'um único admin no staging', (SELECT count(*) FROM public.user_roles WHERE role::text = 'admin')::text,
       (SELECT count(*) FROM public.user_roles WHERE role::text = 'admin') = 1
UNION ALL SELECT 'papel admin sem created_by (linha original intacta)', (SELECT string_agg(coalesce(created_by::text, 'null'), ',') FROM r),
       coalesce((SELECT bool_and(created_by IS NULL) FROM r), false)
UNION ALL SELECT 'impressão digital da identidade (= P04)',
       (SELECT md5(id::text || '|' || email || '|' || extract(epoch FROM email_confirmed_at)::text || '|' || extract(epoch FROM created_at)::text) FROM u),
       (SELECT count(*) FROM u) = 1
UNION ALL SELECT 'impressão digital dos papéis (= P04)',
       (SELECT md5(string_agg(id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM r),
       EXISTS (SELECT 1 FROM r)
UNION ALL SELECT 'sem perfil V2 criado para a conta (opção A)', (SELECT count(*) FROM public.profiles WHERE id IN (SELECT id FROM u))::text,
       NOT EXISTS (SELECT 1 FROM public.profiles WHERE id IN (SELECT id FROM u))
UNION ALL SELECT 'sem estado de acesso V2 para a conta', (SELECT count(*) FROM public.account_access WHERE user_id IN (SELECT id FROM u))::text,
       NOT EXISTS (SELECT 1 FROM public.account_access WHERE user_id IN (SELECT id FROM u))
UNION ALL SELECT 'sem categorias de imóveis semeadas para a conta', (SELECT count(*) FROM public.property_categories WHERE user_id IN (SELECT id FROM u))::text,
       NOT EXISTS (SELECT 1 FROM public.property_categories WHERE user_id IN (SELECT id FROM u))
UNION ALL SELECT 'total de contas igual ao de P04 (informativo)', (SELECT count(*) FROM auth.users)::text, true
UNION ALL SELECT 'impressão digital alargada (informativo; pode mudar com um início de sessão)',
       (SELECT md5(coalesce(j -> 'raw_app_meta_data', 'null')::text || '|' || coalesce(j ->> 'is_sso_user', '') || '|' || coalesce(j ->> 'phone', '')) FROM u),
       true;
