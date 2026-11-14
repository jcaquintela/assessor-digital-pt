-- S2-02 · esquema V2, parte 2 de 2
-- Gerado por scripts/staging/build-staging-schema.ts para o projeto AFONSO Staging.
-- NÃO EXECUTAR neste projeto (produção/V1). Aplicar só no staging, por ordem, um bloco por migração.

-- ===== origem: 20260813084919_4d8f6283-e952-4058-8e08-45a30e6778e2.sql =====
-- [retirado na montagem de staging: dados de produção]

insert into public.product_updates (released_on, title, description, category, is_published)
values (current_date, 'O Afonso já fecha o que dizes que está tratado', 'Quando dizes "o estudo de mercado já está tratado" ou "já liguei ao Nuno", o assunto fica mesmo marcado como concluído e o lembrete deixa de voltar. Se houver uma rotina a repetir esse assunto, o Afonso pergunta-te se queres que continue.', 'melhoria', true);

-- ===== origem: 20260813144041_2f92ff31-a4ef-44ba-b317-3c5eb9381816.sql =====
-- Nenhuma função interna deve ser chamável por quem não tem sessão iniciada.
REVOKE ALL ON FUNCTION public.audit_sensitive_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.effective_tier(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_beta_testers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_accounts_apply(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_accounts_preview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_admin_audit_logs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_conversation_lock(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;

-- O necessário e nada mais: verificação de administrador e escalão de
-- subscrição são usados pelas regras de acesso e pela app com sessão.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO authenticated;

-- Operações administrativas e de manutenção só pelo lado do servidor.
GRANT EXECUTE ON FUNCTION public.merge_accounts_apply(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_accounts_preview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_admin_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_beta_testers() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_conversation_lock(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) TO service_role;

-- ===== origem: 20260813144145_3c622470-7100-4eff-8cd4-d9198ed9203b.sql =====
-- Não é usada por nenhuma regra de acesso nem pela app: fica só do lado do servidor.
REVOKE ALL ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO service_role;

-- ===== origem: 20260813144213_61293a73-3bab-43d7-b436-04b0600ba0d8.sql =====
-- has_role passa a responder apenas sobre quem pergunta: um utilizador com
-- sessão não consegue sondar os papéis de outra conta.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _user_id IS DISTINCT FROM _caller THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

-- ===== origem: 20260813182114_d6485b0f-4dc8-4798-b541-496a2caa82cc.sql =====
with tech as (
  select id, summary,
    trim(both from regexp_replace(summary, '^Ficou por tratar:\s*', '')) as raw
  from public.miscellaneous_items
  where summary ilike 'Ficou por tratar%'
),
mapped as (
  select id, raw,
    case
      when raw ~* '(act sem ferramenta|no_tool)' then 'Não consegui executar este pedido — falta-me essa capacidade ainda.'
      when raw ~* '(indispon|service_down|rate.?limit|timeout|HTTP 4|HTTP 5|429|503)' then 'Não consegui responder na altura por indisponibilidade temporária.'
      when raw ~* '(not_found|invalid_args|tool_failed|error|_rls|falha)' or raw like '%:%' then 'Percebi o pedido, mas não consegui concluir a ação.'
      else 'Guardei aqui para não se perder — diz-me o que fazer com isto.'
    end as pt
  from tech
)
update public.miscellaneous_items m
set summary = mapped.pt,
    tags = (select array_agg(distinct t) from unnest(m.tags || array['tec:' || left(mapped.raw, 180)]) as t)
from mapped
where m.id = mapped.id;

-- ===== origem: 20260814084412_e462a342-a4fd-409f-b677-2253ae127bde.sql =====
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS reminder_lead_minutes integer;

ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_reminder_lead_minutes_check
  CHECK (reminder_lead_minutes IS NULL OR (reminder_lead_minutes >= 0 AND reminder_lead_minutes <= 240));

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value_int integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.app_settings (key, value_int)
VALUES ('reminder_lead_minutes', 0)
ON CONFLICT (key) DO NOTHING;

-- ===== origem: 20260815135922_7efced55-2621-4003-adc4-e2f4e32ae748.sql =====
-- Ligações de email por consultor (metadados; a chave fica em app_user_connections)
CREATE TABLE public.email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail',
  email_address text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz,
  -- Em modo Teste do Google o refresh token expira ~7 dias.
  expires_at timestamptz,
  reauth_warned_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_connections TO authenticated;
GRANT ALL ON public.email_connections TO service_role;
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_connections_own" ON public.email_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail',
  provider_thread_id text NOT NULL,
  subject text,
  last_message_at timestamptz,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  summary text,
  summarized_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_thread_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_threads TO authenticated;
GRANT ALL ON public.email_threads TO service_role;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_threads_own" ON public.email_threads
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX email_threads_user_last_msg_idx ON public.email_threads (user_id, last_message_at DESC);
CREATE INDEX email_threads_person_idx ON public.email_threads (person_id);

-- Sem body_text por decisão de produto: só snippet + resumo. O corpo é lido
-- no Gmail on-demand para reduzir superfície de dados sensíveis (CASA).
CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  from_email text,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  snippet text,
  direction text NOT NULL DEFAULT 'inbound',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_messages_own" ON public.email_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX email_messages_thread_idx ON public.email_messages (thread_id, sent_at DESC);
CREATE INDEX email_messages_from_idx ON public.email_messages (user_id, from_email);

CREATE TABLE public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE CASCADE,
  provider_draft_id text,
  to_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_drafts TO authenticated;
GRANT ALL ON public.email_drafts TO service_role;
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_drafts_own" ON public.email_drafts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX email_drafts_user_status_idx ON public.email_drafts (user_id, status);

CREATE OR REPLACE FUNCTION public.email_drafts_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','discarded','sent') THEN
    RAISE EXCEPTION 'estado de rascunho inválido: %', NEW.status;
  END IF;
  IF NEW.status IN ('confirmed','sent') AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER email_drafts_validate_trg BEFORE INSERT OR UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.email_drafts_validate();

CREATE TRIGGER email_connections_touch BEFORE UPDATE ON public.email_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_threads_touch BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_messages_touch BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_drafts_touch BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260815150353_b2cf6922-1476-45bc-bdf4-5c88db22e278.sql =====
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail';

ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail';

UPDATE public.email_messages SET provider = 'gmail' WHERE provider IS NULL;
UPDATE public.email_drafts SET provider = 'gmail' WHERE provider IS NULL;

ALTER TABLE public.email_messages
  DROP CONSTRAINT IF EXISTS email_messages_user_id_provider_message_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_user_provider_msg_key
  ON public.email_messages (user_id, provider, provider_message_id);

CREATE INDEX IF NOT EXISTS email_drafts_user_provider_idx
  ON public.email_drafts (user_id, provider);

-- ===== origem: 20260815152230_a0d60733-71c8-4a95-afde-3eb93cecc034.sql =====
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS active_calendar_provider text,
  ADD COLUMN IF NOT EXISTS active_mail_provider text;

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_active_calendar_provider_check;
ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_active_calendar_provider_check
  CHECK (active_calendar_provider IS NULL OR active_calendar_provider IN ('google_calendar','microsoft_outlook'));

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_active_mail_provider_check;
ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_active_mail_provider_check
  CHECK (active_mail_provider IS NULL OR active_mail_provider IN ('gmail','outlook'));

-- Backfill email: um só ligado -> esse; dois ligados -> gmail (era o fallback de facto)
INSERT INTO public.consultant_preferences (user_id, active_mail_provider)
SELECT e.user_id,
       CASE WHEN count(*) FILTER (WHERE e.provider = 'gmail') > 0 THEN 'gmail' ELSE 'outlook' END
FROM public.email_connections e
GROUP BY e.user_id
ON CONFLICT (user_id) DO UPDATE
SET active_mail_provider = COALESCE(public.consultant_preferences.active_mail_provider, EXCLUDED.active_mail_provider);

-- Backfill calendário: só quando há exatamente um provedor ligado
INSERT INTO public.consultant_preferences (user_id, active_calendar_provider)
SELECT c.user_id, min(c.provider)
FROM public.calendar_connections c
GROUP BY c.user_id
HAVING count(DISTINCT c.provider) = 1
ON CONFLICT (user_id) DO UPDATE
SET active_calendar_provider = COALESCE(public.consultant_preferences.active_calendar_provider, EXCLUDED.active_calendar_provider);

-- ===== origem: 20260815171041_e1247df9-c685-489d-836a-8e1321ef7d31.sql =====
CREATE OR REPLACE FUNCTION public.profiles_restrict_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR coalesce(current_setting('app.system_job', true), '') = 'on'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.is_beta_tester IS DISTINCT FROM OLD.is_beta_tester
     OR NEW.beta_expires_at IS DISTINCT FROM OLD.beta_expires_at
     OR NEW.account_kind IS DISTINCT FROM OLD.account_kind
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
     OR NEW.whatsapp_link_status IS DISTINCT FROM OLD.whatsapp_link_status
     OR NEW.whatsapp_linked_at IS DISTINCT FROM OLD.whatsapp_linked_at
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at
     OR NEW.trial_tier IS DISTINCT FROM OLD.trial_tier
     OR NEW.trial_status IS DISTINCT FROM OLD.trial_status
     OR NEW.trial_warned_at IS DISTINCT FROM OLD.trial_warned_at
     OR NEW.telegram_retention_warned_at IS DISTINCT FROM OLD.telegram_retention_warned_at
     OR NEW.billing_status IS DISTINCT FROM OLD.billing_status
     OR NEW.billing_source IS DISTINCT FROM OLD.billing_source
     OR NEW.billing_environment IS DISTINCT FROM OLD.billing_environment
     OR NEW.billing_manual_lock IS DISTINCT FROM OLD.billing_manual_lock
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_price_id IS DISTINCT FROM OLD.stripe_price_id THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ===== origem: 20260815202728_73bc00e0-dfdf-44ab-a501-aafa734ab2d2.sql =====
CREATE TABLE public.mentor_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tip_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirmar','editar','cancelar')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_decisions_user_key_idx ON public.mentor_decisions (user_id, tip_key, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_decisions TO authenticated;
GRANT ALL ON public.mentor_decisions TO service_role;
ALTER TABLE public.mentor_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_decisions_own" ON public.mentor_decisions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== origem: 20260815203438_8de9973e-cfc7-46f7-b56c-5f076b50ad28.sql =====
ALTER TABLE public.mentor_decisions DROP CONSTRAINT IF EXISTS mentor_decisions_decision_check;
ALTER TABLE public.mentor_decisions ADD CONSTRAINT mentor_decisions_decision_check CHECK (decision IN ('confirmar','editar','cancelar','tratado'));

-- ===== origem: 20260815224447_cb4dac59-e246-4252-ab24-aa2f52a0b21e.sql =====
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS system_category text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_checksum_idx
  ON public.uploaded_files (user_id, checksum)
  WHERE checksum IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_system_category_idx
  ON public.uploaded_files (user_id, system_category)
  WHERE system_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_duplicate_of_idx
  ON public.uploaded_files (duplicate_of)
  WHERE duplicate_of IS NOT NULL;

-- ===== origem: 20260817074904_0dc63054-b535-4465-b7a6-85469f4081e3.sql =====
insert into public.product_updates (released_on, title, description, category, is_published)
values (current_date, 'Ecrãs vazios com saída clara', 'Quando não há imóveis num estado, negócios numa fase ou movimentos de faturação, passas a ver uma mensagem clara com um botão para criar ou limpar a pesquisa, em vez de um espaço em branco.', 'melhoria', true);

-- ===== origem: 20260817075254_5709e704-86b1-4d94-b7e3-26bc51eb3926.sql =====
insert into public.product_updates (released_on, title, description, category, is_published)
values (current_date, 'Ver as contas por trás da análise', 'Nos cartões de análise (plano Pro) podes abrir "Ver as contas" e ver exatamente o que foi usado: quantos registos entraram, o limiar de dias, quantos ficaram acima, a lista dos casos e a data do último movimento de cada um.', 'melhoria', true);

-- ===== origem: 20260817075718_fb0e6c1e-9a42-43a1-9209-a59a0e684503.sql =====
insert into public.product_updates (released_on, title, description, category, is_published)
values (current_date, 'O Afonso passa a chamar-se sempre pelo nome', 'Corrigimos os sítios onde ainda aparecia "o teu assessor" em vez do nome que escolheste — por exemplo o cartão de análise em Imóveis, Negócios e Faturação passa a dizer "Análise do Afonso".', 'melhoria', true);

-- ===== origem: 20260817205323_d51caade-459e-4a7b-8208-e94e5965a88b.sql =====
CREATE TABLE public.alert_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_key text NOT NULL,
  muted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_mutes TO authenticated;
GRANT ALL ON public.alert_mutes TO service_role;

ALTER TABLE public.alert_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_mutes_own" ON public.alert_mutes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER alert_mutes_set_updated_at
  BEFORE UPDATE ON public.alert_mutes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260818185851_7ae5810d-7537-4053-b74e-1c063ae2d49f.sql =====
ALTER TABLE public.miscellaneous_items
  ADD COLUMN IF NOT EXISTS item_class text NOT NULL DEFAULT 'genuino';

ALTER TABLE public.miscellaneous_items
  DROP CONSTRAINT IF EXISTS miscellaneous_items_item_class_check;

ALTER TABLE public.miscellaneous_items
  ADD CONSTRAINT miscellaneous_items_item_class_check
  CHECK (item_class IN ('genuino','falha_interpretacao'));

CREATE INDEX IF NOT EXISTS miscellaneous_items_item_class_idx
  ON public.miscellaneous_items (user_id, item_class, created_at DESC);

-- ===== origem: 20260823181720_cbdf3bf7-1e3e-47b7-a649-bd8e403abd57.sql =====
INSERT INTO public.feature_flags (key, description, enabled_globally)
VALUES ('assessor.design.v2', 'Redesenho v2: paleta operacional + sidebar consolidada', false)
ON CONFLICT (key) DO NOTHING;

-- [retirado na montagem de staging: dados de produção]

-- ===== origem: 20260823182542_6918a308-9649-45b8-b722-c77acb893d9d.sql =====
INSERT INTO public.product_updates (title, description, category)
VALUES (
  'Novo visual e menu mais simples',
  'O painel passa a usar cores com significado: verde é feito, âmbar é risco, vermelho é atrasado, e o dourado do Afonso fica só para o que é dele. O menu lateral fica com as cinco áreas do dia a dia (Hoje, Pessoas, Imóveis, Negócios, Agenda) e tudo o resto passa para "Mais". A Prospeção aparece em Hoje quando tens placas por contactar.',
  'melhoria'
);

-- ===== origem: 20260824202841_d02ec0b0-8778-44d1-a942-491ec094b5ed.sql =====
ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS last_read_tool text,
  ADD COLUMN IF NOT EXISTS last_read_args jsonb,
  ADD COLUMN IF NOT EXISTS last_read_axis text,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

ALTER TABLE public.conversation_states
  DROP CONSTRAINT IF EXISTS conversation_states_last_read_axis_check;

ALTER TABLE public.conversation_states
  ADD CONSTRAINT conversation_states_last_read_axis_check
  CHECK (last_read_axis IS NULL OR last_read_axis IN ('time', 'none'));

-- ===== origem: 20260824204236_ee7b9002-6a93-43f3-87d7-72f47be40548.sql =====
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.admin_messages FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.admin_messages FROM authenticated;
GRANT ALL ON public.admin_messages TO service_role;

CREATE POLICY "service_role_only" ON public.admin_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON public.admin_cost_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON public.ai_model_rates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON public.app_user_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON public.app_user_connection_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON public.dashboard_login_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON public.support_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON public.telegram_pairings FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.admin_cost_settings TO service_role;
GRANT ALL ON public.ai_model_rates TO service_role;
GRANT ALL ON public.app_user_connections TO service_role;
GRANT ALL ON public.app_user_connection_aliases TO service_role;
GRANT ALL ON public.dashboard_login_tokens TO service_role;
GRANT ALL ON public.support_sessions TO service_role;
GRANT ALL ON public.telegram_pairings TO service_role;

COMMENT ON TABLE public.admin_messages IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role). Sem grants para anon/authenticated por desenho.';
COMMENT ON TABLE public.admin_cost_settings IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';
COMMENT ON TABLE public.ai_model_rates IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';
COMMENT ON TABLE public.app_user_connections IS 'Segredos de ligacoes externas (tokens cifrados): acesso exclusivo do servidor (service_role).';
COMMENT ON TABLE public.app_user_connection_aliases IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';
COMMENT ON TABLE public.dashboard_login_tokens IS 'Hashes de tokens de login/recuperacao: acesso exclusivo do servidor (service_role).';
COMMENT ON TABLE public.support_sessions IS 'Sessoes de modo apoio: acesso exclusivo do servidor (service_role).';
COMMENT ON TABLE public.telegram_pairings IS 'Emparelhamentos Telegram: acesso exclusivo do servidor (service_role).';

-- ===== origem: 20260825175655_18a481d8-2700-4ae9-8852-b8a066c5b326.sql =====
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO service_role;

-- ===== origem: 20260825205549_10e7e2ae-8bc5-4656-9728-be9319739c92.sql =====
ALTER TABLE public.calendar_event_links
  ADD COLUMN IF NOT EXISTS series_master_id text,
  ADD COLUMN IF NOT EXISTS recurrence_type text;

CREATE INDEX IF NOT EXISTS calendar_event_links_series_idx
  ON public.calendar_event_links (user_id, provider, series_master_id);

-- ===== origem: 20260825213701_00d57334-41d0-438a-bfbc-00117b0eb81c.sql =====
CREATE TABLE public.event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_categories TO authenticated;
GRANT ALL ON public.event_categories TO service_role;

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own event categories"
ON public.event_categories FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER event_categories_touch
BEFORE UPDATE ON public.event_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.follow_ups
  ADD COLUMN event_category text,
  ADD COLUMN event_category_id uuid REFERENCES public.event_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_follow_ups_event_category ON public.follow_ups (user_id, event_category);
CREATE INDEX idx_follow_ups_event_category_id ON public.follow_ups (event_category_id);

-- ===== origem: 20260825215434_7f808260-7028-4e06-901c-f68595de4602.sql =====
ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_body text,
  ADD COLUMN IF NOT EXISTS in_reply_to_message_id text,
  ADD COLUMN IF NOT EXISTS revisions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_text text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS to_name text,
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS email_drafts_user_recent_idx
  ON public.email_drafts (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.email_drafts TO authenticated;
GRANT ALL ON public.email_drafts TO service_role;

-- ===== origem: 20260825221015_8214aa6b-2fc4-4074-853d-9b87b6ad94eb.sql =====
ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE OR REPLACE FUNCTION public.email_drafts_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','discarded','sent','cancelled') THEN
    RAISE EXCEPTION 'estado de rascunho inválido: %', NEW.status;
  END IF;
  IF NEW.status IN ('confirmed','sent') AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- ===== origem: 20260826123430_e57868f2-9a52-4c2a-a8cd-d04379b0b5ce.sql =====
ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reply',
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_drafts_person_idx ON public.email_drafts (user_id, person_id);

CREATE OR REPLACE FUNCTION public.email_drafts_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','discarded','sent','cancelled') THEN
    RAISE EXCEPTION 'estado de rascunho inválido: %', NEW.status;
  END IF;
  IF NEW.kind NOT IN ('reply','outbound') THEN
    RAISE EXCEPTION 'tipo de rascunho inválido: %', NEW.kind;
  END IF;
  IF NEW.status IN ('confirmed','sent') AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- ===== origem: 20260828082658_b78138fe-42f5-4b5a-a139-514001de91ef.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_area text,
  ADD COLUMN IF NOT EXISTS team_context text,
  ADD COLUMN IF NOT EXISTS profile_questions_asked jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_last_question_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_refusal_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS profile_notice_sent_at timestamptz;

-- ===== origem: 20260828182104_d8ac8ed9-fa19-4e4a-8126-e61b3ab25a0f.sql =====
CREATE TABLE public.similar_listing_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  query TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.similar_listing_searches TO authenticated;
GRANT ALL ON public.similar_listing_searches TO service_role;

ALTER TABLE public.similar_listing_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultores veem as suas pesquisas de mercado"
ON public.similar_listing_searches FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Consultores registam as suas pesquisas de mercado"
ON public.similar_listing_searches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_similar_listing_cache ON public.similar_listing_searches (user_id, cache_key, created_at DESC);
CREATE INDEX idx_similar_listing_daily ON public.similar_listing_searches (user_id, created_at DESC);

-- ===== origem: 20260829172640_4474cac9-d1ba-48c3-ba3d-418337625096.sql =====
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS duration_minutes integer;

COMMENT ON COLUMN public.follow_ups.duration_minutes IS 'Duração real do compromisso em minutos (vinda do calendário externo). NULL = desconhecida, assume-se 60.';

-- ===== origem: 20260829223743_83868bf8-439b-4437-94fa-a41a64db2597.sql =====
CREATE TABLE public.deal_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  label text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','cumprido','cancelado')),
  notes text,
  notice_days integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_deadlines TO authenticated;
GRANT ALL ON public.deal_deadlines TO service_role;

ALTER TABLE public.deal_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own deal deadlines"
ON public.deal_deadlines FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX deal_deadlines_user_due_idx ON public.deal_deadlines (user_id, due_date);
CREATE INDEX deal_deadlines_opportunity_idx ON public.deal_deadlines (opportunity_id);

CREATE TRIGGER deal_deadlines_set_updated_at
BEFORE UPDATE ON public.deal_deadlines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.deal_deadlines (user_id, opportunity_id, label, due_date, status, created_at)
SELECT o.user_id, o.id, 'Prazo', (o.deadline AT TIME ZONE 'Europe/Lisbon')::date, 'aberto', now()
FROM public.opportunities o
WHERE o.deadline IS NOT NULL AND o.user_id IS NOT NULL;

-- ===== origem: 20260830111333_0adf6c78-e4c7-4d47-b20c-c5223c2ca704.sql =====
ALTER TABLE public.consultant_preferences
  ALTER COLUMN evening_wrap_enabled SET DEFAULT true;

UPDATE public.consultant_preferences SET evening_wrap_enabled = true WHERE evening_wrap_enabled = false;

INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (
  current_date,
  'Resumo de fim de dia',
  'Ao fim do dia (19h) passas a receber um fecho do dia: o que aconteceu, o que ficou por fechar e o que te espera amanhã. Podes pedi-lo a qualquer hora com "como correu o dia?" ou "resumo do dia".',
  'nova_funcionalidade',
  true
);

-- ===== origem: 20260830112257_7a15ee81-0c69-401b-ae55-55a0b863e53d.sql =====
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS evening_review_detail text NOT NULL DEFAULT 'normal';

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_evening_review_detail_check;

ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_evening_review_detail_check
  CHECK (evening_review_detail IN ('curto','normal','detalhado'));

-- ===== origem: 20260830170743_bd8c01ee-8c69-4fec-88fd-d0d047023657.sql =====
insert into public.product_updates (released_on, title, description, category, is_published)
values (current_date, 'Cartela de briefing mais completa', 'Quando tens compromissos seguidos, o aviso passa a mencionar também o que vem logo a seguir, indica sempre que há mais detalhe no painel e avisa quando o texto foi cortado. Se o WhatsApp não puder entregar o aviso, ele segue pelo Telegram em vez de se perder.', 'melhoria', true);

-- ===== origem: 20260901071357_df9ee2a6-34b7-4a85-a0ec-322ab379d1d5.sql =====
ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'follow_up',
  ADD COLUMN IF NOT EXISTS digest_query text;

ALTER TABLE public.routines
  DROP CONSTRAINT IF EXISTS routines_kind_check;
ALTER TABLE public.routines
  ADD CONSTRAINT routines_kind_check CHECK (kind IN ('follow_up','digest'));

-- ===== origem: 20260903144309_f5121903-f71d-4cc4-a308-4c6f097a1227.sql =====
CREATE TABLE public.short_links (
  code text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE UNIQUE INDEX short_links_user_target_idx ON public.short_links (user_id, target_path);

GRANT SELECT ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "short_links_owner_select" ON public.short_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ===== origem: 20260903144715_713aeb2d-5235-4df4-a991-3ae586481604.sql =====
INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (current_date, 'Links do briefing mais curtos', 'Os links das prioridades no briefing matinal passam a ser curtos e legíveis, em vez de endereços longos. Abrem exatamente a mesma ficha de sempre.', 'melhoria', true);

-- ===== origem: 20260907075940_bf8b6e08-3a93-46a1-a640-0973afe6fcc3.sql =====
ALTER TABLE public.whatsapp_template_bindings
  ADD COLUMN IF NOT EXISTS fallback_template_name text;

UPDATE public.whatsapp_template_bindings
   SET template_name = 'afonso_briefing_compromisso_v2',
       param_count = 5,
       fallback_template_name = 'afonso_briefing_compromisso',
       updated_at = now()
 WHERE purpose = 'meeting_briefing';

-- ===== origem: 20260907141640_22257119-54b4-45e9-94a0-4dfbba84bab3.sql =====
CREATE POLICY "own daily_priorities insert" ON public.daily_priorities FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own daily_priorities delete" ON public.daily_priorities FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== origem: 20260909080503_f79304d4-15eb-4bbb-b351-7cc3fc07611e.sql =====
INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (
  current_date,
  'Avisos de oportunidade mais claros',
  'Os avisos de imóveis e negócios parados explicam agora o tempo esperado em linguagem simples.',
  'melhoria',
  true
);

-- ===== origem: 20260910072531_c83d1a09-9135-4e06-a9d6-2dcc5a30b7a9.sql =====
INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (
  current_date,
  'Briefing matinal mais legível',
  'Os compromissos e conflitos do briefing matinal aparecem agora separados por espaço no WhatsApp.',
  'melhoria',
  true
);

-- ===== origem: 20260914085803_cd65ed62-7cd7-4bb6-bfaa-b48b0a710448.sql =====
INSERT INTO public.product_updates (title, description, category, released_on, is_published)
VALUES (
  'Adiar sem dizer a hora',
  'Já podes dizer "a proposta à Joana passou para segunda-feira" sem indicar hora: o item muda de dia e mantém a hora que tinha (ou continua sem hora). E quando falta algum detalhe para guardar, o Afonso pergunta o que falta em vez de dizer apenas que não conseguiu.',
  'correcao',
  current_date,
  true
);

-- ===== origem: 20260925075734_19770889-c5e4-4613-aa0d-45a193178d45.sql =====
DROP POLICY IF EXISTS "Authenticated read flags" ON public.feature_flags;
CREATE POLICY "Admins read flags" ON public.feature_flags FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ===== origem: 0000_proactive_daily_cap_and_opportunity_nudges.sql =====
-- Fase 1 ACI: teto de intervenções não solicitadas + prioridade/evidência por aviso.
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS max_unsolicited_nudges_per_day integer NOT NULL DEFAULT 1;

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_max_unsolicited_check;
ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_max_unsolicited_check
  CHECK (max_unsolicited_nudges_per_day BETWEEN 0 AND 20);

ALTER TABLE public.assessor_nudges
  ADD COLUMN IF NOT EXISTS priority integer,
  ADD COLUMN IF NOT EXISTS evidence jsonb;

-- Kill switch da entrega de oportunidades no canal. Desligar => volta o resumo agregado antigo.
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES (
  'assessor.opportunity_nudges.v1',
  'Oportunidades comerciais (match comprador-imóvel e negócio parado) entregues uma a uma no canal, com evidência e prioridade. Desligado = resumo diário agregado antigo.',
  true, '{}', 0
)
ON CONFLICT (key) DO NOTHING;

-- ===== origem: 0001_cross_channel_shared_conversation.sql =====
-- Fase 2 ACI V1: conversa partilhada por conta entre WhatsApp e Telegram.
-- Só acrescentos. Com o interruptor assessor.cross_channel.v1 desligado,
-- nada disto é lido e o comportamento por canal mantém-se.

ALTER TABLE public.pending_actions
  ADD COLUMN IF NOT EXISTS presented_channels text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS confirm_token text,
  ADD COLUMN IF NOT EXISTS confirm_token_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_channel text;

COMMENT ON COLUMN public.pending_actions.presented_channels IS 'Canais onde a pergunta deste pendente foi mostrada ao consultor. Vazio = só o canal de origem (coluna channel).';
COMMENT ON COLUMN public.pending_actions.confirm_token IS 'Reserva atómica de confirmação: só um turno de cada vez pode confirmar este pendente.';
COMMENT ON COLUMN public.pending_actions.resolved_channel IS 'Canal onde o consultor confirmou/recusou (pode diferir da origem).';

ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS last_channel text;

COMMENT ON COLUMN public.conversation_states.last_channel IS 'Canal da última escrita no estado partilhado da conta (linha channel=account).';

CREATE INDEX IF NOT EXISTS pending_actions_user_status_created_idx
  ON public.pending_actions (user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_pending_confirmation(
  _user_id uuid, _ids uuid[], _token text, _ttl_seconds integer DEFAULT 120
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET confirm_token = _token,
         confirm_token_at = now()
   WHERE user_id = _user_id
     AND id = ANY(_ids)
     AND status IN ('pending_confirmation','collecting_information','correction_pending')
     AND (confirm_token IS NULL
          OR confirm_token = _token
          OR confirm_token_at < now() - make_interval(secs => _ttl_seconds));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pending_confirmation(
  _user_id uuid, _token text, _channel text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET confirm_token = NULL,
         confirm_token_at = NULL,
         resolved_channel = CASE
           WHEN status IN ('executed','cancelled','corrected','failed')
             THEN coalesce(resolved_channel, _channel)
           ELSE resolved_channel
         END
   WHERE user_id = _user_id
     AND confirm_token = _token;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_pending_presented(
  _user_id uuid, _ids uuid[], _channel text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET presented_channels = array_append(
           CASE WHEN cardinality(presented_channels) = 0 THEN ARRAY[channel] ELSE presented_channels END,
           _channel)
   WHERE user_id = _user_id
     AND id = ANY(_ids)
     AND NOT (_channel = ANY(
           CASE WHEN cardinality(presented_channels) = 0 THEN ARRAY[channel] ELSE presented_channels END));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_confirmation(uuid, uuid[], text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_pending_confirmation(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_pending_presented(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_confirmation(uuid, uuid[], text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pending_confirmation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_pending_presented(uuid, uuid[], text) TO service_role;

-- ===== origem: 0002_pre_pilot_global_cap_deferred_relink.sql =====
-- Correções pré-piloto (após Fase 2). Só acrescentos; cada parte tem
-- interruptor próprio em feature_flags e, desligado, nada disto é lido.

-- (1) Teto global de intervenções NÃO solicitadas por conta/dia ------------
CREATE TABLE IF NOT EXISTS public.proactive_daily_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day date NOT NULL,
  source text NOT NULL,
  ref_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day, ref_key)
);
COMMENT ON TABLE public.proactive_daily_ledger IS 'Vaga diária (dia de Lisboa) de intervenções não solicitadas, partilhada por todos os emissores proativos.';

GRANT SELECT ON public.proactive_daily_ledger TO authenticated;
GRANT ALL ON public.proactive_daily_ledger TO service_role;
ALTER TABLE public.proactive_daily_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Consultor vê as suas vagas" ON public.proactive_daily_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.reserve_unsolicited_slot(
  _user_id uuid, _day date, _source text, _ref_key text, _cap integer DEFAULT 1
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _day::text, 0));
  IF EXISTS (SELECT 1 FROM public.proactive_daily_ledger
              WHERE user_id = _user_id AND day = _day AND ref_key = _ref_key) THEN
    RETURN true; -- mesma intervenção (retry): idempotente
  END IF;
  SELECT count(*) INTO _n FROM public.proactive_daily_ledger
   WHERE user_id = _user_id AND day = _day;
  IF _n >= greatest(coalesce(_cap, 1), 0) THEN
    RETURN false;
  END IF;
  INSERT INTO public.proactive_daily_ledger (user_id, day, source, ref_key)
  VALUES (_user_id, _day, _source, _ref_key);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_unsolicited_slot(
  _user_id uuid, _day date, _ref_key text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.proactive_daily_ledger
   WHERE user_id = _user_id AND day = _day AND ref_key = _ref_key;
$$;

REVOKE ALL ON FUNCTION public.reserve_unsolicited_slot(uuid, date, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_unsolicited_slot(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_unsolicited_slot(uuid, date, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_unsolicited_slot(uuid, date, text) TO service_role;

-- Notificações explicitamente ativadas pelo consultor.
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS explicit_opt_ins text[] NOT NULL DEFAULT '{}'::text[];
COMMENT ON COLUMN public.consultant_preferences.explicit_opt_ins IS 'Notificações que o consultor ligou explicitamente (morning_briefing, evening_review, push). Ligado por defeito não conta.';

-- Backfill: proactive_push_enabled é desligado por defeito, por isso estar
-- ligado é prova de ativação explícita.
UPDATE public.consultant_preferences
   SET explicit_opt_ins = ARRAY['push']::text[]
 WHERE proactive_push_enabled IS TRUE
   AND NOT ('push' = ANY(explicit_opt_ins));

CREATE OR REPLACE FUNCTION public.consultant_preferences_track_opt_ins()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.proactive_push_enabled IS TRUE AND NOT ('push' = ANY(NEW.explicit_opt_ins)) THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'push');
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.morning_briefing_enabled IS DISTINCT FROM OLD.morning_briefing_enabled THEN
    NEW.explicit_opt_ins := array_remove(NEW.explicit_opt_ins, 'morning_briefing');
    IF NEW.morning_briefing_enabled IS TRUE THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'morning_briefing');
    END IF;
  END IF;
  IF NEW.evening_wrap_enabled IS DISTINCT FROM OLD.evening_wrap_enabled THEN
    NEW.explicit_opt_ins := array_remove(NEW.explicit_opt_ins, 'evening_review');
    IF NEW.evening_wrap_enabled IS TRUE THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'evening_review');
    END IF;
  END IF;
  IF NEW.proactive_push_enabled IS DISTINCT FROM OLD.proactive_push_enabled THEN
    NEW.explicit_opt_ins := array_remove(NEW.explicit_opt_ins, 'push');
    IF NEW.proactive_push_enabled IS TRUE THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'push');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consultant_preferences_track_opt_ins ON public.consultant_preferences;
CREATE TRIGGER consultant_preferences_track_opt_ins
  BEFORE INSERT OR UPDATE ON public.consultant_preferences
  FOR EACH ROW EXECUTE FUNCTION public.consultant_preferences_track_opt_ins();

-- (2) Mensagens adiadas por falta de lock (conversa partilhada) ------------
CREATE INDEX IF NOT EXISTS assessor_messages_deferred_lock_idx
  ON public.assessor_messages (created_at)
  WHERE status = 'deferred_lock';

-- (3) Ligação segura de um canal já associado a outra conta ----------------
ALTER TABLE public.telegram_pairings
  ADD COLUMN IF NOT EXISTS source_user_id uuid;
COMMENT ON COLUMN public.telegram_pairings.source_user_id IS 'Conta atual deste chat quando o consultor pede para o ligar a outra conta (nunca há fusão automática).';

-- ===== origem: 0003_early_access_invites.sql =====
-- Early Access por convite (fase 1). Tudo aditivo; interruptores desligados.
CREATE TABLE public.account_access (
  user_id uuid PRIMARY KEY,
  state text NOT NULL DEFAULT 'registered_waiting',
  invite_id uuid,
  source text,
  activated_at timestamptz,
  trial_started_at timestamptz,
  waitlist_offered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_access_state_chk CHECK (state IN ('registered_waiting','invited','activated','trialing','subscribed'))
);
GRANT SELECT ON public.account_access TO authenticated;
GRANT ALL ON public.account_access TO service_role;
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own access read" ON public.account_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE TABLE public.access_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  issuer_user_id uuid,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  note text,
  expires_at timestamptz NOT NULL,
  used_by uuid,
  used_at timestamptz,
  used_channel text,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_invites_source_chk CHECK (source IN ('beta_tester','admin')),
  CONSTRAINT access_invites_status_chk CHECK (status IN ('issued','used','revoked'))
);
CREATE INDEX access_invites_issuer_idx ON public.access_invites (issuer_user_id, status);
GRANT SELECT ON public.access_invites TO authenticated;
GRANT ALL ON public.access_invites TO service_role;
ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin invites read" ON public.access_invites FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.access_invite_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text,
  ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_invite_attempts_user_idx ON public.access_invite_attempts (user_id, created_at DESC);
GRANT ALL ON public.access_invite_attempts TO service_role;
ALTER TABLE public.access_invite_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin attempts read" ON public.access_invite_attempts FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
GRANT SELECT ON public.access_invite_attempts TO authenticated;

CREATE TABLE public.access_waitlist (
  user_id uuid PRIMARY KEY,
  channel text,
  consent_contact boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  notify boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_waitlist_status_chk CHECK (status IN ('waiting','granted','removed'))
);
GRANT SELECT ON public.access_waitlist TO authenticated;
GRANT ALL ON public.access_waitlist TO service_role;
ALTER TABLE public.access_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist read" ON public.access_waitlist FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Contas criadas com o gate global ligado nascem em espera (qualquer via).
CREATE OR REPLACE FUNCTION public.account_access_on_new_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.feature_flags
             WHERE key = 'access.early_access_gate.v1' AND enabled_globally = true) THEN
    INSERT INTO public.account_access (user_id, state, source)
    VALUES (NEW.id, 'registered_waiting', 'signup') ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_account_access_new
AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.account_access_on_new_profile();

-- Consumo atómico: no máximo um sucesso por convite.
CREATE OR REPLACE FUNCTION public.consume_access_invite(_token_hash text, _user_id uuid, _channel text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  UPDATE public.access_invites
     SET status = 'used', used_by = _user_id, used_at = now(), used_channel = _channel
   WHERE token_hash = _token_hash AND status = 'issued' AND expires_at > now()
     AND (issuer_user_id IS NULL OR issuer_user_id <> _user_id)
  RETURNING id INTO _id;
  IF _id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.account_access (user_id, state, invite_id, source, activated_at, updated_at)
  VALUES (_user_id, 'activated', _id, 'invite', now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET state = 'activated', invite_id = _id, source = 'invite', activated_at = now(), updated_at = now()
    WHERE public.account_access.state IN ('registered_waiting','invited');
  RETURN _id;
END $$;

-- Emissão por beta tester com quota atómica (vivos + usados < quota).
CREATE OR REPLACE FUNCTION public.issue_referral_invite(_issuer uuid, _token_hash text, _ttl_days integer, _quota integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('referral:' || _issuer::text));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _issuer AND is_beta_tester = true
                 AND (beta_expires_at IS NULL OR beta_expires_at > now())) THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO _n FROM public.access_invites
   WHERE issuer_user_id = _issuer AND source = 'beta_tester'
     AND (status = 'used' OR (status = 'issued' AND expires_at > now()));
  IF _n >= _quota THEN RETURN NULL; END IF;
  INSERT INTO public.access_invites (token_hash, issuer_user_id, source, expires_at)
  VALUES (_token_hash, _issuer, 'beta_tester', now() + make_interval(days => _ttl_days))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.consume_access_invite(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_referral_invite(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_invite(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_referral_invite(uuid, text, integer, integer) TO service_role;

INSERT INTO public.feature_flags (key, enabled_globally, description)
VALUES
  ('access.early_access_gate.v1', false, 'Early access: contas novas sem convite ficam em espera'),
  ('access.referral_invites.v1', false, 'Beta testers geram convites (3, 7 dias) em conversa'),
  ('access.waitlist.v1', false, 'Lista de espera com consentimento na conversa')
ON CONFLICT (key) DO NOTHING;

-- ===== origem: 0004_pilot_v2_entitlement_and_invites.sql =====
-- Piloto AFONSO 2.0: participação própria (independente de beta/plano/canais)
-- e convites do piloto com teto próprio. Tudo aditivo; interruptores desligados;
-- piloto em 'no_go' (a base de dados recusa emitir convites enquanto assim estiver).
CREATE TABLE public.pilots (
  key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'no_go',
  invite_issuer_user_id uuid,
  invite_cap integer NOT NULL DEFAULT 2,
  invite_ttl_days integer NOT NULL DEFAULT 7,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilots_status_chk CHECK (status IN ('no_go','go','closed')),
  CONSTRAINT pilots_cap_chk CHECK (invite_cap >= 0),
  CONSTRAINT pilots_ttl_chk CHECK (invite_ttl_days BETWEEN 1 AND 30)
);
GRANT SELECT ON public.pilots TO authenticated;
GRANT ALL ON public.pilots TO service_role;
ALTER TABLE public.pilots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin pilots read" ON public.pilots FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.pilot_participants (
  pilot_key text NOT NULL REFERENCES public.pilots(key),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL,
  invite_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pilot_key, user_id),
  CONSTRAINT pilot_participants_status_chk CHECK (status IN ('active','excluded')),
  CONSTRAINT pilot_participants_source_chk CHECK (source IN ('seed','invite','admin'))
);
GRANT SELECT ON public.pilot_participants TO authenticated;
GRANT ALL ON public.pilot_participants TO service_role;
ALTER TABLE public.pilot_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot participant read" ON public.pilot_participants FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Convites do piloto vivem na mesma tabela, com origem própria ('pilot'),
-- para não contarem na quota geral de beta testers.
ALTER TABLE public.access_invites
  ADD COLUMN pilot_key text REFERENCES public.pilots(key),
  ADD COLUMN idempotency_key text;
ALTER TABLE public.access_invites DROP CONSTRAINT access_invites_source_chk;
ALTER TABLE public.access_invites ADD CONSTRAINT access_invites_source_chk
  CHECK (source IN ('beta_tester','admin','pilot'));
ALTER TABLE public.access_invites ADD CONSTRAINT access_invites_pilot_chk
  CHECK ((source = 'pilot') = (pilot_key IS NOT NULL));
CREATE UNIQUE INDEX access_invites_idem_uidx ON public.access_invites (issuer_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX access_invites_pilot_idx ON public.access_invites (pilot_key, status) WHERE pilot_key IS NOT NULL;

-- Emissão de convite do piloto: só o emissor designado, só com o piloto em 'go',
-- teto vivos+usados < invite_cap, idempotente por chave, serializada por piloto.
CREATE OR REPLACE FUNCTION public.issue_pilot_invite(_pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text)
RETURNS TABLE (out_invite_id uuid, out_outcome text, out_remaining integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.pilots%ROWTYPE; _id uuid; _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pilot-invites:' || _pilot_key));
  SELECT * INTO _p FROM public.pilots WHERE key = _pilot_key FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, 'no_pilot'::text, 0; RETURN; END IF;
  IF _p.invite_issuer_user_id IS NULL OR _p.invite_issuer_user_id <> _issuer THEN
    RETURN QUERY SELECT NULL::uuid, 'not_issuer'::text, 0; RETURN;
  END IF;
  SELECT count(*) INTO _n FROM public.access_invites
   WHERE pilot_key = _pilot_key AND (status = 'used' OR (status = 'issued' AND expires_at > now()));
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _id FROM public.access_invites
     WHERE issuer_user_id = _issuer AND idempotency_key = _idempotency_key;
    IF _id IS NOT NULL THEN
      RETURN QUERY SELECT _id, 'replayed'::text, GREATEST(_p.invite_cap - _n, 0); RETURN;
    END IF;
  END IF;
  IF _p.status <> 'go' THEN RETURN QUERY SELECT NULL::uuid, 'not_open'::text, 0; RETURN; END IF;
  IF _n >= _p.invite_cap THEN RETURN QUERY SELECT NULL::uuid, 'cap_reached'::text, 0; RETURN; END IF;
  INSERT INTO public.access_invites (token_hash, issuer_user_id, source, pilot_key, idempotency_key, expires_at)
  VALUES (_token_hash, _issuer, 'pilot', _pilot_key, _idempotency_key, now() + make_interval(days => _p.invite_ttl_days))
  RETURNING id INTO _id;
  RETURN QUERY SELECT _id, 'issued'::text, _p.invite_cap - _n - 1;
END $$;

-- Convite do piloto usado => o convidado entra no piloto (sem tocar em beta/plano).
CREATE OR REPLACE FUNCTION public.pilot_participant_on_invite_used()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pilot_key IS NOT NULL AND NEW.status = 'used' AND OLD.status IS DISTINCT FROM 'used'
     AND NEW.used_by IS NOT NULL THEN
    INSERT INTO public.pilot_participants (pilot_key, user_id, status, source, invite_id)
    VALUES (NEW.pilot_key, NEW.used_by, 'active', 'invite', NEW.id)
    ON CONFLICT (pilot_key, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_invites_pilot_participant
AFTER UPDATE OF status ON public.access_invites FOR EACH ROW
EXECUTE FUNCTION public.pilot_participant_on_invite_used();

REVOKE ALL ON FUNCTION public.issue_pilot_invite(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_participant_on_invite_used() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_pilot_invite(text, uuid, text, text) TO service_role;

-- [retirado na montagem de staging: dados de produção]

INSERT INTO public.feature_flags (key, enabled_globally, description)
VALUES
  ('pilot.v2_entitlement.v1', false, 'Funções AFONSO 2.0 só para participantes ativos do piloto'),
  ('pilot.v2_invites.v1', false, 'Emissor do piloto gera convites do piloto (teto próprio) em conversa')
ON CONFLICT (key) DO NOTHING;

-- ===== origem: 0005_pilot_invites_admin_rbac_and_guards.sql =====
ALTER TABLE public.access_invites ADD COLUMN issued_via text;

DROP FUNCTION IF EXISTS public.issue_pilot_invite(text, uuid, text, text);

-- Emissão única para conversa e administração: emissor designado ou super_admin,
-- piloto em 'go', teto global do piloto (vivos + usados), 7 dias, idempotência, serializada.
CREATE OR REPLACE FUNCTION public.issue_pilot_invite(
  _pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text,
  _note text DEFAULT NULL, _issued_via text DEFAULT NULL)
RETURNS TABLE (out_invite_id uuid, out_outcome text, out_remaining integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.pilots%ROWTYPE; _id uuid; _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pilot-invites:' || _pilot_key));
  SELECT * INTO _p FROM public.pilots WHERE key = _pilot_key FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, 'no_pilot'::text, 0; RETURN; END IF;
  IF _issuer IS NULL OR NOT (_p.invite_issuer_user_id = _issuer OR public.has_role(_issuer, 'super_admin')) THEN
    RETURN QUERY SELECT NULL::uuid, 'not_issuer'::text, 0; RETURN;
  END IF;
  SELECT count(*) INTO _n FROM public.access_invites
   WHERE pilot_key = _pilot_key AND (status = 'used' OR (status = 'issued' AND expires_at > now()));
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _id FROM public.access_invites
     WHERE issuer_user_id = _issuer AND idempotency_key = _idempotency_key;
    IF _id IS NOT NULL THEN
      RETURN QUERY SELECT _id, 'replayed'::text, GREATEST(_p.invite_cap - _n, 0); RETURN;
    END IF;
  END IF;
  IF _p.status <> 'go' THEN RETURN QUERY SELECT NULL::uuid, 'not_open'::text, 0; RETURN; END IF;
  IF _n >= _p.invite_cap THEN RETURN QUERY SELECT NULL::uuid, 'cap_reached'::text, 0; RETURN; END IF;
  PERFORM set_config('afonso.pilot_invite_write', 'on', true);
  INSERT INTO public.access_invites (token_hash, issuer_user_id, source, pilot_key, idempotency_key, note, issued_via, expires_at)
  VALUES (_token_hash, _issuer, 'pilot', _pilot_key, _idempotency_key, left(_note, 200), _issued_via,
          now() + make_interval(days => _p.invite_ttl_days))
  RETURNING id INTO _id;
  PERFORM set_config('afonso.pilot_invite_write', 'off', true);
  RETURN QUERY SELECT _id, 'issued'::text, _p.invite_cap - _n - 1;
END $$;

-- Anulação única: quem emitiu, o emissor designado ou super_admin; só convites por usar.
CREATE OR REPLACE FUNCTION public.revoke_pilot_invite(_pilot_key text, _actor uuid, _invite_id uuid, _token_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv public.access_invites%ROWTYPE; _designated uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pilot-invites:' || _pilot_key));
  SELECT invite_issuer_user_id INTO _designated FROM public.pilots WHERE key = _pilot_key;
  SELECT * INTO _inv FROM public.access_invites
   WHERE pilot_key = _pilot_key
     AND ((_invite_id IS NOT NULL AND id = _invite_id) OR (_token_hash IS NOT NULL AND token_hash = _token_hash))
   FOR UPDATE;
  IF NOT FOUND OR _actor IS NULL THEN RETURN 'not_found'; END IF;
  IF NOT (_inv.issuer_user_id = _actor OR _designated = _actor OR public.has_role(_actor, 'super_admin')) THEN
    RETURN 'not_found';
  END IF;
  IF _inv.status <> 'issued' THEN RETURN 'not_found'; END IF;
  PERFORM set_config('afonso.pilot_invite_write', 'on', true);
  UPDATE public.access_invites SET status = 'revoked', revoked_at = now(), revoked_by = _actor WHERE id = _inv.id;
  PERFORM set_config('afonso.pilot_invite_write', 'off', true);
  RETURN 'revoked';
END $$;

-- Guarda: convites do piloto só nascem/anulam pelas funções acima; uso só issued->used;
-- nada se reativa, prolonga ou muda de piloto/origem.
CREATE OR REPLACE FUNCTION public.access_invites_pilot_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _via_fn boolean := coalesce(current_setting('afonso.pilot_invite_write', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'pilot' AND NOT _via_fn THEN
      RAISE EXCEPTION 'pilot invites are issued only through issue_pilot_invite' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.source = 'pilot' OR NEW.source = 'pilot' THEN
    IF NEW.source IS DISTINCT FROM OLD.source OR NEW.pilot_key IS DISTINCT FROM OLD.pilot_key
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.issuer_user_id IS DISTINCT FROM OLD.issuer_user_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'pilot invite fields are immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'issued' AND (NEW.status = 'used' OR (NEW.status = 'revoked' AND _via_fn))) THEN
        RAISE EXCEPTION 'pilot invite status change not allowed' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_invites_pilot_guard
BEFORE INSERT OR UPDATE ON public.access_invites FOR EACH ROW
EXECUTE FUNCTION public.access_invites_pilot_guard();

-- Guarda: um lugar ativo no piloto só se ganha com um convite do piloto usado pela própria pessoa.
CREATE OR REPLACE FUNCTION public.pilot_participants_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pilot_key IS DISTINCT FROM OLD.pilot_key OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'pilot participant identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'active' AND OLD.status <> 'active' THEN
      RAISE EXCEPTION 'pilot seats are granted only by a used pilot invite' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'active' AND NOT (
       NEW.source = 'invite' AND EXISTS (
         SELECT 1 FROM public.access_invites
          WHERE id = NEW.invite_id AND pilot_key = NEW.pilot_key AND status = 'used' AND used_by = NEW.user_id)) THEN
    RAISE EXCEPTION 'pilot seats are granted only by a used pilot invite' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pilot_participants_guard
BEFORE INSERT OR UPDATE ON public.pilot_participants FOR EACH ROW
EXECUTE FUNCTION public.pilot_participants_guard();

REVOKE ALL ON FUNCTION public.issue_pilot_invite(text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_pilot_invite(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_pilot_invite(text, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_pilot_invite(text, uuid, uuid, text) TO service_role;

-- ===== origem: 0006_inbound_message_claims.sql =====
CREATE TABLE public.inbound_message_claims (
  channel text NOT NULL,
  external_message_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (channel, external_message_id)
);
GRANT SELECT ON public.inbound_message_claims TO authenticated;
GRANT ALL ON public.inbound_message_claims TO service_role;
ALTER TABLE public.inbound_message_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read inbound claims" ON public.inbound_message_claims
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX inbound_message_claims_claimed_at_idx ON public.inbound_message_claims (claimed_at);

CREATE OR REPLACE FUNCTION public.claim_inbound_message(_channel text, _external_id text, _stale_seconds integer DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok boolean;
BEGIN
  IF _channel IS NULL OR _external_id IS NULL OR length(_external_id) = 0 THEN
    RETURN true;
  END IF;
  INSERT INTO public.inbound_message_claims AS c (channel, external_message_id)
  VALUES (_channel, _external_id)
  ON CONFLICT (channel, external_message_id) DO UPDATE
    SET claimed_at = now(), attempts = c.attempts + 1
    WHERE c.claimed_at < now() - make_interval(secs => greatest(_stale_seconds, 60))
      AND NOT EXISTS (SELECT 1 FROM public.assessor_messages m WHERE m.whatsapp_message_id = _external_id)
  RETURNING true INTO _ok;
  RETURN coalesce(_ok, false);
END $$;
REVOKE ALL ON FUNCTION public.claim_inbound_message(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inbound_message(text, text, integer) TO service_role;

-- ===== origem: 0007_revoke_trigger_fn_execute.sql =====
REVOKE EXECUTE ON FUNCTION public.account_access_on_new_profile() FROM PUBLIC, anon, authenticated;

-- ===== origem: 0008_billing_env_segregation.sql =====
CREATE TABLE public.billing_test_accounts (
  user_id uuid PRIMARY KEY,
  added_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_test_accounts TO authenticated;
GRANT ALL ON public.billing_test_accounts TO service_role;
ALTER TABLE public.billing_test_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can read billing test accounts" ON public.billing_test_accounts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS stripe_event_created timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_last_event_at timestamptz;

CREATE OR REPLACE FUNCTION public.profiles_restrict_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR coalesce(current_setting('app.system_job', true), '') = 'on'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.is_beta_tester IS DISTINCT FROM OLD.is_beta_tester
     OR NEW.beta_expires_at IS DISTINCT FROM OLD.beta_expires_at
     OR NEW.account_kind IS DISTINCT FROM OLD.account_kind
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
     OR NEW.whatsapp_link_status IS DISTINCT FROM OLD.whatsapp_link_status
     OR NEW.whatsapp_linked_at IS DISTINCT FROM OLD.whatsapp_linked_at
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at
     OR NEW.trial_tier IS DISTINCT FROM OLD.trial_tier
     OR NEW.trial_status IS DISTINCT FROM OLD.trial_status
     OR NEW.trial_warned_at IS DISTINCT FROM OLD.trial_warned_at
     OR NEW.telegram_retention_warned_at IS DISTINCT FROM OLD.telegram_retention_warned_at
     OR NEW.billing_status IS DISTINCT FROM OLD.billing_status
     OR NEW.billing_source IS DISTINCT FROM OLD.billing_source
     OR NEW.billing_environment IS DISTINCT FROM OLD.billing_environment
     OR NEW.billing_manual_lock IS DISTINCT FROM OLD.billing_manual_lock
     OR NEW.billing_last_event_at IS DISTINCT FROM OLD.billing_last_event_at
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_price_id IS DISTINCT FROM OLD.stripe_price_id THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ===== origem: 0009_pilot_invite_deliveries.sql =====
CREATE TABLE public.pilot_invite_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_key text NOT NULL REFERENCES public.pilots(key),
  recipient_user_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'issuing',
  invite_id uuid,
  requested_by uuid NOT NULL,
  provider_message_id text,
  error_code text,
  error_reason text,
  attempts integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilot_invite_deliveries_channel_chk CHECK (channel IN ('whatsapp','telegram')),
  CONSTRAINT pilot_invite_deliveries_status_chk CHECK (status IN ('issuing','accepted','sent','delivered','read','failed','blocked')),
  CONSTRAINT pilot_invite_deliveries_recipient_uniq UNIQUE (pilot_key, recipient_user_id)
);
GRANT SELECT ON public.pilot_invite_deliveries TO authenticated;
GRANT ALL ON public.pilot_invite_deliveries TO service_role;
ALTER TABLE public.pilot_invite_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read pilot invite deliveries" ON public.pilot_invite_deliveries
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX pilot_invite_deliveries_provider_msg_idx ON public.pilot_invite_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE TRIGGER pilot_invite_deliveries_set_updated_at BEFORE UPDATE ON public.pilot_invite_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
