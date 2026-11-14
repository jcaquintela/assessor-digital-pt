-- Q03 · Conta do proprietário DEPOIS de instalar = P04, sem perfil nem conta nova.
-- Substituir __EMAIL_AUTORIZADO__ como em P04 e os 4 marcadores __…_P04__ pelos valores GUARDADOS de P04-09..P04-12.
-- A comparação é feita pela própria consulta: qualquer diferença => REPROVADO. Não corrigir à mão.
-- Só leitura: um único SELECT. Resultado: uma linha por verificação. Se alguma
-- verificação falhar (ou der NULL), a consulta TERMINA EM ERRO com "REPROVADO: <id> obtido=<valor> | …".
WITH alvo AS (SELECT lower('__EMAIL_AUTORIZADO__') AS email),
u AS (SELECT au.id, lower(au.email) AS email, au.email_confirmed_at, au.created_at, to_jsonb(au) AS j FROM auth.users au, alvo WHERE lower(au.email) = alvo.email),
r AS (SELECT ur.id, ur.user_id, ur.role, ur.created_at FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u)),
c(id, verificacao, ok, esperado, obtido) AS (
  SELECT 'Q03-00'::text, 'marcadores substituídos'::text, ((SELECT email FROM alvo) ~ '^[^_][^@]*@[^@]+\.[^@]+$' AND '__IMPRESSAO_IDENTIDADE_P04__' ~ '^[0-9a-f]{32}$' AND '__IMPRESSAO_PAPEIS_CONTA_P04__' ~ '^[0-9a-f]{32}$' AND '__IMPRESSAO_PAPEIS_TODOS_P04__' ~ '^[0-9a-f]{32}$' AND '__TOTAL_CONTAS_P04__' ~ '^[0-9]+$')::boolean, 'todos'::text, ('ver comentário do ficheiro')::text
  UNION ALL SELECT 'Q03-01'::text, 'uma única conta com o email autorizado'::text, ((SELECT count(*) FROM u) = 1)::boolean, '1'::text, ((SELECT count(*) FROM u)::text)::text
  UNION ALL SELECT 'Q03-02'::text, 'email continua confirmado'::text, ((SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u))::boolean, 'sim'::text, ((SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u)::text)::text
  UNION ALL SELECT 'Q03-03'::text, 'identidade igual a P04'::text, ((SELECT md5(id::text || '|' || email || '|' || extract(epoch FROM email_confirmed_at)::text || '|' || extract(epoch FROM created_at)::text) FROM u) = '__IMPRESSAO_IDENTIDADE_P04__')::boolean, '= P04-09'::text, ((SELECT md5(id::text || '|' || email || '|' || extract(epoch FROM email_confirmed_at)::text || '|' || extract(epoch FROM created_at)::text) FROM u))::text
  UNION ALL SELECT 'Q03-04'::text, 'papéis da conta = exatamente {admin}'::text, (coalesce((SELECT array_agg(role::text ORDER BY role::text) FROM r), '{}') = ARRAY['admin'])::boolean, 'admin'::text, ((SELECT string_agg(role::text, ',' ORDER BY role::text) FROM r))::text
  UNION ALL SELECT 'Q03-05'::text, 'papéis da conta iguais a P04'::text, ((SELECT md5(string_agg(id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM r) = '__IMPRESSAO_PAPEIS_CONTA_P04__')::boolean, '= P04-10'::text, ((SELECT md5(string_agg(id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM r))::text
  UNION ALL SELECT 'Q03-06'::text, 'todos os papéis do staging iguais a P04 (nenhum papel novo ou alterado)'::text, ((SELECT md5(string_agg(id::text || ':' || user_id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM public.user_roles) = '__IMPRESSAO_PAPEIS_TODOS_P04__')::boolean, '= P04-11'::text, ((SELECT md5(string_agg(id::text || ':' || user_id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM public.user_roles))::text
  UNION ALL SELECT 'Q03-07'::text, 'linha do papel admin sem created_by'::text, ((SELECT bool_and(ur.created_by IS NULL) FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u)))::boolean, 'null'::text, ((SELECT string_agg(coalesce(ur.created_by::text, 'null'), ',') FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u)))::text
  UNION ALL SELECT 'Q03-08'::text, 'total de contas igual a P04 (nenhuma conta criada)'::text, ((SELECT count(*) FROM auth.users)::text = '__TOTAL_CONTAS_P04__')::boolean, '= P04-12'::text, ((SELECT count(*) FROM auth.users)::text)::text
  UNION ALL SELECT 'Q03-09'::text, 'nenhum perfil V2 (nem para o proprietário, nem para ninguém)'::text, (NOT EXISTS (SELECT 1 FROM public.profiles))::boolean, '0'::text, ((SELECT count(*) FROM public.profiles)::text)::text
  UNION ALL SELECT 'Q03-10'::text, 'sem estado de acesso nem categorias para a conta'::text, (NOT EXISTS (SELECT 1 FROM public.account_access WHERE user_id IN (SELECT id FROM u)) AND NOT EXISTS (SELECT 1 FROM public.property_categories WHERE user_id IN (SELECT id FROM u)))::boolean, '0/0'::text, ((SELECT count(*) FROM public.account_access WHERE user_id IN (SELECT id FROM u))::text || '/' || (SELECT count(*) FROM public.property_categories WHERE user_id IN (SELECT id FROM u))::text)::text
),
v AS (SELECT count(*) AS n, string_agg(id || ' obtido=' || left(coalesce(obtido, 'NULL'), 160), ' | ' ORDER BY id) FILTER (WHERE ok IS NOT TRUE) AS falhas FROM c)
SELECT c.id, c.verificacao, CASE WHEN c.ok IS TRUE THEN 'OK' ELSE 'FALHA' END AS estado, c.esperado, c.obtido,
       CASE WHEN v.n <> 11 THEN ('VEREDITO INVÁLIDO: ' || v.n::text || ' verificações')::int::text
            WHEN v.falhas IS NULL THEN 'APROVADO'
            ELSE ('REPROVADO: ' || v.falhas)::int::text END AS veredito
  FROM c CROSS JOIN v ORDER BY c.id;
