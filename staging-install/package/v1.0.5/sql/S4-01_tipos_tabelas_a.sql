-- S4-01 · tipos e tabelas (parte A)
-- AFONSO V2 · pacote de instalação v1.0.2 · destino ÚNICO: AFONSO Staging.
-- Gerado por scripts/staging/build-staging-package-v102.ts a partir do estado final do esquema
-- (staging-install/rehearsal/results/schema_public.sql, sha256 e047c2e1fe0effb5…).
-- Só DDL aditivo: sem INSERT/UPDATE/DELETE, sem DROP, sem RENAME, sem DROP NOT NULL, sem instruções SET de sessão.
-- NÃO EXECUTAR na V1 (produção). Aplicar só com autorização, por ordem, um ficheiro por migração.
-- Cada tabela nasce com RLS, barreira admin/tester (RESTRICTIVE) e permissões só para o servidor, na mesma migração.

CREATE TYPE public.assistant_correction_category AS ENUM (
    'wrong_person',
    'wrong_property',
    'wrong_date',
    'wrong_document',
    'lost_context',
    'unnatural_reply',
    'unnecessary_question',
    'wrong_execution',
    'other'
);

CREATE TYPE public.assistant_reflection_trigger AS ENUM (
    'low_aqs',
    'low_ats',
    'user_correction'
);

CREATE TYPE public.deal_stage AS ENUM (
    'preparacao',
    'angariacao',
    'promocao',
    'visitas',
    'proposta',
    'cpcv',
    'escritura',
    'concluido',
    'perdido'
);

CREATE TYPE public.person_role AS ENUM (
    'owner',
    'potential_owner',
    'buyer',
    'potential_buyer',
    'client',
    'reference',
    'partner',
    'supplier',
    'colleague',
    'other'
);

CREATE TYPE public.prospecting_listing_type AS ENUM (
    'owner_sale',
    'other_agency',
    'own_agency',
    'unknown'
);

CREATE TYPE public.prospecting_source_type AS ENUM (
    'street_sign',
    'referral',
    'online_listing',
    'direct_observation',
    'other'
);

CREATE TYPE public.prospecting_status AS ENUM (
    'to_contact',
    'contact_attempted',
    'contacted',
    'no_interest',
    'opportunity',
    'converted',
    'archived'
);

