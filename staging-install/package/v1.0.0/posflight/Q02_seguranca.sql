-- Q02 · Estado de segurança depois da instalação. Só leitura. Esperado: ok = true em todas.
WITH au AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'auth' AND c.relname = 'users'
), trg AS (
  SELECT tg.tgname::text AS nome, tg.tgtype, pp.proname::text AS funcao, pn.nspname::text AS fschema
    FROM pg_trigger tg JOIN pg_proc pp ON pp.oid = tg.tgfoid JOIN pg_namespace pn ON pn.oid = pp.pronamespace
   WHERE tg.tgrelid = (SELECT oid FROM au) AND NOT tg.tgisinternal
), f AS (
  SELECT p.proname::text AS nome, p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
)
SELECT 'interruptores: nenhum ligado nem com rollout' AS verificacao,
       NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE enabled_globally OR rollout_percentage <> 0 OR cardinality(enabled_plans) > 0) AS ok,
       (SELECT count(*)::text FROM public.feature_flags) || ' interruptores' AS detalhe
UNION ALL SELECT 'sem ativações individuais', NOT EXISTS (SELECT 1 FROM public.feature_flag_users), NULL
UNION ALL SELECT 'sem pilotos nem participantes', NOT EXISTS (SELECT 1 FROM public.pilots) AND NOT EXISTS (SELECT 1 FROM public.pilot_participants), NULL
UNION ALL SELECT 'sem administradores V2 (super_admin/support_admin)',
       NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role::text IN ('super_admin', 'support_admin')), NULL
UNION ALL SELECT 'app_role = admin,tester,consultant,support_admin,super_admin',
       (SELECT string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = ty.typnamespace WHERE n.nspname = 'public' AND ty.typname = 'app_role')
         = 'admin,tester,consultant,support_admin,super_admin', NULL
UNION ALL SELECT 'auth.users: só on_auth_user_created, AFTER INSERT por linha, -> public.handle_new_user',
       (SELECT count(*) FROM trg) = 1 AND EXISTS (SELECT 1 FROM trg WHERE nome = 'on_auth_user_created' AND tgtype = 5 AND funcao = 'handle_new_user' AND fschema = 'public'),
       (SELECT string_agg(nome || ':' || tgtype || '->' || fschema || '.' || funcao, ',') FROM trg)
UNION ALL SELECT 'handle_new_user: corpo igual ao ensaio',
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = (SELECT oid FROM f WHERE nome = 'handle_new_user')) = 'a7af893457d61aa06775f46ba8ab7a6a', NULL
UNION ALL SELECT 'handle_new_user: não executável por anon/authenticated',
       NOT has_function_privilege('anon', (SELECT oid FROM f WHERE nome = 'handle_new_user'), 'EXECUTE')
       AND NOT has_function_privilege('authenticated', (SELECT oid FROM f WHERE nome = 'handle_new_user'), 'EXECUTE'), NULL
UNION ALL SELECT 'has_role: corpo V2 (só responde sobre quem pergunta)',
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = (SELECT oid FROM f WHERE nome = 'has_role')) = 'f12f7a59372b1f9e4bb5221649147a2e', NULL
UNION ALL SELECT 'has_role: anon sem EXECUTE; authenticated e service_role com EXECUTE',
       NOT has_function_privilege('anon', (SELECT oid FROM f WHERE nome = 'has_role'), 'EXECUTE')
       AND has_function_privilege('authenticated', (SELECT oid FROM f WHERE nome = 'has_role'), 'EXECUTE')
       AND has_function_privilege('service_role', (SELECT oid FROM f WHERE nome = 'has_role'), 'EXECUTE'), NULL
UNION ALL SELECT 'RLS ligado em todas as tabelas de public',
       NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity), NULL
UNION ALL SELECT 'publicação Realtime: só assessor_messages',
       coalesce((SELECT string_agg(schemaname || '.' || tablename, ',') FROM pg_publication_tables WHERE pubname = 'supabase_realtime'), '') = 'public.assessor_messages',
       (SELECT string_agg(schemaname || '.' || tablename, ',') FROM pg_publication_tables WHERE pubname = 'supabase_realtime')
UNION ALL SELECT 'unaccent instalada em extensions',
       EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent' AND n.nspname = 'extensions'), NULL
UNION ALL SELECT 'nenhuma extensão de rede/agendamento instalada pela V2 (informativo: lista)', true,
       coalesce((SELECT string_agg(extname::text, ',') FROM pg_extension WHERE extname IN ('pg_net', 'pg_cron', 'http', 'dblink', 'postgres_fdw')), 'nenhuma')
UNION ALL SELECT 'bucket assessor-files (informativo: criar depois com a ferramenta de armazenamento)', true,
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'assessor-files') THEN 'existe' ELSE 'ainda não existe' END;
