-- S2-99 · verificações finais
-- Gerado por scripts/staging/build-staging-schema.ts para o projeto AFONSO Staging.
-- NÃO EXECUTAR neste projeto (produção/V1). Aplicar só no staging, por ordem, um bloco por migração.

-- S2-99 · Verificações de segurança do staging (abortam a migração se falharem).
-- Todos os interruptores começam desligados no staging, incluindo os que a
-- história de produção semeou ligados; só se ligam depois por decisão explícita.
UPDATE public.feature_flags
   SET enabled_globally = false, enabled_plans = '{}'::text[], rollout_percentage = 0, updated_by = NULL
 WHERE enabled_globally OR rollout_percentage <> 0 OR cardinality(enabled_plans) > 0 OR updated_by IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.feature_flags
             WHERE enabled_globally OR rollout_percentage <> 0 OR cardinality(enabled_plans) > 0) THEN
    RAISE EXCEPTION 'staging: há interruptores ligados';
  END IF;
  IF EXISTS (SELECT 1 FROM public.feature_flag_users) THEN
    RAISE EXCEPTION 'staging: há ativações individuais de interruptores';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pilots) OR EXISTS (SELECT 1 FROM public.pilot_participants) THEN
    RAISE EXCEPTION 'staging: há pilotos ou participantes (devem vir só dos dados sintéticos, passo S5)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role IN ('super_admin', 'support_admin')) THEN
    RAISE EXCEPTION 'staging: há administradores V2 atribuídos pela montagem';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'admin')
     OR NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'tester') THEN
    RAISE EXCEPTION 'staging: os papéis admin/tester do staging desapareceram';
  END IF;
  IF to_regprocedure('public.has_staging_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staging: has_staging_access desapareceu';
  END IF;
END $$;
