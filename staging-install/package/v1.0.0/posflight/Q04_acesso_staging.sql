-- Q04 · O controlo de acesso do staging ficou igual. Só leitura.
WITH f AS (
  SELECT p.proname::text AS nome, p.oid, md5(p.prosrc) AS corpo FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'has_staging_access'
)
SELECT 'has_staging_access: corpo igual ao da migração 0000' AS verificacao,
       (SELECT corpo FROM f) = '4376edeea92abf14230207df0fbbef11' AS ok, (SELECT corpo FROM f) AS detalhe
UNION ALL SELECT 'has_staging_access: anon sem EXECUTE, authenticated com EXECUTE',
       NOT has_function_privilege('anon', (SELECT oid FROM f), 'EXECUTE') AND has_function_privilege('authenticated', (SELECT oid FROM f), 'EXECUTE'), NULL
UNION ALL SELECT 'staging_notes: mesmas 3 notas',
       (SELECT md5(string_agg(title || '|' || body || '|' || synthetic::text, E'\n' ORDER BY title COLLATE "C")) FROM public.staging_notes) = '9839c85692f965b4f419fb33c6af3404',
       (SELECT count(*)::text FROM public.staging_notes)
UNION ALL SELECT 'staging_notes: política original intacta e única',
       coalesce((SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staging_notes'), '{}')
         = ARRAY['Staging members read notes'],
       (SELECT string_agg(policyname::text || ':' || qual, ' | ') FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staging_notes')
UNION ALL SELECT 'user_roles: política de leitura própria mantida + 4 políticas de admin V2',
       coalesce((SELECT array_agg(policyname::text ORDER BY policyname COLLATE "C") FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles'), '{}')
         = ARRAY['Admins delete roles', 'Admins insert roles', 'Admins read all roles', 'Admins update roles', 'Users read own roles'],
       (SELECT string_agg(policyname::text, ',' ORDER BY policyname COLLATE "C") FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles')
UNION ALL SELECT 'user_roles: colunas id,user_id,role,created_at,created_by',
       (SELECT string_agg(a.attname::text, ',' ORDER BY a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'user_roles' AND a.attnum > 0 AND NOT a.attisdropped)
         = 'id,user_id,role,created_at,created_by', NULL;
