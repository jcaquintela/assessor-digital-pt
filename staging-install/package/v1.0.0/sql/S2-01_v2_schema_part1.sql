-- S2-01 · esquema V2, parte 1 de 2
-- Gerado por scripts/staging/build-staging-schema.ts para o projeto AFONSO Staging.
-- NÃO EXECUTAR neste projeto (produção/V1). Aplicar só no staging, por ordem, um bloco por migração.

-- ===== origem: 20260724162530_54e52f0f-906e-4109-8c16-e9173d61e21d.sql =====
-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- properties (declared before opportunities to allow FK)
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_person_id uuid,
  title text NOT NULL,
  property_type text NOT NULL DEFAULT 'T2',
  location text,
  value numeric(12,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'Angariado',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own properties" ON public.properties FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX properties_user_idx ON public.properties(user_id);

-- people
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  relationship_type text NOT NULL DEFAULT 'Potencial',
  summary text,
  next_action text,
  next_action_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own people" ON public.people FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER people_set_updated_at BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX people_user_idx ON public.people(user_id);

-- Add FK from properties.owner_person_id → people(id)
ALTER TABLE public.properties
  ADD CONSTRAINT properties_owner_person_fk
  FOREIGN KEY (owner_person_id) REFERENCES public.people(id) ON DELETE SET NULL;

-- opportunities
CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'Compra',
  status text NOT NULL DEFAULT 'Novo',
  value numeric(12,2) DEFAULT 0,
  probability text NOT NULL DEFAULT 'Média',
  next_action text,
  next_action_date timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own opportunities" ON public.opportunities FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER opportunities_set_updated_at BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX opportunities_user_idx ON public.opportunities(user_id);

-- follow_ups
CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'task',
  title text NOT NULL,
  due_date timestamptz NOT NULL DEFAULT now(),
  due_time text,
  status text NOT NULL DEFAULT 'Pendente',
  priority text NOT NULL DEFAULT 'Média',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own follow_ups" ON public.follow_ups FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER follow_ups_set_updated_at BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX follow_ups_user_idx ON public.follow_ups(user_id);
CREATE INDEX follow_ups_due_idx ON public.follow_ups(user_id, due_date);

-- interactions
CREATE TABLE public.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  source_channel text NOT NULL DEFAULT 'web',
  original_content text,
  summary text,
  interaction_type text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interactions TO authenticated;
GRANT ALL ON public.interactions TO service_role;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interactions" ON public.interactions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX interactions_user_idx ON public.interactions(user_id);

-- financial_movements
CREATE TABLE public.financial_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  type text NOT NULL,
  description text NOT NULL,
  category text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2),
  status text NOT NULL DEFAULT 'Prevista',
  movement_date timestamptz NOT NULL DEFAULT now(),
  expected_payment_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_movements TO authenticated;
GRANT ALL ON public.financial_movements TO service_role;
ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own movements" ON public.financial_movements FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER movements_set_updated_at BEFORE UPDATE ON public.financial_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX movements_user_idx ON public.financial_movements(user_id);

-- assessor_messages
CREATE TABLE public.assessor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  message_type text,
  structured_payload jsonb,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessor_messages TO authenticated;
GRANT ALL ON public.assessor_messages TO service_role;
ALTER TABLE public.assessor_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.assessor_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX messages_user_idx ON public.assessor_messages(user_id, created_at);

-- ===== origem: 20260724162541_8a6e7b8a-4b15-45e2-bec8-457d36d0e8f7.sql =====
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ===== origem: 20260724165431_369619b8-6992-49fc-9ad5-78f2978c91e3.sql =====
-- 1. app_role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('consultant','support_admin','super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policy for authenticated: only service_role can mutate.

-- 3. has_role / is_admin
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','support_admin')
  );
$$;

-- Allow admins to read all roles (for admin UI)
DROP POLICY IF EXISTS "Admins read all roles" ON public.user_roles;
CREATE POLICY "Admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 4. admin_audit_logs (append-only via service_role)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resource_type text,
  resource_id text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit" ON public.admin_audit_logs;
CREATE POLICY "Admins read audit" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
-- No INSERT/UPDATE/DELETE from authenticated (append-only via service_role server functions)

-- 5. feature_flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  description text,
  enabled_globally boolean NOT NULL DEFAULT false,
  enabled_plans text[] NOT NULL DEFAULT '{}',
  rollout_percentage int NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read flags" ON public.feature_flags;
CREATE POLICY "Authenticated read flags" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.feature_flag_users (
  flag_key text NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (flag_key, user_id)
);
GRANT SELECT ON public.feature_flag_users TO authenticated;
GRANT ALL ON public.feature_flag_users TO service_role;
ALTER TABLE public.feature_flag_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User reads own flag membership" ON public.feature_flag_users;
CREATE POLICY "User reads own flag membership" ON public.feature_flag_users
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 6. admin_mfa_required (placeholder for future enforcement)
CREATE TABLE IF NOT EXISTS public.admin_mfa_required (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  required_at timestamptz NOT NULL DEFAULT now(),
  required_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.admin_mfa_required TO authenticated;
GRANT ALL ON public.admin_mfa_required TO service_role;
ALTER TABLE public.admin_mfa_required ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read mfa flags" ON public.admin_mfa_required;
CREATE POLICY "Admins read mfa flags" ON public.admin_mfa_required
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR auth.uid() = user_id);

-- 7. Seed 'consultant' role on new users (extend existing handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (NEW.id, 'consultant', NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (it should, but be safe)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Backfill 'consultant' for existing users without any role
INSERT INTO public.user_roles (user_id, role, created_by)
SELECT u.id, 'consultant'::public.app_role, u.id
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT DO NOTHING;

-- ===== origem: 20260724165453_9fc55051-a1ba-44ee-bd05-bf0aa268b91f.sql =====
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- ===== origem: 20260724174117_7a867b0c-ef4b-428c-acfa-fe9d228fb2dd.sql =====
-- 1. Add account_kind to profiles for real/demo indicator
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_kind text NOT NULL DEFAULT 'real' CHECK (account_kind IN ('real','demo'));

-- 2. Secure user_roles: only admins can INSERT/UPDATE/DELETE (privilege escalation fix)
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- 3. Force RLS on all user-data tables (defence in depth)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.people FORCE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.assessor_messages FORCE ROW LEVEL SECURITY;

-- ===== origem: 20260726172308_2bdca0cc-f645-4376-b100-4d64d1d5c35e.sql =====
ALTER TABLE public.assessor_messages
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS sender_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS assessor_messages_wa_msg_id_uniq
  ON public.assessor_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assessor_messages_channel_created_idx
  ON public.assessor_messages (channel, created_at DESC);

-- ===== origem: 20260726173141_c68e6fd8-9751-4ef2-9742-1688b826d38a.sql =====
-- 1) Extend profiles with WhatsApp linking metadata
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_link_status TEXT NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS whatsapp_linked_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_whatsapp_link_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_whatsapp_link_status_check
  CHECK (whatsapp_link_status IN ('unlinked','pending','linked'));

-- Only one account can own a linked phone at a time
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_linked_unique
  ON public.profiles (phone)
  WHERE whatsapp_link_status = 'linked';

-- 2) whatsapp_link_codes table
CREATE TABLE IF NOT EXISTS public.whatsapp_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_link_codes TO authenticated;
GRANT ALL ON public.whatsapp_link_codes TO service_role;

ALTER TABLE public.whatsapp_link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own link codes read" ON public.whatsapp_link_codes;
CREATE POLICY "own link codes read"
  ON public.whatsapp_link_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies for authenticated: mutations happen server-side only.

CREATE INDEX IF NOT EXISTS whatsapp_link_codes_hash_idx
  ON public.whatsapp_link_codes (code_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_link_codes_user_active_idx
  ON public.whatsapp_link_codes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_link_codes_phone_active_idx
  ON public.whatsapp_link_codes (phone)
  WHERE used_at IS NULL;

-- ===== origem: 20260726174304_44c81fec-2c6c-4886-8e51-9d8b0b89d4c6.sql =====
CREATE TABLE IF NOT EXISTS public.whatsapp_send_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  to_phone TEXT NOT NULL,
  phone_number_id TEXT,
  http_status INTEGER,
  ok BOOLEAN NOT NULL DEFAULT false,
  message_id TEXT,
  error_code INTEGER,
  error_subcode INTEGER,
  error_type TEXT,
  error_message TEXT,
  fbtrace_id TEXT,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'auto'
);
GRANT SELECT ON public.whatsapp_send_logs TO authenticated;
GRANT ALL ON public.whatsapp_send_logs TO service_role;
ALTER TABLE public.whatsapp_send_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read whatsapp send logs"
  ON public.whatsapp_send_logs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS whatsapp_send_logs_created_idx
  ON public.whatsapp_send_logs (created_at DESC);

-- ===== origem: 20260726180628_1fbc8abf-076b-4522-9644-09f3690f8912.sql =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assessor_name text NOT NULL DEFAULT 'Assessor';

CREATE TABLE IF NOT EXISTS public.assessor_ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  channel text NOT NULL,
  model text NOT NULL,
  intent text,
  confidence numeric,
  input_tokens int,
  output_tokens int,
  total_tokens int,
  latency_ms int,
  success boolean NOT NULL DEFAULT true,
  error text,
  estimated_cost_usd numeric
);

GRANT SELECT ON public.assessor_ai_logs TO authenticated;
GRANT ALL ON public.assessor_ai_logs TO service_role;
ALTER TABLE public.assessor_ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read AI logs" ON public.assessor_ai_logs
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS assessor_ai_logs_created_at_idx ON public.assessor_ai_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS assessor_ai_logs_user_id_idx ON public.assessor_ai_logs (user_id);

-- ===== origem: 20260726183637_3b20b68e-3169-4920-99ad-ecb7a7edfb7b.sql =====
CREATE TABLE public.miscellaneous_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_content TEXT,
  summary TEXT,
  category TEXT,
  source_channel TEXT NOT NULL DEFAULT 'web',
  source_message_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'inbox',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  related_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  related_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  related_opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT miscellaneous_items_status_check CHECK (status IN ('inbox','reviewed','classified','archived','deleted'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.miscellaneous_items TO authenticated;
GRANT ALL ON public.miscellaneous_items TO service_role;

ALTER TABLE public.miscellaneous_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own miscellaneous"
  ON public.miscellaneous_items
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX miscellaneous_items_user_created_idx
  ON public.miscellaneous_items(user_id, created_at DESC);

CREATE TRIGGER miscellaneous_items_set_updated_at
  BEFORE UPDATE ON public.miscellaneous_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260726184857_49fb338e-a4db-4481-9933-b64176eacb08.sql =====
-- ========== pending_actions ==========
CREATE TABLE public.pending_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  source_message_id UUID NULL,
  intent TEXT NOT NULL,
  original_content TEXT NOT NULL,
  structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending_confirmation',
  confidence NUMERIC NULL,
  pending_question TEXT NULL,
  created_resource_type TEXT NULL,
  created_resource_id UUID NULL,
  error_message TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pending_actions_user_channel_status_idx
  ON public.pending_actions (user_id, channel, status, created_at DESC);
CREATE INDEX pending_actions_expires_at_idx
  ON public.pending_actions (expires_at);

-- Trigger de validação (CHECK constraints devem ser imutáveis; usamos trigger).
CREATE OR REPLACE FUNCTION public.pending_actions_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN (
    'collecting_information','pending_confirmation','executing','executed',
    'correction_pending','corrected','cancelled','failed','expired'
  ) THEN
    RAISE EXCEPTION 'pending_actions.status inválido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pending_actions_biu
BEFORE INSERT OR UPDATE ON public.pending_actions
FOR EACH ROW EXECUTE FUNCTION public.pending_actions_validate();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_actions TO authenticated;
GRANT ALL ON public.pending_actions TO service_role;

ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_actions_owner_all"
  ON public.pending_actions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========== conversation_states ==========
CREATE TABLE public.conversation_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  external_conversation_id TEXT NOT NULL DEFAULT 'default',
  active_topic TEXT NULL,
  state_summary TEXT NULL,
  last_intent TEXT NULL,
  last_entity_type TEXT NULL,
  last_entity_id UUID NULL,
  pending_action_id UUID NULL REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  last_created_resource_type TEXT NULL,
  last_created_resource_id UUID NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_states_unique_key
    UNIQUE (user_id, channel, external_conversation_id)
);

CREATE INDEX conversation_states_user_channel_idx
  ON public.conversation_states (user_id, channel);

CREATE OR REPLACE FUNCTION public.conversation_states_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_states_biu
BEFORE INSERT OR UPDATE ON public.conversation_states
FOR EACH ROW EXECUTE FUNCTION public.conversation_states_touch();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_states TO authenticated;
GRANT ALL ON public.conversation_states TO service_role;

ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_states_owner_all"
  ON public.conversation_states
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===== origem: 20260726184920_d208f136-e336-4ab7-8227-93591cf1c156.sql =====
REVOKE EXECUTE ON FUNCTION public.pending_actions_validate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.conversation_states_touch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_actions_validate() TO service_role;
GRANT EXECUTE ON FUNCTION public.conversation_states_touch() TO service_role;

-- ===== origem: 20260726185002_7d4f773e-3cbc-42e8-b4d5-fedad49f40ea.sql =====
ALTER TABLE public.assessor_messages
  ADD COLUMN IF NOT EXISTS conversation_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS related_pending_action_id UUID NULL REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_resource_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS related_resource_id UUID NULL;

CREATE INDEX IF NOT EXISTS assessor_messages_pending_action_idx
  ON public.assessor_messages (related_pending_action_id);
CREATE INDEX IF NOT EXISTS assessor_messages_conversation_idx
  ON public.assessor_messages (user_id, channel, conversation_id, created_at DESC);

-- ===== origem: 20260726191910_ef2e90cb-0c1a-4611-a551-2427f5dbd7bc.sql =====
-- Tabela principal
CREATE TABLE public.uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  source_message_id uuid REFERENCES public.assessor_messages(id) ON DELETE SET NULL,
  external_file_id text,
  original_file_name text,
  internal_file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received',
  classification text,
  extracted_text text,
  extracted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_resource_type text,
  related_resource_id uuid,
  related_pending_action_id uuid REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX uploaded_files_user_created_idx ON public.uploaded_files(user_id, created_at DESC);
CREATE INDEX uploaded_files_status_idx ON public.uploaded_files(processing_status);
CREATE INDEX uploaded_files_related_idx ON public.uploaded_files(related_resource_type, related_resource_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_files TO authenticated;
GRANT ALL ON public.uploaded_files TO service_role;

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uploaded_files_owner_select" ON public.uploaded_files
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "uploaded_files_owner_insert" ON public.uploaded_files
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uploaded_files_owner_update" ON public.uploaded_files
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uploaded_files_owner_delete" ON public.uploaded_files
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER uploaded_files_set_updated_at
  BEFORE UPDATE ON public.uploaded_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies no bucket privado 'assessor-files': utilizador só acede à sua pasta {user_id}/...
CREATE POLICY "assessor_files_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "assessor_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "assessor_files_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "assessor_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ===== origem: 20260726195351_080c89e2-ea4b-467c-85d4-e4383b464a4d.sql =====
ALTER TABLE public.uploaded_files ADD COLUMN IF NOT EXISTS user_description text;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS related_file_id uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_follow_ups_related_file_id ON public.follow_ups(related_file_id);
ALTER TABLE public.pending_actions ADD COLUMN IF NOT EXISTS current_question text;

-- ===== origem: 20260726200507_a6cceed6-3fec-4811-95ab-38bee5c5212f.sql =====
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS typology text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS parish text,
  ADD COLUMN IF NOT EXISTS asking_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS area_gross numeric(10,2),
  ADD COLUMN IF NOT EXISTS area_useful numeric(10,2),
  ADD COLUMN IF NOT EXISTS bedrooms integer,
  ADD COLUMN IF NOT EXISTS bathrooms integer,
  ADD COLUMN IF NOT EXISTS parking integer,
  ADD COLUMN IF NOT EXISTS energy_rating text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid;

ALTER TABLE public.properties
  ALTER COLUMN property_type DROP NOT NULL,
  ALTER COLUMN property_type DROP DEFAULT;

CREATE INDEX IF NOT EXISTS properties_user_city_idx ON public.properties (user_id, city);
CREATE INDEX IF NOT EXISTS properties_user_typology_idx ON public.properties (user_id, typology);

ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric;

ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS last_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

-- ===== origem: 20260726201013_1b9d2399-575a-456c-b1f5-87e7c11e207e.sql =====
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS related_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS follow_ups_related_property_id_idx ON public.follow_ups(related_property_id);

-- ===== origem: 20260726212157_c9a238c6-081c-4484-87bd-27ef7aa51538.sql =====
CREATE TABLE public.routines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  interval_n INT NOT NULL DEFAULT 1,
  weekday INT,
  day_of_month INT,
  time_of_day TEXT,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'Média',
  person_id UUID,
  opportunity_id UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT routines_frequency_chk CHECK (frequency IN ('daily','weekly','monthly')),
  CONSTRAINT routines_interval_chk CHECK (interval_n >= 1 AND interval_n <= 365),
  CONSTRAINT routines_weekday_chk CHECK (weekday IS NULL OR (weekday BETWEEN 0 AND 6)),
  CONSTRAINT routines_dom_chk CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routines TO authenticated;
GRANT ALL ON public.routines TO service_role;

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines_owner_all" ON public.routines
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX routines_user_next_idx ON public.routines (user_id, active, next_run_at);

CREATE TRIGGER routines_set_updated_at
  BEFORE UPDATE ON public.routines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260727144120_6fb07ce6-d1ac-4aa8-9045-a3c0f17ca75c.sql =====
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS source_channel text NULL,
  ADD COLUMN IF NOT EXISTS source_message_id text NULL,
  ADD COLUMN IF NOT EXISTS source_pending_action_id uuid NULL,
  ADD COLUMN IF NOT EXISTS timezone text NULL,
  ADD COLUMN IF NOT EXISTS external_reference text NULL,
  ADD COLUMN IF NOT EXISTS created_by_assessor boolean NOT NULL DEFAULT false;

-- Pesquisa por mensagem de origem (WhatsApp/Telegram)
CREATE INDEX IF NOT EXISTS follow_ups_source_message_id_idx
  ON public.follow_ups (source_message_id)
  WHERE source_message_id IS NOT NULL;

-- Métricas agregadas por canal (Super Admin)
CREATE INDEX IF NOT EXISTS follow_ups_source_channel_idx
  ON public.follow_ups (source_channel)
  WHERE source_channel IS NOT NULL;

-- Auditoria por ação pendente + idempotência (mesma pending só cria 1 seguimento)
CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_source_pending_action_id_uidx
  ON public.follow_ups (source_pending_action_id)
  WHERE source_pending_action_id IS NOT NULL;

-- ===== origem: 20260728110445_9c49a708-d5fb-42b7-ab3e-9ecb8607bb39.sql =====
ALTER TABLE public.assessor_ai_logs
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS fallback_used boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS assessor_ai_logs_user_created_idx
  ON public.assessor_ai_logs (user_id, created_at DESC);

-- ===== origem: 20260728111639_63b08577-1fce-4e51-8134-da4d73bf9473.sql =====
-- 1) conversation_states: enriquecimento aditivo
ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS factual_summary text,
  ADD COLUMN IF NOT EXISTS active_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;

-- 2) pending_actions: campos confirmados incrementalmente + objectivo
ALTER TABLE public.pending_actions
  ADD COLUMN IF NOT EXISTS confirmed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS goal text;

