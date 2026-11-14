-- B02 · BOOTSTRAP SINTÉTICO (R5), parte 3: papel admin da conta sintética, DEPOIS da migração 0000 do staging.
-- v1.0.3. ESTADO: BLOQUEADO. Preparado, NUNCA executado. Só na instância DESCARTÁVEL, como ensaio_super, na
-- base afonso_ensaio, numa transação (psql -1). Reproduz o estado que P03/P04 exigem: exatamente 1 conta,
-- 1 linha em user_roles (admin), 3 notas da 0000 (vindas da própria 0000, conferida por sha256 — B14).
DO $bloqueado$ BEGIN RAISE EXCEPTION 'BLOQUEADO: B02 escreve o papel admin sintético; requer autorização separada do proprietário'; END $bloqueado$;
DO $so_descartavel$ BEGIN
  IF NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'SÓ DESCARTÁVEL: exige o superutilizador da instância descartável do ensaio (no staging e na V1 não existe)'; END IF;
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
END $b02_antes$;
INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'admin'::public.app_role FROM auth.users u WHERE u.email = 'proprietario.sintetico@afonso-staging.invalid';
DO $b02_depois$ BEGIN
  IF (SELECT count(*) FROM public.user_roles) <> 1 THEN RAISE EXCEPTION 'B02: esperada exatamente 1 linha em user_roles'; END IF;
  IF (SELECT count(*) FROM public.staging_notes) <> 3 THEN RAISE EXCEPTION 'B02: esperadas as 3 notas da 0000 do staging'; END IF;
END $b02_depois$;
