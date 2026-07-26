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