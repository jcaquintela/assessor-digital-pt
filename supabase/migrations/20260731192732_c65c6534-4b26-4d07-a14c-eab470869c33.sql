INSERT INTO public.feature_flags (key, description, enabled_globally)
VALUES ('whatsapp.templates.approved', 'Templates WhatsApp aprovados pela Meta: autoriza push proativo fora da janela de 24h. Ligado automaticamente pela verificação periódica.', false)
ON CONFLICT (key) DO NOTHING;