-- ----- função public.text_norm(text) -----
CREATE FUNCTION public.text_norm(_t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public', 'extensions'
    AS $$ select lower(extensions.unaccent('extensions.unaccent', coalesce(_t, ''))) $$;
REVOKE ALL ON FUNCTION public.text_norm(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.text_norm(text) TO service_role;

-- ----- tabela public.access_invite_attempts -----
CREATE TABLE public.access_invite_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text,
    ok boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.access_invite_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.access_invite_attempts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.access_invite_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.access_invite_attempts TO service_role;

-- ----- tabela public.access_invites -----
CREATE TABLE public.access_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    issuer_user_id uuid,
    source text NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    note text,
    expires_at timestamp with time zone NOT NULL,
    used_by uuid,
    used_at timestamp with time zone,
    used_channel text,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pilot_key text,
    idempotency_key text,
    issued_via text,
    CONSTRAINT access_invites_pilot_chk CHECK (((source = 'pilot'::text) = (pilot_key IS NOT NULL))),
    CONSTRAINT access_invites_source_chk CHECK ((source = ANY (ARRAY['beta_tester'::text, 'admin'::text, 'pilot'::text]))),
    CONSTRAINT access_invites_status_chk CHECK ((status = ANY (ARRAY['issued'::text, 'used'::text, 'revoked'::text])))
);
ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.access_invites AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.access_invites FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.access_invites TO service_role;

-- ----- tabela public.access_waitlist -----
CREATE TABLE public.access_waitlist (
    user_id uuid NOT NULL,
    channel text,
    consent_contact boolean DEFAULT false NOT NULL,
    consent_at timestamp with time zone,
    notify boolean DEFAULT false NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_waitlist_status_chk CHECK ((status = ANY (ARRAY['waiting'::text, 'granted'::text, 'removed'::text])))
);
ALTER TABLE public.access_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.access_waitlist AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.access_waitlist FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.access_waitlist TO service_role;

-- ----- tabela public.account_access -----
CREATE TABLE public.account_access (
    user_id uuid NOT NULL,
    state text DEFAULT 'registered_waiting'::text NOT NULL,
    invite_id uuid,
    source text,
    activated_at timestamp with time zone,
    trial_started_at timestamp with time zone,
    waitlist_offered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_access_state_chk CHECK ((state = ANY (ARRAY['registered_waiting'::text, 'invited'::text, 'activated'::text, 'trialing'::text, 'subscribed'::text])))
);
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.account_access AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.account_access FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_access TO service_role;

-- ----- tabela public.admin_audit_logs -----
CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid,
    action text NOT NULL,
    target_user_id uuid,
    resource_type text,
    resource_id text,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.admin_audit_logs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.admin_audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_audit_logs TO service_role;

-- ----- tabela public.admin_broadcast_recipients -----
CREATE TABLE public.admin_broadcast_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broadcast_id uuid NOT NULL,
    user_id uuid,
    email text,
    status text DEFAULT 'pendente'::text NOT NULL,
    error text,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.admin_broadcast_recipients AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.admin_broadcast_recipients FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_broadcast_recipients TO service_role;

-- ----- tabela public.admin_broadcasts -----
CREATE TABLE public.admin_broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    segment text DEFAULT 'all'::text NOT NULL,
    subject text,
    body text NOT NULL,
    recipients_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.admin_broadcasts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.admin_broadcasts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_broadcasts TO service_role;

-- ----- tabela public.admin_cost_settings -----
CREATE TABLE public.admin_cost_settings (
    key text NOT NULL,
    value numeric,
    source text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_cost_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.admin_cost_settings AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.admin_cost_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_cost_settings TO service_role;
COMMENT ON TABLE public.admin_cost_settings IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';

-- ----- tabela public.admin_messages -----
CREATE TABLE public.admin_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consultor_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    pergunta text NOT NULL,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    resposta text,
    respondido_em timestamp with time zone,
    estado text DEFAULT 'pendente'::text NOT NULL,
    janela_expira_em timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    resposta_lida_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.admin_messages AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.admin_messages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_messages TO service_role;
COMMENT ON TABLE public.admin_messages IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role). Sem grants para anon/authenticated por desenho.';

-- ----- tabela public.admin_mfa_required -----
CREATE TABLE public.admin_mfa_required (
    user_id uuid NOT NULL,
    required_at timestamp with time zone DEFAULT now() NOT NULL,
    required_by uuid
);
ALTER TABLE public.admin_mfa_required ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.admin_mfa_required AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.admin_mfa_required FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_mfa_required TO service_role;

-- ----- tabela public.ai_model_rates -----
CREATE TABLE public.ai_model_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model text NOT NULL,
    credits_per_1m_input numeric NOT NULL,
    credits_per_1m_output numeric NOT NULL,
    source text,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.ai_model_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.ai_model_rates AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.ai_model_rates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_model_rates TO service_role;
COMMENT ON TABLE public.ai_model_rates IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';

-- ----- tabela public.alert_mutes -----
CREATE TABLE public.alert_mutes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    alert_key text NOT NULL,
    muted_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.alert_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.alert_mutes AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.alert_mutes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.alert_mutes TO service_role;

-- ----- tabela public.announcement_dismissals -----
CREATE TABLE public.announcement_dismissals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    announcement_id uuid NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.announcement_dismissals AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.announcement_dismissals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.announcement_dismissals TO service_role;

-- ----- tabela public.app_settings -----
CREATE TABLE public.app_settings (
    key text NOT NULL,
    value_int integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.app_settings AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.app_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO service_role;

-- ----- tabela public.app_user_connection_aliases -----
CREATE TABLE public.app_user_connection_aliases (
    user_id uuid NOT NULL,
    connector_id text NOT NULL,
    app_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.app_user_connection_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.app_user_connection_aliases AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.app_user_connection_aliases FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_user_connection_aliases TO service_role;
COMMENT ON TABLE public.app_user_connection_aliases IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';

-- ----- tabela public.app_user_connections -----
CREATE TABLE public.app_user_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    connector_id text NOT NULL,
    connection_key_ciphertext text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.app_user_connections AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.app_user_connections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_user_connections TO service_role;
COMMENT ON TABLE public.app_user_connections IS 'Segredos de ligacoes externas (tokens cifrados): acesso exclusivo do servidor (service_role).';

-- ----- tabela public.assessor_ai_logs -----
CREATE TABLE public.assessor_ai_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    model text NOT NULL,
    intent text,
    confidence numeric,
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    latency_ms integer,
    success boolean DEFAULT true NOT NULL,
    error text,
    estimated_cost_usd numeric,
    domain text,
    route text,
    fallback_used boolean DEFAULT false,
    tool_name text,
    tool_success boolean,
    modality text,
    billed_model text
);
ALTER TABLE public.assessor_ai_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assessor_ai_logs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assessor_ai_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessor_ai_logs TO service_role;

-- ----- tabela public.assessor_messages -----
CREATE TABLE public.assessor_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    role text NOT NULL,
    content text NOT NULL,
    message_type text,
    structured_payload jsonb,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text DEFAULT 'app'::text NOT NULL,
    sender_phone text,
    whatsapp_message_id text,
    conversation_id text,
    related_pending_action_id uuid,
    related_resource_type text,
    related_resource_id uuid,
    archived_at timestamp with time zone
);
ALTER TABLE public.assessor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.assessor_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assessor_messages AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assessor_messages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessor_messages TO service_role;

-- ----- tabela public.assessor_nudges -----
CREATE TABLE public.assessor_nudges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    subject_type text,
    subject_id uuid,
    reason text NOT NULL,
    suggested_reply text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    dedupe_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome text,
    outcome_at timestamp with time zone,
    urgency text DEFAULT 'useful'::text NOT NULL,
    priority integer,
    evidence jsonb
);
ALTER TABLE public.assessor_nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assessor_nudges AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assessor_nudges FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessor_nudges TO service_role;