-- 3) assessor_ai_logs: telemetria de tool-calling
ALTER TABLE public.assessor_ai_logs
  ADD COLUMN IF NOT EXISTS tool_name text,
  ADD COLUMN IF NOT EXISTS tool_success boolean;

-- 4) auditoria de cada chamada de ferramenta pela IA (v2)
CREATE TABLE IF NOT EXISTS public.assessor_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  turn_id uuid,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  success boolean NOT NULL,
  error text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assessor_tool_calls TO authenticated;
GRANT ALL ON public.assessor_tool_calls TO service_role;
ALTER TABLE public.assessor_tool_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tool calls" ON public.assessor_tool_calls;
CREATE POLICY "own tool calls" ON public.assessor_tool_calls
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS assessor_tool_calls_user_created_idx
  ON public.assessor_tool_calls (user_id, created_at DESC);

-- 5) ligações de calendário (fica vazia; será usada na Fase 3)
CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_account_id text,
  display_name text,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  refresh_token_encrypted text,
  is_primary boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, external_account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_connections TO authenticated;
GRANT ALL ON public.calendar_connections TO service_role;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own calendar connections" ON public.calendar_connections;
CREATE POLICY "own calendar connections" ON public.calendar_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS calendar_connections_touch ON public.calendar_connections;
CREATE TRIGGER calendar_connections_touch
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) feature flag para ligar o Assessor v2 por consultor
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage, updated_at)
VALUES (
  'assessor.engine.v2',
  'Novo motor conversacional do Assessor (Fase 1: IA central com tool-calling via Lovable AI Gateway).',
  false,
  ARRAY[]::text[],
  0,
  now()
) ON CONFLICT (key) DO NOTHING;

-- ===== origem: 20260728195405_9f6cdf04-d094-4413-8521-b400f6704297.sql =====
-- Reasoning Engine v3: telemetria de raciocínio + feature flag global (off).

CREATE TABLE public.assessor_reasoning_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  source_message_id text,
  input_content text NOT NULL,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb,
  searches jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_writes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply text,
  think_latency_ms integer,
  decide_latency_ms integer,
  total_latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  success boolean NOT NULL DEFAULT true,
  error text
);

GRANT SELECT ON public.assessor_reasoning_traces TO authenticated;
GRANT ALL ON public.assessor_reasoning_traces TO service_role;

ALTER TABLE public.assessor_reasoning_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reasoning_traces_owner_select"
  ON public.assessor_reasoning_traces FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX assessor_reasoning_traces_user_created_idx
  ON public.assessor_reasoning_traces (user_id, created_at DESC);

INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES (
  'assessor.engine.v3',
  'Motor Reasoning Engine (Observe -> Think -> Search -> Decide -> Act). Substitui o v2 quando activo.',
  false,
  ARRAY[]::text[],
  0
)
ON CONFLICT (key) DO NOTHING;

-- ===== origem: 20260728205620_369b352e-61cb-46e1-81b9-a35813873529.sql =====
-- 1) assessor_nudges
CREATE TABLE public.assessor_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  subject_type text,
  subject_id uuid,
  reason text NOT NULL,
  suggested_reply text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assessor_nudges TO authenticated;
GRANT ALL ON public.assessor_nudges TO service_role;

ALTER TABLE public.assessor_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own nudges read" ON public.assessor_nudges
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX assessor_nudges_user_status_idx
  ON public.assessor_nudges(user_id, status, scheduled_for);

CREATE UNIQUE INDEX assessor_nudges_dedupe_uidx
  ON public.assessor_nudges(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TRIGGER assessor_nudges_set_updated_at
  BEFORE UPDATE ON public.assessor_nudges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) assessor_quality_scores
CREATE TABLE public.assessor_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL,
  understood_first_try boolean,
  reformulated boolean,
  executed_successfully boolean,
  human_tone boolean,
  score numeric(4,3),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assessor_quality_scores TO authenticated;
GRANT ALL ON public.assessor_quality_scores TO service_role;

ALTER TABLE public.assessor_quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own aqs read" ON public.assessor_quality_scores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX assessor_quality_scores_user_created_idx
  ON public.assessor_quality_scores(user_id, created_at DESC);
CREATE INDEX assessor_quality_scores_created_idx
  ON public.assessor_quality_scores(created_at DESC);

-- ===== origem: 20260728211750_164d214d-3813-454c-83f4-e4fa663a9bb6.sql =====
-- =========================================================
-- Trust Mode v1 — Foundational tables
-- =========================================================

-- Categorias de correções
DO $$ BEGIN
  CREATE TYPE public.assistant_correction_category AS ENUM (
    'wrong_person','wrong_property','wrong_date','wrong_document',
    'lost_context','unnatural_reply','unnecessary_question',
    'wrong_execution','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.assistant_reflection_trigger AS ENUM (
    'low_aqs','low_ats','user_correction'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- assistant_user_corrections
-- ---------------------------------------------------------
CREATE TABLE public.assistant_user_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  conversation_id text,
  turn_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL,
  category public.assistant_correction_category NOT NULL DEFAULT 'other',
  original_message text,
  correction_message text NOT NULL,
  final_result text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_user_corrections TO authenticated;
GRANT ALL ON public.assistant_user_corrections TO service_role;
ALTER TABLE public.assistant_user_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corrections_admin_read"
  ON public.assistant_user_corrections FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_corrections_updated
  BEFORE UPDATE ON public.assistant_user_corrections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_corrections_user_created ON public.assistant_user_corrections(user_id, created_at DESC);
CREATE INDEX idx_corrections_category ON public.assistant_user_corrections(category);

-- ---------------------------------------------------------
-- assistant_trust_scores
-- ---------------------------------------------------------
CREATE TABLE public.assistant_trust_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE,
  task_success numeric,               -- 0|1|null
  aqs_score numeric,                  -- 0..1
  corrections_count integer NOT NULL DEFAULT 0,
  context_preservation numeric,       -- 0..1
  safe_decisions numeric,             -- 0..1
  ats numeric,                        -- 0..100
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_trust_scores TO authenticated;
GRANT ALL ON public.assistant_trust_scores TO service_role;
ALTER TABLE public.assistant_trust_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_admin_read"
  ON public.assistant_trust_scores FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_trust_created ON public.assistant_trust_scores(created_at DESC);
CREATE INDEX idx_trust_user ON public.assistant_trust_scores(user_id, created_at DESC);

-- ---------------------------------------------------------
-- assistant_reflections
-- ---------------------------------------------------------
CREATE TABLE public.assistant_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE,
  correction_id uuid REFERENCES public.assistant_user_corrections(id) ON DELETE SET NULL,
  trigger public.assistant_reflection_trigger NOT NULL,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_reflections TO authenticated;
GRANT ALL ON public.assistant_reflections TO service_role;
ALTER TABLE public.assistant_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reflections_admin_read"
  ON public.assistant_reflections FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_reflections_created ON public.assistant_reflections(created_at DESC);

-- ---------------------------------------------------------
-- assistant_golden_conversations
-- ---------------------------------------------------------
CREATE TABLE public.assistant_golden_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_golden_conversations TO authenticated;
GRANT ALL ON public.assistant_golden_conversations TO service_role;
ALTER TABLE public.assistant_golden_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golden_admin_read"
  ON public.assistant_golden_conversations FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_golden_updated
  BEFORE UPDATE ON public.assistant_golden_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------
-- assistant_golden_runs
-- ---------------------------------------------------------
CREATE TABLE public.assistant_golden_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  golden_id uuid NOT NULL REFERENCES public.assistant_golden_conversations(id) ON DELETE CASCADE,
  release_ref text NOT NULL,
  passed boolean NOT NULL,
  ats numeric,
  aqs numeric,
  task_success numeric,
  diffs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_golden_runs TO authenticated;
GRANT ALL ON public.assistant_golden_runs TO service_role;
ALTER TABLE public.assistant_golden_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golden_runs_admin_read"
  ON public.assistant_golden_runs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_golden_runs_golden ON public.assistant_golden_runs(golden_id, created_at DESC);
CREATE INDEX idx_golden_runs_release ON public.assistant_golden_runs(release_ref);

-- ---------------------------------------------------------
-- assistant_shadow_runs
-- ---------------------------------------------------------
CREATE TABLE public.assistant_shadow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel text NOT NULL,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE,
  strategy text NOT NULL,
  reply text,
  ats numeric,
  aqs numeric,
  task_success numeric,
  latency_ms integer,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_shadow_runs TO authenticated;
GRANT ALL ON public.assistant_shadow_runs TO service_role;
ALTER TABLE public.assistant_shadow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shadow_admin_read"
  ON public.assistant_shadow_runs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_shadow_created ON public.assistant_shadow_runs(created_at DESC);
CREATE INDEX idx_shadow_strategy ON public.assistant_shadow_runs(strategy);

-- ===== origem: 20260728212713_c8c61279-825e-469b-a8fd-f36033ba2d12.sql =====
INSERT INTO public.assistant_golden_conversations (slug, title, description, turns, tags) VALUES
('greeting-bom-dia', 'Saudação simples', 'Consultor diz bom dia; assessor deve reconhecer sem executar nada.',
 '[{"user":"Bom dia","expect":{"action":"acknowledge","must_not_contain":["Feito","payload","backend"]}}]'::jsonb,
 ARRAY['cultura','saudacao']),
('short-answer-sim', 'Confirmação curta', 'Resposta "sim" sem contexto pendente não deve inventar ação.',
 '[{"user":"sim","expect":{"action":"acknowledge","must_not_contain":["Feito","criado","registei"]}}]'::jsonb,
 ARRAY['cultura','short-answer']),
('agenda-hoje', 'Pergunta pela agenda', 'Consultor pergunta o que tem hoje; assessor deve reconhecer intenção de consulta.',
 '[{"user":"O que tenho hoje?","expect":{"action":"act","tool":"agenda_today","reply_contains":[]}}]'::jsonb,
 ARRAY['agenda'])
ON CONFLICT (slug) DO UPDATE SET turns = EXCLUDED.turns, description = EXCLUDED.description, updated_at = now();

-- ===== origem: 20260729080340_ba4fff96-3d81-4df5-a5b2-abd046d2ae48.sql =====
-- Feature flag Supreme v1 (só Júlio)
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES ('assessor.supreme.v1', 'Assessor Supremo: Daily Operating Loop, prioridades, outcomes, autonomia', false, ARRAY[]::text[], 0)
ON CONFLICT (key) DO NOTHING;

-- consultant_preferences: uma linha por consultor
CREATE TABLE IF NOT EXISTS public.consultant_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  morning_briefing_enabled boolean NOT NULL DEFAULT true,
  morning_time time NOT NULL DEFAULT '08:00',
  morning_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  evening_wrap_enabled boolean NOT NULL DEFAULT false,
  evening_time time NOT NULL DEFAULT '19:00',
  quiet_hours_start time NOT NULL DEFAULT '22:00',
  quiet_hours_end time NOT NULL DEFAULT '07:30',
  timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  primary_channel text NOT NULL DEFAULT 'whatsapp',
  max_daily_nudges int NOT NULL DEFAULT 6,
  autonomy_level text NOT NULL DEFAULT 'balanced',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultant_preferences TO authenticated;
GRANT ALL ON public.consultant_preferences TO service_role;
ALTER TABLE public.consultant_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own consultant_preferences" ON public.consultant_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER consultant_preferences_set_updated_at BEFORE UPDATE ON public.consultant_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- autonomy_rules: uma linha por (user, action_type)
CREATE TABLE IF NOT EXISTS public.autonomy_rules (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  requires_confirmation boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomy_rules TO authenticated;
GRANT ALL ON public.autonomy_rules TO service_role;
ALTER TABLE public.autonomy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own autonomy_rules" ON public.autonomy_rules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER autonomy_rules_set_updated_at BEFORE UPDATE ON public.autonomy_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- daily_priorities: prioridades materializadas
CREATE TABLE IF NOT EXISTS public.daily_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id uuid,
  action text NOT NULL,
  reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  priority_score numeric NOT NULL DEFAULT 0,
  due_at timestamptz,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_priorities_user_score_idx
  ON public.daily_priorities (user_id, priority_score DESC)
  WHERE dismissed_at IS NULL AND completed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_priorities_user_subject_uidx
  ON public.daily_priorities (user_id, subject_type, subject_id)
  WHERE subject_id IS NOT NULL AND dismissed_at IS NULL AND completed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_priorities TO authenticated;
GRANT ALL ON public.daily_priorities TO service_role;
ALTER TABLE public.daily_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily_priorities read" ON public.daily_priorities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own daily_priorities update" ON public.daily_priorities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER daily_priorities_set_updated_at BEFORE UPDATE ON public.daily_priorities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Outcome tracking em follow_ups
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_created_id uuid;

-- Extensões em assessor_nudges
ALTER TABLE public.assessor_nudges
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'useful';

-- ===== origem: 20260729084803_50d51e6b-d06d-4fe2-bcbc-8b28c4d65454.sql =====
-- Enums
DO $$ BEGIN
  CREATE TYPE public.prospecting_source_type AS ENUM (
    'street_sign','referral','online_listing','direct_observation','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prospecting_listing_type AS ENUM (
    'owner_sale','other_agency','own_agency','unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prospecting_status AS ENUM (
    'to_contact','contact_attempted','contacted','no_interest','opportunity','converted','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela
CREATE TABLE IF NOT EXISTS public.prospecting_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  phone text,
  location text,
  address text,
  source_type public.prospecting_source_type NOT NULL DEFAULT 'other',
  listing_type public.prospecting_listing_type NOT NULL DEFAULT 'unknown',
  agency_name text,
  contact_name text,
  property_type text,
  typology text,
  asking_price numeric,
  status public.prospecting_status NOT NULL DEFAULT 'to_contact',
  notes text,
  source_channel text NOT NULL DEFAULT 'web',
  source_message_id uuid,
  image_file_id uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL,
  related_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  related_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  next_follow_up_at timestamptz,
  extraction_confidence numeric,
  extraction_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_attempts integer NOT NULL DEFAULT 0,
  last_contact_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospecting_leads_user_status_idx
  ON public.prospecting_leads(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS prospecting_leads_user_phone_idx
  ON public.prospecting_leads(user_id, phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospecting_leads TO authenticated;
GRANT ALL ON public.prospecting_leads TO service_role;

ALTER TABLE public.prospecting_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospecting_leads_owner_all"
  ON public.prospecting_leads
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER prospecting_leads_set_updated_at
  BEFORE UPDATE ON public.prospecting_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ligação a seguimentos
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS related_prospecting_lead_id uuid
    REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS follow_ups_prospecting_idx
  ON public.follow_ups(related_prospecting_lead_id)
  WHERE related_prospecting_lead_id IS NOT NULL;

-- ===== origem: 20260729090033_4e6e5416-ddcb-4c53-ba0d-a8b2b9efcfc3.sql =====
-- 1) Enum papel
DO $$ BEGIN
  CREATE TYPE public.person_role AS ENUM (
    'owner','potential_owner','buyer','potential_buyer','client',
    'reference','partner','supplier','colleague','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extensão people
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS roles public.person_role[] NOT NULL DEFAULT ARRAY[]::public.person_role[],
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid,
  ADD COLUMN IF NOT EXISTS source_file_id uuid,
  ADD COLUMN IF NOT EXISTS search_location text,
  ADD COLUMN IF NOT EXISTS search_property_type text,
  ADD COLUMN IF NOT EXISTS budget_min numeric,
  ADD COLUMN IF NOT EXISTS budget_max numeric,
  ADD COLUMN IF NOT EXISTS referred_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_normalized text;

-- Backfill email_normalized
UPDATE public.people SET email_normalized = lower(trim(email)) WHERE email IS NOT NULL AND email_normalized IS NULL;

CREATE INDEX IF NOT EXISTS people_user_email_norm_idx ON public.people(user_id, email_normalized);
CREATE INDEX IF NOT EXISTS people_user_name_idx ON public.people(user_id, lower(name));

-- 3) person_phones
CREATE TABLE IF NOT EXISTS public.person_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  raw text NOT NULL,
  e164 text,
  country_code text,
  kind text NOT NULL DEFAULT 'unknown',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_phones TO authenticated;
GRANT ALL ON public.person_phones TO service_role;

ALTER TABLE public.person_phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "person_phones_owner_all" ON public.person_phones;
CREATE POLICY "person_phones_owner_all" ON public.person_phones
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS person_phones_user_e164_idx
  ON public.person_phones(user_id, e164) WHERE e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS person_phones_person_idx ON public.person_phones(person_id);

-- 4) Backfill: para cada pessoa com phone existente, cria uma entrada em person_phones se não existir
INSERT INTO public.person_phones (user_id, person_id, raw, e164, kind, is_primary)
SELECT p.user_id, p.id, p.phone, NULL, 'unknown', true
FROM public.people p
WHERE p.phone IS NOT NULL AND btrim(p.phone) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.person_phones pp WHERE pp.person_id = p.id);

-- 5) Backfill roles a partir de relationship_type quando roles está vazio
UPDATE public.people
SET roles = ARRAY[
  CASE lower(coalesce(relationship_type,''))
    WHEN 'proprietário' THEN 'owner'::public.person_role
    WHEN 'proprietario' THEN 'owner'::public.person_role
    WHEN 'cliente' THEN 'client'::public.person_role
    WHEN 'comprador' THEN 'buyer'::public.person_role
    WHEN 'potencial' THEN 'potential_buyer'::public.person_role
    WHEN 'potencial comprador' THEN 'potential_buyer'::public.person_role
    WHEN 'referenciador' THEN 'reference'::public.person_role
    WHEN 'referência' THEN 'reference'::public.person_role
    WHEN 'referencia' THEN 'reference'::public.person_role
    WHEN 'colega' THEN 'colleague'::public.person_role
    ELSE 'other'::public.person_role
  END
]
WHERE (roles IS NULL OR cardinality(roles) = 0);

-- 6) Trigger email_normalized
CREATE OR REPLACE FUNCTION public.people_touch_email_norm()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email_normalized = CASE WHEN NEW.email IS NULL THEN NULL ELSE lower(btrim(NEW.email)) END;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS people_email_norm_trg ON public.people;
CREATE TRIGGER people_email_norm_trg
  BEFORE INSERT OR UPDATE OF email ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_touch_email_norm();

