-- S4-02 · tabelas (parte B), chaves primárias, unicidade e verificações
-- AFONSO V2 · pacote de instalação v1.0.2 · destino ÚNICO: AFONSO Staging.
-- Gerado por scripts/staging/build-staging-package-v102.ts a partir do estado final do esquema
-- (staging-install/rehearsal/results/schema_public.sql, sha256 e047c2e1fe0effb5…).
-- Só DDL aditivo: sem INSERT/UPDATE/DELETE, sem DROP, sem RENAME, sem DROP NOT NULL, sem instruções SET de sessão.
-- NÃO EXECUTAR na V1 (produção). Aplicar só com autorização, por ordem, um ficheiro por migração.
-- Mesmas regras da parte A: RLS, barreira e permissões só para o servidor nascem com cada tabela.

-- ----- tabela public.file_categories -----
CREATE TABLE public.file_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    color text
);
ALTER TABLE public.file_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.file_categories AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.file_categories FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.file_categories TO service_role;

-- ----- tabela public.file_links -----
CREATE TABLE public.file_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    relation_type text DEFAULT 'belongs_to'::text NOT NULL,
    source text DEFAULT 'user'::text NOT NULL,
    confidence numeric,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_links_entity_type_check CHECK ((entity_type = ANY (ARRAY['person'::text, 'property'::text, 'opportunity'::text, 'follow_up'::text, 'interaction'::text, 'miscellaneous'::text, 'prospecting_lead'::text]))),
    CONSTRAINT file_links_relation_type_check CHECK ((relation_type = ANY (ARRAY['belongs_to'::text, 'supports'::text, 'received_from'::text, 'related_to'::text, 'version_of'::text, 'evidence_for'::text, 'attachment'::text]))),
    CONSTRAINT file_links_source_check CHECK ((source = ANY (ARRAY['ai'::text, 'user'::text, 'rule'::text, 'migration'::text])))
);
ALTER TABLE public.file_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.file_links AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.file_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.file_links TO service_role;

-- ----- tabela public.financial_movements -----
CREATE TABLE public.financial_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid,
    property_id uuid,
    type text NOT NULL,
    description text NOT NULL,
    category text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    vat_amount numeric(12,2),
    status text DEFAULT 'Prevista'::text NOT NULL,
    movement_date timestamp with time zone DEFAULT now() NOT NULL,
    expected_payment_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone
);
ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.financial_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.financial_movements AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.financial_movements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financial_movements TO service_role;

-- ----- tabela public.folder_items -----
CREATE TABLE public.folder_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.folder_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.folder_items AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.folder_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.folder_items TO service_role;

-- ----- tabela public.folders -----
CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    color text
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.folders AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.folders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.folders TO service_role;

-- ----- tabela public.follow_ups -----
CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    opportunity_id uuid,
    type text DEFAULT 'task'::text NOT NULL,
    title text NOT NULL,
    due_date timestamp with time zone DEFAULT now() NOT NULL,
    due_time text,
    status text DEFAULT 'Pendente'::text NOT NULL,
    priority text DEFAULT 'Média'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    related_file_id uuid,
    related_property_id uuid,
    source_channel text,
    source_message_id text,
    source_pending_action_id uuid,
    timezone text,
    external_reference text,
    created_by_assessor boolean DEFAULT false NOT NULL,
    outcome text,
    outcome_notes text,
    outcome_recorded_at timestamp with time zone,
    next_action_created_id uuid,
    related_prospecting_lead_id uuid,
    briefing_sent_at timestamp with time zone,
    objection_guide_sent_at timestamp with time zone,
    archived_at timestamp with time zone,
    title_norm text GENERATED ALWAYS AS (public.text_norm(title)) STORED,
    event_class text,
    event_category text,
    event_category_id uuid,
    duration_minutes integer,
    CONSTRAINT follow_ups_event_class_chk CHECK (((event_class IS NULL) OR (event_class = ANY (ARRAY['negocio'::text, 'interno'::text]))))
);
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.follow_ups FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.follow_ups AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.follow_ups FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.follow_ups TO service_role;
COMMENT ON COLUMN public.follow_ups.duration_minutes IS 'Duração real do compromisso em minutos (vinda do calendário externo). NULL = desconhecida, assume-se 60.';

-- ----- tabela public.inbound_message_claims -----
CREATE TABLE public.inbound_message_claims (
    channel text NOT NULL,
    external_message_id text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 1 NOT NULL
);
ALTER TABLE public.inbound_message_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.inbound_message_claims AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.inbound_message_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inbound_message_claims TO service_role;

-- ----- tabela public.interactions -----
CREATE TABLE public.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    opportunity_id uuid,
    source_channel text DEFAULT 'web'::text NOT NULL,
    original_content text,
    summary text,
    interaction_type text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    property_id uuid,
    is_confidential boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone
);
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.interactions FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.interactions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.interactions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.interactions TO service_role;

