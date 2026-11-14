-- B01 · BOOTSTRAP SINTÉTICO (R5), parte 2: schemas auth/extensions/storage, privilégios por omissão e a
-- ÚNICA conta sintética (com 1 identidade). v1.0.3.
-- ESTADO: BLOQUEADO. Preparado, NUNCA executado. Só na instância DESCARTÁVEL, como ensaio_super, na base
-- afonso_ensaio, numa transação (psql -1), com ON_ERROR_STOP. NÃO é o Supabase real (limites L1–L10).
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: B01 cria esquemas e uma conta sintética; requer autorização separada do proprietário'; END $bloqueado$;
DO $so_descartavel$ BEGIN
  IF NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: exige o superutilizador da instância descartável do ensaio (no staging e na V1 não existe)'; END IF;
  IF (pg_stat_file('afonso-rehearsal.nonce', true)).size IS NULL THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: sem afonso-rehearsal.nonce no data_directory'; END IF;
  IF encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex') IS DISTINCT FROM '__R_NONCE_SHA256__' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: nonce diferente do registado fora de PGDATA (ou marcador por substituir)'; END IF;
END $so_descartavel$;

REVOKE ALL ON DATABASE afonso_ensaio FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE afonso_ensaio TO anon, authenticated, service_role, authenticator;
ALTER DATABASE afonso_ensaio SET search_path TO "$user", public, extensions;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- PIOR CASO deliberado: objetos novos de "postgres" em public nascem com TODAS as permissões para os 3 papéis
-- da API (como os privilégios por omissão habituais do Supabase). Assim o ensaio prova que os REVOKE do S4
-- retiram tudo, em vez de partir de uma base já fechada.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA extensions AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- auth: só o que o pacote lê ou referencia (auth.users, auth.identities, auth.uid()).
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
CREATE TABLE auth.users (
  instance_id uuid, id uuid PRIMARY KEY, aud varchar(255), role varchar(255),
  email varchar(255), encrypted_password varchar(255), email_confirmed_at timestamptz,
  invited_at timestamptz, confirmation_token varchar(255), confirmation_sent_at timestamptz,
  recovery_token varchar(255), recovery_sent_at timestamptz, email_change_token_new varchar(255),
  email_change varchar(255), email_change_sent_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  phone text UNIQUE DEFAULT NULL, phone_confirmed_at timestamptz, phone_change text DEFAULT '',
  phone_change_token varchar(255) DEFAULT '', phone_change_sent_at timestamptz,
  confirmed_at timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  email_change_token_current varchar(255) DEFAULT '', email_change_confirm_status smallint DEFAULT 0,
  banned_until timestamptz, reauthentication_token varchar(255) DEFAULT '',
  reauthentication_sent_at timestamptz, is_sso_user boolean NOT NULL DEFAULT false,
  deleted_at timestamptz, is_anonymous boolean NOT NULL DEFAULT false
);
CREATE TABLE auth.identities (
  provider_id text NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb NOT NULL, provider text NOT NULL, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  email text GENERATED ALWAYS AS (lower(identity_data ->> 'email')) STORED,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  UNIQUE (provider_id, provider)
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
ALTER TABLE auth.users OWNER TO supabase_auth_admin;
ALTER TABLE auth.identities OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
REVOKE ALL ON TABLE auth.users, auth.identities FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;
GRANT SELECT, REFERENCES ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.users TO service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role, postgres;

-- storage: só a tabela que o Q02-18 lê (vazia). Sem Storage API, sem objetos, sem políticas.
CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL UNIQUE, public boolean DEFAULT false, created_at timestamptz DEFAULT now());
ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT SELECT ON TABLE storage.buckets TO postgres;

-- A ÚNICA conta: sintética, email .invalid, sem palavra-passe nem tokens, id gerado na hora.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  SELECT gen_random_uuid(), 'authenticated', 'authenticated', 'proprietario.sintetico@afonso-staging.invalid',
         now(), '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now();
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  SELECT u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now()
    FROM auth.users u WHERE u.email = 'proprietario.sintetico@afonso-staging.invalid';
DO $b01$ BEGIN
  IF (SELECT count(*) FROM auth.users) <> 1 OR (SELECT count(*) FROM auth.identities) <> 1 THEN
    RAISE EXCEPTION 'B01: esperada exatamente 1 conta sintética com 1 identidade'; END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname NOT IN ('plpgsql')) THEN
    RAISE EXCEPTION 'B01: extensões inesperadas (a variante INSTALADA de unaccent é o B01b)'; END IF;
END $b01$;
