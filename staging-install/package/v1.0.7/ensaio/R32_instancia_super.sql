-- R32 · Instância da sessão do SUPERUTILIZADOR do ensaio (passos R30, B*, T01; só ensaio).
-- Corre APENAS dentro do wrapper único tools/R40_sessao.sh, numa CÓPIA com os marcadores substituídos.
-- Exige o superutilizador do ensaio (lê data_directory, pg_control_system e o nonce). Sessões do papel
-- postgres não o correm: para elas a instância é provada pelo R41 (processo filho do postmaster do R20).
-- Só leitura: um único SELECT. Resultado: uma linha por verificação. Se alguma
-- verificação falhar (ou der NULL), a consulta TERMINA EM ERRO com "REPROVADO: <id> obtido=<valor> | …".
WITH c(id, verificacao, ok, esperado, obtido) AS (
  SELECT 'R32-01'::text, 'data_directory = PGDATA provado por R20'::text, (current_setting('data_directory') = '__R_PGDATA__')::boolean, '__R_PGDATA__'::text, (current_setting('data_directory'))::text
  UNION ALL SELECT 'R32-02'::text, 'system identifier = o registado pelo R10'::text, ((SELECT system_identifier::text FROM pg_control_system()) = '__R_SYSID__')::boolean, '__R_SYSID__'::text, ((SELECT system_identifier::text FROM pg_control_system()))::text
  UNION ALL SELECT 'R32-03'::text, 'nonce em PGDATA com o sha256 da cópia FORA de PGDATA'::text, (encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex') = '__R_NONCE_SHA256__')::boolean, '= sha256 da cópia externa'::text, (left(encode(sha256(pg_read_binary_file('afonso-rehearsal.nonce')), 'hex'), 16))::text
  UNION ALL SELECT 'R32-04'::text, 'pasta do socket = a do R10 e sem TCP'::text, (current_setting('unix_socket_directories') = '__R_SOCKDIR__' AND current_setting('listen_addresses') = '')::boolean, '__R_SOCKDIR__ / '''''::text, (current_setting('unix_socket_directories') || ' / ''' || current_setting('listen_addresses') || '''')::text
),
v AS (SELECT count(*) AS n, string_agg(id || ' obtido=' || left(coalesce(obtido, 'NULL'), 160), ' | ' ORDER BY id) FILTER (WHERE ok IS NOT TRUE) AS falhas FROM c)
SELECT c.id, c.verificacao, CASE WHEN c.ok IS TRUE THEN 'OK' ELSE 'FALHA' END AS estado, c.esperado, c.obtido,
       CASE WHEN v.n <> 4 THEN ('VEREDITO INVÁLIDO: ' || v.n::text || ' verificações')::int::text
            WHEN v.falhas IS NULL THEN 'R32 APROVADO'
            ELSE ('REPROVADO: ' || v.falhas)::int::text END AS veredito
  FROM c CROSS JOIN v ORDER BY c.id;
