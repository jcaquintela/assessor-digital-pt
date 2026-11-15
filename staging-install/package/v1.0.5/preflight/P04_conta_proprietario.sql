-- P04 · Conta do proprietário IMEDIATAMENTE antes de instalar (exatamente 1 conta no staging).
-- Substituir __EMAIL_AUTORIZADO__ pelo email autorizado ao executar (não fica no pacote).
-- Lê auth.users e auth.identities. Se a sessão não puder ler auth.identities, a consulta dá ERRO de
-- permissão: isso é BLOQUEIO (B11), não aprovação. Não remover a verificação para a fazer passar.
-- Só leitura: um único SELECT. Resultado: uma linha por verificação. Se alguma
-- verificação falhar (ou der NULL), a consulta TERMINA EM ERRO com "REPROVADO: <id> obtido=<valor> | …".
WITH alvo AS (SELECT lower('__EMAIL_AUTORIZADO__') AS email),
u AS (SELECT au.id, lower(au.email) AS email, to_jsonb(au) AS j FROM auth.users au, alvo WHERE lower(au.email) = alvo.email),
r AS (SELECT ur.id, ur.user_id, ur.role, ur.created_at FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u)),
c(id, verificacao, ok, esperado, obtido) AS (
  SELECT 'P04-00'::text, 'marcador do email substituído'::text, ((SELECT email FROM alvo) ~ '^[^_][^@]*@[^@]+\.[^@]+$')::boolean, 'email'::text, (CASE WHEN (SELECT email FROM alvo) LIKE '\_\_%' THEN 'marcador por substituir' ELSE 'substituído' END)::text
  UNION ALL SELECT 'P04-01'::text, 'o staging tem EXATAMENTE 1 conta'::text, ((SELECT count(*) FROM auth.users) = 1)::boolean, '1'::text, ((SELECT count(*) FROM auth.users)::text)::text
  UNION ALL SELECT 'P04-02'::text, 'essa conta é a do email autorizado'::text, ((SELECT count(*) FROM u) = 1)::boolean, '1'::text, ((SELECT count(*) FROM u)::text)::text
  UNION ALL SELECT 'P04-03'::text, 'email confirmado'::text, ((SELECT bool_and(j ->> 'email_confirmed_at' IS NOT NULL) FROM u))::boolean, 'sim'::text, ((SELECT bool_and(j ->> 'email_confirmed_at' IS NOT NULL) FROM u)::text)::text
  UNION ALL SELECT 'P04-04'::text, 'não bloqueada'::text, ((SELECT bool_and(j ->> 'banned_until' IS NULL OR (j ->> 'banned_until')::timestamptz < now()) FROM u))::boolean, 'sim'::text, ((SELECT coalesce(max(j ->> 'banned_until'), 'sem bloqueio') FROM u))::text
  UNION ALL SELECT 'P04-05'::text, 'não apagada'::text, ((SELECT bool_and(j ->> 'deleted_at' IS NULL) FROM u))::boolean, 'sim'::text, ((SELECT coalesce(max(j ->> 'deleted_at'), 'não apagada') FROM u))::text
  UNION ALL SELECT 'P04-06'::text, 'não anónima'::text, ((SELECT bool_and(coalesce(j ->> 'is_anonymous', 'false') = 'false') FROM u))::boolean, 'sim'::text, ((SELECT coalesce(max(j ->> 'is_anonymous'), 'false') FROM u))::text
  UNION ALL SELECT 'P04-07'::text, 'papéis da conta = exatamente {admin}'::text, (coalesce((SELECT array_agg(role::text ORDER BY role::text) FROM r), '{}') = ARRAY['admin'])::boolean, 'admin'::text, ((SELECT string_agg(role::text, ',' ORDER BY role::text) FROM r))::text
  UNION ALL SELECT 'P04-08'::text, 'user_roles tem exatamente 1 linha no total (a do proprietário)'::text, ((SELECT count(*) FROM public.user_roles) = 1 AND (SELECT count(*) FROM r) = 1)::boolean, '1/1'::text, ((SELECT count(*) FROM public.user_roles)::text || '/' || (SELECT count(*) FROM r)::text)::text
  UNION ALL SELECT 'P04-09'::text, 'public.profiles ainda não existe (logo, sem perfil)'::text, (to_regclass('public.profiles') IS NULL)::boolean, 'não existe'::text, (coalesce(to_regclass('public.profiles')::text, 'não existe'))::text
  UNION ALL SELECT 'P04-10'::text, 'auth.identities: a conta tem pelo menos 1 identidade e não há identidades de outras contas'::text, ((SELECT count(*) FROM auth.identities i WHERE i.user_id IN (SELECT id FROM u)) >= 1 AND (SELECT count(*) FROM auth.identities) = (SELECT count(*) FROM auth.identities i WHERE i.user_id IN (SELECT id FROM u)))::boolean, '>= 1 e todas desta conta'::text, ((SELECT count(*) FROM auth.identities i WHERE i.user_id IN (SELECT id FROM u))::text || ' desta conta / ' || (SELECT count(*) FROM auth.identities)::text || ' no total')::text
),
v AS (SELECT count(*) AS n, string_agg(id || ' obtido=' || left(coalesce(obtido, 'NULL'), 160), ' | ' ORDER BY id) FILTER (WHERE ok IS NOT TRUE) AS falhas FROM c)
SELECT c.id, c.verificacao, CASE WHEN c.ok IS TRUE THEN 'OK' ELSE 'FALHA' END AS estado, c.esperado, c.obtido,
       CASE WHEN v.n <> 11 THEN ('VEREDITO INVÁLIDO: ' || v.n::text || ' verificações')::int::text
            WHEN v.falhas IS NULL THEN 'APROVADO'
            ELSE ('REPROVADO: ' || v.falhas)::int::text END AS veredito
  FROM c CROSS JOIN v ORDER BY c.id;
