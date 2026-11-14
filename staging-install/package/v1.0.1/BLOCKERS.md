# Bloqueios e ambiguidades — v1.0.1

Nenhum destes pontos foi "resolvido" por simulação. Cada um diz o que falta e quem decide.

| # | Bloqueio | Impacto | O que falta |
|---|---|---|---|
| B1 | **Não ensaiado.** Por instrução, a v1.0.1 não foi aplicada em nenhuma base, nem descartável | A ordem e a validade estão provadas só por análise estática e pelo parser oficial (sintaxe). Erros que só a base deteta (por exemplo, dependências entre funções SQL ou regras da plataforma) não estão excluídos | Autorização para um ensaio descartável isolado (S3-00…S3-05 + Q00–Q05 + T01) |
| B2 | **Executor inferido.** BYPASSRLS e REFERENCES em `auth.users` só lidos do catálogo | Sem BYPASSRLS, funções SECURITY DEFINER que escrevem nas 8 tabelas com FORCE RLS falham em uso | P01/P02 no staging; prova definitiva só ao aplicar |
| B3 | **Ambiguidade: "acesso somente via funções server-side autorizadas".** Aplicado no sentido mais estrito: nenhuma permissão direta de cliente em tabelas e funções V2; a barreira admin/tester fica como segunda camada | A app V2 ainda lê/escreve várias tabelas com a sessão do utilizador (no browser e em funções do servidor que usam a sessão). No staging essas chamadas são **recusadas** | Decisão do proprietário: (a) adaptar a app para passar pelo servidor com verificação de `has_staging_access`, ou (b) aprovar uma lista de tabelas abertas a `authenticated` (atrás da barreira), numa nova versão |
| B4 | **Admin do staging ≠ admin V2** | A consola de administração V2 não funciona no staging | Decisão de privilégios do proprietário (dar `super_admin` a quem, e como) |
| B5 | **Perfil automático em quarentena** (QZ-02) | Contas de teste novas não recebem perfil V2 | Autorização separada + TRIGGER em `auth.users` |
| B6 | **Sem apagamento em cascata** (84 chaves para `auth.users` retiradas) | Apagar uma conta não apaga as linhas V2 dela | Definir o caminho de apagamento antes de haver dados de teste |
| B7 | **Sem ficheiros nem tempo real** (QZ-03, QZ-04) | Essas funções não existem no staging | Reescrever com a barreira e autorizar |
| B8 | **Teste comportamental bloqueado** (`tests-db/T01`) | A matriz está provada estaticamente e confirmável só de leitura (Q05), mas não com sessões reais | Autorização separada (escreve dados sintéticos em ROLLBACK) |
| B9 | **Divergência intencional da V1**: 6 valores por omissão de envio passam a `false` no staging | Um teste que conte com "ligado por omissão" vai comportar-se de outra forma | Nada, se aceite; documentado em DIFF-v1.0.0.md |
