delete from public.dashboard_announcements where body like 'VALIDACAO CICLO2%';
delete from public.admin_broadcast_recipients where broadcast_id in (select id from public.admin_broadcasts where body like 'VALIDACAO CICLO2%');
delete from public.admin_broadcasts where body like 'VALIDACAO CICLO2%';