-- ----- tabela public.assessor_quality_scores -----
CREATE TABLE public.assessor_quality_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    trace_id uuid,
    understood_first_try boolean,
    reformulated boolean,
    executed_successfully boolean,
    human_tone boolean,
    score numeric(4,3),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assessor_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assessor_quality_scores AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assessor_quality_scores FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessor_quality_scores TO service_role;

-- ----- tabela public.assessor_reasoning_traces -----
CREATE TABLE public.assessor_reasoning_traces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    source_message_id text,
    input_content text NOT NULL,
    observations jsonb DEFAULT '[]'::jsonb NOT NULL,
    hypotheses jsonb DEFAULT '[]'::jsonb NOT NULL,
    searches jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision jsonb DEFAULT '{}'::jsonb NOT NULL,
    tool_calls jsonb DEFAULT '[]'::jsonb NOT NULL,
    memory_writes jsonb DEFAULT '[]'::jsonb NOT NULL,
    reply text,
    think_latency_ms integer,
    decide_latency_ms integer,
    total_latency_ms integer,
    input_tokens integer,
    output_tokens integer,
    success boolean DEFAULT true NOT NULL,
    error text
);
ALTER TABLE public.assessor_reasoning_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assessor_reasoning_traces AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assessor_reasoning_traces FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessor_reasoning_traces TO service_role;

-- ----- tabela public.assessor_tool_calls -----
CREATE TABLE public.assessor_tool_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    turn_id uuid,
    tool_name text NOT NULL,
    arguments jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    success boolean NOT NULL,
    error text,
    latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assessor_tool_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assessor_tool_calls AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assessor_tool_calls FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessor_tool_calls TO service_role;

-- ----- tabela public.assistant_golden_conversations -----
CREATE TABLE public.assistant_golden_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    turns jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assistant_golden_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assistant_golden_conversations AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assistant_golden_conversations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_golden_conversations TO service_role;

-- ----- tabela public.assistant_golden_runs -----
CREATE TABLE public.assistant_golden_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    golden_id uuid NOT NULL,
    release_ref text NOT NULL,
    passed boolean NOT NULL,
    ats numeric,
    aqs numeric,
    task_success numeric,
    diffs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assistant_golden_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assistant_golden_runs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assistant_golden_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_golden_runs TO service_role;

