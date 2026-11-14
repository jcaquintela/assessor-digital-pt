# Plano de migração — Afonso AI 2.0 (WhatsApp + Telegram, uma conta, só conversa)

Só plano. Nada é alterado até aprovação explícita de cada fase.

## Ponto de partida (confirmado no código)
- Uma conta = `profiles` (id = utilizador de Auth). Canais em `channel_links (user_id, channel, external_id)`; o WhatsApp tem ainda um caminho legado em `profiles.phone` + `whatsapp_link_status`.
- Vinculação: `whatsapp_link_codes` (código com hash, tentativas, validade), `telegram_link_tokens` e `telegram_pairings` (pareamento com telefone + código).
- Dados de negócio (pessoas, imóveis, tarefas, negócios, rotinas, memória) já pertencem ao `user_id`, não ao canal — partilha entre canais já é natural.
- Contexto de conversa em `conversation_states` e bloqueio em `conversation_locks` são **por canal**.
- Envio proativo: `primary-channel.server.ts` escolhe 1 canal (WhatsApp tem prioridade); avisos passam por `assessor_nudges`.
- Existe app web do consultor (41 páginas), chat do dashboard e servidor MCP — fora da nova premissa.

## 1. Esquema de identidade (alvo)
- `channel_identities` (substitui/estende `channel_links`): `user_id`, `channel` (whatsapp|telegram), `external_id` único por canal, `status` (pending|verified|revoked), `verified_at`, `verification_method`, `revoked_at`, `revoked_reason`, `last_seen_at`. Único global (channel, external_id) entre identidades ativas.
- `identity_link_challenges`: desafio de posse (código com hash, canal de origem e de destino, tentativas, expira em 10 min, uso único).
- `channel_preferences`: por utilizador e canal — recebe briefing, lembretes, avisos, horário de silêncio, canal preferido por tipo de aviso.
- `inbound_events`: inbox duradoura por (channel, provider_message_id) única — idempotência de entrada.
- `outbound_deliveries`: um registo por aviso lógico (`nudge_id`) com canal escolhido, id do fornecedor e estado — garante 1 entrega por aviso.
- Deixar de usar `profiles.phone/whatsapp_link_status` como fonte de verdade (só marcar como obsoleto; não apagar).

## 2. Vinculação de contas (prova de posse e revogação)
- Primeiro canal cria a conta (onboarding por conversa).
- Adicionar segundo canal: no canal já verificado, "liga o meu Telegram" → Afonso dá um código de uso único; o consultor envia-o no novo canal (ou o contrário). Só fica verificado se o código chegar pelo canal-alvo dentro do prazo.
- Conflito: identidade já ligada a outra conta → nunca reatribuir automaticamente; exige prova no canal antigo ou intervenção da equipa (consola admin), com auditoria.
- Revogação: "desliga o Telegram" (confirmação obrigatória), ou pela consola admin. Revogar o último canal ativo é bloqueado com explicação.
- Contas duplicadas pré-existentes: reaproveitar `merge_accounts_preview/apply` apenas pela consola admin.

## 3. Onboarding e configuração por conversa
- Remover dependência de registo/password web: conta nasce no primeiro contacto verificado.
- Definições (nome do assistente, horários, briefing, rotinas, canais, notificações) só por conversa — estender a whitelist de `settings-conversa.ts` com preferências por canal.
- OAuth (Google/Outlook) e pagamento (Stripe) por link seguro de uso único e curta validade, aberto a partir da conversa; resultado confirmado de volta no canal.
- App web do consultor: fase de desativação gradual (redirecionar para "fala comigo no WhatsApp/Telegram"); consola `/admin` mantém-se.

## 4. Motor de memória e roteamento
- Memória, entidades e `pending_actions` passam a ser por **conta**; `conversation_states` ganha um estado partilhado por conta + um fio curto por canal (para "sim/não" responder ao canal certo).
- Confirmações pendentes: uma pergunta aberta só pode ser respondida no canal onde foi feita (ou explicitamente transferida), evitando confirmar no canal errado.
- `conversation_locks` passam a ser por conta (evita duas escritas simultâneas vindas dos dois canais).
- Entrada: webhook → grava em `inbound_events` (idempotente) → resolve identidade verificada → pipeline único existente.
- Saída proativa: `dispatchPendingNudges` escolhe canal por `channel_preferences` (+ janela 24h no WhatsApp; fallback para Telegram se template falhar) e regista em `outbound_deliveries` — nunca dois canais para o mesmo aviso, salvo preferência explícita.
- Respostas a pedidos saem sempre no canal de origem.

## 5. UX conversacional
- Mensagens novas: ligar/desligar canal, código de vinculação, "estou ligado em WhatsApp e Telegram", escolha "onde preferes receber o resumo da manhã?".
- Paridade de funcionalidades nos dois canais (botões do WhatsApp ↔ teclado inline do Telegram), mesmos textos PT-PT.
- Privacidade: nunca mostrar o número/ID completo do outro canal; confirmar antes de revogar; nota confidencial continua filtrada.

## 6. Testes (golden + E2E)
- Vinculação: código certo no canal certo → liga; errado/expirado/repetido → recusa; identidade de outra conta → não reatribui.
- Revogação e bloqueio do último canal.
- Mesma tarefa criada no WhatsApp aparece ao perguntar no Telegram.
- Mesma mensagem recebida 2× → processada 1×.
- Aviso proativo entregue num único canal conforme preferência; fallback quando template é rejeitado.
- Confirmação pendente não é respondida a partir do outro canal.
- Escritas concorrentes dos dois canais não duplicam.

## 7. Riscos de migração
- Utilizadores existentes com WhatsApp em `profiles.phone` e Telegram em `channel_links` — backfill para `channel_identities` sem perder ligação.
- Contas duplicadas (caso Iolanda) a fundir antes de ativar a regra de unicidade.
- Consultores que usam a app web hoje — comunicação prévia e período de transição.
- Duplicação de avisos durante a mudança do despacho.
- Regressões no motor v3 ao mudar estado de conversa para "por conta".
- Telegram não tem janela de 24h nem templates — comportamentos assimétricos.

## 8. Fases e critérios de aceitação
1. **Fundação de identidade** — tabelas novas + backfill + leitura dupla. Aceite quando todos os canais existentes estão em `channel_identities` verificadas e nada muda para o consultor.
2. **Inbox idempotente** — entrada por `inbound_events` nos dois webhooks. Aceite: mensagem duplicada processada 1×; nenhum 200 sem gravação.
3. **Vinculação e revogação por conversa** — Aceite: testes de posse/revogação verdes; auditoria registada.
4. **Memória e locks por conta** — Aceite: teste "criado num canal, lido no outro" verde; bateria do motor sem regressões.
5. **Despacho multi-canal com preferências** — Aceite: 0 avisos duplicados num ensaio com 2 canais; fallback testado.
6. **Configuração 100% por conversa + links seguros para OAuth/pagamento** — Aceite: onboarding completo sem abrir a app web.
7. **Desativação da app web do consultor** (e chat do dashboard/MCP) — Aceite: rotas de consultor redirecionam; consola admin intacta; nenhum consultor ativo dependente.
8. **Limpeza** — marcar colunas/tabelas antigas como obsoletas.

## Decisões em aberto para o proprietário
- Servidor MCP: manter (para equipa) ou retirar.
- Avisos em ambos os canais por omissão, ou só no preferido.
- Período de transição da app web.
