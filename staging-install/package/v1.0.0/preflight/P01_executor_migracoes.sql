-- P01 · Identificar o papel REAL do executor de migrações, sem escrever.
-- Método: dono dos objetos criados pela migração 0000 do staging (aplicada pela
-- ferramenta de migrações) e, se visível, do registo de migrações do Drizzle.
-- Esperado: todos os donos iguais. "AMBÍGUO" ou "NÃO VISÍVEL" => BLOQUEIO.
WITH o AS (
  SELECT 'schema drizzle' AS objeto, n.nspowner AS dono
    FROM pg_namespace n WHERE n.nspname = 'drizzle'
  UNION ALL
  SELECT 'tabela drizzle.__drizzle_migrations', c.relowner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'drizzle' AND c.relname = '__drizzle_migrations'
  UNION ALL
  SELECT 'tabela public.user_roles', c.relowner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'user_roles'
  UNION ALL
  SELECT 'tabela public.staging_notes', c.relowner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'staging_notes'
  UNION ALL
  SELECT 'tipo public.app_role', t.typowner
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'app_role'
  UNION ALL
  SELECT 'função public.has_role', p.proowner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'has_role'
  UNION ALL
  SELECT 'função public.has_staging_access', p.proowner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'has_staging_access'
)
SELECT objeto, pg_get_userbyid(dono)::text AS dono FROM o
UNION ALL
SELECT '=> executor inferido',
       CASE WHEN count(*) = 0 THEN 'NÃO VISÍVEL'
            WHEN count(DISTINCT dono) = 1 THEN pg_get_userbyid(max(dono))::text
            ELSE 'AMBÍGUO: ' || string_agg(DISTINCT pg_get_userbyid(dono)::text, ',') END
FROM o
UNION ALL
SELECT '=> objetos com dono visível (esperado 5 sem Drizzle visível, 7 com)', count(*)::text FROM o;
