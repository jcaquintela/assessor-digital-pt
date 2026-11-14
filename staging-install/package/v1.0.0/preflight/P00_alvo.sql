-- P00 · Confirmar o alvo. Só leitura (um único SELECT).
-- Tem de ser a base do AFONSO Staging antes da instalação, nunca a V1.
-- Esperado: ok = true em todas as linhas. Qualquer false => PARAR.
WITH pub AS (
  SELECT c.relname::text AS nome
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
)
SELECT 'existe public.staging_notes (marca do staging)' AS verificacao,
       EXISTS (SELECT 1 FROM pub WHERE nome = 'staging_notes') AS ok,
       NULL::text AS detalhe
UNION ALL
SELECT 'não existem tabelas da V1 (people, profiles, assessor_messages)',
       NOT EXISTS (SELECT 1 FROM pub WHERE nome IN ('people', 'profiles', 'assessor_messages')),
       NULL
UNION ALL
SELECT 'public contém exatamente staging_notes e user_roles',
       coalesce((SELECT array_agg(nome ORDER BY nome COLLATE "C") FROM pub), '{}') = ARRAY['staging_notes', 'user_roles'],
       (SELECT string_agg(nome, ',' ORDER BY nome COLLATE "C") FROM pub)
UNION ALL
SELECT 'PostgreSQL 15 ou superior',
       current_setting('server_version_num')::int >= 150000,
       current_setting('server_version')
UNION ALL
SELECT 'sessão de leitura (informativo: papel que corre esta consulta)',
       true,
       current_user::text || ' / read_only=' || current_setting('transaction_read_only');
