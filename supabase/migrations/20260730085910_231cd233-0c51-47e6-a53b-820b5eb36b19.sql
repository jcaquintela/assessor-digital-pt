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