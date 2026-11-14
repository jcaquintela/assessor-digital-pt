-- P02 · Privilégios do executor inferido em P01, lidos do catálogo (sem escrever).
-- obrigatorio = true e ok = false => BLOQUEIO. Ver EXECUTOR-PRIVILEGES.md para o
-- que esta leitura prova e o que não prova.
WITH ex AS (
  SELECT c.relowner AS r FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'user_roles'
), rl AS (
  SELECT * FROM pg_roles WHERE oid = (SELECT r FROM ex)
), au AS (
  SELECT c.oid, c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'auth' AND c.relname = 'users'
), so AS (
  SELECT c.oid, c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'storage' AND c.relname = 'objects'
), pu AS (
  SELECT pubowner FROM pg_publication WHERE pubname = 'supabase_realtime'
), ns AS (
  SELECT nspname, oid FROM pg_namespace WHERE nspname IN ('public', 'extensions', 'auth', 'storage')
), fn AS (
  SELECT n.nspname || '.' || p.proname AS nome, p.oid, p.proowner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE (n.nspname, p.proname) IN (('auth', 'uid'), ('storage', 'foldername'), ('public', 'has_role'))
), ty AS (
  SELECT t.typowner FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'app_role'
), s AS (SELECT coalesce((SELECT rolsuper FROM rl), false) AS su)
SELECT 'executor identificado' AS verificacao, true AS obrigatorio,
       EXISTS (SELECT 1 FROM rl) AS ok, (SELECT rolname::text FROM rl) AS detalhe
UNION ALL SELECT 'superutilizador (informativo)', false, (SELECT su FROM s), NULL
UNION ALL SELECT 'BYPASSRLS ou superutilizador (funções SECURITY DEFINER escrevem em tabelas com FORCE RLS)', true,
       coalesce((SELECT rolbypassrls OR rolsuper FROM rl), false), NULL
UNION ALL SELECT 'TRIGGER em auth.users (CREATE TRIGGER on_auth_user_created)', true,
       coalesce((SELECT has_table_privilege((SELECT r FROM ex), au.oid, 'TRIGGER') FROM au), false) OR (SELECT su FROM s),
       'dono de auth.users = ' || coalesce((SELECT pg_get_userbyid(relowner)::text FROM au), 'NÃO VISÍVEL')
UNION ALL SELECT 'REFERENCES em auth.users (chaves estrangeiras para utilizadores)', true,
       coalesce((SELECT has_table_privilege((SELECT r FROM ex), au.oid, 'REFERENCES') FROM au), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'USAGE no schema auth', true,
       coalesce((SELECT has_schema_privilege((SELECT r FROM ex), oid, 'USAGE') FROM ns WHERE nspname = 'auth'), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'USAGE no schema storage', true,
       coalesce((SELECT has_schema_privilege((SELECT r FROM ex), oid, 'USAGE') FROM ns WHERE nspname = 'storage'), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'CREATE no schema public', true,
       coalesce((SELECT has_schema_privilege((SELECT r FROM ex), oid, 'CREATE') FROM ns WHERE nspname = 'public'), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'CREATE no schema extensions (só se unaccent ainda não estiver instalada)', false,
       coalesce((SELECT has_schema_privilege((SELECT r FROM ex), oid, 'CREATE') FROM ns WHERE nspname = 'extensions'), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'dono (ou membro do dono) de storage.objects (CREATE POLICY)', true,
       coalesce((SELECT (SELECT r FROM ex) = relowner OR pg_has_role((SELECT r FROM ex), relowner, 'MEMBER') FROM so), false) OR (SELECT su FROM s),
       'dono = ' || coalesce((SELECT pg_get_userbyid(relowner)::text FROM so), 'NÃO VISÍVEL')
UNION ALL SELECT 'dono (ou membro do dono) da publicação supabase_realtime', true,
       coalesce((SELECT (SELECT r FROM ex) = pubowner OR pg_has_role((SELECT r FROM ex), pubowner, 'MEMBER') FROM pu), false) OR (SELECT su FROM s),
       'dono = ' || coalesce((SELECT pg_get_userbyid(pubowner)::text FROM pu), 'NÃO EXISTE')
UNION ALL SELECT 'dono de public.has_role (CREATE OR REPLACE)', true,
       coalesce((SELECT (SELECT r FROM ex) = proowner OR pg_has_role((SELECT r FROM ex), proowner, 'MEMBER') FROM fn WHERE nome = 'public.has_role'), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'dono de public.app_role (ALTER TYPE … ADD VALUE)', true,
       coalesce((SELECT (SELECT r FROM ex) = typowner OR pg_has_role((SELECT r FROM ex), typowner, 'MEMBER') FROM ty), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'EXECUTE em auth.uid()', true,
       coalesce((SELECT has_function_privilege((SELECT r FROM ex), oid, 'EXECUTE') FROM fn WHERE nome = 'auth.uid'), false) OR (SELECT su FROM s), NULL
UNION ALL SELECT 'EXECUTE em storage.foldername()', true,
       coalesce((SELECT has_function_privilege((SELECT r FROM ex), oid, 'EXECUTE') FROM fn WHERE nome = 'storage.foldername'), false) OR (SELECT su FROM s), NULL;
