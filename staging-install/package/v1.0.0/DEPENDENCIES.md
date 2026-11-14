# Dependências do pacote

| Tipo | Dependência | Onde é verificada |
|---|---|---|
| Motor | PostgreSQL 15 ou superior. Não usa funcionalidades além da 15; foi ensaiado em 17.11 | P00 |
| Estado prévio | Migração 0000 do staging aplicada (`app_role` admin/tester, `user_roles`, `has_role`, `has_staging_access`, `staging_notes`) e nada mais em `public` | P00, P03 |
| Plataforma: auth | `auth.users` (colunas do serviço de autenticação, incluindo `raw_user_meta_data`, `email`), `auth.uid()` | P02, P03 |
| Plataforma: storage | `storage.objects`, `storage.foldername()`. O bucket `assessor-files` é criado **depois**, com a ferramenta de armazenamento do staging | P02, Q02 |
| Plataforma: papéis | `anon`, `authenticated`, `service_role` | (usados nos GRANT; um erro aqui faz falhar a migração inteira) |
| Plataforma: Realtime | publicação `supabase_realtime` | P03 |
| Extensões | `unaccent` em `extensions`. `gen_random_uuid()` é nativo. Sem `pg_cron`, `pg_net`, `vault`, `http`, `dblink` | P03, Q02 |
| Privilégios do executor | ver EXECUTOR-PRIVILEGES.md | P01, P02 |
| Ordem | S2-00 → S2-01 → S2-02 → S2-99, **um ficheiro por migração**. O S2-00 tem de ficar confirmado antes do S2-01, porque os valores novos de `app_role` só podem ser usados noutra transação | — |
| Tamanho | S2-01 tem 190 026 bytes (918 instruções) e S2-02 tem 75 796 bytes (342). **Por confirmar:** o limite de tamanho do pedido da ferramenta de migrações do staging. Se for menor, o S2-01 tem de ser dividido pelo construtor, o que gera nova versão do pacote e novos hashes | — |
| Código | Nenhuma. Este pacote só instala o esquema; o código V2 e os segredos de teste são os passos S3 e S1 | — |