-- ----- tabela public.assistant_reflections -----
CREATE TABLE public.assistant_reflections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    trace_id uuid,
    correction_id uuid,
    trigger public.assistant_reflection_trigger NOT NULL,
    analysis jsonb DEFAULT '{}'::jsonb NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assistant_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assistant_reflections AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assistant_reflections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_reflections TO service_role;

-- ----- tabela public.assistant_shadow_runs -----
CREATE TABLE public.assistant_shadow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    trace_id uuid,
    strategy text NOT NULL,
    reply text,
    ats numeric,
    aqs numeric,
    task_success numeric,
    latency_ms integer,
    diff jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assistant_shadow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assistant_shadow_runs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assistant_shadow_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_shadow_runs TO service_role;

-- ----- tabela public.assistant_trust_scores -----
CREATE TABLE public.assistant_trust_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    trace_id uuid,
    task_success numeric,
    aqs_score numeric,
    corrections_count integer DEFAULT 0 NOT NULL,
    context_preservation numeric,
    safe_decisions numeric,
    ats numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assistant_trust_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assistant_trust_scores AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assistant_trust_scores FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_trust_scores TO service_role;

-- ----- tabela public.assistant_user_corrections -----
CREATE TABLE public.assistant_user_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    conversation_id text,
    turn_id uuid,
    category public.assistant_correction_category DEFAULT 'other'::public.assistant_correction_category NOT NULL,
    original_message text,
    correction_message text NOT NULL,
    final_result text,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.assistant_user_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.assistant_user_corrections AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.assistant_user_corrections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_user_corrections TO service_role;

-- ----- tabela public.autonomy_rules -----
CREATE TABLE public.autonomy_rules (
    user_id uuid NOT NULL,
    action_type text NOT NULL,
    requires_confirmation boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.autonomy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.autonomy_rules AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.autonomy_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.autonomy_rules TO service_role;

-- ----- tabela public.billing_test_accounts -----
CREATE TABLE public.billing_test_accounts (
    user_id uuid NOT NULL,
    added_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.billing_test_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.billing_test_accounts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.billing_test_accounts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_test_accounts TO service_role;

-- ----- tabela public.calendar_connections -----
CREATE TABLE public.calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    external_account_id text,
    display_name text,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL,
    refresh_token_encrypted text,
    is_primary boolean DEFAULT false NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.calendar_connections AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.calendar_connections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_connections TO service_role;

-- ----- tabela public.calendar_event_links -----
CREATE TABLE public.calendar_event_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    follow_up_id uuid NOT NULL,
    external_event_id text NOT NULL,
    external_calendar_id text,
    external_updated_at timestamp with time zone,
    local_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    last_origin text,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    series_master_id text,
    recurrence_type text,
    CONSTRAINT calendar_event_links_provider_check CHECK ((provider = ANY (ARRAY['google_calendar'::text, 'microsoft_outlook'::text])))
);
ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.calendar_event_links AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.calendar_event_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_event_links TO service_role;

-- ----- tabela public.calendar_sync_log -----
CREATE TABLE public.calendar_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    follow_up_id uuid,
    external_event_id text,
    direction text NOT NULL,
    action text NOT NULL,
    origin text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.calendar_sync_log AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.calendar_sync_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_sync_log TO service_role;

-- ----- tabela public.calendar_sync_state -----
CREATE TABLE public.calendar_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    calendar_id text,
    sync_token text,
    delta_link text,
    last_polled_at timestamp with time zone,
    last_error text,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_sync_state_provider_check CHECK ((provider = ANY (ARRAY['google_calendar'::text, 'microsoft_outlook'::text])))
);
ALTER TABLE public.calendar_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.calendar_sync_state AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.calendar_sync_state FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_sync_state TO service_role;

-- ----- tabela public.channel_links -----
CREATE TABLE public.channel_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    external_id text NOT NULL,
    display_name text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_links_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'telegram'::text])))
);
ALTER TABLE public.channel_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.channel_links AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.channel_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.channel_links TO service_role;

