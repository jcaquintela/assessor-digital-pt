-- B00 · BOOTSTRAP SINTÉTICO (R5), parte 1: papéis e base do ensaio. v1.0.3.
-- ESTADO: BLOQUEADO. Preparado, NUNCA executado. Só na instância DESCARTÁVEL criada por R10 e provada
-- por R20/R40, como ensaio_super, na base postgres, SEM transação única (CREATE DATABASE), com ON_ERROR_STOP.
-- Especificação e limites face ao Supabase real: BOOTSTRAP-SINTETICO.md. Nenhum dado real, segredo ou palavra-passe.
-- Para executar depois de autorizado: apagar APENAS a linha de guarda seguinte e substituir __R_NONCE_SHA256__
-- (sha256 do nonce externo) numa CÓPIA em <ROOT>/evidencia/sql/, nunca neste ficheiro.
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: B00 cria papéis e uma base; requer autorização separada do proprietário'; END $bloqueado$;
DO $so_descartavel$ BEGIN
  IF NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: exige o superutilizador da instância descartável do ensaio (no staging e na V1 não existe)'; END IF;
  IF (pg_stat_file('afonso-rehearsal.nonce', true)).size IS NULL THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: sem afonso-rehearsal.nonce no data_directory'; END IF;
  IF encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex') IS DISTINCT FROM '__R_NONCE_SHA256__' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: nonce diferente do registado fora de PGDATA (ou marcador por substituir)'; END IF;
END $so_descartavel$;

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
