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

---

# DECISÃO DE PRODUTO — Zero-UI / Execução Autónoma (Afonso AI 2.0)

Esta secção define a tese do produto e prevalece sobre as anteriores onde houver conflito.

## Z1. Tese
- O consultor usa WhatsApp e/ou Telegram, em simultâneo, com uma só conta e memória. Não há dashboard nem app web.
- Envia material em bruto: áudios, fotos, capturas de ecrã, PDFs e emails reencaminhados. O Afonso faz todo o trabalho interno de ponta a ponta, diz o que fez e permite desfazer quando for reversível.
- **Nunca sem aprovação explícita:** comunicação externa, partilha de dados com terceiros, compromissos (visitas marcadas com clientes, propostas, valores).
- OAuth (calendário/email) só quando for estritamente necessário, por link seguro de uso único. O consultor nunca configura webhooks.
- O núcleo é o motor proativo (secção anterior): identifica, prioriza por receita e confiança, prepara, interage e acompanha.

## Z2. Briefing da manhã
- Às 08:30 no fuso do utilizador (hoje: fuso fixo de Lisboa no código — **adaptar**: `profiles.timezone` + cálculo do dia por fuso).
- Opt-in explícito e canal preferido. No WhatsApp fora das 24h só sai por template aprovado; no Telegram sai livre.
- Respeita silêncio e domingos. O horário atual de envio (9h–20h) tem de passar a permitir 08:30 apenas para o briefing com opt-in.
- Nunca inventa comissões ou valores: só mostra números que o consultor deu.

## Z3. Forward & Forget
- WhatsApp/Telegram: reencaminhar qualquer coisa. Já existe para texto, áudio, imagem, documento e cartão de contacto. **Adaptar:** "email reencaminhado como print ou PDF".
- Endereço de email individual (ex.: `nome.xxxx@in.meuafonso.com`) — **desenvolver**. Requisitos:
  - endereço aleatório, que se pode revogar;
  - aceitar só remetentes autorizados (o email do consultor);
  - verificação SPF/DKIM/DMARC e rejeição de spoofing;
  - limite de tamanho e de anexos;
  - quarentena do que for suspeito;
  - nenhum conteúdo lido sem pertencer à conta.
- Respeita a regra existente "o Afonso não lê a caixa de entrada": só processa o que o consultor reencaminha de propósito.

## Z4. Resultados que o Afonso produz
- Texto de anúncio de imóvel (rascunho).
- Correspondência entre compradores e imóveis, com explicação do porquê.
- Mensagens de seguimento (rascunho para o consultor aprovar ou copiar).
- Documentos e dossiers: ficha de imóvel, dossier do cliente, preparação de reunião.
- Minutas (CPCV, propostas): **apenas rascunho**, com o aviso "precisa de validação"; nunca são enviadas ao cliente pelo Afonso.

## Z5. Matriz existente / adaptar / desenvolver
| Área | Existe | Adaptar | Desenvolver |
|---|---|---|---|
| Entrada WhatsApp (Meta direta) | ✓ | inbox idempotente | — |
| Entrada Telegram | ✓ | mesma inbox | — |
| Conta única multi-canal | parcial (`channel_links`) | identidade verificada, revogação | desafio de posse |
| Memória por conta | parcial (dados por utilizador, estado por canal) | estado/locks por conta | — |
| Áudio → factos/tarefas | ✓ | — | — |
| Imagem/cartão/PDF | ✓ (visão LLM) | prints de email | — |
| Email individual de entrada | ✗ | — | ✓ |
| Desfazer | parcial (arquivar) | "desfaz o último" por conversa | registo de ações reversíveis |
| Motor proativo | parcial (3 tipos ativos) | priorização por receita | 6 detetores novos |
| Briefing 08:30 por fuso | parcial (Lisboa, 9h) | fuso, opt-in, canal | — |
| Anúncio / match / dossier | parcial (match no detetor) | saída por conversa | anúncio, dossier |
| Minutas | ✗ | — | rascunho com aviso |
| Configuração por conversa | parcial (whitelist) | canais e notificações | — |
| OAuth por link seguro | parcial (páginas web) | página mínima pontual | — |
| Pagamento por link | parcial (Stripe + página `/planos`) | checkout externo a partir da conversa | — |
| App web do consultor | ✓ (41 páginas) | retirar | — |
| Marketing de dashboard (textos, `/planos`, ecrãs) | ✓ | eliminar | — |
| Landing meuafonso.com | fora deste projeto | **não alterar sem acesso e autorização** | — |
| Consola admin | ✓ | manter | funil de receita |

