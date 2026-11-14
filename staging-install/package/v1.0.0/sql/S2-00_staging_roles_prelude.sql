-- S2-00 · prelúdio de papéis
-- Gerado por scripts/staging/build-staging-schema.ts para o projeto AFONSO Staging.
-- NÃO EXECUTAR neste projeto (produção/V1). Aplicar só no staging, por ordem, um bloco por migração.

-- S2-00 · Papéis (staging). Transação própria: os valores novos do tipo só
-- podem ser usados depois de confirmados.
-- Conserva os papéis do staging (admin, tester), as linhas de user_roles e as
-- funções has_staging_access/has_role do staging. Só acrescenta o que a V2 usa.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'app_role') THEN
    RAISE EXCEPTION 'staging: public.app_role (admin/tester) não existe; este prelúdio é só para o AFONSO Staging';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'admin')
     OR NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'tester') THEN
    RAISE EXCEPTION 'staging: faltam os papéis admin/tester do staging';
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