-- ----- tabela public.consultant_preferences -----
CREATE TABLE public.consultant_preferences (
    user_id uuid NOT NULL,
    morning_briefing_enabled boolean DEFAULT false NOT NULL,
    morning_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    morning_days integer[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
    evening_wrap_enabled boolean DEFAULT false NOT NULL,
    evening_time time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    quiet_hours_start time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    quiet_hours_end time without time zone DEFAULT '07:30:00'::time without time zone NOT NULL,
    timezone text DEFAULT 'Europe/Lisbon'::text NOT NULL,
    primary_channel text DEFAULT 'whatsapp'::text NOT NULL,
    max_daily_nudges integer DEFAULT 6 NOT NULL,
    autonomy_level text DEFAULT 'balanced'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    proactive_push_enabled boolean DEFAULT false NOT NULL,
    evening_checkin_enabled boolean DEFAULT false NOT NULL,
    evening_checkin_time time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    confirm_document_send boolean DEFAULT false NOT NULL,
    reminder_lead_minutes integer,
    active_calendar_provider text,
    active_mail_provider text,
    evening_review_detail text DEFAULT 'normal'::text NOT NULL,
    max_unsolicited_nudges_per_day integer DEFAULT 1 NOT NULL,
    explicit_opt_ins text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT consultant_preferences_active_calendar_provider_check CHECK (((active_calendar_provider IS NULL) OR (active_calendar_provider = ANY (ARRAY['google_calendar'::text, 'microsoft_outlook'::text])))),
    CONSTRAINT consultant_preferences_active_mail_provider_check CHECK (((active_mail_provider IS NULL) OR (active_mail_provider = ANY (ARRAY['gmail'::text, 'outlook'::text])))),
    CONSTRAINT consultant_preferences_evening_review_detail_check CHECK ((evening_review_detail = ANY (ARRAY['curto'::text, 'normal'::text, 'detalhado'::text]))),
    CONSTRAINT consultant_preferences_max_unsolicited_check CHECK (((max_unsolicited_nudges_per_day >= 0) AND (max_unsolicited_nudges_per_day <= 20))),
    CONSTRAINT consultant_preferences_reminder_lead_minutes_check CHECK (((reminder_lead_minutes IS NULL) OR ((reminder_lead_minutes >= 0) AND (reminder_lead_minutes <= 240))))
);
ALTER TABLE public.consultant_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.consultant_preferences AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.consultant_preferences FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consultant_preferences TO service_role;
COMMENT ON COLUMN public.consultant_preferences.explicit_opt_ins IS 'Notificações que o consultor ligou explicitamente (morning_briefing, evening_review, push). Ligado por defeito não conta.';

-- ----- tabela public.content_access_consents -----
CREATE TABLE public.content_access_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    scope text DEFAULT 'conversation'::text NOT NULL,
    resource_id text,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.content_access_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.content_access_consents AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.content_access_consents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_access_consents TO service_role;

-- ----- tabela public.conversation_locks -----
CREATE TABLE public.conversation_locks (
    user_id uuid NOT NULL,
    channel text NOT NULL,
    locked_until timestamp with time zone NOT NULL,
    holder text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.conversation_locks AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.conversation_locks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_locks TO service_role;

-- ----- tabela public.conversation_states -----
CREATE TABLE public.conversation_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    external_conversation_id text DEFAULT 'default'::text NOT NULL,
    active_topic text,
    state_summary text,
    last_intent text,
    last_entity_type text,
    last_entity_id uuid,
    pending_action_id uuid,
    last_created_resource_type text,
    last_created_resource_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_property_id uuid,
    goal text,
    factual_summary text,
    active_person_id uuid,
    sparring_turns integer DEFAULT 0 NOT NULL,
    last_read_tool text,
    last_read_args jsonb,
    last_read_axis text,
    last_read_at timestamp with time zone,
    last_channel text,
    CONSTRAINT conversation_states_last_read_axis_check CHECK (((last_read_axis IS NULL) OR (last_read_axis = ANY (ARRAY['time'::text, 'none'::text]))))
);
ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.conversation_states AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.conversation_states FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_states TO service_role;
COMMENT ON COLUMN public.conversation_states.last_channel IS 'Canal da última escrita no estado partilhado da conta (linha channel=account).';

-- ----- tabela public.daily_digests -----
CREATE TABLE public.daily_digests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    digest_date date NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    sent_at timestamp with time zone,
    recipients_count integer DEFAULT 0 NOT NULL,
    broadcast_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_edited boolean DEFAULT false NOT NULL
);
ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.daily_digests AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.daily_digests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_digests TO service_role;