-- ----- tabela public.invite_send_attempts -----
CREATE TABLE public.invite_send_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    canal text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    reason text,
    error_code integer,
    destino text,
    attempts integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    requested_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.invite_send_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.invite_send_attempts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.invite_send_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invite_send_attempts TO service_role;

-- ----- tabela public.landing_page_visits -----
CREATE TABLE public.landing_page_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_date date DEFAULT ((now() AT TIME ZONE 'Europe/Lisbon'::text))::date NOT NULL,
    visit_hour smallint DEFAULT EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Lisbon'::text)) NOT NULL,
    referrer_host text,
    path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.landing_page_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.landing_page_visits AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.landing_page_visits FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.landing_page_visits TO service_role;

-- ----- tabela public.mentor_decisions -----
CREATE TABLE public.mentor_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tip_key text NOT NULL,
    decision text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mentor_decisions_decision_check CHECK ((decision = ANY (ARRAY['confirmar'::text, 'editar'::text, 'cancelar'::text, 'tratado'::text])))
);
ALTER TABLE public.mentor_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.mentor_decisions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.mentor_decisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mentor_decisions TO service_role;

-- ----- tabela public.miscellaneous_items -----
CREATE TABLE public.miscellaneous_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    original_content text,
    summary text,
    category text,
    source_channel text DEFAULT 'web'::text NOT NULL,
    source_message_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'inbox'::text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    related_person_id uuid,
    related_property_id uuid,
    related_opportunity_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_confidential boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    title_norm text GENERATED ALWAYS AS (public.text_norm(title)) STORED,
    team_read_at timestamp with time zone,
    team_archived_at timestamp with time zone,
    item_class text DEFAULT 'genuino'::text NOT NULL,
    CONSTRAINT miscellaneous_items_item_class_check CHECK ((item_class = ANY (ARRAY['genuino'::text, 'falha_interpretacao'::text]))),
    CONSTRAINT miscellaneous_items_status_check CHECK ((status = ANY (ARRAY['inbox'::text, 'reviewed'::text, 'classified'::text, 'archived'::text, 'deleted'::text])))
);
ALTER TABLE public.miscellaneous_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.miscellaneous_items AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.miscellaneous_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.miscellaneous_items TO service_role;

-- ----- tabela public.opportunities -----
CREATE TABLE public.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    property_id uuid,
    type text DEFAULT 'Compra'::text NOT NULL,
    status text DEFAULT 'Novo'::text NOT NULL,
    value numeric(12,2) DEFAULT 0,
    probability text DEFAULT 'Média'::text NOT NULL,
    next_action text,
    next_action_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    deal_kind text DEFAULT 'comprador'::text NOT NULL,
    stage public.deal_stage DEFAULT 'preparacao'::public.deal_stage NOT NULL,
    stage_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    deadline timestamp with time zone,
    archived_at timestamp with time zone,
    title_norm text GENERATED ALWAYS AS (public.text_norm(title)) STORED,
    source_lead_id uuid,
    CONSTRAINT opportunities_deal_kind_check CHECK ((deal_kind = ANY (ARRAY['comprador'::text, 'vendedor'::text])))
);
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.opportunities FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.opportunities AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.opportunities FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunities TO service_role;

-- ----- tabela public.opportunity_events -----
CREATE TABLE public.opportunity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    kind text NOT NULL,
    summary text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'dashboard'::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.opportunity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.opportunity_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.opportunity_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunity_events TO service_role;

-- ----- tabela public.opportunity_properties -----
CREATE TABLE public.opportunity_properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    property_id uuid NOT NULL,
    role text DEFAULT 'principal'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.opportunity_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.opportunity_properties AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.opportunity_properties FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunity_properties TO service_role;

-- ----- tabela public.pending_actions -----
CREATE TABLE public.pending_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    source_message_id uuid,
    intent text NOT NULL,
    original_content text NOT NULL,
    structured_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    missing_fields text[] DEFAULT ARRAY[]::text[] NOT NULL,
    status text DEFAULT 'pending_confirmation'::text NOT NULL,
    confidence numeric,
    pending_question text,
    created_resource_type text,
    created_resource_id uuid,
    error_message text,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_question text,
    confirmed_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    goal text,
    presented_channels text[] DEFAULT '{}'::text[] NOT NULL,
    confirm_token text,
    confirm_token_at timestamp with time zone,
    resolved_channel text
);
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.pending_actions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.pending_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pending_actions TO service_role;
COMMENT ON COLUMN public.pending_actions.presented_channels IS 'Canais onde a pergunta deste pendente foi mostrada ao consultor. Vazio = só o canal de origem (coluna channel).';
COMMENT ON COLUMN public.pending_actions.confirm_token IS 'Reserva atómica de confirmação: só um turno de cada vez pode confirmar este pendente.';
COMMENT ON COLUMN public.pending_actions.resolved_channel IS 'Canal onde o consultor confirmou/recusou (pode diferir da origem).';