-- ===== origem: 20260729093330_31b5bdd8-39b9-491b-ad70-d6fd7c13ce77.sql =====
-- 1. Estender uploaded_files
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_external_file_id text;

-- Backfill source_external_file_id a partir de external_file_id
UPDATE public.uploaded_files
   SET source_external_file_id = external_file_id
 WHERE source_external_file_id IS NULL AND external_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_checksum_idx
  ON public.uploaded_files(user_id, checksum)
  WHERE checksum IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_status_idx
  ON public.uploaded_files(user_id, processing_status)
  WHERE deleted_at IS NULL;

-- 2. Tabela file_links
CREATE TABLE IF NOT EXISTS public.file_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'person','property','opportunity','follow_up','interaction','miscellaneous','prospecting_lead'
  )),
  entity_id uuid NOT NULL,
  relation_type text NOT NULL DEFAULT 'belongs_to' CHECK (relation_type IN (
    'belongs_to','supports','received_from','related_to','version_of','evidence_for','attachment'
  )),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('ai','user','rule','migration')),
  confidence numeric,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_id, entity_type, entity_id, relation_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_links TO authenticated;
GRANT ALL ON public.file_links TO service_role;

ALTER TABLE public.file_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_links_owner_all"
  ON public.file_links FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS file_links_user_entity_idx
  ON public.file_links(user_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS file_links_user_file_idx
  ON public.file_links(user_id, file_id);

-- 3. Backfill a partir de related_resource_type/id
INSERT INTO public.file_links (user_id, file_id, entity_type, entity_id, relation_type, source, confidence, confirmed_at, created_at)
SELECT
  uf.user_id,
  uf.id,
  CASE uf.related_resource_type
    WHEN 'people' THEN 'person'
    WHEN 'person' THEN 'person'
    WHEN 'properties' THEN 'property'
    WHEN 'property' THEN 'property'
    WHEN 'opportunities' THEN 'opportunity'
    WHEN 'opportunity' THEN 'opportunity'
    WHEN 'follow_ups' THEN 'follow_up'
    WHEN 'follow_up' THEN 'follow_up'
    WHEN 'interactions' THEN 'interaction'
    WHEN 'interaction' THEN 'interaction'
    WHEN 'miscellaneous_items' THEN 'miscellaneous'
    WHEN 'miscellaneous' THEN 'miscellaneous'
    WHEN 'prospecting_leads' THEN 'prospecting_lead'
    WHEN 'prospecting_lead' THEN 'prospecting_lead'
    ELSE NULL
  END,
  uf.related_resource_id,
  'belongs_to',
  'migration',
  1.0,
  uf.updated_at,
  uf.created_at
FROM public.uploaded_files uf
WHERE uf.related_resource_type IS NOT NULL
  AND uf.related_resource_id IS NOT NULL
  AND uf.user_id IS NOT NULL
  AND CASE uf.related_resource_type
    WHEN 'people' THEN 'person'
    WHEN 'person' THEN 'person'
    WHEN 'properties' THEN 'property'
    WHEN 'property' THEN 'property'
    WHEN 'opportunities' THEN 'opportunity'
    WHEN 'opportunity' THEN 'opportunity'
    WHEN 'follow_ups' THEN 'follow_up'
    WHEN 'follow_up' THEN 'follow_up'
    WHEN 'interactions' THEN 'interaction'
    WHEN 'interaction' THEN 'interaction'
    WHEN 'miscellaneous_items' THEN 'miscellaneous'
    WHEN 'miscellaneous' THEN 'miscellaneous'
    WHEN 'prospecting_leads' THEN 'prospecting_lead'
    WHEN 'prospecting_lead' THEN 'prospecting_lead'
    ELSE NULL
  END IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Feature flag drive.v1
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES ('drive.v1', 'Drive Inteligente v1 — nova área de ficheiros com relações múltiplas e classificação automática', false, ARRAY[]::text[], 0)
ON CONFLICT (key) DO NOTHING;

-- [retirado na montagem de staging: dados de produção]

-- ===== origem: 20260729110426_e1f92bae-5676-4992-9d9f-db9f31d00026.sql =====
UPDATE public.assistant_golden_conversations
SET turns = '[{"user":"O que tenho hoje?","expect":{"action":"act","tool":"search_agenda","must_not_contain":["diversos","feito","registei"]}}]'::jsonb,
    description = 'Consultor pergunta pela agenda de hoje; assessor chama search_agenda e devolve dados reais.',
    updated_at = now()
WHERE slug = 'agenda-hoje';

UPDATE public.assistant_golden_conversations
SET turns = '[{"user":"sim","expect":{"action":"ask","reply_contains":["a que te referes"],"must_not_contain":["feito","criado","registei","registado","marquei"]}}]'::jsonb,
    description = 'Confirmação curta sem contexto pendente pede referência, não executa tools.',
    updated_at = now()
WHERE slug = 'short-answer-sim';

INSERT INTO public.assistant_golden_conversations (slug, title, description, turns, tags) VALUES
  ('agenda-que-tenho-hoje','Agenda: Que tenho hoje?','Variante interrogativa curta.',
   '[{"user":"Que tenho hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-marcado-hoje','Agenda: marcado para hoje','Variante "o que está marcado para hoje".',
   '[{"user":"O que está marcado para hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-alguma-coisa-hoje','Agenda: alguma coisa hoje','Variante "tenho alguma coisa hoje".',
   '[{"user":"Tenho alguma coisa hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-como-esta','Agenda: como está a minha agenda','Variante genérica com palavra "agenda".',
   '[{"user":"Como está a minha agenda?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-e-hoje','Agenda: e hoje?','Variante ultra-curta "E hoje?".',
   '[{"user":"E hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda'])
ON CONFLICT (slug) DO UPDATE SET turns = EXCLUDED.turns, description = EXCLUDED.description, updated_at = now();

-- ===== origem: 20260729125115_8f5bfb01-136a-49ce-9c12-26e2331f4fa1.sql =====
CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_resource_type text NOT NULL CHECK (related_resource_type IN ('follow_up','event','prospecting_lead','other')),
  related_resource_id uuid,
  scheduled_for timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','processing','sent','failed','cancelled')),
  sent_at timestamptz,
  failed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  external_message_id text,
  idempotency_key text,
  message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_owner ON public.reminders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Um único lembrete activo por recurso (impede duplicados no reagendamento).
CREATE UNIQUE INDEX reminders_active_unique
  ON public.reminders(user_id, related_resource_type, related_resource_id)
  WHERE status IN ('scheduled','processing') AND related_resource_id IS NOT NULL;

CREATE UNIQUE INDEX reminders_idempotency
  ON public.reminders(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX reminders_due_idx
  ON public.reminders(status, scheduled_for)
  WHERE status IN ('scheduled','processing');

CREATE TRIGGER reminders_touch_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260729140829_08dd3cc1-89a3-497e-bd37-d77a300e7a6b.sql =====
-- 1. profiles: plan + canal preferido
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS primary_channel text NOT NULL DEFAULT 'whatsapp';

-- 2. channel_links
CREATE TABLE IF NOT EXISTS public.channel_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','telegram')),
  external_id text NOT NULL,
  display_name text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);

GRANT SELECT ON public.channel_links TO authenticated;
GRANT ALL ON public.channel_links TO service_role;
ALTER TABLE public.channel_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_links_owner_select" ON public.channel_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. telegram_invites
CREATE TABLE IF NOT EXISTS public.telegram_invites (
  code text PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_tier text NOT NULL DEFAULT 'free',
  note text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  used_chat_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.telegram_invites TO authenticated;
GRANT ALL ON public.telegram_invites TO service_role;
ALTER TABLE public.telegram_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_invites_admin_all" ON public.telegram_invites
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4. index para lookups por user_id
CREATE INDEX IF NOT EXISTS channel_links_user_channel_idx
  ON public.channel_links (user_id, channel);

-- ===== origem: 20260729161830_bb3e2eb2-20a8-4949-9c7b-5b5f1b881fc5.sql =====
-- 1) profiles: novos campos
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text,
  ADD COLUMN IF NOT EXISTS is_beta_tester boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_expires_at timestamptz;

-- Backfill a partir de plan_tier antigo
UPDATE public.profiles
SET subscription_tier = CASE
  WHEN plan_tier IN ('consultor','pro','hub') THEN plan_tier
  WHEN plan_tier = 'pro' THEN 'pro'
  ELSE 'base'
END
WHERE subscription_tier IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN subscription_tier SET DEFAULT 'base',
  ALTER COLUMN subscription_tier SET NOT NULL,
  ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN ('base','consultor','pro','hub'));

-- Remover fonte antiga
ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan_tier;

-- 2) telegram_invites: renomear + normalizar valores
UPDATE public.telegram_invites SET plan_tier = 'base' WHERE plan_tier NOT IN ('base','consultor','pro','hub');
ALTER TABLE public.telegram_invites RENAME COLUMN plan_tier TO subscription_tier;
ALTER TABLE public.telegram_invites
  ALTER COLUMN subscription_tier SET DEFAULT 'base',
  ADD CONSTRAINT telegram_invites_subscription_tier_check
    CHECK (subscription_tier IN ('base','consultor','pro','hub'));

