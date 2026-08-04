insert into public.feature_flags (key, description, enabled_globally)
values ('whatsapp.template.checkin_v2.approved', 'Template de check-in corrigido aprovado pela Meta', true)
on conflict (key) do update set enabled_globally = true, updated_at = now();

update public.whatsapp_template_bindings
set enabled = true, param_count = 3, language = 'pt_PT', updated_at = now()
where purpose = 'meeting_briefing' and template_name = 'afonso_briefing_compromisso';