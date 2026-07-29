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