-- ----- tabela public.people -----
CREATE TABLE public.people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    relationship_type text DEFAULT 'Potencial'::text NOT NULL,
    summary text,
    next_action text,
    next_action_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    roles public.person_role[] DEFAULT ARRAY[]::public.person_role[] NOT NULL,
    company text,
    job_title text,
    source_channel text,
    source_message_id uuid,
    source_file_id uuid,
    search_location text,
    search_property_type text,
    budget_min numeric,
    budget_max numeric,
    referred_by_person_id uuid,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    email_normalized text,
    archived_at timestamp with time zone,
    name_norm text GENERATED ALWAYS AS (public.text_norm(name)) STORED
);
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.people FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.people AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.people FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.people TO service_role;

-- ----- tabela public.person_phones -----
CREATE TABLE public.person_phones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid NOT NULL,
    raw text NOT NULL,
    e164 text,
    country_code text,
    kind text DEFAULT 'unknown'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.person_phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.person_phones AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.person_phones FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.person_phones TO service_role;

-- ----- tabela public.pilot_invite_deliveries -----
CREATE TABLE public.pilot_invite_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pilot_key text NOT NULL,
    recipient_user_id uuid NOT NULL,
    channel text NOT NULL,
    status text DEFAULT 'issuing'::text NOT NULL,
    invite_id uuid,
    requested_by uuid NOT NULL,
    provider_message_id text,
    error_code text,
    error_reason text,
    attempts integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilot_invite_deliveries_channel_chk CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'telegram'::text]))),
    CONSTRAINT pilot_invite_deliveries_status_chk CHECK ((status = ANY (ARRAY['issuing'::text, 'accepted'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'blocked'::text])))
);
ALTER TABLE public.pilot_invite_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.pilot_invite_deliveries AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.pilot_invite_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pilot_invite_deliveries TO service_role;

-- ----- tabela public.pilot_participants -----
CREATE TABLE public.pilot_participants (
    pilot_key text NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source text NOT NULL,
    invite_id uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilot_participants_source_chk CHECK ((source = ANY (ARRAY['seed'::text, 'invite'::text, 'admin'::text]))),
    CONSTRAINT pilot_participants_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'excluded'::text])))
);
ALTER TABLE public.pilot_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.pilot_participants AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.pilot_participants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pilot_participants TO service_role;

-- ----- tabela public.pilots -----
CREATE TABLE public.pilots (
    key text NOT NULL,
    status text DEFAULT 'no_go'::text NOT NULL,
    invite_issuer_user_id uuid,
    invite_cap integer DEFAULT 2 NOT NULL,
    invite_ttl_days integer DEFAULT 7 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilots_cap_chk CHECK ((invite_cap >= 0)),
    CONSTRAINT pilots_status_chk CHECK ((status = ANY (ARRAY['no_go'::text, 'go'::text, 'closed'::text]))),
    CONSTRAINT pilots_ttl_chk CHECK (((invite_ttl_days >= 1) AND (invite_ttl_days <= 30)))
);
ALTER TABLE public.pilots ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.pilots AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.pilots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pilots TO service_role;

-- ----- tabela public.plan_configs -----
CREATE TABLE public.plan_configs (
    tier text NOT NULL,
    price_month numeric,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    pricing_mode text DEFAULT 'paid'::text NOT NULL
);
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.plan_configs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.plan_configs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_configs TO service_role;

-- ----- tabela public.proactive_daily_ledger -----
CREATE TABLE public.proactive_daily_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    day date NOT NULL,
    source text NOT NULL,
    ref_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.proactive_daily_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.proactive_daily_ledger AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.proactive_daily_ledger FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proactive_daily_ledger TO service_role;
COMMENT ON TABLE public.proactive_daily_ledger IS 'Vaga diária (dia de Lisboa) de intervenções não solicitadas, partilhada por todos os emissores proativos.';

-- ----- tabela public.product_feedback -----
CREATE TABLE public.product_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text DEFAULT 'suggestion'::text NOT NULL,
    body text NOT NULL,
    channel text DEFAULT 'dashboard'::text NOT NULL,
    status text DEFAULT 'novo'::text NOT NULL,
    internal_note text,
    handled_by uuid,
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_file_id uuid
);
ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.product_feedback AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.product_feedback FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_feedback TO service_role;

-- ----- tabela public.product_telemetry_events -----
CREATE TABLE public.product_telemetry_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event text NOT NULL,
    lead_id uuid,
    channel text,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.product_telemetry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.product_telemetry_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.product_telemetry_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_telemetry_events TO service_role;

