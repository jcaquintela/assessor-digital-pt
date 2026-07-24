INSERT INTO public.user_roles (user_id, role, created_by)
VALUES ('08d24695-a12c-4954-887a-81a71215a87e', 'super_admin', '08d24695-a12c-4954-887a-81a71215a87e')
ON CONFLICT (user_id, role) DO NOTHING;