-- 3) effective_tier(): beta ativo => 'hub', senão o tier real
CREATE OR REPLACE FUNCTION public.effective_tier(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.is_beta_tester = true
         AND (p.beta_expires_at IS NULL OR p.beta_expires_at > now())
      THEN 'hub'
    ELSE p.subscription_tier
  END
  FROM public.profiles p
  WHERE p.id = _user_id
$$;

-- Helper booleano para gating por ordem: base<consultor<pro<hub
CREATE OR REPLACE FUNCTION public.tier_at_least(_user_id uuid, _min text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE public.effective_tier(_user_id)
      WHEN 'base' THEN 0 WHEN 'consultor' THEN 1 WHEN 'pro' THEN 2 WHEN 'hub' THEN 3
      ELSE -1
    END
    >=
    CASE _min
      WHEN 'base' THEN 0 WHEN 'consultor' THEN 1 WHEN 'pro' THEN 2 WHEN 'hub' THEN 3
      ELSE 99
    END
$$;

GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO authenticated, anon;

-- ===== origem: 20260729173847_0b9442a8-447f-4e99-8e26-4943f41fe4ac.sql =====
CREATE OR REPLACE FUNCTION public.effective_tier(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _role text := current_setting('request.jwt.claim.role', true);
  _result text;
BEGIN
  IF _role IS NULL THEN
    _role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  END IF;

  -- Chamadas internas do servidor (service_role / conexões diretas sem JWT) mantêm acesso.
  IF _caller IS NOT NULL AND _caller <> _user_id AND _role <> 'service_role' THEN
    IF NOT public.is_admin(_caller) THEN
      RAISE EXCEPTION 'nao autorizado a consultar o plano de outro utilizador';
    END IF;
  END IF;

  IF _caller IS NULL AND _role NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;

  SELECT CASE
    WHEN p.is_beta_tester = true
         AND (p.beta_expires_at IS NULL OR p.beta_expires_at > now())
      THEN 'hub'
    ELSE p.subscription_tier
  END
  INTO _result
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN _result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tier_at_least(uuid, text) FROM anon;

-- ===== origem: 20260729174028_9639d632-3441-41a2-960e-ae6234ca2804.sql =====
REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO authenticated, service_role;

-- ===== origem: 20260729184150_c0bdb794-3969-4c5b-9045-f39c9df1b3c6.sql =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.miscellaneous_items TO authenticated;
GRANT ALL ON public.miscellaneous_items TO service_role;

-- ===== origem: 20260729214443_4db91048-0650-4804-b9ab-207a2d18b91c.sql =====
CREATE TABLE public.plan_configs (
  tier TEXT PRIMARY KEY,
  price_month NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.plan_configs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_configs TO authenticated;
GRANT ALL ON public.plan_configs TO service_role;

ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published plans are readable by anyone"
  ON public.plan_configs FOR SELECT
  USING (status = 'published' OR public.is_admin(auth.uid()));

CREATE POLICY "Admins manage plan configs"
  ON public.plan_configs FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.plan_configs (tier, price_month, status, notes) VALUES
  ('base', 0, 'published', 'Telegram, grátis'),
  ('consultor', NULL, 'draft', NULL),
  ('pro', NULL, 'draft', NULL),
  ('hub', NULL, 'draft', NULL);

-- ===== origem: 20260730085910_231cd233-0c51-47e6-a53b-820b5eb36b19.sql =====
-- Códigos promocionais
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  grants_tier text NOT NULL DEFAULT 'consultor',
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view promo codes" ON public.promo_codes
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER promo_codes_touch BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Anúncios no dashboard do consultor
CREATE TABLE public.dashboard_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  segment text NOT NULL DEFAULT 'all',
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dashboard_announcements TO authenticated;
GRANT ALL ON public.dashboard_announcements TO service_role;
ALTER TABLE public.dashboard_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read active announcements" ON public.dashboard_announcements
  FOR SELECT TO authenticated
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));
CREATE TRIGGER dashboard_announcements_touch BEFORE UPDATE ON public.dashboard_announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Histórico de comunicações em massa
CREATE TABLE public.admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  segment text NOT NULL DEFAULT 'all',
  subject text,
  body text NOT NULL,
  recipients_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_broadcasts TO authenticated;
GRANT ALL ON public.admin_broadcasts TO service_role;
ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view broadcasts" ON public.admin_broadcasts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ===== origem: 20260730194624_8ce34e5d-ac46-42fa-94e6-f001023a3f72.sql =====
CREATE TABLE IF NOT EXISTS public.conversation_locks (
  user_id uuid NOT NULL,
  channel text NOT NULL,
  locked_until timestamptz NOT NULL,
  holder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);

GRANT ALL ON public.conversation_locks TO service_role;

ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_locks_owner_read" ON public.conversation_locks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.try_acquire_conversation_lock(
  _user_id uuid, _channel text, _ttl_seconds integer DEFAULT 60, _holder text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _got boolean := false;
BEGIN
  INSERT INTO public.conversation_locks (user_id, channel, locked_until, holder)
  VALUES (_user_id, _channel, now() + make_interval(secs => _ttl_seconds), _holder)
  ON CONFLICT (user_id, channel) DO UPDATE
    SET locked_until = now() + make_interval(secs => _ttl_seconds),
        holder = _holder
    WHERE public.conversation_locks.locked_until < now()
  RETURNING true INTO _got;
  RETURN coalesce(_got, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_conversation_lock(
  _user_id uuid, _channel text, _holder text DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversation_locks
     SET locked_until = now() - interval '1 second'
   WHERE user_id = _user_id AND channel = _channel
     AND (_holder IS NULL OR holder = _holder);
$$;

REVOKE ALL ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_conversation_lock(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_conversation_lock(uuid, text, text) TO service_role;

-- ===== origem: 20260730200459_0a2381dd-8ab6-4498-94db-2494762df462.sql =====
GRANT SELECT ON public.plan_configs TO anon, authenticated;
GRANT ALL ON public.plan_configs TO service_role;

-- ===== origem: 20260730200815_ea6188c3-6adc-459d-ab17-0f7605fc73da.sql =====
DROP POLICY IF EXISTS "Published plans are readable by anyone" ON public.plan_configs;
CREATE POLICY "Published plans are readable by anyone"
  ON public.plan_configs FOR SELECT
  USING (status = 'published');

-- ===== origem: 20260730230947_9fd2e0dd-9a23-4877-b6dd-d864344c8f47.sql =====
CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT ALL ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google_calendar','microsoft_outlook')),
  follow_up_id uuid NOT NULL REFERENCES public.follow_ups(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  external_calendar_id text,
  external_updated_at timestamptz,
  local_updated_at timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_origin text,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, follow_up_id),
  UNIQUE (user_id, provider, external_event_id)
);
GRANT SELECT ON public.calendar_event_links TO authenticated;
GRANT ALL ON public.calendar_event_links TO service_role;
ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own links readable" ON public.calendar_event_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_cal_links_user_provider ON public.calendar_event_links (user_id, provider);

CREATE TABLE public.calendar_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google_calendar','microsoft_outlook')),
  calendar_id text,
  sync_token text,
  delta_link text,
  last_polled_at timestamptz,
  last_error text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT ON public.calendar_sync_state TO authenticated;
GRANT ALL ON public.calendar_sync_state TO service_role;
ALTER TABLE public.calendar_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync state readable" ON public.calendar_sync_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  follow_up_id uuid,
  external_event_id text,
  direction text NOT NULL,
  action text NOT NULL,
  origin text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.calendar_sync_log TO authenticated;
GRANT ALL ON public.calendar_sync_log TO service_role;
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync log readable" ON public.calendar_sync_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_cal_log_user_created ON public.calendar_sync_log (user_id, created_at DESC);

CREATE TRIGGER cal_links_set_updated_at BEFORE UPDATE ON public.calendar_event_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cal_sync_state_set_updated_at BEFORE UPDATE ON public.calendar_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER app_user_connections_set_updated_at BEFORE UPDATE ON public.app_user_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260731070542_d64fc4b2-667e-4364-ae5e-64e1c17e0451.sql =====
CREATE TABLE public.telegram_pairings (
  chat_id text PRIMARY KEY,
  step text NOT NULL DEFAULT 'asked',
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  code_hash text,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_pairings TO service_role;
ALTER TABLE public.telegram_pairings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_link_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_chat_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_link_tokens TO authenticated;
GRANT ALL ON public.telegram_link_tokens TO service_role;
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_link_tokens_own_select" ON public.telegram_link_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX idx_telegram_link_tokens_user ON public.telegram_link_tokens (user_id);

-- ===== origem: 20260731132735_fcd77462-806b-4c2b-8092-51fcca60d298.sql =====
CREATE TABLE public.app_user_connection_aliases (
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  app_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, connector_id)
);
GRANT ALL ON public.app_user_connection_aliases TO service_role;
ALTER TABLE public.app_user_connection_aliases ENABLE ROW LEVEL SECURITY;

-- ===== origem: 20260731135800_b1253d4d-1afb-46c4-91b3-d88708e82b0f.sql =====
-- TAGS
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_user_name_uniq ON public.tags (user_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_own" ON public.tags FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tags_touch BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ENTITY TAGS
CREATE TABLE public.entity_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, entity_type, entity_id)
);
CREATE INDEX entity_tags_lookup ON public.entity_tags (user_id, entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_tags TO authenticated;
GRANT ALL ON public.entity_tags TO service_role;
ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_tags_own" ON public.entity_tags FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- FOLDERS
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX folders_user_name_uniq ON public.folders (user_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders_own" ON public.folders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER folders_touch BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FOLDER ITEMS
CREATE TABLE public.folder_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_id, entity_type, entity_id)
);
CREATE INDEX folder_items_lookup ON public.folder_items (user_id, entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_items TO authenticated;
GRANT ALL ON public.folder_items TO service_role;
ALTER TABLE public.folder_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folder_items_own" ON public.folder_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DRIVE custom category
ALTER TABLE public.uploaded_files ADD COLUMN IF NOT EXISTS custom_category text;

-- ===== origem: 20260731141119_cea225fe-dee9-4edb-8b06-57b0679639d9.sql =====
CREATE TABLE public.file_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_categories TO authenticated;
GRANT ALL ON public.file_categories TO service_role;

ALTER TABLE public.file_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor gere as suas categorias"
ON public.file_categories FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER file_categories_touch
BEFORE UPDATE ON public.file_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.uploaded_files
  ADD COLUMN custom_category_id uuid REFERENCES public.file_categories(id) ON DELETE SET NULL;

CREATE INDEX uploaded_files_custom_category_id_idx
  ON public.uploaded_files (custom_category_id);

-- ===== origem: 20260731143632_a71e1ab8-309d-4fcc-b489-e44bd6ca74e5.sql =====
CREATE OR REPLACE FUNCTION public.profiles_restrict_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.is_beta_tester IS DISTINCT FROM OLD.is_beta_tester
     OR NEW.beta_expires_at IS DISTINCT FROM OLD.beta_expires_at
     OR NEW.account_kind IS DISTINCT FROM OLD.account_kind
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
     OR NEW.whatsapp_link_status IS DISTINCT FROM OLD.whatsapp_link_status
     OR NEW.whatsapp_linked_at IS DISTINCT FROM OLD.whatsapp_linked_at THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_restrict_self_update ON public.profiles;
CREATE TRIGGER profiles_restrict_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_restrict_self_update();

-- ===== origem: 20260731143805_4f8f2f9d-691a-4e9c-9ec4-dde2b42fb909.sql =====
ALTER TABLE public.file_categories ADD COLUMN IF NOT EXISTS color TEXT;

-- Garantir que a coluna é acessível via Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_categories TO authenticated;
GRANT ALL ON public.file_categories TO service_role;

-- ===== origem: 20260731145618_f0033a71-ae6d-45ca-ba53-cd84cd623ebd.sql =====
CREATE TABLE public.dashboard_login_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'telegram',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dashboard_login_tokens_user ON public.dashboard_login_tokens (user_id);
GRANT ALL ON public.dashboard_login_tokens TO service_role;
ALTER TABLE public.dashboard_login_tokens ENABLE ROW LEVEL SECURITY;

-- ===== origem: 20260731154137_982ee88e-f18e-44eb-b05e-2f314ccc7529.sql =====
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS is_beta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_days integer,
  ADD COLUMN IF NOT EXISTS invitee_name text,
  ADD COLUMN IF NOT EXISTS invitee_whatsapp text,
  ADD COLUMN IF NOT EXISTS invitee_email text;

ALTER TABLE public.admin_audit_logs ALTER COLUMN admin_user_id DROP NOT NULL;

-- ===== origem: 20260731155423_02c3ebc6-a5bf-4f55-b8b9-ae3b9e1f9859.sql =====
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
     OR NEW.whatsapp_linked_at IS DISTINCT FROM OLD.whatsapp_linked_at THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_beta_testers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n integer := 0;
BEGIN
  PERFORM set_config('app.system_job', 'on', true);
  FOR r IN
    SELECT id, subscription_tier, beta_expires_at
    FROM public.profiles
    WHERE is_beta_tester = true
      AND beta_expires_at IS NOT NULL
      AND beta_expires_at < now()
  LOOP
    UPDATE public.profiles
       SET subscription_tier = 'base', is_beta_tester = false
     WHERE id = r.id;

    INSERT INTO public.admin_audit_logs
      (admin_user_id, action, target_user_id, resource_type, resource_id, reason, metadata)
    VALUES (
      NULL,
      'beta.expired_auto',
      r.id,
      'profile',
      r.id::text,
      'Período de teste terminado automaticamente.',
      jsonb_build_object(
        'before', jsonb_build_object('subscription_tier', r.subscription_tier, 'is_beta_tester', true, 'beta_expires_at', r.beta_expires_at),
        'after', jsonb_build_object('subscription_tier', 'base', 'is_beta_tester', false),
        'source', 'cron:expire_beta_testers'
      )
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_beta_testers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_beta_testers() TO service_role;

-- ===== origem: 20260731184332_18adad02-4829-4353-8e48-73b575c7c317.sql =====
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS proactive_push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evening_checkin_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evening_checkin_time time without time zone NOT NULL DEFAULT '18:00:00';

-- ===== origem: 20260731192732_c65c6534-4b26-4d07-a14c-eab470869c33.sql =====
INSERT INTO public.feature_flags (key, description, enabled_globally)
VALUES ('whatsapp.templates.approved', 'Templates WhatsApp aprovados pela Meta: autoriza push proativo fora da janela de 24h. Ligado automaticamente pela verificação periódica.', false)
ON CONFLICT (key) DO NOTHING;

-- ===== origem: 20260731193554_7974f286-d463-42bd-b4a5-55996a4c0a38.sql =====
UPDATE public.assistant_golden_conversations
SET turns = '[
  {"user": "lembra-me de ligar ao Miguel {{HORA+2}}", "expect": {"tool": "create_follow_up", "action": "act"}},
  {"user": "afinal passa para as {{H+3}}", "expect": {"action": "act"}},
  {"user": "melhor às {{H+4}}", "expect": {"action": "act", "must_not_contain": ["criei outro", "novo seguimento"]}}
]'::jsonb,
    updated_at = now()
WHERE slug = 'reagendamento-repetido';

UPDATE public.assistant_golden_conversations
SET turns = '[
  {"user": "marca reunião com o Pedro amanhã às 10h, e um script para a chamada também", "expect": {"reply_contains": ["script"], "must_not_contain": ["não percebi"]}}
]'::jsonb,
    updated_at = now()
WHERE slug = 'multiplos-pedidos';

-- ===== origem: 20260731194036_6a638639-5106-4c15-b15f-bdff6c10af03.sql =====
UPDATE public.assistant_golden_conversations
SET turns = '[
  {"user": "marca reunião com o Pedro amanhã às 10h, e um script para a chamada também", "expect": {"reply_contains": ["guião|guiao|script"], "must_not_contain": ["não percebi"]}}
]'::jsonb,
    updated_at = now()
WHERE slug = 'multiplos-pedidos';

-- ===== origem: 20260731201023_558c0d63-c2a7-47db-b591-df22d0c045dd.sql =====
ALTER TABLE public.assessor_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assessor_messages;

-- ===== origem: 20260731201917_a2037017-4a52-4c12-a4fe-b517b7512204.sql =====
-- 1. Fases do negócio
DO $$ BEGIN
  CREATE TYPE public.deal_stage AS ENUM (
    'preparacao','angariacao','promocao','visitas','proposta','cpcv','escritura','concluido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Negócio (tabela opportunities) ganha os campos da nova entidade
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS deal_kind text NOT NULL DEFAULT 'comprador',
  ADD COLUMN IF NOT EXISTS stage public.deal_stage NOT NULL DEFAULT 'preparacao',
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deadline timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_deal_kind_check;
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_deal_kind_check CHECK (deal_kind IN ('comprador','vendedor'));

CREATE INDEX IF NOT EXISTS opportunities_user_stage_idx ON public.opportunities (user_id, stage);
CREATE INDEX IF NOT EXISTS opportunities_user_archived_idx ON public.opportunities (user_id, archived_at);

-- 3. Imóveis do negócio (vários por negócio)
CREATE TABLE IF NOT EXISTS public.opportunity_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'principal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, property_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_properties TO authenticated;
GRANT ALL ON public.opportunity_properties TO service_role;
ALTER TABLE public.opportunity_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunity_properties_own" ON public.opportunity_properties
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS opportunity_properties_opp_idx ON public.opportunity_properties (opportunity_id);
CREATE INDEX IF NOT EXISTS opportunity_properties_prop_idx ON public.opportunity_properties (user_id, property_id);

-- 4. Histórico estruturado do negócio
CREATE TABLE IF NOT EXISTS public.opportunity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  kind text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'dashboard',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_events TO authenticated;
GRANT ALL ON public.opportunity_events TO service_role;
ALTER TABLE public.opportunity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunity_events_own" ON public.opportunity_events
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS opportunity_events_opp_idx ON public.opportunity_events (opportunity_id, occurred_at DESC);

-- 5. Documentos ligados ao negócio
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS uploaded_files_opportunity_idx ON public.uploaded_files (user_id, opportunity_id);

-- 6. Conversão dos negócios existentes (aditiva; imóvel já ligado passa também para a tabela de ligação)
UPDATE public.opportunities SET title = coalesce(nullif(btrim(title), ''), 'Negócio') WHERE title IS NULL OR btrim(title) = '';
INSERT INTO public.opportunity_properties (user_id, opportunity_id, property_id, role)
SELECT o.user_id, o.id, o.property_id, 'principal'
FROM public.opportunities o
WHERE o.property_id IS NOT NULL
ON CONFLICT (opportunity_id, property_id) DO NOTHING;

-- ===== origem: 20260801111514_ccafaff8-84c7-4c69-bbf3-d1d7fcd2dbf5.sql =====
ALTER TABLE public.conversation_states ADD COLUMN IF NOT EXISTS sparring_turns integer NOT NULL DEFAULT 0;

-- ===== origem: 20260801121123_4a9a0020-6f34-4ca4-9ace-0d732720c80a.sql =====
CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  code text NOT NULL,
  granted_tier text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_id)
);

GRANT SELECT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_redemptions_owner_select"
  ON public.promo_redemptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX promo_redemptions_user_status_idx
  ON public.promo_redemptions (user_id, status, created_at DESC);

CREATE TRIGGER promo_redemptions_touch
  BEFORE UPDATE ON public.promo_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260801141815_55b48639-2079-404e-87d2-cd114455bb36.sql =====
CREATE TABLE public.content_access_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  scope text NOT NULL DEFAULT 'conversation',
  resource_id text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.content_access_consents TO authenticated;
GRANT ALL ON public.content_access_consents TO service_role;
ALTER TABLE public.content_access_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultant sees own consent requests"
  ON public.content_access_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Consultant decides own consent requests"
  ON public.content_access_consents FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins create consent requests"
  ON public.content_access_consents FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND requested_by = auth.uid());

