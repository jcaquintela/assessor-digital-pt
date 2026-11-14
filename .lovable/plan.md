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

---

# PRIORIDADE DO PROPRIETÁRIO — Motor proativo orientado a receita

O motor proativo é o diferencial central: o objetivo é gerar mais receita ao consultor, não só gerir tarefas. Esta secção tem precedência sobre as fases 1–8 acima (ver "Ordem revista").

## A. Estado atual (observado, sem assumir que funciona)
- Peças existentes no código: `assessor_nudges` (caminho único), `proactive-tick`, `dispatchPendingNudges` com expiração e texto recalculado, briefing da manhã enriquecido P1/P2/P3, revisão do fim do dia, pré-evento, preparação de reunião (`meeting-briefing`), guia de objeções, detetor de oportunidades + resumo (`opportunities/detector`, `digest`), `next-best-action`, Mentor, conflitos de agenda, `outcomes`.
- Dados reais dos últimos 60 dias em `assessor_nudges`: só 3 tipos aparecem — silêncio do consultor (133 enviados, 47 descartados), tarefa em atraso (77 enviados) e conflito de agenda (90 descartados, 1 pendente). **Nenhum aviso de oportunidade comercial** (comprador compatível, angariação parada, proposta sem resposta, reativação) foi registado. A maioria do que o motor envia hoje é sobre tarefas, não receita.
- `proactive-tick` só corre para utilizadores com a flag v3 (hoje 1 conta segundo a memória do projeto) — **[D]** quantos consultores recebem de facto avisos.
- Não existe medição de resultado ligada ao aviso (aviso → ação → visita/proposta/negócio).

## B. Fase 0 obrigatória — Auditoria do motor existente (antes de mudar)
- Inventário de cada gerador: o que deteta, de que tabelas lê, cadência, limites, dedupe_key, taxa enviado/descartado/respondido.
- Rever as 90 dispensas de conflito e os 47 silêncios descartados: ruído ou expiração correta.
- Confirmar se `opportunities/detector` e `next-best-action` chegam a gerar avisos ou só alimentam o painel web (que vai desaparecer).
- Aceite quando: tabela de cobertura por caso de uso (abaixo) com "existe/parcial/falta" baseada em consultas e testes, não em leitura de nomes.

## C. Ciclo contínuo alvo
```text
sinais -> deteção -> priorização -> mensagem contextual -> próxima ação
   ^                                                          |
   |                                                          v
 medição <- follow-up <- execução assistida <- confirmação do consultor
```
1. **Sinais**: novas pessoas/leads, interações, visitas, propostas, prazos de negócio, estado de imóveis, agenda, silêncio de contactos, histórico de compradores.
2. **Deteção**: regras determinísticas por caso (sem LLM para decidir se há oportunidade); LLM só para redigir.
3. **Priorização**: pontuação = potencial comercial (valor/fase do negócio) × urgência (tempo desde último contacto, prazo) × confiança (qualidade dos dados). Teto diário por consultor; a melhor oportunidade vai no briefing.
4. **Mensagem**: curta, PT-PT, com o porquê ("o João viu o T2 há 9 dias e não houve contacto"), no canal preferido.
5. **Próxima ação concreta**: botões/opções ("Ligo-lhe / Envio mensagem / Adiar 3 dias / Não interessa").
6. **Confirmação e execução assistida**: nada externo sai sem confirmação explícita; rascunho de mensagem para o cliente que o consultor copia ou aprova.
7. **Follow-up**: tarefa criada automaticamente com data; reavaliação se não houver resultado.
8. **Medição**: cada aviso guarda o resultado (aceite, ignorado, executado, levou a visita/proposta/negócio).

## D. Casos de uso e lacunas
| Caso | Sinal | Hoje |
|---|---|---|
| Lead sem contacto | pessoa nova sem interação em X h | parcial (silêncio do consultor ≠ lead esquecida) |
| Comprador compatível com imóvel | `property_interests` + critérios vs. imóvel novo/baixa de preço | falta como aviso |
| Angariação parada | imóvel ativo sem visitas/marketing há X dias | falta como aviso |
| Visita sem follow-up | visita passada sem interação posterior | parcial ("como correu?" pós-evento) |
| Proposta sem resposta | `property_offers` pendente há X dias | falta como aviso |
| Negócio em risco | `deal_deadlines` perto + fase parada | parcial (prazos), sem risco |
| Cliente antigo reativável | negócio concluído há 6–24 meses | falta |
| Preparação de reunião | evento com pessoa/imóvel conhecido | existe (meeting-briefing) — validar uso real |

## E. Regras transversais
- **Anti-spam**: teto diário (reaproveitar `max_daily_nudges`), agrupamento no briefing quando há vários, silêncio após 2 ignorados do mesmo tipo, "não me lembres disto" permanente (`alert_mutes`).
- **Horários**: 9h–20h, sem domingos (já existe), preferências por canal.
- **Deduplicação entre canais**: um aviso lógico = uma entrega (`outbound_deliveries`), mesmo com WhatsApp e Telegram ligados.
- **Explicabilidade**: todo o aviso diz porquê; "porque me disseste isto?" responde com os factos.
- **Privacidade**: notas confidenciais nunca em textos para terceiros; nenhum dado de um cliente aparece na mensagem de outro.
- **Consentimento**: qualquer ação externa (mensagem/email a cliente, evento em calendário partilhado) só após confirmação explícita; registado.

## F. KPIs (com honestidade causal)
- Adoção: consultores ativos/semana, avisos lidos/respondidos, taxa de "não interessa".
- Ações: próximas ações aceites e executadas por aviso.
- Atividade comercial: contactos feitos, visitas marcadas, propostas enviadas após aviso.
- Resultado: negócios fechados e receita (comissão) com aviso na cadeia.
- **Correlação vs. causalidade**: "atribuível" = houve aviso → ação na cadeia (correlação). Para causalidade: grupo de controlo (holdout de ~10–20% dos avisos por tipo não enviados, aleatório) e comparação de taxas de conversão. Sem holdout, reportar só como correlação.

## G. Critérios de aceitação do motor
- Cada caso da tabela tem gerador com teste golden (dispara / não dispara / expira / dedupe).
- 0 avisos duplicados entre canais num ensaio com WhatsApp + Telegram.
- Nenhum aviso sem "porquê" e sem próxima ação.
- Teto diário respeitado em 100% dos testes.
- Cada aviso enviado tem registo de resultado após 7 dias.
- Painel admin mostra funil aviso→ação→visita→proposta→negócio por tipo, com e sem holdout.

## H. Ordem revista das fases
1. Fase 0 — auditoria do motor proativo (B).
2. Identidade + inbox idempotente (fases 1–2) — necessárias para saber o canal e não duplicar.
3. Medição de resultados por aviso (antes de criar novos tipos, para comparar).
4. Novos detetores por ordem de potencial: proposta sem resposta → comprador compatível → visita sem follow-up → lead sem contacto → angariação parada → negócio em risco → reativação.
5. Despacho multi-canal com preferências e dedupe (fase 5).
6. Vinculação/revogação, memória por conta, configuração por conversa, retirada da app web (fases 3, 4, 6, 7, 8).
7. Holdout e relatório causal.