-- ----- tabela public.product_updates -----
CREATE TABLE public.product_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    released_on date DEFAULT CURRENT_DATE NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text DEFAULT 'nova_funcionalidade'::text NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.product_updates AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.product_updates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_updates TO service_role;

-- ----- tabela public.profiles -----
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_kind text DEFAULT 'real'::text NOT NULL,
    phone_verified_at timestamp with time zone,
    whatsapp_link_status text DEFAULT 'unlinked'::text NOT NULL,
    whatsapp_linked_at timestamp with time zone,
    assessor_name text DEFAULT 'Assessor'::text NOT NULL,
    primary_channel text DEFAULT 'whatsapp'::text NOT NULL,
    subscription_tier text DEFAULT 'base'::text NOT NULL,
    is_beta_tester boolean DEFAULT false NOT NULL,
    beta_expires_at timestamp with time zone,
    onboarding_goals text,
    onboarding_stage text DEFAULT 'not_started'::text NOT NULL,
    onboarding_offers integer DEFAULT 0 NOT NULL,
    onboarding_last_offer_at timestamp with time zone,
    telegram_retention_warned_at timestamp with time zone,
    trial_started_at timestamp with time zone,
    trial_expires_at timestamp with time zone,
    trial_tier text,
    trial_status text,
    trial_warned_at timestamp with time zone,
    trial_choice text,
    trial_value_summary_at timestamp with time zone,
    trial_choice_asked_at timestamp with time zone,
    readonly_until timestamp with time zone,
    docs_retention_warned_at timestamp with time zone,
    password_set_at timestamp with time zone,
    password_prompt_skipped_at timestamp with time zone,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    billing_status text DEFAULT 'none'::text NOT NULL,
    billing_source text DEFAULT 'manual'::text NOT NULL,
    billing_environment text DEFAULT 'sandbox'::text NOT NULL,
    billing_manual_lock boolean DEFAULT false NOT NULL,
    work_area text,
    team_context text,
    profile_questions_asked jsonb DEFAULT '[]'::jsonb NOT NULL,
    profile_last_question_at timestamp with time zone,
    profile_refusal_streak integer DEFAULT 0 NOT NULL,
    profile_paused_until timestamp with time zone,
    profile_notice_sent_at timestamp with time zone,
    billing_last_event_at timestamp with time zone,
    CONSTRAINT profiles_account_kind_check CHECK ((account_kind = ANY (ARRAY['real'::text, 'demo'::text, 'merged'::text]))),
    CONSTRAINT profiles_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['base'::text, 'consultor'::text, 'pro'::text, 'hub'::text]))),
    CONSTRAINT profiles_trial_status_check CHECK (((trial_status IS NULL) OR (trial_status = ANY (ARRAY['active'::text, 'converted'::text, 'expired'::text])))),
    CONSTRAINT profiles_whatsapp_link_status_check CHECK ((whatsapp_link_status = ANY (ARRAY['unlinked'::text, 'pending'::text, 'linked'::text])))
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.profiles AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

-- ----- tabela public.promo_codes -----
CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    grants_tier text DEFAULT 'consultor'::text NOT NULL,
    max_uses integer DEFAULT 1 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_beta boolean DEFAULT false NOT NULL,
    beta_days integer,
    invitee_name text,
    invitee_whatsapp text,
    invitee_email text
);
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.promo_codes AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.promo_codes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promo_codes TO service_role;

-- ----- tabela public.promo_redemptions -----
CREATE TABLE public.promo_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_id uuid NOT NULL,
    code text NOT NULL,
    granted_tier text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.promo_redemptions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.promo_redemptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promo_redemptions TO service_role;

-- ----- tabela public.properties -----
CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    owner_person_id uuid,
    title text NOT NULL,
    property_type text,
    location text,
    value numeric(12,2) DEFAULT 0,
    status text DEFAULT 'Angariado'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    typology text,
    address text,
    postal_code text,
    city text,
    parish text,
    asking_price numeric(12,2),
    estimated_value numeric(12,2),
    area_gross numeric(10,2),
    area_useful numeric(10,2),
    bedrooms integer,
    bathrooms integer,
    parking integer,
    energy_rating text,
    source_channel text,
    source_message_id uuid,
    category text,
    reserved_at timestamp with time zone,
    sold_at timestamp with time zone,
    sale_price numeric,
    commission_pct numeric,
    commission_amount numeric,
    category_id uuid,
    archived_at timestamp with time zone,
    search_norm text GENERATED ALWAYS AS (public.text_norm(((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(location, ''::text)) || ' '::text) || COALESCE(city, ''::text)) || ' '::text) || COALESCE(address, ''::text)))) STORED
);
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.properties FORCE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.properties AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.properties FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.properties TO service_role;

-- ----- tabela public.property_categories -----
CREATE TABLE public.property_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.property_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.property_categories AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.property_categories FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.property_categories TO service_role;

