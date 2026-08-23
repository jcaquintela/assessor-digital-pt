INSERT INTO public.feature_flags (key, description, enabled_globally)
VALUES ('assessor.design.v2', 'Redesenho v2: paleta operacional + sidebar consolidada', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.feature_flag_users (flag_key, user_id)
SELECT 'assessor.design.v2', u.id FROM auth.users u WHERE u.email = 'julio.quintela@saguii.com'
ON CONFLICT DO NOTHING;