CREATE INDEX idx_cac_user_status ON public.content_access_consents (user_id, status);

CREATE OR REPLACE FUNCTION public.content_access_consents_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','denied','revoked','expired') THEN
    RAISE EXCEPTION 'estado de consentimento invalido: %', NEW.status;
  END IF;
  IF NEW.status = 'approved' AND NEW.expires_at IS NULL THEN
    NEW.expires_at = now() + interval '2 hours';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cac_validate
  BEFORE INSERT OR UPDATE ON public.content_access_consents
  FOR EACH ROW EXECUTE FUNCTION public.content_access_consents_validate();

ALTER TABLE public.plan_configs
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'paid';

CREATE OR REPLACE FUNCTION public.plan_configs_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pricing_mode NOT IN ('paid','invite_only','free_beta','on_request') THEN
    RAISE EXCEPTION 'modo de preco invalido: %', NEW.pricing_mode;
  END IF;
  IF NEW.status = 'published'
     AND NEW.pricing_mode = 'paid'
     AND NEW.price_month IS NULL
     AND NEW.tier <> 'base' THEN
    RAISE EXCEPTION 'Um plano pago nao pode ficar publicado sem preco. Define o preco ou escolhe "apenas por convite", "beta gratuito" ou "preco sob consulta".';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

UPDATE public.plan_configs
   SET status = 'draft'
 WHERE status = 'published' AND price_month IS NULL AND tier <> 'base';

CREATE TRIGGER trg_plan_configs_validate
  BEFORE INSERT OR UPDATE ON public.plan_configs
  FOR EACH ROW EXECUTE FUNCTION public.plan_configs_validate();

-- ===== origem: 20260801143815_8a89988d-d203-4c29-9674-88c4ba8bc9d0.sql =====
CREATE TABLE public.admin_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.admin_broadcasts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  status text NOT NULL DEFAULT 'pendente',
  error text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_abr_broadcast ON public.admin_broadcast_recipients(broadcast_id);

GRANT SELECT ON public.admin_broadcast_recipients TO authenticated;
GRANT ALL ON public.admin_broadcast_recipients TO service_role;

ALTER TABLE public.admin_broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_broadcast_recipients"
ON public.admin_broadcast_recipients
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- ===== origem: 20260801151703_ea0d8707-18d8-4b92-be43-bd8e42b8c205.sql =====
CREATE TABLE public.landing_page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date,
  visit_hour smallint NOT NULL DEFAULT EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Lisbon')),
  referrer_host text,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.landing_page_visits TO service_role;

ALTER TABLE public.landing_page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_page_visits_admin_read"
  ON public.landing_page_visits FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX landing_page_visits_date_idx ON public.landing_page_visits (visit_date);

-- ===== origem: 20260802125322_609903c3-7685-42ed-89a1-65dfa2549a95.sql =====
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS color text;

-- ===== origem: 20260802140737_cc627989-1e3d-458c-9357-6e38d1152a06.sql =====
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_price numeric,
  ADD COLUMN IF NOT EXISTS commission_pct numeric,
  ADD COLUMN IF NOT EXISTS commission_amount numeric;

ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS interactions_property_idx ON public.interactions(property_id);

CREATE TABLE public.property_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact text,
  source text,
  status text NOT NULL DEFAULT 'a_contactar',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_interests TO authenticated;
GRANT ALL ON public.property_interests TO service_role;
ALTER TABLE public.property_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own property_interests" ON public.property_interests FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER property_interests_touch BEFORE UPDATE ON public.property_interests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS property_interests_prop_idx ON public.property_interests(property_id);

CREATE TABLE public.property_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  from_name text,
  amount numeric NOT NULL,
  offer_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_offers TO authenticated;
GRANT ALL ON public.property_offers TO service_role;
ALTER TABLE public.property_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own property_offers" ON public.property_offers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER property_offers_touch BEFORE UPDATE ON public.property_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS property_offers_prop_idx ON public.property_offers(property_id);

CREATE TABLE public.property_marketing_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'por_fazer',
  done_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_marketing_activities TO authenticated;
GRANT ALL ON public.property_marketing_activities TO service_role;
ALTER TABLE public.property_marketing_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own property_marketing" ON public.property_marketing_activities FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER property_marketing_touch BEFORE UPDATE ON public.property_marketing_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS property_marketing_prop_idx ON public.property_marketing_activities(property_id);

-- ===== origem: 20260802150140_7527a5c4-8209-4bec-ae08-02f86b6f9077.sql =====
CREATE TABLE public.property_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_categories TO authenticated;
GRANT ALL ON public.property_categories TO service_role;

ALTER TABLE public.property_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor gere as suas categorias de imoveis"
  ON public.property_categories
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER property_categories_touch
  BEFORE UPDATE ON public.property_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.properties
  ADD COLUMN category_id uuid REFERENCES public.property_categories(id) ON DELETE SET NULL;

CREATE INDEX properties_category_id_idx ON public.properties (category_id);

-- Sugestoes de partida para contas existentes que ainda nao tenham categorias.
INSERT INTO public.property_categories (user_id, name, color)
SELECT p.id, d.name, d.color
FROM public.profiles p
CROSS JOIN (VALUES
  ('Angariação própria', '#22c55e'),
  ('Pré-angariação', '#f59e0b'),
  ('De colega/agência', '#3b82f6'),
  ('Em estudo', '#8b5cf6'),
  ('Outros', '#64748b')
) AS d(name, color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.property_categories c WHERE c.user_id = p.id
)
ON CONFLICT (user_id, name) DO NOTHING;

