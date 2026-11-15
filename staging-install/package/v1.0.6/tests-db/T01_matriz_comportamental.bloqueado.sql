-- T01 · Matriz COMPORTAMENTAL de acesso (v1.0.4): anon / autenticado sem papel / tester / admin / servidor.
-- ESTADO: BLOQUEADO. Preparado, NUNCA executado. Corpo (M1–M7) igual ao da v1.0.2/v1.0.3; muda só a 2.ª guarda
-- (base, papel, sessão local, data_directory, system identifier e nonce: B1).
-- Porquê: escreve 3 contas sintéticas (@afonso-staging.invalid) e 2 papéis, e dá uma permissão
-- temporária, tudo numa transação que termina em ROLLBACK. Mesmo assim é escrita numa base.
-- SÓ na instância DESCARTÁVEL do ensaio (REHEARSAL-PLAN.md, fase T), como último passo do wrapper R40,
-- depois de Q00–Q05 aprovados. NUNCA no AFONSO Staging nem na V1: a 2.ª guarda aborta lá.
-- Só com autorização SEPARADA do proprietário. Só dados sintéticos (@afonso-staging.invalid).
-- Só corre como passo do wrapper único tools/R40_sessao.sh, numa CÓPIA determinística: o wrapper retira
-- EXATAMENTE a linha de guarda BLOQUEADO seguinte e substitui os marcadores da instância; este ficheiro nunca muda.
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: T01 escreve dados sintéticos; só na instância descartável e com autorização separada do proprietário'; END $bloqueado$;
DO $so_descartavel$ BEGIN
  IF NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: exige o superutilizador da instância descartável do ensaio (no staging e na V1 não existe)'; END IF;
  IF session_user <> 'ensaio_super' OR current_user <> session_user THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: papel da sessão diferente de ensaio_super, ou SET ROLE ativo'; END IF;
  IF current_database() <> 'afonso_ensaio' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: base errada (esperada afonso_ensaio)'; END IF;
  IF inet_server_addr() IS NOT NULL OR inet_client_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: sessão por TCP (só o socket local do ensaio)'; END IF;
  IF current_setting('data_directory') IS DISTINCT FROM '__R_PGDATA__' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: data_directory diferente do provado pelo R20 (ou marcador por substituir)'; END IF;
  IF (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM '__R_SYSID__' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: system identifier diferente do registado pelo R10 (ou marcador por substituir)'; END IF;
  IF (pg_stat_file('afonso-rehearsal.nonce', true)).size IS NULL THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: sem afonso-rehearsal.nonce no data_directory'; END IF;
  IF encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex') IS DISTINCT FROM '__R_NONCE_SHA256__' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: nonce diferente do registado fora de PGDATA (ou marcador por substituir)'; END IF;
END $so_descartavel$;

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

-- M6 · servidor: lê e escreve, mas SEM TRUNCATE (privilégios normalizados na v1.0.2)
SET LOCAL ROLE service_role;
DO $m6$ DECLARE t text; BEGIN
  FOR t IN SELECT nome FROM t01_v2 LOOP
    EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
    BEGIN EXECUTE format('TRUNCATE public.%I', t); RAISE EXCEPTION 'M6 falhou: service_role faz TRUNCATE em %', t;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  RAISE NOTICE 'OK M6 service_role: lê todas as tabelas V2 e não tem TRUNCATE';
END $m6$;
RESET ROLE;

-- M7 · funções em quarentena: não existem (nem para o servidor)
DO $m7$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
              AND p.proname IN ('merge_accounts_apply', 'merge_accounts_preview', 'handle_new_user')) THEN
    RAISE EXCEPTION 'M7 falhou: função em quarentena instalada'; END IF;
  IF (SELECT count(*) FROM public.user_roles WHERE role::text = 'admin') < 1 THEN RAISE EXCEPTION 'M7 falhou: papel admin desapareceu'; END IF;
  RAISE NOTICE 'OK M7 quarentena: fusão de contas e perfil automático ausentes';
END $m7$;

ROLLBACK;
