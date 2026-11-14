-- T01 · Matriz COMPORTAMENTAL de acesso: anon / autenticado sem papel / tester / admin / servidor.
-- ESTADO: BLOQUEADO. Preparado, NUNCA executado.
-- Porquê: escreve 3 contas sintéticas (@afonso-staging.invalid) e 2 papéis, e dá uma permissão
-- temporária, tudo numa transação que termina em ROLLBACK. Mesmo assim é escrita numa base.
-- Só com autorização SEPARADA do proprietário, só numa base descartável ou no AFONSO Staging,
-- NUNCA na V1. Requer que o executor possa fazer SET ROLE anon/authenticated/service_role.
-- Para executar depois de autorizado: apagar APENAS a linha de guarda seguinte.
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: T01 escreve dados sintéticos; requer autorização separada do proprietário'; END $bloqueado$;

BEGIN;
CREATE TEMP TABLE t01_ids ON COMMIT DROP AS
  SELECT gen_random_uuid() AS sem_papel, gen_random_uuid() AS tester, gen_random_uuid() AS admin2;
INSERT INTO auth.users (id, email, aud, role, email_confirmed_at)
  SELECT sem_papel, 't01.sem-papel@afonso-staging.invalid', 'authenticated', 'authenticated', now() FROM t01_ids
  UNION ALL SELECT tester, 't01.tester@afonso-staging.invalid', 'authenticated', 'authenticated', now() FROM t01_ids
  UNION ALL SELECT admin2, 't01.admin@afonso-staging.invalid', 'authenticated', 'authenticated', now() FROM t01_ids;
INSERT INTO public.user_roles (user_id, role)
  SELECT tester, 'tester'::public.app_role FROM t01_ids UNION ALL SELECT admin2, 'admin'::public.app_role FROM t01_ids;

-- Verificação usada para cada papel: nenhuma tabela nem função V2 acessível diretamente.
CREATE TEMP TABLE t01_v2 ON COMMIT DROP AS
  SELECT c.relname::text AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname NOT IN ('staging_notes', 'user_roles');
GRANT SELECT ON t01_v2 TO anon, authenticated, service_role;

-- M1 · anon
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
DO $m1$ DECLARE t text; BEGIN
  FOR t IN SELECT nome FROM t01_v2 LOOP
    BEGIN EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t); RAISE EXCEPTION 'M1 falhou: anon lê %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN EXECUTE format('INSERT INTO public.%I DEFAULT VALUES', t); RAISE EXCEPTION 'M1 falhou: anon escreve em %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
              AND p.proname NOT IN ('has_role', 'has_staging_access') AND has_function_privilege(p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'M1 falhou: anon executa funções V2'; END IF;
  RAISE NOTICE 'OK M1 anon: 0 tabelas, 0 funções';
END $m1$;
RESET ROLE;

-- M2/M3/M4 · authenticated sem papel, tester, admin (mesmo papel de base de dados)
CREATE TEMP TABLE t01_quem ON COMMIT DROP AS
  SELECT 'M2 sem papel' AS etiqueta, sem_papel AS uid, 0 AS notas FROM t01_ids
  UNION ALL SELECT 'M3 tester', tester, 3 FROM t01_ids
  UNION ALL SELECT 'M4 admin', admin2, 3 FROM t01_ids;
GRANT SELECT ON t01_quem TO authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) FROM t01_quem WHERE etiqueta = 'M2 sem papel';
SET LOCAL ROLE authenticated;
DO $m2$ DECLARE t text; BEGIN
  FOR t IN SELECT nome FROM t01_v2 LOOP
    BEGIN EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t); RAISE EXCEPTION 'M2 falhou: lê %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  IF (SELECT count(*) FROM public.staging_notes) <> 0 THEN RAISE EXCEPTION 'M2 falhou: sem papel lê notas do staging'; END IF;
  RAISE NOTICE 'OK M2 sem papel: 0 tabelas V2, 0 notas';
END $m2$;
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) FROM t01_quem WHERE etiqueta = 'M3 tester';
SET LOCAL ROLE authenticated;
DO $m3$ DECLARE t text; BEGIN
  FOR t IN SELECT nome FROM t01_v2 LOOP
    BEGIN EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t); RAISE EXCEPTION 'M3 falhou: tester lê % diretamente', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  IF (SELECT count(*) FROM public.staging_notes) <> 3 THEN RAISE EXCEPTION 'M3 falhou: tester perdeu acesso ao staging'; END IF;
  RAISE NOTICE 'OK M3 tester: 0 tabelas V2 diretas, notas do staging visíveis';
END $m3$;
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) FROM t01_quem WHERE etiqueta = 'M4 admin';
SET LOCAL ROLE authenticated;
DO $m4$ DECLARE t text; BEGIN
  FOR t IN SELECT nome FROM t01_v2 LOOP
    BEGIN EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t); RAISE EXCEPTION 'M4 falhou: admin lê % diretamente', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  IF (SELECT count(*) FROM public.staging_notes) <> 3 THEN RAISE EXCEPTION 'M4 falhou: admin perdeu acesso ao staging'; END IF;
  RAISE NOTICE 'OK M4 admin: 0 tabelas V2 diretas, notas do staging visíveis';
END $m4$;
RESET ROLE;

-- M5 · barreira: SE uma tabela fosse aberta ao cliente (permissão temporária, desfeita pelo ROLLBACK)
GRANT SELECT ON public.people TO authenticated;
INSERT INTO public.people (user_id, name) SELECT tester, 'Pessoa sintética T01' FROM t01_ids;
SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) FROM t01_quem WHERE etiqueta = 'M2 sem papel';
SET LOCAL ROLE authenticated;
DO $m5a$ BEGIN IF (SELECT count(*) FROM public.people) <> 0 THEN RAISE EXCEPTION 'M5 falhou: a barreira deixou passar uma conta sem papel'; END IF; END $m5a$;
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) FROM t01_quem WHERE etiqueta = 'M3 tester';
SET LOCAL ROLE authenticated;
DO $m5b$ BEGIN IF (SELECT count(*) FROM public.people) <> 1 THEN RAISE EXCEPTION 'M5 falhou: tester não vê a sua própria linha'; END IF; END $m5b$;
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) FROM t01_quem WHERE etiqueta = 'M4 admin';
SET LOCAL ROLE authenticated;
DO $m5c$ BEGIN IF (SELECT count(*) FROM public.people) <> 0 THEN RAISE EXCEPTION 'M5 falhou: admin do staging vê linhas de outra conta (não é admin V2)'; END IF;
  RAISE NOTICE 'OK M5 barreira: sem papel 0, tester só a sua, admin do staging 0'; END $m5c$;
RESET ROLE;

-- M6 · servidor
SET LOCAL ROLE service_role;
DO $m6$ DECLARE t text; BEGIN
  FOR t IN SELECT nome FROM t01_v2 LOOP EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t); END LOOP;
  RAISE NOTICE 'OK M6 service_role: lê todas as tabelas V2';
END $m6$;
RESET ROLE;

ROLLBACK;
