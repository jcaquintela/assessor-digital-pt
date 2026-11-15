-- B00 · BOOTSTRAP SINTÉTICO (R5), parte 1: papéis e base do ensaio. v1.0.4.
-- ESTADO: BLOQUEADO. Preparado, NUNCA executado. Só na instância DESCARTÁVEL criada por R10 e provada
-- por R20, como ensaio_super, na base postgres, SEM transação única (CREATE DATABASE), com ON_ERROR_STOP.
-- Especificação e limites face ao Supabase real: BOOTSTRAP-SINTETICO.md. Nenhum dado real, segredo ou palavra-passe.
-- Só corre como passo do wrapper único tools/R40_sessao.sh, numa CÓPIA determinística: o wrapper retira
-- EXATAMENTE a linha de guarda BLOQUEADO seguinte e substitui os marcadores da instância; este ficheiro nunca muda.
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: B00 cria papéis e uma base; requer autorização separada do proprietário'; END $bloqueado$;
DO $so_descartavel$ BEGIN
  IF NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: exige o superutilizador da instância descartável do ensaio (no staging e na V1 não existe)'; END IF;
  IF session_user <> 'ensaio_super' OR current_user <> session_user THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: papel da sessão diferente de ensaio_super, ou SET ROLE ativo'; END IF;
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: base errada (esperada postgres)'; END IF;
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

-- B1: pré-condições de base e papéis (nada do bootstrap pode existir ainda).
DO $b00_antes$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role', 'authenticator', 'supabase_auth_admin', 'supabase_storage_admin')) THEN
    RAISE EXCEPTION 'B00: papéis do bootstrap já existem (instância não é nova)'; END IF;
  IF (SELECT array_agg(datname::text ORDER BY datname) FROM pg_database) IS DISTINCT FROM ARRAY['postgres', 'template0', 'template1'] THEN
    RAISE EXCEPTION 'B00: bases diferentes das do initdb'; END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolsuper) <> 1 THEN
    RAISE EXCEPTION 'B00: esperado um único superutilizador (ensaio_super)'; END IF;
END $b00_antes$;

-- Papéis com os NOMES que o pacote usa. Atributos aproximados aos do Supabase (L3 em BOOTSTRAP-SINTETICO.md):
-- "postgres" NÃO é superutilizador, para o ensaio exercitar o caminho não-superutilizador do P02.
CREATE ROLE postgres LOGIN NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION BYPASSRLS;
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator NOLOGIN NOINHERIT;
CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT;
CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO postgres;
CREATE DATABASE afonso_ensaio OWNER postgres TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C';

-- B1: pós-condições.
DO $b00_depois$ BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolsuper) <> 1 OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres' AND (rolsuper OR NOT rolcanlogin OR NOT rolbypassrls)) THEN
    RAISE EXCEPTION 'B00: atributos de papéis inesperados'; END IF;
  IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'afonso_ensaio') IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'B00: afonso_ensaio sem o dono postgres'; END IF;
END $b00_depois$;
