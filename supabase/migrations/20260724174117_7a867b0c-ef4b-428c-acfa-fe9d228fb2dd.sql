
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
