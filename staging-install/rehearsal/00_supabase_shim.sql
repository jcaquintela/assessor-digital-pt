-- Simulação MÍNIMA e sintética dos objetos de plataforma que o esquema V2 referencia,
-- só para o ensaio numa instância PostgreSQL 17 descartável. NÃO é o Supabase real:
-- sem GoTrue, sem Storage API, sem Realtime, sem pg_net/pg_cron/vault. Nunca aplicar a
-- uma base gerida.

-- Papéis do Data API (sem login).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOLOGIN NOINHERIT; END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
ALTER DATABASE afonso_disposable SET search_path = "$user", public, extensions;
SET search_path = "$user", public, extensions;

-- auth: tabela de utilizadores com as colunas do GoTrue e as funções de sessão.
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
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
GRANT SELECT ON auth.users TO service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')), '')::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO anon, authenticated, service_role;

-- storage: só as tabelas/funções que as políticas usam.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL UNIQUE, owner uuid, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid, owner_id text, metadata jsonb, path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; BEGIN _parts := string_to_array(name, '/'); RETURN _parts[1:array_length(_parts, 1) - 1]; END $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; BEGIN _parts := string_to_array(name, '/'); RETURN _parts[array_length(_parts, 1)]; END $$;

-- Realtime: só a publicação (sem servidor Realtime).
CREATE PUBLICATION supabase_realtime;
