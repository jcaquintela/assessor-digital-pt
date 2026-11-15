-- R31 · Identidade da SESSÃO de um passo do ensaio DESCARTÁVEL (antes E depois do ficheiro; só ensaio).
-- Corre APENAS dentro do wrapper único tools/R40_sessao.sh, numa CÓPIA com os marcadores substituídos.
-- Não exige superutilizador. A identidade do processo servidor é provada fora do SQL (R41); isto confirma
-- base, papel, socket, porta e exclusividade vistos de dentro. LIMITE: não prova o anfitrião (E1–E10).
-- Só leitura: um único SELECT. Resultado: uma linha por verificação. Se alguma
-- verificação falhar (ou der NULL), a consulta TERMINA EM ERRO com "REPROVADO: <id> obtido=<valor> | …".
WITH c(id, verificacao, ok, esperado, obtido) AS (
  SELECT 'R31-01'::text, 'PostgreSQL 17 e não em recuperação'::text, (current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND NOT pg_is_in_recovery())::boolean, '17.x / primário'::text, (current_setting('server_version') || ' / recuperação=' || pg_is_in_recovery()::text)::text
  UNION ALL SELECT 'R31-02'::text, 'base da sessão = a do passo'::text, (current_database() = '__R_DB__')::boolean, '__R_DB__'::text, (current_database()::text)::text
  UNION ALL SELECT 'R31-03'::text, 'papel da sessão = o do passo, sem SET ROLE nem SET SESSION AUTHORIZATION ativos'::text, (session_user = '__R_ROLE__' AND current_user = session_user)::boolean, '__R_ROLE__ / __R_ROLE__'::text, (session_user::text || ' / ' || current_user::text)::text
  UNION ALL SELECT 'R31-04'::text, 'atributo de superutilizador do papel = o esperado no passo (sim só para ensaio_super)'::text, (coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false) = ('__R_SUPER__' = 'sim'))::boolean, '__R_SUPER__'::text, (coalesce((SELECT rolsuper::text FROM pg_roles WHERE rolname = session_user), 'papel inexistente'))::text
  UNION ALL SELECT 'R31-05'::text, 'sessão pelo socket local: sem endereço de rede no servidor nem no cliente'::text, (inet_server_addr() IS NULL AND inet_client_addr() IS NULL)::boolean, 'NULL/NULL'::text, (coalesce(host(inet_server_addr()), 'NULL') || '/' || coalesce(host(inet_client_addr()), 'NULL'))::text
  UNION ALL SELECT 'R31-06'::text, 'porta = a do R10'::text, (current_setting('port') = '__R_PORT__')::boolean, '__R_PORT__'::text, (current_setting('port'))::text
  UNION ALL SELECT 'R31-07'::text, 'arranque do postmaster coincide (±2 s) com a linha 3 do postmaster.pid lida pelo R20 (corrobora; a identidade é provada fora do SQL pelo R41)'::text, (abs(extract(epoch FROM pg_postmaster_start_time()) - '__R_PGSTART__'::numeric) <= 2)::boolean, '|Δ| ≤ 2 s'::text, ((extract(epoch FROM pg_postmaster_start_time())::bigint)::text)::text
  UNION ALL SELECT 'R31-08'::text, 'nenhuma outra sessão de cliente ligada à instância durante o passo'::text, (NOT EXISTS (SELECT 1 FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()))::boolean, '0'::text, ((SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid())::text)::text
),
v AS (SELECT count(*) AS n, string_agg(id || ' obtido=' || left(coalesce(obtido, 'NULL'), 160), ' | ' ORDER BY id) FILTER (WHERE ok IS NOT TRUE) AS falhas FROM c)
SELECT c.id, c.verificacao, CASE WHEN c.ok IS TRUE THEN 'OK' ELSE 'FALHA' END AS estado, c.esperado, c.obtido,
       CASE WHEN v.n <> 8 THEN ('VEREDITO INVÁLIDO: ' || v.n::text || ' verificações')::int::text
            WHEN v.falhas IS NULL THEN 'R31 APROVADO'
            ELSE ('REPROVADO: ' || v.falhas)::int::text END AS veredito
  FROM c CROSS JOIN v ORDER BY c.id;