-- ----- tabela public.daily_priorities -----
CREATE TABLE public.daily_priorities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid,
    action text NOT NULL,
    reasons text[] DEFAULT ARRAY[]::text[] NOT NULL,
    priority_score numeric DEFAULT 0 NOT NULL,
    due_at timestamp with time zone,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.daily_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.daily_priorities AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.daily_priorities FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_priorities TO service_role;

-- ----- tabela public.dashboard_announcements -----
CREATE TABLE public.dashboard_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    segment text DEFAULT 'all'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.dashboard_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.dashboard_announcements AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.dashboard_announcements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_announcements TO service_role;

-- ----- tabela public.dashboard_login_tokens -----
CREATE TABLE public.dashboard_login_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    channel text DEFAULT 'telegram'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    issued_by uuid
);
ALTER TABLE public.dashboard_login_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.dashboard_login_tokens AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.dashboard_login_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_login_tokens TO service_role;
COMMENT ON TABLE public.dashboard_login_tokens IS 'Hashes de tokens de login/recuperacao: acesso exclusivo do servidor (service_role).';

-- ----- tabela public.deal_deadlines -----
CREATE TABLE public.deal_deadlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    label text NOT NULL,
    due_date date NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    notes text,
    notice_days integer,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_deadlines_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'cumprido'::text, 'cancelado'::text])))
);
ALTER TABLE public.deal_deadlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.deal_deadlines AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.deal_deadlines FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_deadlines TO service_role;

-- ----- tabela public.email_connections -----
CREATE TABLE public.email_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL,
    email_address text,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_ok_at timestamp with time zone,
    expires_at timestamp with time zone,
    reauth_warned_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.email_connections AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.email_connections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_connections TO service_role;

-- ----- tabela public.email_drafts -----
CREATE TABLE public.email_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid,
    provider_draft_id text,
    to_emails text[] DEFAULT '{}'::text[] NOT NULL,
    subject text,
    body text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '06:00:00'::interval) NOT NULL,
    sent_at timestamp with time zone,
    sent_body text,
    in_reply_to_message_id text,
    revisions integer DEFAULT 0 NOT NULL,
    confirmation_text text,
    channel text DEFAULT 'dashboard'::text NOT NULL,
    to_name text,
    person_id uuid,
    archived_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    kind text DEFAULT 'reply'::text NOT NULL
);
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.email_drafts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.email_drafts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_drafts TO service_role;

-- ----- tabela public.email_messages -----
CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    provider_message_id text NOT NULL,
    from_email text,
    from_name text,
    to_emails text[] DEFAULT '{}'::text[] NOT NULL,
    sent_at timestamp with time zone,
    snippet text,
    direction text DEFAULT 'inbound'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL
);
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.email_messages AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.email_messages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_messages TO service_role;

-- ----- tabela public.email_threads -----
CREATE TABLE public.email_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL,
    provider_thread_id text NOT NULL,
    subject text,
    last_message_at timestamp with time zone,
    person_id uuid,
    summary text,
    summarized_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.email_threads AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.email_threads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_threads TO service_role;

-- ----- tabela public.entity_tags -----
CREATE TABLE public.entity_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.entity_tags AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.entity_tags FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entity_tags TO service_role;

-- ----- tabela public.event_categories -----
CREATE TABLE public.event_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.event_categories AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.event_categories FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_categories TO service_role;

-- ----- tabela public.feature_flag_users -----
CREATE TABLE public.feature_flag_users (
    flag_key text NOT NULL,
    user_id uuid NOT NULL
);
ALTER TABLE public.feature_flag_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.feature_flag_users AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.feature_flag_users FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feature_flag_users TO service_role;

-- ----- tabela public.feature_flags -----
CREATE TABLE public.feature_flags (
    key text NOT NULL,
    description text,
    enabled_globally boolean DEFAULT false NOT NULL,
    enabled_plans text[] DEFAULT '{}'::text[] NOT NULL,
    rollout_percentage integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT feature_flags_rollout_percentage_check CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.feature_flags AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.feature_flags FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feature_flags TO service_role;
