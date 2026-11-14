-- P03 · Inventário de colisões com o staging atual. Só leitura.
-- esperado = false em qualquer linha => PARAR e rever COLLISIONS.md antes de instalar.
WITH f AS (
  SELECT p.proname::text AS nome, md5(p.prosrc) AS corpo, p.prosecdef AS secdef, p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
), t AS (
  SELECT t.typname::text AS nome, t.typtype FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'r', 'm', 'b') AND t.typcategory <> 'A'
), au AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'auth' AND c.relname = 'users'
), trg AS (
  SELECT tg.tgname::text AS nome, pn.nspname || '.' || pp.proname AS funcao
    FROM pg_trigger tg JOIN pg_proc pp ON pp.oid = tg.tgfoid JOIN pg_namespace pn ON pn.oid = pp.pronamespace
   WHERE tg.tgrelid = (SELECT oid FROM au) AND NOT tg.tgisinternal
), pol AS (
  SELECT tablename::text || '.' || policyname::text AS nome FROM pg_policies WHERE schemaname = 'public'
), cols AS (
  SELECT string_agg(a.attname::text, ',' ORDER BY a.attnum) AS lista
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'user_roles' AND a.attnum > 0 AND NOT a.attisdropped
), ext AS (
  SELECT e.extname::text AS nome, n.nspname::text AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
)
SELECT 'funções em public' AS categoria, coalesce(string_agg(nome, ',' ORDER BY nome COLLATE "C"), '') AS encontrado,
       coalesce(array_agg(nome ORDER BY nome COLLATE "C"), '{}') = ARRAY['has_role', 'has_staging_access'] AS esperado
  FROM f
UNION ALL SELECT 'has_role: corpo igual ao da migração 0000 do staging', (SELECT corpo FROM f WHERE nome = 'has_role'),
       (SELECT corpo FROM f WHERE nome = 'has_role') = '6b9bca1cc09de70841cac113efbdd41a'
UNION ALL SELECT 'has_staging_access: corpo igual ao da migração 0000', (SELECT corpo FROM f WHERE nome = 'has_staging_access'),
       (SELECT corpo FROM f WHERE nome = 'has_staging_access') = '4376edeea92abf14230207df0fbbef11'
UNION ALL SELECT 'has_role/has_staging_access: anónimo sem EXECUTE, autenticado com EXECUTE',
       (SELECT string_agg(nome || ':anon=' || has_function_privilege('anon', oid, 'EXECUTE') || ',auth=' || has_function_privilege('authenticated', oid, 'EXECUTE'), ' ')
          FROM f WHERE nome IN ('has_role', 'has_staging_access')),
       (SELECT bool_and(NOT has_function_privilege('anon', oid, 'EXECUTE') AND has_function_privilege('authenticated', oid, 'EXECUTE'))
          FROM f WHERE nome IN ('has_role', 'has_staging_access'))
UNION ALL SELECT 'tipos em public', coalesce((SELECT string_agg(nome, ',' ORDER BY nome COLLATE "C") FROM t), ''),
       coalesce((SELECT array_agg(nome ORDER BY nome COLLATE "C") FROM t), '{}') = ARRAY['app_role']
UNION ALL SELECT 'valores de app_role',
       (SELECT string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = ty.typnamespace WHERE n.nspname = 'public' AND ty.typname = 'app_role'),
       (SELECT string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = ty.typnamespace WHERE n.nspname = 'public' AND ty.typname = 'app_role') = 'admin,tester'
UNION ALL SELECT 'colunas de user_roles', (SELECT lista FROM cols), (SELECT lista FROM cols) = 'id,user_id,role,created_at'
UNION ALL SELECT 'políticas em public', coalesce((SELECT string_agg(nome, ' | ' ORDER BY nome COLLATE "C") FROM pol), ''),
       coalesce((SELECT array_agg(nome ORDER BY nome COLLATE "C") FROM pol), '{}') = ARRAY['staging_notes.Staging members read notes', 'user_roles.Users read own roles']
UNION ALL SELECT 'gatilhos em auth.users (V2 cria on_auth_user_created)', coalesce((SELECT string_agg(nome || '->' || funcao, ',') FROM trg), ''),
       NOT EXISTS (SELECT 1 FROM trg)
UNION ALL SELECT 'auth.users visível para esta leitura', CASE WHEN EXISTS (SELECT 1 FROM au) THEN 'sim' ELSE 'NÃO' END, EXISTS (SELECT 1 FROM au)
UNION ALL SELECT 'extensão unaccent: ausente ou em extensions', coalesce((SELECT schema FROM ext WHERE nome = 'unaccent'), 'não instalada'),
       coalesce((SELECT schema FROM ext WHERE nome = 'unaccent'), 'extensions') = 'extensions'
UNION ALL SELECT 'unaccent disponível para instalar', coalesce((SELECT default_version FROM pg_available_extensions WHERE name = 'unaccent'), 'NÃO'),
       EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'unaccent')
UNION ALL SELECT 'schema extensions existe', CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN 'sim' ELSE 'NÃO' END,
       EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions')
UNION ALL SELECT 'publicação supabase_realtime existe e sem tabelas',
       coalesce((SELECT string_agg(schemaname || '.' || tablename, ',') FROM pg_publication_tables WHERE pubname = 'supabase_realtime'), '')
         || CASE WHEN EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN '' ELSE 'NÃO EXISTE' END,
       EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
         AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime')
UNION ALL SELECT 'storage.objects existe',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'storage' AND c.relname = 'objects') THEN 'sim' ELSE 'NÃO' END,
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'storage' AND c.relname = 'objects')
UNION ALL SELECT 'políticas V2 em storage.objects ainda não existem',
       coalesce((SELECT string_agg(policyname::text, ',') FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'), ''),
       true
UNION ALL SELECT 'staging_notes: 3 notas iguais às da migração 0000',
       (SELECT count(*)::text || ' / ' || md5(string_agg(title || '|' || body || '|' || synthetic::text, E'\n' ORDER BY title COLLATE "C")) FROM public.staging_notes),
       (SELECT md5(string_agg(title || '|' || body || '|' || synthetic::text, E'\n' ORDER BY title COLLATE "C")) FROM public.staging_notes) = '9839c85692f965b4f419fb33c6af3404'
UNION ALL SELECT 'esquemas fora do sistema (informativo)',
       (SELECT string_agg(nspname::text, ',' ORDER BY nspname COLLATE "C") FROM pg_namespace
         WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema'),
       true;