-- ----- tabela public.property_interests -----
CREATE TABLE public.property_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    opportunity_id uuid,
    person_id uuid,
    name text NOT NULL,
    contact text,
    source text,
    status text DEFAULT 'a_contactar'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.property_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.property_interests AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.property_interests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.property_interests TO service_role;

-- ----- tabela public.property_marketing_activities -----
CREATE TABLE public.property_marketing_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    opportunity_id uuid,
    title text NOT NULL,
    status text DEFAULT 'por_fazer'::text NOT NULL,
    done_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.property_marketing_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.property_marketing_activities AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.property_marketing_activities FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.property_marketing_activities TO service_role;

-- ----- tabela public.property_offers -----
CREATE TABLE public.property_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    opportunity_id uuid,
    person_id uuid,
    from_name text,
    amount numeric NOT NULL,
    offer_date timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.property_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.property_offers AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.property_offers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.property_offers TO service_role;

-- ----- tabela public.prospecting_leads -----
CREATE TABLE public.prospecting_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    phone text,
    location text,
    address text,
    source_type public.prospecting_source_type DEFAULT 'other'::public.prospecting_source_type NOT NULL,
    listing_type public.prospecting_listing_type DEFAULT 'unknown'::public.prospecting_listing_type NOT NULL,
    agency_name text,
    contact_name text,
    property_type text,
    typology text,
    asking_price numeric,
    status public.prospecting_status DEFAULT 'to_contact'::public.prospecting_status NOT NULL,
    notes text,
    source_channel text DEFAULT 'web'::text NOT NULL,
    source_message_id uuid,
    image_file_id uuid,
    related_property_id uuid,
    related_person_id uuid,
    next_follow_up_at timestamp with time zone,
    extraction_confidence numeric,
    extraction_raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    contact_attempts integer DEFAULT 0 NOT NULL,
    last_contact_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    search_norm text GENERATED ALWAYS AS (public.text_norm(((((COALESCE(title, ''::text) || ' '::text) || COALESCE(location, ''::text)) || ' '::text) || COALESCE(address, ''::text)))) STORED
);
ALTER TABLE public.prospecting_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.prospecting_leads AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.prospecting_leads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prospecting_leads TO service_role;

-- ----- tabela public.reminders -----
CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    related_resource_type text NOT NULL,
    related_resource_id uuid,
    scheduled_for timestamp with time zone NOT NULL,
    timezone text DEFAULT 'Europe/Lisbon'::text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    external_message_id text,
    idempotency_key text,
    message_preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    follow_up_id uuid,
    CONSTRAINT reminders_related_resource_type_check CHECK ((related_resource_type = ANY (ARRAY['follow_up'::text, 'event'::text, 'prospecting_lead'::text, 'other'::text]))),
    CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.reminders AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.reminders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminders TO service_role;

-- ----- tabela public.routines -----
CREATE TABLE public.routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    notes text,
    frequency text DEFAULT 'weekly'::text NOT NULL,
    interval_n integer DEFAULT 1 NOT NULL,
    weekday integer,
    day_of_month integer,
    time_of_day text,
    next_run_at timestamp with time zone DEFAULT now() NOT NULL,
    last_run_at timestamp with time zone,
    priority text DEFAULT 'Média'::text NOT NULL,
    person_id uuid,
    opportunity_id uuid,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'follow_up'::text NOT NULL,
    digest_query text,
    CONSTRAINT routines_dom_chk CHECK (((day_of_month IS NULL) OR ((day_of_month >= 1) AND (day_of_month <= 31)))),
    CONSTRAINT routines_frequency_chk CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
    CONSTRAINT routines_interval_chk CHECK (((interval_n >= 1) AND (interval_n <= 365))),
    CONSTRAINT routines_kind_check CHECK ((kind = ANY (ARRAY['follow_up'::text, 'digest'::text]))),
    CONSTRAINT routines_weekday_chk CHECK (((weekday IS NULL) OR ((weekday >= 0) AND (weekday <= 6))))
);
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.routines AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.routines FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.routines TO service_role;

