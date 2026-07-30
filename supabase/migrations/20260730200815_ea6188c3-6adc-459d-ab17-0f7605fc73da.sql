DROP POLICY IF EXISTS "Published plans are readable by anyone" ON public.plan_configs;
CREATE POLICY "Published plans are readable by anyone"
  ON public.plan_configs FOR SELECT
  USING (status = 'published');