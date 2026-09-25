DROP POLICY IF EXISTS "Authenticated read flags" ON public.feature_flags;
CREATE POLICY "Admins read flags" ON public.feature_flags FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));