-- Casos negativos do S2-99 (tudo em ROLLBACK). Cada bloco tem de ABORTAR.
\set ON_ERROR_STOP 0
-- N1: interruptor ligado globalmente -> o S2-99 desliga-o (normaliza) e não aborta
BEGIN;
UPDATE public.feature_flags SET enabled_globally = true;
\i /dev-server/staging-install/migrations/S2-99_staging_safety_checks.sql
SELECT 'N1 interruptores ligados depois do S2-99: ' || count(*) FROM public.feature_flags WHERE enabled_globally;
ROLLBACK;
-- N2: ativação individual -> tem de abortar
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000d1', 'n2@afonso-staging.invalid');
INSERT INTO public.feature_flag_users (flag_key, user_id) SELECT key, '00000000-0000-4000-8000-0000000000d1' FROM public.feature_flags LIMIT 1;
\i /dev-server/staging-install/migrations/S2-99_staging_safety_checks.sql
ROLLBACK;
-- N3: administrador V2 -> tem de abortar
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000d2', 'n3@afonso-staging.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-0000000000d2', 'super_admin');
\i /dev-server/staging-install/migrations/S2-99_staging_safety_checks.sql
ROLLBACK;
