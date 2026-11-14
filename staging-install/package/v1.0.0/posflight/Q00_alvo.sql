-- Q00 · Confirmar que a instalação foi feita no staging (e só lá). Só leitura.
WITH pub AS (
  SELECT c.relname::text AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
)
SELECT 'existe public.staging_notes (marca do staging)' AS verificacao, EXISTS (SELECT 1 FROM pub WHERE nome = 'staging_notes') AS ok, NULL::text AS detalhe
UNION ALL SELECT 'existem as tabelas V2 (profiles, people, assessor_messages)',
       (SELECT count(*) FROM pub WHERE nome IN ('profiles', 'people', 'assessor_messages')) = 3, NULL
UNION ALL SELECT '106 tabelas em public', (SELECT count(*) FROM pub) = 106, (SELECT count(*) FROM pub)::text;
