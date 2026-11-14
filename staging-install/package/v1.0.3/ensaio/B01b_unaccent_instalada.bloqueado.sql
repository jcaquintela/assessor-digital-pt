-- B01b · BOOTSTRAP SINTÉTICO (R5), variante "unaccent INSTALADA" (R4). v1.0.3.
-- ESTADO: BLOQUEADO. Preparado, NUNCA executado. Só se o P02 do staging (só leitura) disser INSTALADA;
-- se disser NOVA, NÃO aplicar (o S4-00 cria a extensão). Se for desconhecido, ensaiar as duas variantes em
-- duas instâncias descartáveis separadas. Como ensaio_super na base afonso_ensaio, depois do B01.
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: B01b instala unaccent; requer autorização separada do proprietário'; END $bloqueado$;
DO $so_descartavel$ BEGIN
  IF NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: exige o superutilizador da instância descartável do ensaio (no staging e na V1 não existe)'; END IF;
  IF (pg_stat_file('afonso-rehearsal.nonce', true)).size IS NULL THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: sem afonso-rehearsal.nonce no data_directory'; END IF;
  IF encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex') IS DISTINCT FROM '__R_NONCE_SHA256__' THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: nonce diferente do registado fora de PGDATA (ou marcador por substituir)'; END IF;
END $so_descartavel$;

-- Instalada pelo superutilizador do ensaio, como uma extensão pré-instalada pela plataforma.
CREATE EXTENSION unaccent WITH SCHEMA extensions;