-- ----- tabela public.short_links -----
CREATE TABLE public.short_links (
    code text NOT NULL,
    user_id uuid,
    target_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.short_links AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.short_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.short_links TO service_role;

-- ----- tabela public.similar_listing_searches -----
CREATE TABLE public.similar_listing_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cache_key text NOT NULL,
    query text NOT NULL,
    results jsonb DEFAULT '[]'::jsonb NOT NULL,
    cache_hit boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.similar_listing_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.similar_listing_searches AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.similar_listing_searches FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.similar_listing_searches TO service_role;

-- ----- tabela public.stripe_webhook_events -----
CREATE TABLE public.stripe_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    environment text DEFAULT 'sandbox'::text NOT NULL,
    profile_id uuid,
    outcome text DEFAULT 'processed'::text NOT NULL,
    detail text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_event_created timestamp with time zone
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.stripe_webhook_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stripe_webhook_events TO service_role;

-- ----- tabela public.subscription_events -----
CREATE TABLE public.subscription_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event text NOT NULL,
    from_tier text,
    to_tier text,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.subscription_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.subscription_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscription_events TO service_role;

-- ----- tabela public.support_sessions -----
CREATE TABLE public.support_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    reason text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.support_sessions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.support_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_sessions TO service_role;
COMMENT ON TABLE public.support_sessions IS 'Sessoes de modo apoio: acesso exclusivo do servidor (service_role).';

-- ----- tabela public.tags -----
CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.tags AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.tags FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tags TO service_role;

-- ----- tabela public.telegram_invites -----
CREATE TABLE public.telegram_invites (
    code text NOT NULL,
    created_by uuid,
    subscription_tier text DEFAULT 'base'::text NOT NULL,
    note text,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    used_by uuid,
    used_at timestamp with time zone,
    used_chat_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_invites_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['base'::text, 'consultor'::text, 'pro'::text, 'hub'::text])))
);
ALTER TABLE public.telegram_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.telegram_invites AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.telegram_invites FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_invites TO service_role;

-- ----- tabela public.telegram_link_tokens -----
CREATE TABLE public.telegram_link_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_chat_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.telegram_link_tokens AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.telegram_link_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_link_tokens TO service_role;

-- ----- tabela public.telegram_pairings -----
CREATE TABLE public.telegram_pairings (
    chat_id text NOT NULL,
    step text DEFAULT 'asked'::text NOT NULL,
    target_user_id uuid,
    phone text,
    code_hash text,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_user_id uuid
);
ALTER TABLE public.telegram_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.telegram_pairings AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.telegram_pairings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_pairings TO service_role;
COMMENT ON TABLE public.telegram_pairings IS 'Emparelhamentos Telegram: acesso exclusivo do servidor (service_role).';
COMMENT ON COLUMN public.telegram_pairings.source_user_id IS 'Conta atual deste chat quando o consultor pede para o ligar a outra conta (nunca há fusão automática).';

-- ----- tabela public.uploaded_files -----
CREATE TABLE public.uploaded_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    source_message_id uuid,
    external_file_id text,
    original_file_name text,
    internal_file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    storage_path text NOT NULL,
    processing_status text DEFAULT 'received'::text NOT NULL,
    classification text,
    extracted_text text,
    extracted_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    related_resource_type text,
    related_resource_id uuid,
    related_pending_action_id uuid,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_description text,
    document_type text,
    classification_confidence numeric,
    checksum text,
    ai_summary text,
    requires_review boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    source_external_file_id text,
    custom_category text,
    custom_category_id uuid,
    opportunity_id uuid,
    retention_archived_at timestamp with time zone,
    retention_warned_at timestamp with time zone,
    doc_issued_on date,
    doc_expires_on date,
    doc_nif text,
    doc_artigo_matricial text,
    doc_fracao text,
    doc_morada text,
    photo_value text,
    doc_group_id uuid,
    doc_page_number integer,
    search_norm text GENERATED ALWAYS AS (public.text_norm(((((((COALESCE(original_file_name, ''::text) || ' '::text) || COALESCE(ai_summary, ''::text)) || ' '::text) || COALESCE(document_type, ''::text)) || ' '::text) || COALESCE(doc_morada, ''::text)))) STORED,
    system_category text,
    duplicate_of uuid
);
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.uploaded_files AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.uploaded_files FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uploaded_files TO service_role;

-- ----- tabela public.whatsapp_link_codes -----
CREATE TABLE public.whatsapp_link_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    phone text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.whatsapp_link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.whatsapp_link_codes AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.whatsapp_link_codes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_link_codes TO service_role;

-- ----- tabela public.whatsapp_proactive_tests -----
CREATE TABLE public.whatsapp_proactive_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    target_user_id uuid,
    purpose text DEFAULT 'meeting_briefing'::text NOT NULL,
    to_phone text NOT NULL,
    template_name text,
    template_category text,
    hours_since_last_inbound numeric,
    outside_window boolean DEFAULT false NOT NULL,
    forced boolean DEFAULT false NOT NULL,
    send_log_id uuid,
    message_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    cost_eur numeric,
    notes text
);
ALTER TABLE public.whatsapp_proactive_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.whatsapp_proactive_tests AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.whatsapp_proactive_tests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_proactive_tests TO service_role;

