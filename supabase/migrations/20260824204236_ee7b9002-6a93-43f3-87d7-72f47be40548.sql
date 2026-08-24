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