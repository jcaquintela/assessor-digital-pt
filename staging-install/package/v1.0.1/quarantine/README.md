# Quarentena — NÃO EXECUTÁVEL sem autorização separada

Nada desta pasta faz parte da instalação. Cada ficheiro `.quarantine`:
- tem as instruções **todas comentadas** (cada linha começa por `--Q| `);
- começa por um bloco de guarda que **aborta** a transação se o ficheiro for executado por engano;
- foi verificado com o parser oficial do PostgreSQL: a única instrução ativa é a guarda (`../evidence/parse-check.txt`).

Reativar qualquer item exige: autorização **separada** do proprietário, revisão do item (alguns não servem tal como estão) e uma **nova versão** do pacote. Nunca descomentar à mão no staging.

| Ficheiro | O quê | Porque ficou de fora | Antes de reativar |
|---|---|---|---|
| `QZ-01_dml_v1.0.0.quarantine` | As 90 instruções de dados da v1.0.0, com origem (ficheiro:linha) e categoria: seeds, reparos, preenchimentos, interruptores e blocos DO | O canal de migrações do staging só aceita DDL; num esquema novo não há nada a reparar; os interruptores eram ligados e depois desligados | Os reparos e preenchimentos não se aplicam a uma base nova. Seeds (catálogos, planos) só se o proprietário os quiser, e como dados de teste |
| `QZ-02_gatilho_auth_users.quarantine` | Gatilho `on_auth_user_created` em `auth.users` | Criaria perfil, papel `consultant` e categorias em **cada** conta nova; exige TRIGGER em `auth.users` | Decidir se contas de teste devem receber perfil V2, e com que barreira |
| `QZ-03_realtime.quarantine` | `ALTER PUBLICATION supabase_realtime ADD TABLE public.assessor_messages` e `REPLICA IDENTITY FULL` | Seria uma superfície de leitura para clientes fora da barreira | Rever com a barreira e com o acesso só pelo servidor |
| `QZ-04_politicas_storage_v1.0.0.quarantine` | As 4 políticas de `storage.objects` para `assessor-files` | **Sem** barreira admin/tester; o bucket nem existe | Reescrever com a barreira, ou acesso só pelo servidor |
| `QZ-05_chaves_auth_users_retiradas.quarantine` | As 84 chaves estrangeiras para `auth.users` retiradas | Proibidas fora de `profiles`/`user_roles` | Não reativar: usar `profiles` ou um caminho de apagamento explícito (ver BLOCKERS.md, B6) |