-- ----- tabela public.whatsapp_send_logs -----
CREATE TABLE public.whatsapp_send_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    to_phone text NOT NULL,
    phone_number_id text,
    http_status integer,
    ok boolean DEFAULT false NOT NULL,
    message_id text,
    error_code integer,
    error_subcode integer,
    error_type text,
    error_message text,
    fbtrace_id text,
    triggered_by uuid,
    kind text DEFAULT 'auto'::text NOT NULL,
    purpose text,
    template_name text,
    template_category text,
    template_language text,
    outside_window boolean,
    hours_since_last_inbound numeric,
    billable boolean,
    cost_eur numeric,
    cost_source text,
    delivery_status text DEFAULT 'sent'::text NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    replied_at timestamp with time zone,
    test_id uuid
);
ALTER TABLE public.whatsapp_send_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.whatsapp_send_logs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.whatsapp_send_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_send_logs TO service_role;

-- ----- tabela public.whatsapp_template_bindings -----
CREATE TABLE public.whatsapp_template_bindings (
    purpose text NOT NULL,
    template_name text NOT NULL,
    language text DEFAULT 'pt_PT'::text NOT NULL,
    param_count integer DEFAULT 3 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    fallback_template_name text
);
ALTER TABLE public.whatsapp_template_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.whatsapp_template_bindings AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.whatsapp_template_bindings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_template_bindings TO service_role;

-- ----- tabela public.whatsapp_template_rates -----
CREATE TABLE public.whatsapp_template_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    country_code text DEFAULT 'PT'::text NOT NULL,
    price_eur numeric NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);
ALTER TABLE public.whatsapp_template_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_gate_admin_tester ON public.whatsapp_template_rates AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));
REVOKE ALL ON TABLE public.whatsapp_template_rates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_template_rates TO service_role;

-- ----- chaves primárias, unicidade e verificações -----

ALTER TABLE ONLY public.access_invite_attempts
    ADD CONSTRAINT access_invite_attempts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.access_waitlist
    ADD CONSTRAINT access_waitlist_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.account_access
    ADD CONSTRAINT account_access_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_broadcast_recipients
    ADD CONSTRAINT admin_broadcast_recipients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_broadcasts
    ADD CONSTRAINT admin_broadcasts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_cost_settings
    ADD CONSTRAINT admin_cost_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_mfa_required
    ADD CONSTRAINT admin_mfa_required_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.ai_model_rates
    ADD CONSTRAINT ai_model_rates_model_key UNIQUE (model);

ALTER TABLE ONLY public.ai_model_rates
    ADD CONSTRAINT ai_model_rates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.alert_mutes
    ADD CONSTRAINT alert_mutes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.alert_mutes
    ADD CONSTRAINT alert_mutes_user_id_alert_key_key UNIQUE (user_id, alert_key);

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_user_id_announcement_id_key UNIQUE (user_id, announcement_id);

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.app_user_connection_aliases
    ADD CONSTRAINT app_user_connection_aliases_pkey PRIMARY KEY (user_id, connector_id);

ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_user_id_connector_id_key UNIQUE (user_id, connector_id);

ALTER TABLE ONLY public.assessor_ai_logs
    ADD CONSTRAINT assessor_ai_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assessor_messages
    ADD CONSTRAINT assessor_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assessor_nudges
    ADD CONSTRAINT assessor_nudges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assessor_quality_scores
    ADD CONSTRAINT assessor_quality_scores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assessor_reasoning_traces
    ADD CONSTRAINT assessor_reasoning_traces_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assessor_tool_calls
    ADD CONSTRAINT assessor_tool_calls_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_golden_conversations
    ADD CONSTRAINT assistant_golden_conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_golden_conversations
    ADD CONSTRAINT assistant_golden_conversations_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.assistant_golden_runs
    ADD CONSTRAINT assistant_golden_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_reflections
    ADD CONSTRAINT assistant_reflections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_shadow_runs
    ADD CONSTRAINT assistant_shadow_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_trust_scores
    ADD CONSTRAINT assistant_trust_scores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_user_corrections
    ADD CONSTRAINT assistant_user_corrections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.autonomy_rules
    ADD CONSTRAINT autonomy_rules_pkey PRIMARY KEY (user_id, action_type);

ALTER TABLE ONLY public.billing_test_accounts
    ADD CONSTRAINT billing_test_accounts_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_user_id_provider_external_account_id_key UNIQUE (user_id, provider, external_account_id);

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_user_id_provider_external_event_id_key UNIQUE (user_id, provider, external_event_id);

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_user_id_provider_follow_up_id_key UNIQUE (user_id, provider, follow_up_id);

ALTER TABLE ONLY public.calendar_sync_log
    ADD CONSTRAINT calendar_sync_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_sync_state
    ADD CONSTRAINT calendar_sync_state_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_sync_state
    ADD CONSTRAINT calendar_sync_state_user_id_provider_key UNIQUE (user_id, provider);

ALTER TABLE ONLY public.channel_links
    ADD CONSTRAINT channel_links_channel_external_id_key UNIQUE (channel, external_id);

