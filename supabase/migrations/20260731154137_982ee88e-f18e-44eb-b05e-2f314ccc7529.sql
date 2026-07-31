ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS is_beta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_days integer,
  ADD COLUMN IF NOT EXISTS invitee_name text,
  ADD COLUMN IF NOT EXISTS invitee_whatsapp text,
  ADD COLUMN IF NOT EXISTS invitee_email text;

ALTER TABLE public.admin_audit_logs ALTER COLUMN admin_user_id DROP NOT NULL;