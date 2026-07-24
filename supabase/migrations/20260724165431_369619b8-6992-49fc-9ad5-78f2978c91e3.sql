
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
