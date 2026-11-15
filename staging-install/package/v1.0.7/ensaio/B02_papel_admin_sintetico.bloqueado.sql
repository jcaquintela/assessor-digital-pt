-- B02 · BOOTSTRAP SINTÉTICO (R5), parte 3: papel admin da conta sintética, DEPOIS da migração 0000 do staging.
-- v1.0.4. ESTADO: BLOQUEADO. Preparado, NUNCA executado. Só na instância DESCARTÁVEL, como ensaio_super, na
-- base afonso_ensaio, numa transação (psql -1). Reproduz o estado que P03/P04 exigem: exatamente 1 conta,
-- 1 linha em user_roles (admin), 3 notas da 0000 (vindas da própria 0000, conferida pelo R05 — hoje PENDENTE, B14).
-- Só corre como passo do wrapper único tools/R40_sessao.sh, numa CÓPIA determinística: o wrapper retira
-- EXATAMENTE a linha de guarda BLOQUEADO seguinte e substitui os marcadores da instância; este ficheiro nunca muda.
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: B02 escreve o papel admin sintético; requer autorização separada do proprietário'; END $bloqueado$;
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

DO $b02_antes$ BEGIN
  IF to_regclass('public.user_roles') IS NULL OR to_regclass('public.staging_notes') IS NULL THEN
    RAISE EXCEPTION 'B02: a migração 0000 do staging ainda não foi aplicada'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles) THEN
    RAISE EXCEPTION 'B02: user_roles já tem linhas (a 0000 não devia criar papéis)'; END IF;
  -- B2 outra vez: a conta que vai receber o papel continua a ser a única e coerente.
  IF (SELECT count(*) FROM auth.users) <> 1 OR (SELECT count(*) FROM auth.identities) <> 1 THEN
    RAISE EXCEPTION 'B02: esperada exatamente 1 conta sintética com 1 identidade'; END IF;
  -- B2: provider, email e sub coerentes, como o GoTrue os grava para uma conta de email.
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u JOIN auth.identities i ON i.user_id = u.id
     WHERE u.email = 'proprietario.sintetico@afonso-staging.invalid' AND u.email LIKE '%@afonso-staging.invalid'
       AND i.provider = 'email' AND i.provider_id = u.id::text
       AND i.identity_data ->> 'sub' = u.id::text AND i.identity_data ->> 'email' = u.email
       AND i.email = lower(u.email) AND (i.identity_data ->> 'email_verified')::boolean IS TRUE
       AND u.raw_app_meta_data ->> 'provider' = 'email' AND u.raw_app_meta_data -> 'providers' = '["email"]'::jsonb
       AND u.aud = 'authenticated' AND u.role = 'authenticated' AND u.email_confirmed_at IS NOT NULL
       AND u.encrypted_password IS NULL AND u.confirmation_token IS NULL AND u.recovery_token IS NULL
       AND coalesce(u.is_super_admin, false) = false AND u.is_anonymous = false AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'B02/B2: identidade sintética incoerente (provider, provider_id, sub, email, verificação, metadados ou credenciais)'; END IF;
END $b02_antes$;
INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'admin'::public.app_role FROM auth.users u WHERE u.email = 'proprietario.sintetico@afonso-staging.invalid';
DO $b02_depois$ BEGIN
  IF (SELECT count(*) FROM public.user_roles) <> 1 THEN RAISE EXCEPTION 'B02: esperada exatamente 1 linha em user_roles'; END IF;
  IF (SELECT user_id FROM public.user_roles) IS DISTINCT FROM (SELECT id FROM auth.users WHERE email = 'proprietario.sintetico@afonso-staging.invalid') THEN
    RAISE EXCEPTION 'B02: o papel admin não ficou na conta sintética'; END IF;
  IF (SELECT count(*) FROM public.staging_notes) <> 3 THEN RAISE EXCEPTION 'B02: esperadas as 3 notas da 0000 do staging'; END IF;
END $b02_depois$;
