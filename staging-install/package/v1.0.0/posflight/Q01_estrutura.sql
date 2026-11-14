-- Q01 · Estrutura instalada vs. ensaio de referência (rehearsal, commit 84f428ce). Só leitura.
-- Cada linha compara contagem e impressão digital com o valor obtido na base descartável.
-- ok = false => não é necessariamente erro: comparar com COLLISIONS.md e investigar antes de prosseguir.
WITH tb AS (
  SELECT c.oid, c.relname::text AS nome, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
), co AS (
  SELECT c.relname::text || '.' || a.attname::text || ':' || ty.typname::text || ':' || a.attnotnull::text AS k
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type ty ON ty.oid = a.atttypid
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
), fu AS (
  SELECT p.proname::text || '/' || p.pronargs::text || '/' || md5(p.prosrc) || '/' || p.prosecdef::text AS k
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
), po AS (
  SELECT schemaname::text || '.' || tablename::text || '.' || policyname::text || ':' || cmd::text || ':' || permissive::text || ':' || array_to_string(roles, '+') AS k
    FROM pg_policies WHERE schemaname IN ('public', 'storage')
), tg AS (
  SELECT n.nspname::text || '.' || c.relname::text || '.' || t.tgname::text || ':' || t.tgtype::text || ':' || p.proname::text AS k
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
), ix AS (
  SELECT ic.relname::text AS k FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_namespace n ON n.oid = ic.relnamespace WHERE n.nspname = 'public'
), cn AS (
  SELECT cl.relname::text || '.' || x.conname::text || ':' || x.contype::text AS k
    FROM pg_constraint x JOIN pg_class cl ON cl.oid = x.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public'
), en AS (
  SELECT ty.typname::text || ':' || string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) AS k
    FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid JOIN pg_namespace n ON n.oid = ty.typnamespace WHERE n.nspname = 'public' GROUP BY ty.typname
), r AS (
  SELECT 'tabelas' AS parte, count(*)::text AS n, md5(string_agg(nome, ',' ORDER BY nome COLLATE "C")) AS impressao FROM tb
  UNION ALL SELECT 'colunas', count(*)::text, md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM co
  UNION ALL SELECT 'funções', count(*)::text, md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM fu
  UNION ALL SELECT 'políticas (public+storage)', count(*)::text, md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM po
  UNION ALL SELECT 'gatilhos (public + auth.users)', count(*)::text, md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM tg
  UNION ALL SELECT 'índices', count(*)::text, md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM ix
  UNION ALL SELECT 'restrições', count(*)::text, md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM cn
  UNION ALL SELECT 'enums', count(*)::text, md5(string_agg(k, ';' ORDER BY k COLLATE "C")) FROM en
  UNION ALL SELECT 'tabelas sem RLS', count(*) FILTER (WHERE NOT rls)::text, coalesce(string_agg(nome, ',') FILTER (WHERE NOT rls), '') FROM tb
  UNION ALL SELECT 'tabelas com FORCE RLS', count(*) FILTER (WHERE force)::text, md5(coalesce(string_agg(nome, ',' ORDER BY nome COLLATE "C") FILTER (WHERE force), '')) FROM tb
), e(parte, n_esperado, impressao_esperada) AS (VALUES
  ('tabelas', '106', '763f08375643a3854b8b1659d4ea3b97'),
  ('colunas', '1259', 'e430ff2ec16146b724432a1dd660d7e9'),
  ('funções', '43', '2bf9f2bd9a72ef5da5a3e1b91f43d631'),
  ('políticas (public+storage)', '130', '4cdd78d50e8ae8a8e878bc73c40231f5'),
  ('gatilhos (public + auth.users)', '73', 'd44387516d390cdae817b8056d460149'),
  ('índices', '297', 'a60052ea9315dd2906ad6f5ec9144320'),
  ('restrições', '339', '4eb1163e39816f3e6cde02e4415cb8e6'),
  ('enums', '8', '1b5a7036fcb428b39d49461f0a77c93b'),
  ('tabelas sem RLS', '0', ''),
  ('tabelas com FORCE RLS', '8', '48f8b2f56db2ebd6f3e53e752a5de3d8')
)
SELECT r.parte, r.n, e.n_esperado, r.impressao, e.impressao_esperada,
       (r.n = e.n_esperado AND r.impressao = e.impressao_esperada) AS ok
  FROM r JOIN e USING (parte);
