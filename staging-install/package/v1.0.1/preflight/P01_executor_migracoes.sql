-- P01 · Identificar, SEM escrever, o papel real que aplica as migrações.
-- Método: dono dos objetos criados pela migração 0000 do staging (aplicada pela ferramenta de
-- migrações). Um só dono visível => executor inferido. Vários ou nenhum => BLOQUEIO.
-- Isto é prova INFERIDA (catálogo), não prova definitiva — ver EXECUTOR-PRIVILEGES.md.
-- Só leitura: um único SELECT. Resultado: uma linha por verificação. Se alguma
-- verificação falhar (ou der NULL), a consulta TERMINA EM ERRO com "REPROVADO: <id> obtido=<valor> | …".
WITH o(objeto, dono) AS (
    SELECT 'tabela user_roles', c.relowner FROM pg_class c WHERE c.oid = to_regclass('public.user_roles')
    UNION ALL SELECT 'tabela staging_notes', c.relowner FROM pg_class c WHERE c.oid = to_regclass('public.staging_notes')
    UNION ALL SELECT 'tipo app_role', t.typowner FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'app_role'
    UNION ALL SELECT 'função has_role', p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_role'
    UNION ALL SELECT 'função has_staging_access', p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_staging_access'
    UNION ALL SELECT 'tabela drizzle.__drizzle_migrations', c.relowner FROM pg_class c WHERE c.oid = to_regclass('drizzle.__drizzle_migrations')),
c(id, verificacao, ok, esperado, obtido) AS (
  SELECT 'P01-01'::text, 'os 5 objetos da migração 0000 têm dono visível'::text, ((SELECT count(*) FROM o WHERE objeto <> 'tabela drizzle.__drizzle_migrations') = 5)::boolean, '5'::text, ((SELECT count(*) FROM o WHERE objeto <> 'tabela drizzle.__drizzle_migrations')::text)::text
  UNION ALL SELECT 'P01-02'::text, 'um único dono em todos os objetos visíveis'::text, ((SELECT count(DISTINCT dono) FROM o) = 1)::boolean, '1 dono'::text, ((SELECT string_agg(DISTINCT pg_get_userbyid(dono)::text, ',') FROM o))::text
  UNION ALL SELECT 'P01-03'::text, 'o dono não é um papel de cliente nem o servidor da API'::text, (NOT EXISTS (SELECT 1 FROM o WHERE pg_get_userbyid(dono) IN ('anon', 'authenticated', 'service_role', 'authenticator')))::boolean, 'não'::text, ((SELECT string_agg(DISTINCT pg_get_userbyid(dono)::text, ',') FROM o))::text
),
v AS (SELECT count(*) AS n, string_agg(id || ' obtido=' || left(coalesce(obtido, 'NULL'), 160), ' | ' ORDER BY id) FILTER (WHERE ok IS NOT TRUE) AS falhas FROM c)
SELECT c.id, c.verificacao, CASE WHEN c.ok IS TRUE THEN 'OK' ELSE 'FALHA' END AS estado, c.esperado, c.obtido,
       CASE WHEN v.n <> 3 THEN ('VEREDITO INVÁLIDO: ' || v.n::text || ' verificações')::int::text
            WHEN v.falhas IS NULL THEN 'APROVADO'
            ELSE ('REPROVADO: ' || v.falhas)::int::text END AS veredito
  FROM c CROSS JOIN v ORDER BY c.id;