## Z6. Modelo de preço — HIPÓTESE a testar
- Grátis (Telegram): 10 registos/mês.
- Consultor, 29 €/mês (WhatsApp).
- Autónomo, 69 €/mês (WhatsApp, execução proativa completa).
- Os dois canais em simultâneo funcionam em qualquer plano pago, sem exclusividade. O Grátis no Telegram pode ligar o WhatsApp ao fazer upgrade.
- Hoje os planos usam Base/Consultor/Pro/Team e quotas do Drive (40/200/ilimitado) — **adaptar** depois da validação; não mudar preços em produção antes do teste.
- **Não prometer "ilimitado"** antes da auditoria de custos (Z7).

## Z7. Auditoria de custos (antes de definir limites)
Dados registados do projeto, de 16/10 a 14/11 (créditos pedidos, sem valores em dinheiro):
- Base de dados (instância pico, sempre ligada): ~54,6 créditos, ~93% do total. É um custo fixo, não depende do número de consultores.
- IA (Gemini): ~0,67 créditos, com o último registo a 03/11. Uso muito baixo e, aparentemente, sem chamadas desde então — **por confirmar** se o motor está a usar IA ou só regras.
- Pedidos ao servidor: ~0,35 créditos. Ficheiros e rede: desprezáveis.
- **Desconhecido:** custo do WhatsApp (pago diretamente à Meta, fora deste registo — templates de marketing e utility por conversa), custo de leitura de imagens/PDF por página, custo por consultor ativo.
- A medir antes de fixar preços: tokens por mensagem, por áudio (por minuto) e por documento (por página); templates enviados por consultor/mês; custo do briefing diário × 30. Com isto, definir a margem por plano e os tetos (ex.: registos/mês, documentos/mês).

## Z8. Backlog por fases (com critérios de aceitação)
1. **Auditoria do motor proativo e dos custos** — tabela de cobertura e custo por consultor ativo medidos. *Aceite:* números reais para 30 dias e nenhum "ilimitado" sem margem calculada.
2. **Identidade multi-canal e inbox idempotente** — *Aceite:* os critérios das fases 1–2 acima.
3. **Medição por aviso e KPIs** — *Aceite:* todos os avisos com resultado ao fim de 7 dias; funil na consola.
4. **Briefing 08:30 por fuso, opt-in e canal** — *Aceite:* envio à hora certa em 3 fusos de teste; nada sem opt-in; fallback por template testado.
5. **Detetores de receita** (ordem da secção H) — *Aceite:* testes golden por detetor e teto diário respeitado.
6. **Execução autónoma interna + desfazer** — *Aceite:* cada ação interna fica com recibo ("fiz X") e "desfaz" funciona em todas as ações reversíveis; nenhuma ação externa sem confirmação (teste negativo obrigatório).
7. **Resultados que o Afonso produz** (anúncio, dossier, minutas como rascunho) — *Aceite:* todos marcados como rascunho; nenhum enviado a terceiros.
8. **Email individual de entrada** — *Aceite:* spoofing rejeitado em teste; remetente não autorizado posto em quarentena; endereço revogável.
9. **Configuração 100% por conversa, OAuth e pagamento por link** — *Aceite:* onboarding e upgrade completos sem dashboard.
10. **Retirar a app web do consultor e o marketing de dashboard** — *Aceite:* rotas de consultor redirecionam; a consola admin fica intacta.
11. **Teste de preços** — *Aceite:* conversão e retenção medidas por plano, com margem positiva.

## Z9. Riscos
- Autonomia sem limites a gerar escritas erradas: recibo obrigatório e desfazer.
- Fuga para fora por engano: as ações externas têm de passar sempre por confirmação. O teste negativo bloqueia a publicação.
- Custo do WhatsApp por templates com muitos consultores: medir antes de prometer briefing diário no plano barato.
- Spoofing de email e privacidade de dados de terceiros (RGPD): base legal, retenção e apagamento.
- Retirar a app web aos consultores atuais: transição comunicada.
- Minutas confundidas com documentos finais: aviso fixo e nunca envio automático.

## Z10. Plano de medição
- **Ativação:** % de consultores com 1.º registo em 24h e com briefing ativo.
- **Envolvimento:** dias ativos/semana; inputs em bruto por semana.
- **Valor:** ações internas executadas, avisos aceites, visitas/propostas após aviso, negócios com aviso na cadeia (correlação) e efeito em grupo de controlo (causalidade).
- **Retenção:** W1, W2, W4. **Correção:** W4 mede-se no dia 28 após o registo, por isso **não pode ser validada num piloto de 21 dias**. O piloto tem de durar ≥ 28 dias após a entrada do último consultor da coorte (recomendado: 35 dias, para dar margem). Num ciclo de 21 dias só se validam W1 e W2; W3 só em coortes que entraram até ao dia 0 desse ciclo.
- **Economia:** custo por consultor ativo/mês vs. preço do plano.