ALTER TABLE ONLY public.channel_links
    ADD CONSTRAINT channel_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.consultant_preferences
    ADD CONSTRAINT consultant_preferences_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.content_access_consents
    ADD CONSTRAINT content_access_consents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversation_locks
    ADD CONSTRAINT conversation_locks_pkey PRIMARY KEY (user_id, channel);

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_unique_key UNIQUE (user_id, channel, external_conversation_id);

ALTER TABLE ONLY public.daily_digests
    ADD CONSTRAINT daily_digests_digest_date_key UNIQUE (digest_date);

ALTER TABLE ONLY public.daily_digests
    ADD CONSTRAINT daily_digests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.daily_priorities
    ADD CONSTRAINT daily_priorities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.dashboard_announcements
    ADD CONSTRAINT dashboard_announcements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.dashboard_login_tokens
    ADD CONSTRAINT dashboard_login_tokens_pkey PRIMARY KEY (token);

ALTER TABLE ONLY public.deal_deadlines
    ADD CONSTRAINT deal_deadlines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_connections
    ADD CONSTRAINT email_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_connections
    ADD CONSTRAINT email_connections_user_id_provider_key UNIQUE (user_id, provider);

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_user_id_provider_provider_thread_id_key UNIQUE (user_id, provider, provider_thread_id);

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_tag_id_entity_type_entity_id_key UNIQUE (tag_id, entity_type, entity_id);

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE ONLY public.feature_flag_users
    ADD CONSTRAINT feature_flag_users_pkey PRIMARY KEY (flag_key, user_id);

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.file_categories
    ADD CONSTRAINT file_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.file_categories
    ADD CONSTRAINT file_categories_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_user_id_file_id_entity_type_entity_id_relation_t_key UNIQUE (user_id, file_id, entity_type, entity_id, relation_type);

ALTER TABLE ONLY public.financial_movements
    ADD CONSTRAINT financial_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.folder_items
    ADD CONSTRAINT folder_items_folder_id_entity_type_entity_id_key UNIQUE (folder_id, entity_type, entity_id);

ALTER TABLE ONLY public.folder_items
    ADD CONSTRAINT folder_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbound_message_claims
    ADD CONSTRAINT inbound_message_claims_pkey PRIMARY KEY (channel, external_message_id);

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invite_send_attempts
    ADD CONSTRAINT invite_send_attempts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.landing_page_visits
    ADD CONSTRAINT landing_page_visits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mentor_decisions
    ADD CONSTRAINT mentor_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.opportunity_events
    ADD CONSTRAINT opportunity_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_opportunity_id_property_id_key UNIQUE (opportunity_id, property_id);

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.person_phones
    ADD CONSTRAINT person_phones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pilot_invite_deliveries
    ADD CONSTRAINT pilot_invite_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pilot_invite_deliveries
    ADD CONSTRAINT pilot_invite_deliveries_recipient_uniq UNIQUE (pilot_key, recipient_user_id);

ALTER TABLE ONLY public.pilot_participants
    ADD CONSTRAINT pilot_participants_pkey PRIMARY KEY (pilot_key, user_id);

ALTER TABLE ONLY public.pilots
    ADD CONSTRAINT pilots_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.plan_configs
    ADD CONSTRAINT plan_configs_pkey PRIMARY KEY (tier);

ALTER TABLE ONLY public.proactive_daily_ledger
    ADD CONSTRAINT proactive_daily_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.proactive_daily_ledger
    ADD CONSTRAINT proactive_daily_ledger_user_id_day_ref_key_key UNIQUE (user_id, day, ref_key);

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT product_feedback_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_telemetry_events
    ADD CONSTRAINT product_telemetry_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_updates
    ADD CONSTRAINT product_updates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_user_id_code_id_key UNIQUE (user_id, code_id);

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.property_categories
    ADD CONSTRAINT property_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.property_categories
    ADD CONSTRAINT property_categories_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.property_marketing_activities
    ADD CONSTRAINT property_marketing_activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.short_links
    ADD CONSTRAINT short_links_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.similar_listing_searches
    ADD CONSTRAINT similar_listing_searches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_event_id_key UNIQUE (event_id);

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.telegram_invites
    ADD CONSTRAINT telegram_invites_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_pkey PRIMARY KEY (token);

ALTER TABLE ONLY public.telegram_pairings
    ADD CONSTRAINT telegram_pairings_pkey PRIMARY KEY (chat_id);

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_link_codes
    ADD CONSTRAINT whatsapp_link_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_proactive_tests
    ADD CONSTRAINT whatsapp_proactive_tests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_send_logs
    ADD CONSTRAINT whatsapp_send_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_template_bindings
    ADD CONSTRAINT whatsapp_template_bindings_pkey PRIMARY KEY (purpose);

ALTER TABLE ONLY public.whatsapp_template_rates
    ADD CONSTRAINT whatsapp_template_rates_pkey PRIMARY KEY (id);