-- Contas novas recebem as mesmas sugestoes de partida.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (NEW.id, 'consultant', NEW.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.property_categories (user_id, name, color)
  VALUES
    (NEW.id, 'Angariação própria', '#22c55e'),
    (NEW.id, 'Pré-angariação', '#f59e0b'),
    (NEW.id, 'De colega/agência', '#3b82f6'),
    (NEW.id, 'Em estudo', '#8b5cf6'),
    (NEW.id, 'Outros', '#64748b')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ===== origem: 20260802172342_03f08aef-b588-47f1-964b-86674c5a67c0.sql =====
CREATE TABLE public.product_updates (
  id uuid primary key default gen_random_uuid(),
  released_on date not null default current_date,
  title text not null,
  description text not null,
  category text not null default 'nova_funcionalidade',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.product_updates TO authenticated;
GRANT ALL ON public.product_updates TO service_role;

ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_updates_read_authenticated"
ON public.product_updates FOR SELECT TO authenticated
USING (is_published = true);

CREATE POLICY "product_updates_admin_manage"
ON public.product_updates FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER product_updates_touch
BEFORE UPDATE ON public.product_updates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.product_updates_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.category NOT IN ('nova_funcionalidade','melhoria','correcao') THEN
    RAISE EXCEPTION 'categoria de novidade invalida: %', NEW.category;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_updates_validate_trg
BEFORE INSERT OR UPDATE ON public.product_updates
FOR EACH ROW EXECUTE FUNCTION public.product_updates_validate();

CREATE INDEX product_updates_released_idx ON public.product_updates (released_on DESC);

-- ===== origem: 20260802174320_e18de247-1302-4495-a78b-cb2a7b0b32a2.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_goals text,
  ADD COLUMN IF NOT EXISTS onboarding_stage text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS onboarding_offers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_last_offer_at timestamptz;

-- ===== origem: 20260802180500_fb7df2a1-b54c-45b3-b740-8c0fd6723a49.sql =====
INSERT INTO public.product_updates (released_on, title, description, category)
VALUES (CURRENT_DATE, 'A app passa a chamar-se Afonso', 'O nome e o ícone ficam iguais em todo o lado: separadores do navegador, ecrã inicial do telemóvel e cabeçalho do painel mostram sempre Afonso.', 'melhoria');

-- ===== origem: 20260802183041_d75f23db-b1c3-4c08-bdf7-942521daf7f7.sql =====
-- 1. Categoria FSBO para todos os utilizadores com categorias
INSERT INTO public.property_categories (user_id, name, color)
SELECT DISTINCT user_id, 'FSBO', '#ef4444' FROM public.property_categories
ON CONFLICT (user_id, name) DO NOTHING;

-- 2. Contas novas passam a receber FSBO também
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (NEW.id, 'consultant', NEW.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.property_categories (user_id, name, color)
  VALUES
    (NEW.id, 'Angariação própria', '#22c55e'),
    (NEW.id, 'Pré-angariação', '#f59e0b'),
    (NEW.id, 'De colega/agência', '#3b82f6'),
    (NEW.id, 'FSBO', '#ef4444'),
    (NEW.id, 'Em estudo', '#8b5cf6'),
    (NEW.id, 'Outros', '#64748b')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3. Etiqueta que corresponde a uma categoria existente -> categoria (só se o imóvel ainda não tem categoria)
UPDATE public.properties p
SET category_id = pc.id
FROM public.entity_tags et
JOIN public.tags t ON t.id = et.tag_id
JOIN public.property_categories pc ON lower(pc.name) = lower(t.name)
WHERE et.entity_type = 'property' AND et.entity_id = p.id
  AND pc.user_id = p.user_id AND p.category_id IS NULL;

-- 4. Etiquetas restantes (sem categoria correspondente) guardadas nas notas
UPDATE public.properties p
SET notes = trim(both E'\n' from coalesce(p.notes,'') || E'\n' || 'Etiquetas anteriores: ' || x.lista)
FROM (
  SELECT et.entity_id, string_agg(t.name, ', ' ORDER BY t.name) AS lista
  FROM public.entity_tags et
  JOIN public.tags t ON t.id = et.tag_id
  JOIN public.properties pr ON pr.id = et.entity_id
  LEFT JOIN public.property_categories pc ON pc.user_id = pr.user_id AND lower(pc.name) = lower(t.name)
  WHERE et.entity_type = 'property' AND (pc.id IS NULL OR pr.category_id IS DISTINCT FROM pc.id)
  GROUP BY et.entity_id
) x
WHERE x.entity_id = p.id;

-- 5. Imóveis deixam de ter etiquetas (as etiquetas mantêm-se para Pessoas)
DELETE FROM public.entity_tags WHERE entity_type = 'property';

-- ===== origem: 20260802215739_aaef2644-ef4d-45a3-92aa-41e8b35b20e9.sql =====
ALTER TABLE public.assessor_messages ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS assessor_messages_retention_idx
  ON public.assessor_messages (channel, archived_at, created_at);

DROP POLICY IF EXISTS "own messages" ON public.assessor_messages;
CREATE POLICY "own messages" ON public.assessor_messages
  TO authenticated
  USING (auth.uid() = user_id AND archived_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_retention_warned_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_tier text,
  ADD COLUMN IF NOT EXISTS trial_status text,
  ADD COLUMN IF NOT EXISTS trial_warned_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_trial_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_trial_status_check
  CHECK (trial_status IS NULL OR trial_status IN ('active','converted','expired'));

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
     OR NEW.telegram_retention_warned_at IS DISTINCT FROM OLD.telegram_retention_warned_at THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ===== origem: 20260802220746_a3496fd0-ea42-4c01-b893-c7b1f9d854d2.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_choice text,
  ADD COLUMN IF NOT EXISTS trial_value_summary_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_choice_asked_at timestamptz,
  ADD COLUMN IF NOT EXISTS readonly_until timestamptz,
  ADD COLUMN IF NOT EXISTS docs_retention_warned_at timestamptz;

ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS retention_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_warned_at timestamptz;

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  from_tier text,
  to_tier text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_events_admin_read ON public.subscription_events;
CREATE POLICY subscription_events_admin_read ON public.subscription_events
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS subscription_events_created_idx
  ON public.subscription_events (created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_user_idx
  ON public.subscription_events (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.subscription_events_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.event NOT IN (
    'trial_started','trial_to_consultor','trial_to_pro','trial_to_base',
    'base_to_paid','paid_to_base','churn','reactivation'
  ) THEN
    RAISE EXCEPTION 'evento de subscricao invalido: %', NEW.event;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_events_validate_trg ON public.subscription_events;
CREATE TRIGGER subscription_events_validate_trg
  BEFORE INSERT OR UPDATE ON public.subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.subscription_events_validate();

-- ===== origem: 20260803080836_b7444d7f-a263-49ec-b453-6256ce8c7375.sql =====
CREATE TABLE public.product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'suggestion',
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'dashboard',
  status text NOT NULL DEFAULT 'novo',
  internal_note text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_feedback_user_idx ON public.product_feedback (user_id, created_at DESC);
CREATE INDEX product_feedback_status_idx ON public.product_feedback (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_feedback TO authenticated;
GRANT ALL ON public.product_feedback TO service_role;

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_feedback_owner_read" ON public.product_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "product_feedback_owner_insert" ON public.product_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "product_feedback_admin_update" ON public.product_feedback
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "product_feedback_admin_delete" ON public.product_feedback
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.product_feedback_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kind NOT IN ('bug','suggestion') THEN
    RAISE EXCEPTION 'tipo de feedback invalido: %', NEW.kind;
  END IF;
  IF NEW.status NOT IN ('novo','em_analise','resolvido','arquivado') THEN
    RAISE EXCEPTION 'estado de feedback invalido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_feedback_biu
BEFORE INSERT OR UPDATE ON public.product_feedback
FOR EACH ROW EXECUTE FUNCTION public.product_feedback_validate();

-- ===== origem: 20260803082201_d1e7753d-d94b-43c7-a5d7-ef6f5da44c23.sql =====
ALTER TABLE public.product_feedback
  ADD COLUMN IF NOT EXISTS attachment_file_id uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_feedback_attachment_idx
  ON public.product_feedback (attachment_file_id)
  WHERE attachment_file_id IS NOT NULL;

-- ===== origem: 20260803100845_6059248a-6436-4826-a72f-9316de92da1e.sql =====
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS confirm_document_send boolean NOT NULL DEFAULT false;

-- ===== origem: 20260803101537_4811a870-eff3-4498-87c8-b9e8766a0e24.sql =====
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS briefing_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS follow_ups_briefing_pending_idx ON public.follow_ups (due_date) WHERE briefing_sent_at IS NULL AND person_id IS NOT NULL;

-- ===== origem: 20260803102340_89efe28b-8ba9-47a1-8f67-ecfa30cf6433.sql =====
CREATE TABLE public.whatsapp_template_bindings (
  purpose text PRIMARY KEY,
  template_name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_PT',
  param_count integer NOT NULL DEFAULT 3,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.whatsapp_template_bindings TO authenticated;
GRANT ALL ON public.whatsapp_template_bindings TO service_role;

ALTER TABLE public.whatsapp_template_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read template bindings"
ON public.whatsapp_template_bindings
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER whatsapp_template_bindings_touch
BEFORE UPDATE ON public.whatsapp_template_bindings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260803103051_6d85a33b-bf4c-47ad-94af-df345c3580d8.sql =====
REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  name,
  phone,
  assessor_name,
  primary_channel,
  onboarding_goals,
  onboarding_stage,
  onboarding_offers,
  onboarding_last_offer_at,
  updated_at
) ON public.profiles TO authenticated;

-- ===== origem: 20260803103118_46e996a0-239f-4d0e-94ff-43329d3aa60a.sql =====
GRANT UPDATE (email) ON public.profiles TO authenticated;

-- ===== origem: 20260803103804_ea212d62-de33-4c75-97ee-445bd0096850.sql =====
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;
ALTER TABLE public.miscellaneous_items ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS interactions_user_confidential_idx ON public.interactions (user_id, is_confidential);

-- ===== origem: 20260803141140_5d90eaa2-d22b-4753-85fc-d9a2f924f2db.sql =====
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS doc_issued_on date,
  ADD COLUMN IF NOT EXISTS doc_expires_on date,
  ADD COLUMN IF NOT EXISTS doc_nif text,
  ADD COLUMN IF NOT EXISTS doc_artigo_matricial text,
  ADD COLUMN IF NOT EXISTS doc_fracao text,
  ADD COLUMN IF NOT EXISTS doc_morada text,
  ADD COLUMN IF NOT EXISTS photo_value text;

CREATE INDEX IF NOT EXISTS uploaded_files_expiry_idx
  ON public.uploaded_files (user_id, doc_expires_on)
  WHERE doc_expires_on IS NOT NULL AND deleted_at IS NULL;

-- ===== origem: 20260803202844_90069f0a-2199-4dc4-afd2-be61443b3530.sql =====
CREATE TABLE public.announcement_dismissals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.dashboard_announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, announcement_id)
);

CREATE INDEX announcement_dismissals_user_idx ON public.announcement_dismissals (user_id);

GRANT SELECT, INSERT, DELETE ON public.announcement_dismissals TO authenticated;
GRANT ALL ON public.announcement_dismissals TO service_role;

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor gere os seus avisos fechados"
  ON public.announcement_dismissals FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===== origem: 20260803204849_731d11f4-f6fe-4d8b-aac3-14a577b10e30.sql =====
-- has_role e tier_at_least não são chamadas pela aplicação; ficam internas.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated, service_role;

-- is_admin é usada em 29 políticas RLS, por isso continua executável;
-- mas uma chamada direta de um utilizador só pode perguntar por si próprio.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
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
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','support_admin')
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- ===== origem: 20260803223706_2d9a3824-fed1-404b-8f2c-e932b0b7020f.sql =====
INSERT INTO public.product_updates (released_on, title, description, category) VALUES (CURRENT_DATE, 'O Drive passa a chamar-se Drive Inteligente', 'O nome mudou em todo o produto — menu, páginas e mensagens. O que faz é o mesmo: envias, o Assessor organiza.', 'melhoria');

-- ===== origem: 20260804145716_8b06a772-8397-40b2-95d9-4265727914f3.sql =====
insert into public.feature_flags (key, description, enabled_globally)
values ('whatsapp.template.checkin_v2.approved', 'Template de check-in corrigido aprovado pela Meta', true)
on conflict (key) do update set enabled_globally = true, updated_at = now();

update public.whatsapp_template_bindings
set enabled = true, param_count = 3, language = 'pt_PT', updated_at = now()
where purpose = 'meeting_briefing' and template_name = 'afonso_briefing_compromisso';

-- ===== origem: 20260804155906_358b49ea-58ed-4caf-af7d-544259de83d4.sql =====
WITH q AS (
  SELECT s.id, t.user_id, t.channel, t.input_content, t.created_at
  FROM public.assessor_quality_scores s JOIN public.assessor_reasoning_traces t ON t.id=s.trace_id
), ctx AS (
  SELECT q.*, p.content prev_msg, p.created_at prev_at,
    (SELECT m.content FROM public.assessor_messages m WHERE m.user_id=q.user_id AND m.channel=q.channel AND m.role='assistant' AND m.created_at<q.created_at ORDER BY m.created_at DESC LIMIT 1) last_reply
  FROM q LEFT JOIN LATERAL (
    SELECT content, created_at FROM (
      SELECT m.content, m.created_at, row_number() OVER (ORDER BY m.created_at DESC) rn
      FROM public.assessor_messages m
      WHERE m.user_id=q.user_id AND m.channel=q.channel AND m.role='user' AND m.created_at<q.created_at
      ORDER BY m.created_at DESC LIMIT 3) x
    WHERE rn = (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.assessor_messages m2 WHERE m2.user_id=q.user_id AND m2.channel=q.channel AND m2.role='user'
          AND m2.created_at<q.created_at AND btrim(m2.content)=btrim(q.input_content)
          AND m2.created_at=(SELECT max(m3.created_at) FROM public.assessor_messages m3 WHERE m3.user_id=q.user_id AND m3.channel=q.channel AND m3.role='user' AND m3.created_at<q.created_at)
      ) THEN 2 ELSE 1 END) LIMIT 1) p ON true
), sim AS (
  SELECT c.*, EXTRACT(epoch FROM (c.created_at-c.prev_at)) dt,
   COALESCE((SELECT cardinality(ARRAY(SELECT unnest(z.a) INTERSECT SELECT unnest(z.b)))::numeric/NULLIF(cardinality(ARRAY(SELECT unnest(z.a) UNION SELECT unnest(z.b))),0)
    FROM (SELECT
     ARRAY(SELECT DISTINCT w FROM unnest(regexp_split_to_array(lower(regexp_replace(translate(c.input_content,'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ','aaaaeeioooucAAAAEEIOOOUC'),'[^a-zA-Z0-9 ]',' ','g')),'\s+')) w WHERE length(w)>1 AND w NOT IN ('de','da','do','das','dos','um','uma','que','para','por','com','no','na','nos','nas','em','ao','as','os','se','ou')) a,
     ARRAY(SELECT DISTINCT w FROM unnest(regexp_split_to_array(lower(regexp_replace(translate(COALESCE(c.prev_msg,''),'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ','aaaaeeioooucAAAAEEIOOOUC'),'[^a-zA-Z0-9 ]',' ','g')),'\s+')) w WHERE length(w)>1 AND w NOT IN ('de','da','do','das','dos','um','uma','que','para','por','com','no','na','nos','nas','em','ao','as','os','se','ou')) b) z),0) jac
  FROM ctx c
), cls AS (
  SELECT id,
   CASE WHEN prev_msg IS NULL OR dt IS NULL OR dt<0 OR dt>600 THEN false
        WHEN jac>=0.9 THEN true
        WHEN last_reply ~ '\?\s*$' THEN false
        WHEN dt>60 THEN false
        WHEN jac>=0.6 OR input_content ~* '(nao e|nao era|errado|erraste|quis dizer|queria dizer|afinal|alias|corrige|troca|substitui)' THEN true
        ELSE false END novo FROM sim)
UPDATE public.assessor_quality_scores s
SET reformulated = c.novo,
    score = round((
      (CASE WHEN s.understood_first_try THEN 1 ELSE 0 END)
      + (CASE WHEN c.novo THEN 0 ELSE 1 END)
      + (CASE WHEN s.executed_successfully THEN 1 ELSE 0 END)
      + (CASE WHEN s.human_tone THEN 1 ELSE 0 END)
    )::numeric / NULLIF((
      (CASE WHEN s.understood_first_try IS NULL THEN 0 ELSE 1 END)
      + 1
      + (CASE WHEN s.executed_successfully IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN s.human_tone IS NULL THEN 0 ELSE 1 END)
    ),0), 3)
FROM cls c WHERE c.id = s.id AND s.reformulated IS DISTINCT FROM c.novo;

-- ===== origem: 20260804184834_59f01e3d-f251-4c9e-9c6f-9e3ffb448ab8.sql =====
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS objection_guide_sent_at timestamptz;

-- ===== origem: 20260805175405_433dc7de-962a-4714-a92d-e4d9c3330d59.sql =====
CREATE TABLE public.product_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  lead_id uuid,
  channel text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_telemetry_events_user_event_idx
  ON public.product_telemetry_events (user_id, event, occurred_at DESC);
CREATE INDEX product_telemetry_events_lead_idx
  ON public.product_telemetry_events (lead_id);

GRANT SELECT, INSERT ON public.product_telemetry_events TO authenticated;
GRANT ALL ON public.product_telemetry_events TO service_role;

ALTER TABLE public.product_telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telemetry_own_select" ON public.product_telemetry_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "telemetry_own_insert" ON public.product_telemetry_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ===== origem: 20260805212626_42b86153-18b4-4c5c-9821-707f22904efa.sql =====
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.financial_movements ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.miscellaneous_items ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS people_user_active_idx ON public.people (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_user_active_idx ON public.properties (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS follow_ups_user_active_idx ON public.follow_ups (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS financial_movements_user_active_idx ON public.financial_movements (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS interactions_user_active_idx ON public.interactions (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS miscellaneous_items_user_active_idx ON public.miscellaneous_items (user_id) WHERE archived_at IS NULL;

-- ===== origem: 20260806095607_0a186cb3-99a3-4a86-baf8-2e21864e4ee8.sql =====
ALTER TABLE public.dashboard_login_tokens
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ===== origem: 20260806101054_354d2ea4-8dc4-4f1c-a633-6872c18e3282.sql =====
-- Fusão de contas duplicadas (shadow WhatsApp/Telegram <-> conta de email).
-- Funções internas: apenas o servidor (service_role) as pode executar.

CREATE OR REPLACE FUNCTION public.merge_accounts_preview(_source uuid)
RETURNS TABLE(table_name text, rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t)
      INTO n USING _source;
    IF n > 0 THEN
      table_name := t;
      rows := n;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_accounts_apply(_source uuid, _target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  ctids tid[];
  c tid;
  moved bigint;
  skipped bigint;
  result jsonb := '[]'::jsonb;
  src record;
  tgt record;
BEGIN
  IF _source IS NULL OR _target IS NULL OR _source = _target THEN
    RAISE EXCEPTION 'contas de origem e destino inválidas';
  END IF;

  SELECT * INTO src FROM public.profiles WHERE id = _source;
  IF NOT FOUND THEN RAISE EXCEPTION 'conta de origem inexistente'; END IF;
  SELECT * INTO tgt FROM public.profiles WHERE id = _target;
  IF NOT FOUND THEN RAISE EXCEPTION 'conta de destino inexistente'; END IF;

  PERFORM set_config('app.system_job', 'on', true);

  FOR t IN
    SELECT c2.table_name
    FROM information_schema.columns c2
    JOIN information_schema.tables tb
      ON tb.table_schema = c2.table_schema AND tb.table_name = c2.table_name
    WHERE c2.table_schema = 'public'
      AND c2.column_name = 'user_id'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY 1
  LOOP
    moved := 0;
    skipped := 0;
    EXECUTE format('SELECT coalesce(array_agg(ctid), ''{}''::tid[]) FROM public.%I WHERE user_id = $1', t)
      INTO ctids USING _source;

    FOREACH c IN ARRAY ctids LOOP
      BEGIN
        EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE ctid = $2', t)
          USING _target, c;
        moved := moved + 1;
      EXCEPTION WHEN unique_violation OR foreign_key_violation THEN
        -- linha equivalente já existe na conta de destino: descarta a duplicada.
        EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', t) USING c;
        skipped := skipped + 1;
      END;
    END LOOP;

    IF moved > 0 OR skipped > 0 THEN
      result := result || jsonb_build_object('table', t, 'moved', moved, 'discarded', skipped);
    END IF;
  END LOOP;

  -- Contacto e estado do canal passam para a conta de destino.
  UPDATE public.profiles
     SET phone = coalesce(tgt.phone, src.phone),
         phone_verified_at = coalesce(tgt.phone_verified_at, src.phone_verified_at),
         whatsapp_link_status = CASE
           WHEN tgt.whatsapp_link_status = 'linked' THEN tgt.whatsapp_link_status
           ELSE coalesce(src.whatsapp_link_status, tgt.whatsapp_link_status)
         END,
         whatsapp_linked_at = coalesce(tgt.whatsapp_linked_at, src.whatsapp_linked_at),
         primary_channel = coalesce(tgt.primary_channel, src.primary_channel),
         assessor_name = coalesce(tgt.assessor_name, src.assessor_name),
         name = coalesce(tgt.name, src.name),
         subscription_tier = CASE
           WHEN src.subscription_tier = 'hub' OR tgt.subscription_tier = 'hub' THEN 'hub'
           WHEN src.subscription_tier = 'pro' OR tgt.subscription_tier = 'pro' THEN 'pro'
           WHEN src.subscription_tier = 'consultor' OR tgt.subscription_tier = 'consultor' THEN 'consultor'
           ELSE coalesce(tgt.subscription_tier, 'base')
         END,
         is_beta_tester = coalesce(tgt.is_beta_tester, false) OR coalesce(src.is_beta_tester, false),
         beta_expires_at = greatest(
           coalesce(tgt.beta_expires_at, src.beta_expires_at),
           coalesce(src.beta_expires_at, tgt.beta_expires_at)
         ),
         updated_at = now()
   WHERE id = _target;

  -- A conta de origem fica inactiva (nada é apagado).
  UPDATE public.profiles
     SET subscription_tier = 'base',
         is_beta_tester = false,
         beta_expires_at = NULL,
         phone = NULL,
         phone_verified_at = NULL,
         whatsapp_link_status = 'unlinked',
         whatsapp_linked_at = NULL,
         primary_channel = NULL,
         account_kind = 'merged',
         readonly_until = 'infinity'::timestamptz,
         updated_at = now()
   WHERE id = _source;

  RETURN jsonb_build_object('source', _source, 'target', _target, 'tables', result);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_accounts_preview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_accounts_apply(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_accounts_preview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_accounts_apply(uuid, uuid) TO service_role;

-- ===== origem: 20260806103601_fdd052b8-5f26-434d-b349-894b49eb15f4.sql =====
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_kind_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_kind_check
  CHECK (account_kind = ANY (ARRAY['real'::text, 'demo'::text, 'merged'::text]));

CREATE OR REPLACE FUNCTION public.merge_accounts_apply(_source uuid, _target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text;
  ctids tid[];
  c tid;
  moved bigint;
  skipped bigint;
  result jsonb := '[]'::jsonb;
  src record;
  tgt record;
BEGIN
  IF _source IS NULL OR _target IS NULL OR _source = _target THEN
    RAISE EXCEPTION 'contas de origem e destino inválidas';
  END IF;

  SELECT * INTO src FROM public.profiles WHERE id = _source;
  IF NOT FOUND THEN RAISE EXCEPTION 'conta de origem inexistente'; END IF;
  SELECT * INTO tgt FROM public.profiles WHERE id = _target;
  IF NOT FOUND THEN RAISE EXCEPTION 'conta de destino inexistente'; END IF;

  PERFORM set_config('app.system_job', 'on', true);

  FOR t IN
    SELECT c2.table_name
    FROM information_schema.columns c2
    JOIN information_schema.tables tb
      ON tb.table_schema = c2.table_schema AND tb.table_name = c2.table_name
    WHERE c2.table_schema = 'public'
      AND c2.column_name = 'user_id'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY 1
  LOOP
    moved := 0;
    skipped := 0;
    EXECUTE format('SELECT coalesce(array_agg(ctid), ''{}''::tid[]) FROM public.%I WHERE user_id = $1', t)
      INTO ctids USING _source;

    FOREACH c IN ARRAY ctids LOOP
      BEGIN
        EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE ctid = $2', t)
          USING _target, c;
        moved := moved + 1;
      EXCEPTION WHEN unique_violation OR foreign_key_violation THEN
        EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', t) USING c;
        skipped := skipped + 1;
      END;
    END LOOP;

    IF moved > 0 OR skipped > 0 THEN
      result := result || jsonb_build_object('table', t, 'moved', moved, 'discarded', skipped);
    END IF;
  END LOOP;

  -- Liberta o contacto da conta de origem antes de o passar para o destino.
  UPDATE public.profiles
     SET phone = NULL,
         phone_verified_at = NULL,
         whatsapp_link_status = 'unlinked',
         whatsapp_linked_at = NULL,
         updated_at = now()
   WHERE id = _source;

  UPDATE public.profiles
     SET phone = coalesce(tgt.phone, src.phone),
         phone_verified_at = coalesce(tgt.phone_verified_at, src.phone_verified_at),
         whatsapp_link_status = CASE
           WHEN tgt.whatsapp_link_status = 'linked' THEN tgt.whatsapp_link_status
           ELSE coalesce(src.whatsapp_link_status, tgt.whatsapp_link_status)
         END,
         whatsapp_linked_at = coalesce(tgt.whatsapp_linked_at, src.whatsapp_linked_at),
         primary_channel = coalesce(tgt.primary_channel, src.primary_channel),
         assessor_name = coalesce(tgt.assessor_name, src.assessor_name),
         name = coalesce(tgt.name, src.name),
         subscription_tier = CASE
           WHEN src.subscription_tier = 'hub' OR tgt.subscription_tier = 'hub' THEN 'hub'
           WHEN src.subscription_tier = 'pro' OR tgt.subscription_tier = 'pro' THEN 'pro'
           WHEN src.subscription_tier = 'consultor' OR tgt.subscription_tier = 'consultor' THEN 'consultor'
           ELSE coalesce(tgt.subscription_tier, 'base')
         END,
         is_beta_tester = coalesce(tgt.is_beta_tester, false) OR coalesce(src.is_beta_tester, false),
         beta_expires_at = greatest(
           coalesce(tgt.beta_expires_at, src.beta_expires_at),
           coalesce(src.beta_expires_at, tgt.beta_expires_at)
         ),
         updated_at = now()
   WHERE id = _target;

  UPDATE public.profiles
     SET subscription_tier = 'base',
         is_beta_tester = false,
         beta_expires_at = NULL,
         account_kind = 'merged',
         readonly_until = 'infinity'::timestamptz,
         updated_at = now()
   WHERE id = _source;

  RETURN jsonb_build_object('source', _source, 'target', _target, 'tables', result);
END;
$function$;
-- [retirado na montagem de staging: dados de produção]

-- ===== origem: 20260806112045_20e52de1-ca0b-4ab9-a8e6-69d23140d268.sql =====
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS doc_group_id uuid,
  ADD COLUMN IF NOT EXISTS doc_page_number integer;

CREATE INDEX IF NOT EXISTS uploaded_files_doc_group_idx
  ON public.uploaded_files (user_id, doc_group_id)
  WHERE doc_group_id IS NOT NULL;

INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (
  current_date,
  'Documentos de várias páginas',
  'Quando envias várias fotos seguidas do mesmo documento (por exemplo, as páginas de uma caderneta predial), o Afonso junta-as num só documento e liga tudo ao mesmo imóvel, sem voltar a perguntar em cada página.',
  'melhoria',
  true
);

-- ===== origem: 20260806131157_9582cfdf-a757-4617-89e6-27bc97ee20a2.sql =====
insert into public.product_updates (title, description, category, is_published, released_on)
values (
  'Ordenar páginas de um documento',
  'Quando as fotos de um documento chegam fora de ordem, podes agora arrumar as páginas no Drive Inteligente. Depois de guardares a ordem, a leitura do documento é consolidada de novo pela sequência certa.',
  'nova_funcionalidade',
  true,
  current_date
);

-- ===== origem: 20260806131640_015f0285-5ce7-453e-8cf6-9534fd574559.sql =====
CREATE TABLE public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_sessions_open_idx ON public.support_sessions (target_user_id) WHERE ended_at IS NULL;
CREATE INDEX support_sessions_admin_idx ON public.support_sessions (admin_user_id, started_at DESC);

GRANT ALL ON public.support_sessions TO service_role;
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

-- ===== origem: 20260806172346_e404a672-817a-4fd4-9b59-06bef7a5d222.sql =====
INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (CURRENT_DATE, 'PDFs digitalizados agora são lidos', 'Os PDFs criados pelo scanner do WhatsApp (páginas que são fotografias) passam agora pela mesma leitura das fotos: o Afonso identifica o tipo de documento, datas, NIF, artigo matricial e morada, e diz logo do que se trata em vez de perguntar "a que se refere?". Quando não consegue identificar, pergunta se queres associar a alguém ou a um imóvel, em vez de adivinhar.', 'melhoria', true);

-- ===== origem: 20260806182234_e5fe3f36-9dea-41f1-8102-833a435ee172.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_skipped_at timestamptz;

-- ===== origem: 20260806182426_793ad0af-ab32-4ad2-87a8-9dd152cf4813.sql =====
INSERT INTO public.product_updates (title, description, category, is_published)
VALUES (
  'Podes definir uma palavra-passe',
  'Na primeira vez que entras no painel por link, o Afonso pergunta se queres definir uma palavra-passe para entrares diretamente da próxima vez. Podes saltar — o link continua a funcionar na mesma.',
  'nova_funcionalidade',
  true
);

-- ===== origem: 20260806182946_c57fa6c7-0ece-4040-a87c-c35e86e52613.sql =====
INSERT INTO public.product_updates (title, description, category, is_published)
VALUES (
  'Recuperar a palavra-passe',
  'Esqueceste-te da palavra-passe? Em Entrar → Recuperar, escreves o teu email e recebes um link para definires uma nova — por email, ou pela conversa com o Afonso se for por aí que falas com ele.',
  'nova_funcionalidade',
  true
);

-- ===== origem: 20260806200429_f249b06c-7893-400e-a189-d55c090ae7a2.sql =====
ALTER TABLE public.whatsapp_send_logs
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS template_category text,
  ADD COLUMN IF NOT EXISTS template_language text,
  ADD COLUMN IF NOT EXISTS outside_window boolean,
  ADD COLUMN IF NOT EXISTS hours_since_last_inbound numeric,
  ADD COLUMN IF NOT EXISTS billable boolean,
  ADD COLUMN IF NOT EXISTS cost_eur numeric,
  ADD COLUMN IF NOT EXISTS cost_source text,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_id uuid;

CREATE INDEX IF NOT EXISTS whatsapp_send_logs_message_id_idx
  ON public.whatsapp_send_logs (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_send_logs_template_idx
  ON public.whatsapp_send_logs (created_at DESC) WHERE template_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_template_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  country_code text NOT NULL DEFAULT 'PT',
  price_eur numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  effective_from date NOT NULL DEFAULT current_date,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.whatsapp_template_rates TO authenticated;
GRANT ALL ON public.whatsapp_template_rates TO service_role;
ALTER TABLE public.whatsapp_template_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read whatsapp template rates"
  ON public.whatsapp_template_rates FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_template_rates_unique_idx
  ON public.whatsapp_template_rates (category, country_code, effective_from);

CREATE TRIGGER whatsapp_template_rates_touch
  BEFORE UPDATE ON public.whatsapp_template_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.whatsapp_proactive_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose text NOT NULL DEFAULT 'meeting_briefing',
  to_phone text NOT NULL,
  template_name text,
  template_category text,
  hours_since_last_inbound numeric,
  outside_window boolean NOT NULL DEFAULT false,
  forced boolean NOT NULL DEFAULT true,
  send_log_id uuid REFERENCES public.whatsapp_send_logs(id) ON DELETE SET NULL,
  message_id text,
  status text NOT NULL DEFAULT 'pending',
  cost_eur numeric,
  notes text
);

GRANT SELECT ON public.whatsapp_proactive_tests TO authenticated;
GRANT ALL ON public.whatsapp_proactive_tests TO service_role;
ALTER TABLE public.whatsapp_proactive_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read whatsapp proactive tests"
  ON public.whatsapp_proactive_tests FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER whatsapp_proactive_tests_touch
  BEFORE UPDATE ON public.whatsapp_proactive_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260806211716_1d5a9519-b51d-42f4-b197-b7003d32084d.sql =====
CREATE TABLE public.daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  recipients_count integer NOT NULL DEFAULT 0,
  broadcast_id uuid REFERENCES public.admin_broadcasts(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX daily_digests_date_idx ON public.daily_digests (digest_date DESC);

GRANT SELECT ON public.daily_digests TO authenticated;
GRANT ALL ON public.daily_digests TO service_role;

ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_digests_admin_read" ON public.daily_digests
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.daily_digests_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('rascunho','aprovado','enviado','sem_novidades','falhou') THEN
    RAISE EXCEPTION 'estado de resumo diario invalido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER daily_digests_biu
BEFORE INSERT OR UPDATE ON public.daily_digests
FOR EACH ROW EXECUTE FUNCTION public.daily_digests_validate();

-- ===== origem: 20260806211831_5158ca9b-2a68-4bd0-b6e7-502869088caf.sql =====
ALTER TABLE public.daily_digests ADD COLUMN body_edited boolean NOT NULL DEFAULT false;

-- ===== origem: 20260806212706_c22d8ec4-8853-4aeb-ab6a-ebad6f131857.sql =====
ALTER TABLE public.assessor_ai_logs
  ADD COLUMN IF NOT EXISTS modality text,
  ADD COLUMN IF NOT EXISTS billed_model text;

CREATE INDEX IF NOT EXISTS assessor_ai_logs_user_created_idx
  ON public.assessor_ai_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_model_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL UNIQUE,
  credits_per_1m_input numeric NOT NULL,
  credits_per_1m_output numeric NOT NULL,
  source text,
  effective_from date NOT NULL DEFAULT current_date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_model_rates TO service_role;
ALTER TABLE public.ai_model_rates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_cost_settings (
  key text PRIMARY KEY,
  value numeric,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_cost_settings TO service_role;
ALTER TABLE public.admin_cost_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_model_rates (model, credits_per_1m_input, credits_per_1m_output, source)
VALUES ('google/gemini-3.6-flash', 6, 30, 'derivado dos registos reais do AI Gateway (ago/2026)')
ON CONFLICT (model) DO NOTHING;

INSERT INTO public.admin_cost_settings (key, value, source)
VALUES ('credit_price_eur', NULL, 'por confirmar na faturação da workspace')
ON CONFLICT (key) DO NOTHING;

-- ===== origem: 20260806220651_53067d1e-90cd-4e71-9136-c0f6180b0e6d.sql =====
REVOKE ALL ON public.admin_cost_settings FROM anon, authenticated;
REVOKE ALL ON public.ai_model_rates FROM anon, authenticated;
REVOKE ALL ON public.app_user_connections FROM anon, authenticated;
REVOKE ALL ON public.app_user_connection_aliases FROM anon, authenticated;
REVOKE ALL ON public.dashboard_login_tokens FROM anon, authenticated;
REVOKE ALL ON public.support_sessions FROM anon, authenticated;
REVOKE ALL ON public.telegram_pairings FROM anon, authenticated;
GRANT ALL ON public.admin_cost_settings TO service_role;
GRANT ALL ON public.ai_model_rates TO service_role;
GRANT ALL ON public.app_user_connections TO service_role;
GRANT ALL ON public.app_user_connection_aliases TO service_role;
GRANT ALL ON public.dashboard_login_tokens TO service_role;
GRANT ALL ON public.support_sessions TO service_role;
GRANT ALL ON public.telegram_pairings TO service_role;

-- ===== origem: 20260806221701_07ac6d95-571d-4da8-a883-9e661b86d199.sql =====
CREATE OR REPLACE FUNCTION public.audit_sensitive_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row jsonb;
  _old jsonb;
  _target uuid;
  _actor uuid := auth.uid();
  _res text;
  _secret text;
  _secrets text[] := ARRAY[
    'connection_key_ciphertext','refresh_token_encrypted','code_hash','token','access_token'
  ];
BEGIN
  _row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  _old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;

  FOREACH _secret IN ARRAY _secrets LOOP
    IF _row ? _secret THEN
      _row := jsonb_set(_row, ARRAY[_secret], to_jsonb('[oculto]'::text));
    END IF;
    IF _old IS NOT NULL AND _old ? _secret THEN
      _old := jsonb_set(_old, ARRAY[_secret], to_jsonb('[oculto]'::text));
    END IF;
  END LOOP;

  IF _row ? 'user_id' THEN
    _target := (_row ->> 'user_id')::uuid;
  ELSIF _row ? 'target_user_id' THEN
    _target := (_row ->> 'target_user_id')::uuid;
  END IF;

  _res := coalesce(_row ->> 'id', _row ->> 'token', _row ->> 'key');
  IF TG_TABLE_NAME IN ('dashboard_login_tokens','telegram_link_tokens') THEN
    _res := left(coalesce(_res, ''), 6) || '…';
  END IF;

  INSERT INTO public.admin_audit_logs
    (admin_user_id, action, target_user_id, resource_type, resource_id, reason, metadata)
  VALUES (
    _actor,
    'sensivel.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    _target,
    TG_TABLE_NAME,
    _res,
    NULL,
    jsonb_build_object(
      'source', 'trigger:audit_sensitive_write',
      'db_role', current_setting('role', true),
      'system_job', coalesce(current_setting('app.system_job', true), 'off'),
      'after', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE _row END,
      'before', _old
    )
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_user_connections','app_user_connection_aliases','calendar_connections',
    'dashboard_login_tokens','telegram_link_tokens','whatsapp_link_codes',
    'support_sessions','ai_model_rates','whatsapp_template_rates','admin_cost_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_sensitive_write ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_sensitive_write AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write()', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS admin_audit_logs_action_created_idx
  ON public.admin_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_resource_type_idx
  ON public.admin_audit_logs (resource_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.purge_admin_audit_logs(_keep_days integer DEFAULT 730)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.admin_audit_logs
   WHERE created_at < now() - make_interval(days => _keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ===== origem: 20260806221722_1a5870f6-5d42-40a4-89b3-d12805c83a9c.sql =====
REVOKE ALL ON FUNCTION public.purge_admin_audit_logs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_admin_audit_logs(integer) TO service_role;

-- ===== origem: 20260807112521_ea3cdc2f-4cb3-4024-ae25-f7013a4ff8f6.sql =====
create extension if not exists unaccent with schema extensions;

create or replace function public.text_norm(_t text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$ select lower(extensions.unaccent('extensions.unaccent', coalesce(_t, ''))) $$;

alter table public.people
  add column if not exists name_norm text generated always as (public.text_norm(name)) stored;
create index if not exists people_name_norm_idx on public.people (name_norm text_pattern_ops);

alter table public.properties
  add column if not exists search_norm text generated always as (
    public.text_norm(coalesce(title,'') || ' ' || coalesce(location,'') || ' ' || coalesce(city,'') || ' ' || coalesce(address,''))
  ) stored;
create index if not exists properties_search_norm_idx on public.properties (search_norm text_pattern_ops);

alter table public.miscellaneous_items
  add column if not exists title_norm text generated always as (public.text_norm(title)) stored;

alter table public.follow_ups
  add column if not exists title_norm text generated always as (public.text_norm(title)) stored;

alter table public.prospecting_leads
  add column if not exists search_norm text generated always as (
    public.text_norm(coalesce(title,'') || ' ' || coalesce(location,'') || ' ' || coalesce(address,''))
  ) stored;

alter table public.uploaded_files
  add column if not exists search_norm text generated always as (
    public.text_norm(coalesce(original_file_name,'') || ' ' || coalesce(ai_summary,'') || ' ' || coalesce(document_type,'') || ' ' || coalesce(doc_morada,''))
  ) stored;

-- ===== origem: 20260807112620_05a582e2-4c6f-44c5-8a2b-0265631935b3.sql =====
alter table public.opportunities
  add column if not exists title_norm text generated always as (public.text_norm(title)) stored;

-- ===== origem: 20260807153123_ba71352b-54e1-4c30-9f5b-9bfa26ce91cd.sql =====
INSERT INTO public.product_updates (title, description, category, is_published)
VALUES (
  'Guião para abordar quem vende por si',
  'Quando registas uma placa de particular a partir de uma foto, o Afonso passa a oferecer também preparar um guião curto para a abordagem — chamada ou mensagem. É sempre um rascunho para leres e mudares; ele nunca envia nada por ti.',
  'nova_funcionalidade',
  true
);

-- ===== origem: 20260810080750_eddc371c-5dd7-44d9-9618-2b5ec0344a00.sql =====
WITH explicit_answers AS (
  SELECT DISTINCT ON (n.user_id, n.subject_id)
    n.user_id,
    n.subject_id,
    CASE
      WHEN lower(trim(m.content)) IN ('sim', 'sim!', 'ok', 'pode ser', 'claro') THEN 'yes'
      WHEN lower(trim(m.content)) IN ('não', 'nao', 'não!', 'nao!') THEN 'no'
    END AS answer,
    m.created_at AS answered_at
  FROM public.assessor_nudges n
  JOIN public.assessor_messages m
    ON m.user_id = n.user_id
   AND m.role = 'user'
   AND m.created_at >= n.sent_at
   AND m.created_at <= n.sent_at + interval '15 minutes'
  WHERE n.kind = 'property_missing_docs'
    AND n.sent_at IS NOT NULL
    AND lower(trim(m.content)) IN ('sim', 'sim!', 'ok', 'pode ser', 'claro', 'não', 'nao', 'não!', 'nao!')
  ORDER BY n.user_id, n.subject_id, m.created_at DESC
)
UPDATE public.assessor_nudges n
SET status = 'resolved',
    outcome = a.answer,
    outcome_at = a.answered_at,
    updated_at = now()
FROM explicit_answers a
WHERE n.user_id = a.user_id
  AND n.subject_id = a.subject_id
  AND n.kind = 'property_missing_docs'
  AND n.outcome_at IS NULL;

-- ===== origem: 20260810081154_832119ec-6a66-4eb0-91c2-bbcf06182edc.sql =====
INSERT INTO public.product_updates (title, description, category, is_published)
VALUES (
  'O Afonso nunca fala com terceiros por ti',
  'Quando há algo a pedir a um proprietário, cliente ou comprador, o Afonso passa a dizer com precisão o que faz: prepara-te a mensagem para tu enviares. Deixou de usar frases como "vou contactar o proprietário", que davam a ideia errada de que falava com alguém por ti — nunca o fez, e agora a linguagem diz isso mesmo.',
  'melhoria',
  true
);

-- ===== origem: 20260810150256_af51742f-68c1-4e97-959c-403c51512da2.sql =====
CREATE TABLE public.invite_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'pendente',
  reason text,
  error_code integer,
  destino text,
  attempts integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX invite_send_attempts_open_uniq
  ON public.invite_send_attempts (user_id, canal)
  WHERE status = 'pendente';

CREATE INDEX invite_send_attempts_status_idx
  ON public.invite_send_attempts (status, last_attempt_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_send_attempts TO authenticated;
GRANT ALL ON public.invite_send_attempts TO service_role;

ALTER TABLE public.invite_send_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins gerem convites por reenviar"
ON public.invite_send_attempts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'support_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'support_admin'));

CREATE TRIGGER invite_send_attempts_touch
BEFORE UPDATE ON public.invite_send_attempts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== origem: 20260810194428_72aa142d-2fa0-4815-8225-494b8ddc41e4.sql =====
ALTER TABLE public.miscellaneous_items
  ADD COLUMN IF NOT EXISTS team_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_archived_at timestamptz;

CREATE INDEX IF NOT EXISTS miscellaneous_items_team_suggestion_idx
  ON public.miscellaneous_items (created_at DESC)
  WHERE category ILIKE 'sugest%' OR title ILIKE 'sugest%';

-- ===== origem: 20260810203323_93f22030-cff0-41e7-84dd-f3471c010ffd.sql =====
CREATE TABLE public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  pergunta text not null,
  enviado_em timestamptz not null default now(),
  resposta text,
  respondido_em timestamptz,
  estado text not null default 'pendente',
  janela_expira_em timestamptz not null default (now() + interval '48 hours'),
  resposta_lida_em timestamptz,
  created_at timestamptz not null default now()
);

CREATE INDEX admin_messages_consultor_estado_idx
  ON public.admin_messages (consultor_id, estado, janela_expira_em DESC);

GRANT ALL ON public.admin_messages TO service_role;

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- ===== origem: 20260810205125_6d1d46b6-8e0e-48a0-991e-1f07d1f6fee8.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS billing_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS billing_environment text NOT NULL DEFAULT 'sandbox';

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON public.profiles(stripe_subscription_id);

CREATE OR REPLACE FUNCTION public.profiles_validate_billing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.billing_status NOT IN ('none','trialing','active','past_due','canceled') THEN
    RAISE EXCEPTION 'estado de cobranca invalido: %', NEW.billing_status;
  END IF;
  IF NEW.billing_source NOT IN ('manual','stripe') THEN
    RAISE EXCEPTION 'origem de cobranca invalida: %', NEW.billing_source;
  END IF;
  IF NEW.billing_environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'ambiente de cobranca invalido: %', NEW.billing_environment;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_billing ON public.profiles;
CREATE TRIGGER profiles_validate_billing
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_billing();

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  outcome text NOT NULL DEFAULT 'processed',
  detail text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stripe_webhook_events TO authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver eventos de pagamento"
  ON public.stripe_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stripe_events_profile ON public.stripe_webhook_events(profile_id, processed_at DESC);

-- ===== origem: 20260810205220_4141d647-426e-4550-ab25-9c876b5905ca.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_manual_lock boolean NOT NULL DEFAULT false;

-- ===== origem: 20260811214708_8ce7ea36-d78a-4d5b-bb1a-4919450e4579.sql =====
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS event_class text;

ALTER TABLE public.follow_ups DROP CONSTRAINT IF EXISTS follow_ups_event_class_chk;
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_event_class_chk
  CHECK (event_class IS NULL OR event_class IN ('negocio','interno'));

-- Retroativo: compromissos claramente internos deixam de ser tratados como
-- seguimentos pendentes. Nada é apagado — só reclassificado.
UPDATE public.follow_ups
SET event_class = 'interno'
WHERE event_class IS NULL
  AND (
    lower(public.text_norm(coalesce(title,''))) ~ '(^|[^a-z0-9])(reuniao de equipa|reuniao interna|reuniao de operacoes|operacoes|lideranca|equipa|interno|interna|1:1|one on one|daily|standup|stand-up|alinhamento|ponto de situacao interno|formacao interna|administrativo)([^a-z0-9]|$)'
  );

-- ===== origem: 20260812173836_272f4887-eaf8-4c67-8bbd-231f05ab81eb.sql =====
-- Contexto comercial é obrigatório para pedir resultado. O valor 'negocio'
-- existente é preservado por ser um override manual explícito do consultor.
UPDATE public.follow_ups
SET event_class = 'interno'
WHERE event_class IS DISTINCT FROM 'negocio'
  AND person_id IS NULL
  AND related_property_id IS NULL
  AND opportunity_id IS NULL;

-- Títulos inequivocamente internos continuam internos mesmo quando uma
-- associação foi acrescentada automaticamente.
UPDATE public.follow_ups
SET event_class = 'interno'
WHERE event_class IS DISTINCT FROM 'negocio'
  AND lower(public.text_norm(coalesce(title, ''))) ~ '(^|[^a-z0-9])(reuniao de equipa|reuniao interna|reuniao de operacoes|operacoes|lideranca|equipa|interno|interna|1:1|one on one|daily|standup|stand up|alinhamento|briefing interno|reuniao geral|plenario|administrativo|administrativa|backoffice|back office|formacao interna|onboarding interno)([^a-z0-9]|$)';

-- Um snapshot antigo não pode manter um compromisso interno nas prioridades.
UPDATE public.daily_priorities AS dp
SET dismissed_at = now()
FROM public.follow_ups AS fu
WHERE dp.user_id = fu.user_id
  AND dp.subject_type = 'follow_up'
  AND dp.subject_id = fu.id
  AND dp.dismissed_at IS NULL
  AND dp.completed_at IS NULL
  AND fu.event_class = 'interno';

INSERT INTO public.product_updates (released_on, title, description, category, is_published)
SELECT
  current_date,
  'Compromissos internos sem perguntas de resultado',
  'Reuniões e blocos de agenda sem ligação a uma pessoa, imóvel ou negócio deixam de gerar perguntas como “Como correu?”.',
  'correcao',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_updates
  WHERE title = 'Compromissos internos sem perguntas de resultado'
);

-- ===== origem: 20260812174053_cb3b364f-9dcb-4b49-a572-dddf6c0b1657.sql =====
-- A limpeza anterior não contou related_prospecting_lead_id como contexto
-- comercial. Corrigimos apenas as linhas que ela marcou como internas e que
-- estão ligadas a uma lead; títulos inequivocamente internos permanecem assim.
UPDATE public.follow_ups
SET event_class = 'negocio'
WHERE event_class = 'interno'
  AND related_prospecting_lead_id IS NOT NULL
  AND NOT (
    lower(public.text_norm(coalesce(title, ''))) ~ '(^|[^a-z0-9])(reuniao de equipa|reuniao interna|reuniao de operacoes|operacoes|lideranca|equipa|interno|interna|1:1|one on one|daily|standup|stand up|alinhamento|briefing interno|reuniao geral|plenario|administrativo|administrativa|backoffice|back office|formacao interna|onboarding interno)([^a-z0-9]|$)'
  );

-- ===== origem: 20260812203501_df21a590-cfda-43ce-954d-412f049a571d.sql =====
-- 1) reminders -> follow_ups (relação polimórfica passa a ter coluna dedicada + FK)
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS follow_up_id uuid;

UPDATE public.reminders r
   SET follow_up_id = r.related_resource_id
  FROM public.follow_ups f
 WHERE r.related_resource_type = 'follow_up'
   AND f.id = r.related_resource_id
   AND r.follow_up_id IS DISTINCT FROM r.related_resource_id;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_follow_up_id_fkey;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_follow_up_id_fkey
  FOREIGN KEY (follow_up_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS reminders_follow_up_id_idx ON public.reminders(follow_up_id);

-- Mantém follow_up_id sincronizado com o par polimórfico, sem exigir alterações ao código.
CREATE OR REPLACE FUNCTION public.reminders_sync_follow_up_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.related_resource_type = 'follow_up' AND NEW.related_resource_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.follow_ups f WHERE f.id = NEW.related_resource_id) THEN
      NEW.follow_up_id := NEW.related_resource_id;
    ELSE
      NEW.follow_up_id := NULL;
    END IF;
  ELSE
    NEW.follow_up_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reminders_sync_follow_up_id_trg ON public.reminders;
CREATE TRIGGER reminders_sync_follow_up_id_trg
  BEFORE INSERT OR UPDATE OF related_resource_type, related_resource_id ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.reminders_sync_follow_up_id();

-- 2) user_id -> auth.users nas tabelas que ainda não tinham FK
ALTER TABLE public.app_user_connection_aliases ADD CONSTRAINT app_user_connection_aliases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.app_user_connections ADD CONSTRAINT app_user_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_reflections ADD CONSTRAINT assistant_reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_shadow_runs ADD CONSTRAINT assistant_shadow_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_trust_scores ADD CONSTRAINT assistant_trust_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_user_corrections ADD CONSTRAINT assistant_user_corrections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_event_links ADD CONSTRAINT calendar_event_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_sync_log ADD CONSTRAINT calendar_sync_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_sync_state ADD CONSTRAINT calendar_sync_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.content_access_consents ADD CONSTRAINT content_access_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.entity_tags ADD CONSTRAINT entity_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.file_categories ADD CONSTRAINT file_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.file_links ADD CONSTRAINT file_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.folder_items ADD CONSTRAINT folder_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.folders ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.opportunity_events ADD CONSTRAINT opportunity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.opportunity_properties ADD CONSTRAINT opportunity_properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.person_phones ADD CONSTRAINT person_phones_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.property_interests ADD CONSTRAINT property_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.property_marketing_activities ADD CONSTRAINT property_marketing_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.property_offers ADD CONSTRAINT property_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.routines ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Tabelas com registos históricos cujo dono já não existe: validar só daqui para a frente.
ALTER TABLE public.assessor_ai_logs ADD CONSTRAINT assessor_ai_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.conversation_locks ADD CONSTRAINT conversation_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.property_categories ADD CONSTRAINT property_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- Índices para as FKs novas mais consultadas
CREATE INDEX IF NOT EXISTS entity_tags_user_id_idx ON public.entity_tags(user_id);
CREATE INDEX IF NOT EXISTS folder_items_user_id_idx ON public.folder_items(user_id);
CREATE INDEX IF NOT EXISTS file_links_user_id_idx ON public.file_links(user_id);
CREATE INDEX IF NOT EXISTS person_phones_user_id_idx ON public.person_phones(user_id);

-- ===== origem: 20260812204515_4210478c-b0ec-4f3e-9589-dc95313bb2ca.sql =====
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS source_lead_id uuid NULL;

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_source_lead_id_fkey
  FOREIGN KEY (source_lead_id) REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_source_lead_id
  ON public.opportunities (source_lead_id) WHERE source_lead_id IS NOT NULL;

-- Backfill: apenas onde existe um follow_up do mesmo consultor a ligar
-- inequivocamente um lead a uma oportunidade (uma só origem candidata).
WITH pares AS (
  SELECT f.opportunity_id, min(f.related_prospecting_lead_id::text)::uuid AS lead_id
  FROM public.follow_ups f
  JOIN public.opportunities o ON o.id = f.opportunity_id AND o.user_id = f.user_id
  JOIN public.prospecting_leads l ON l.id = f.related_prospecting_lead_id AND l.user_id = f.user_id
  WHERE f.opportunity_id IS NOT NULL
    AND f.related_prospecting_lead_id IS NOT NULL
  GROUP BY f.opportunity_id
  HAVING count(DISTINCT f.related_prospecting_lead_id) = 1
)
UPDATE public.opportunities o
   SET source_lead_id = p.lead_id
  FROM pares p
 WHERE o.id = p.opportunity_id
   AND o.source_lead_id IS NULL;

-- ===== origem: 20260812210439_d760fbe9-d42d-4997-89aa-76a6c11d4754.sql =====
ALTER TYPE public.deal_stage ADD VALUE IF NOT EXISTS 'perdido';
