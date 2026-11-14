// Regras para montar o esquema LIMPO da V2 destinado ao projeto AFONSO Staging.
// Só preparação: nada aqui executa SQL nem toca em nenhuma base de dados.
//
// Cada regra fixa o sha256 do ficheiro de origem revisto. Se a origem mudar,
// a montagem falha e a regra tem de ser revista outra vez (nada passa às cegas).

export type SchemaRule =
  | { file: string; sha256: string; action: "exclude"; reason: string }
  | { file: string; sha256: string; action: "strip"; reason: string; patterns: string[] };

/** Ficheiros de origem (supabase/migrations ou drizzle/migrations), por nome. */
export const STAGING_SCHEMA_RULES: readonly SchemaRule[] = [
  { file: "20260724171931_dbefc538-e993-4663-9151-c79af4c336f9.sql", sha256: "b7561de3c4bcd72836311debe2d8be308a991f05953191b3b786c6edc04d4ebc", action: "exclude",
    reason: "Dá super_admin a um identificador de conta de produção (administrador fixo)." },
  { file: "20260731084458_6c6f59e5-67f8-401b-9cfa-824290ae6e6e.sql", sha256: "bc9650c4db3ac40fbcc1aaebd4fdfd4956dc7edf14ebb5e8cea361b3b498ef1e", action: "exclude",
    reason: "Limpeza de linhas de produção por identificador." },
  { file: "20260801144947_0e213a95-046a-4774-9539-e7b82eeef5ca.sql", sha256: "7c3c4e0e77f64680d9ffaa6e612bf9d13e87a79b4e449a62707ebd4758bf03c5", action: "exclude",
    reason: "Limpeza de dados de produção por texto (sem efeito num esquema novo)." },
  { file: "20260801164332_45eebeba-ebde-47d5-9c88-cb68c3e62713.sql", sha256: "a923826a5ac7721daf02b4893a60191a7457a7aad541a0920de3b3d856d5cf82", action: "exclude",
    reason: "Apaga uma visita de produção por identificador." },
  { file: "20260804150324_545c9612-f875-4463-a02a-825ce45ed63d.sql", sha256: "6bf9954a9e079e995710af15510056d22cc72de3a9b8a0dbc239e851de733a77", action: "exclude",
    reason: "Fixture de teste: seguimento ligado ao email do proprietário e a um contacto de produção." },
  { file: "20260804150413_c7cd7276-3a27-49b4-aa9b-2a02bd0dfa94.sql", sha256: "76877c832700b0c020718359556a5a3454ceb5802c5939810efb4afb864a7748", action: "exclude",
    reason: "Apaga a fixture anterior (excluída)." },
  { file: "20260815121414_1e48e119-0f21-4c12-bdca-6b09ef7571b4.sql", sha256: "c9b244c09cb3005b9a67abebc631aa7a3e7ea2cede726add070dd85605fcbe80", action: "exclude",
    reason: "Arquiva um contacto de produção por identificador." },
  { file: "20260914085646_a2b7a27c-ecb7-488c-a177-9e091997fc8b.sql", sha256: "742baa3799338abdf4c044103861129bd5deda5607d3484530bb8f43c970bf99", action: "exclude",
    reason: "Correção de um item de produção por identificador." },
  { file: "20260914085718_08a63e8b-1fee-4050-b43d-875caad83fef.sql", sha256: "cbde0293fa6a15f971e65b1c93377db165dde3e1c2e33fdb4f158de2518f70a8", action: "exclude",
    reason: "Correção de um item de produção por identificador." },
  { file: "20260806103601_fdd052b8-5f26-434d-b349-894b49eb15f4.sql", sha256: "86247ec33cabd8821d32763ac6e05dee5541181dcb6245258699e8767694e1f1", action: "strip",
    reason: "Mantém a estrutura (restrição e função de fusão); retira a fusão de contas reais e o registo de auditoria com telefones e nomes reais.",
    patterns: ["\\nDO \\$\\$\\nDECLARE r jsonb;[\\s\\S]*?\\nEND \\$\\$;"] },
  { file: "20260729093330_31b5bdd8-39b9-491b-ad70-d6fd7c13ce77.sql", sha256: "22d6cb6ae03fc2b714c2a9c81e5d1420ab4fb5f9c545a57d14e33e7ea783973a", action: "strip",
    reason: "Retira a ativação individual de um interruptor pelo email do proprietário.",
    patterns: ["INSERT INTO public\\.feature_flag_users \\(flag_key, user_id\\)\\s*SELECT 'drive\\.v1'[\\s\\S]*?ON CONFLICT DO NOTHING;"] },
  { file: "20260823181720_cbdf3bf7-1e3e-47b7-a649-bd8e403abd57.sql", sha256: "0b6d235869573da1512fd9bc524d3d0f8ecb0ba320757d2d6ce44a462fd3530d", action: "strip",
    reason: "Retira a ativação individual de um interruptor pelo email do proprietário.",
    patterns: ["INSERT INTO public\\.feature_flag_users \\(flag_key, user_id\\)\\s*SELECT 'assessor\\.design\\.v2'[\\s\\S]*?ON CONFLICT DO NOTHING;"] },
  { file: "20260813084919_4d8f6283-e952-4058-8e08-45a30e6778e2.sql", sha256: "6ee6db4d4729c156d5d8793b037f1d2b655bdd6ff38c58abadd017adf9373006", action: "strip",
    reason: "Retira a conclusão de seguimentos de produção por identificador; mantém a novidade do produto.",
    patterns: ["update public\\.follow_ups set status = 'Concluído'[^;]*;"] },
  { file: "0004_pilot_v2_entitlement_and_invites.sql", sha256: "ffe123a38811e40f020b1a1a389919920d864bc70cfebecb92932d480f23da71", action: "strip",
    reason: "Mantém tabelas, funções e guardas do piloto; retira o piloto e os participantes com identificadores reais (o staging recebe um piloto sintético no passo S5).",
    patterns: ["-- Composição decidida pelo proprietário[\\s\\S]*?ON CONFLICT \\(pilot_key, user_id\\) DO NOTHING;"] },
];

/** Prelúdio próprio do staging: conserva admin/tester e acrescenta os papéis V2. */
export const STAGING_ROLES_PRELUDE = `-- S2-00 · Papéis (staging). Transação própria: os valores novos do tipo só
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
`;

/** Último passo: tudo desligado e verificações que abortam se algo real entrou. */
export const STAGING_SAFETY_CHECKS = `-- S2-99 · Verificações de segurança do staging (abortam a migração se falharem).
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
`;
