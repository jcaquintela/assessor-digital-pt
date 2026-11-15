-- B01b · BOOTSTRAP SINTÉTICO (R5), variante "unaccent INSTALADA" (R4). v1.0.4.
-- ESTADO: BLOQUEADO. Preparado, NUNCA executado. Só se o P02 do staging (só leitura) disser INSTALADA;
-- se disser NOVA, NÃO aplicar (o S4-00 cria a extensão). Se for desconhecido, ensaiar as duas variantes em
-- duas instâncias descartáveis separadas (R10 com INSTALADA ou NOVA). Como ensaio_super na base afonso_ensaio,
-- depois do B01.
-- Só corre como passo do wrapper único tools/R40_sessao.sh, numa CÓPIA determinística: o wrapper retira
-- EXATAMENTE a linha de guarda BLOQUEADO seguinte e substitui os marcadores da instância; este ficheiro nunca muda.
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: B01b instala unaccent; requer autorização separada do proprietário'; END $bloqueado$;
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

DO $b01b_antes$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') OR to_regnamespace('extensions') IS NULL THEN
    RAISE EXCEPTION 'B01b: unaccent já instalada ou schema extensions em falta (B01 não correu?)'; END IF;
END $b01b_antes$;
-- Instalada pelo superutilizador do ensaio, como uma extensão pré-instalada pela plataforma.
CREATE EXTENSION unaccent WITH SCHEMA extensions;
DO $b01b_depois$ BEGIN
  IF to_regprocedure('extensions.unaccent(regdictionary, text)') IS NULL OR NOT EXISTS (SELECT 1 FROM pg_ts_dict t JOIN pg_namespace n ON n.oid = t.dictnamespace WHERE n.nspname = 'extensions' AND t.dictname = 'unaccent') THEN
    RAISE EXCEPTION 'B01b: unaccent sem a função ou o dicionário em extensions'; END IF;
END $b01b_depois$;
