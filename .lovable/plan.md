# Afonso AI V1 — Assessor Comercial Autónomo (plano de piloto, 30 dias)

Só plano. Nada é implementado, publicado ou alterado até aprovação de cada passo. Este plano substitui o âmbito do plano 2.0 durante 30 dias. O backlog fica congelado: tudo o que não está abaixo fica parado.

## 1. Âmbito V1 (estrito)
1. **Memória comercial contextual**: áudio, texto, fotos e mensagens reencaminhadas alimentam um grafo pessoa ↔ imóvel ↔ visita/proposta ↔ objeção.
2. **Execução comercial interna autónoma**:
   - prepara follow-ups e faz o matching comprador-imóvel;
   - permite corrigir e desfazer quando a ação é reversível;
   - qualquer ação externa só avança com aprovação explícita.
3. **Motor proativo orientado a receita**:
   - máximo de 2 alertas relevantes por dia, e zero se não houver nada relevante;
   - gatilhos iniciais: negócio parado há mais de 5 dias e comprador compatível com um imóvel.
4. **Arranque conversacional**: pedir os 3 negócios ou clientes prioritários, por áudio ou texto, e devolver um resultado útil em menos de 2 minutos.
- **Canais**: WhatsApp e Telegram em simultâneo, com uma só identidade e uma só memória.
- **Briefing da manhã e check-in**: opcionais e configuráveis por conversa. Respeitam as regras de mensagens do WhatsApp (janela de 24h e templates), o silêncio e a privacidade.

**Fora da V1:** minutas de CPCV, estudos de mercado complexos, email individual, leitura avançada de documentos, painéis para o consultor e integrações novas.

## 2. Inventário: o que existe e o que falta
Legenda: **E** existe no código · **P** existe em parte ou precisa de adaptação · **F** falta · **?** por verificar no piloto

| Peça | Estado | Nota |
|---|---|---|
| Entrada WhatsApp (Meta) e Telegram | E | assinatura verificada; idempotência de entrada **?** |
| Áudio → factos, tarefas e notas | E | processador de áudio com confirmação única |
| Fotos e cartões (visão) | E | cartão de visita, cartão partilhado, documentos simples |
| Mensagens reencaminhadas | P | tratadas como texto; sem marca de "reencaminhado" |
| Pessoas, imóveis, interesses, propostas, visitas | E | `people`, `properties`, `property_interests`, `property_offers`, `interactions` |
| Objeções ligadas a pessoa/imóvel | F | há guia de objeções, mas não há registo de objeção no grafo |
| Seguimentos e lembretes | E | remarcação sem hora já corrigida |
| Matching comprador-imóvel | P | o detetor de oportunidades existe, mas não gera avisos (0 nos últimos 60 dias) |
| Negócio parado há mais de 5 dias | P | prazos e fases existem, mas não há gatilho de "parado" |
| Teto de 2 alertas relevantes por dia | P | existe teto diário; hoje conta também silêncio, atrasos e conflitos |
| Desfazer | P | existe arquivar; não existe "desfaz o último" por conversa |
| Recibo de escrita ("fiz X") | E | não diz "fica anotado" se nada foi guardado |
| Aprovação antes de ações externas | E | email e mensagens a terceiros com confirmação |
| Arranque com 3 prioridades em 2 minutos | F | há perguntas leves de arranque, mas não este fluxo |
| Uma conta com os dois canais | P | ligação por canal existe; memória de conversa e bloqueios são por canal |
| Briefing e check-in opcionais | P | existem; o opt-in e o canal preferido por conversa estão incompletos |
| Medição aviso → ação → resultado | F | não existe ligação |
| Custo variável por consultor | F | não é medido; o WhatsApp é pago diretamente à Meta |

## 3. Trabalho necessário antes do piloto (mínimo)
1. Desativar os avisos que não são de receita no piloto (silêncio, conflito) ou tirá-los da contagem dos 2 por dia.
2. Gatilho "negócio parado há mais de 5 dias" e gatilho de matching a gerar avisos, sempre com o porquê e uma próxima ação.
3. Fluxo de arranque com as 3 prioridades, cronometrado a menos de 2 minutos.
4. Registo de objeções no grafo.
5. "Desfaz o último" para as ações reversíveis.
6. Memória e bloqueios por conta (os dois canais) e um único envio por aviso.
7. Registo de resultado por aviso (aceite, ignorado, executado e o que veio depois) e custo por consultor (tokens, templates).
8. Ativar o motor atual para os 15 consultores (hoje só corre para contas com a flag).

## 4. Cronograma
- **Semana −2 a −1 (preparação):** pontos 1–8, testes golden, ensaio interno com 2 contas.
- **Dias 1–2:** entrada dos 15 consultores. Têm de entrar todos até ao dia 2, para a W4 (dia 28) caber nos 30 dias.
- **Dias 3–30:** piloto sem funcionalidades novas, só correções de defeitos.
- **Dias 31–35:** análise e decisão GO/PIVOT/STOP.

## 5. Métricas e alvos
| Métrica | Alvo | Nota |
|---|---|---|
| Retenção semanal (W1–W4) | acompanhar | W4 só é válida com a entrada até ao dia 2 |
| Consultores com 3 ou mais inputs/semana na W4 | ≥ 40% | 6 de 15 |
| Conversão para pago a 39 €/mês | ≥ 20% | 3 de 15; oferta no fim do piloto |
| Custo variável/consultor/mês | < 5 € | IA, templates WhatsApp, imagens |
| Qualidade de extração | ≥ 90% dos factos certos | amostra revista à mão |
| Utilidade dos alertas | ≥ 50% aceites ou úteis | resposta "útil / não útil" |
| Ações concretizadas | contagem por consultor | follow-ups feitos, visitas, propostas |
| Arranque < 2 min | ≥ 80% dos consultores | tempo medido |
| Receita atribuível | reportar com cautela | correlação apenas; sem grupo de controlo com n=15 |

**Evidência vs. hipótese:**
- 15 consultores mostram sinal de valor, não escala.
- O preço de 39 € e o custo abaixo de 5 € são hipóteses até haver números medidos.
- A receita é reportada como "houve aviso na cadeia". Não se afirma causalidade.
- Não se promete uso ilimitado.

## 6. Critérios de decisão (dia 31–35)
- **GO:** W4 ativa ≥ 40%, conversão ≥ 20%, custo < 5 €, alertas úteis ≥ 50%, sem incidentes de privacidade nem envios externos sem aprovação.
- **PIVOT:** retenção ≥ 25% mas conversão < 20%, ou alertas pouco úteis enquanto a memória é valorizada. Rever o preço ou o foco (memória vs. proatividade).
- **STOP:** W4 < 25%, ou custo > 10 €, ou qualquer incidente grave de privacidade ou ação externa sem aprovação.

## 7. Riscos
- **Fadiga de mensagens:** teto de 2 avisos, zero quando não há nada relevante, opt-in no briefing.
- **Regras do WhatsApp:** fora das 24h, só templates aprovados (a aprovação pode demorar até 48h, por isso submeter na preparação).
- **Erros de extração no grafo:** recibo de cada escrita e desfazer.
- **Amostra pequena e enviesada** (beta testers conhecidos): ler os resultados como sinal, não como prova.
- **Dados de terceiros (RGPD):** notas confidenciais nunca saem; apagar a pedido.

---

## 8. Entrada de novos consultores: landing → registo → canal (requisito confirmado)

Zero-UI significa que não há dashboard no dia a dia. A landing e o registo continuam a existir. A landing externa meuafonso.com **não se altera** sem acesso e autorização: o botão dela aponta para a página de registo desta app.

### 8.1 Fluxo alvo
```text
meuafonso.com -> /registo (nome, email, telemóvel opcional, aceitar termos)
  -> "Onde queres falar com o Afonso?"  [WhatsApp] [Telegram]
  -> ecrã de ligação: QR (desktop) + botão "Abrir no WhatsApp/Telegram" (mobile)
  -> consultor envia a 1.ª mensagem com token efémero
  -> Afonso confirma a ligação e pede logo os 3 negócios prioritários (secção 1.4)
  -> mais tarde: "liga também o Telegram" -> novo token no canal já ligado
```

### 8.2 Token efémero
- Uso único, aleatório (≥ 128 bits), válido 15 minutos. Na base de dados guarda-se só o hash.
- Sem dados pessoais no link: `wa.me/<número Afonso>?text=Olá Afonso AF-XXXX` e `t.me/<bot>?start=<token>`.
- O WhatsApp exige que a mensagem seja enviada pelo próprio consultor, e isso é a prova de posse do número. No Telegram, a prova de posse é o próprio chat.
- Gerar um token novo invalida os anteriores. Há limite de tentativas e um limite de geração por conta.

### 8.3 UX
- **Mobile:** botão grande "Abrir no WhatsApp/Telegram" e, por baixo, "Não abriu? Copia este código e envia-o para +351…".
- **Desktop:** QR grande, o mesmo link escrito por baixo e a indicação "aponta a câmara do telemóvel".
- O ecrã fica à espera. Mostra "À espera da tua mensagem…" e muda sozinho para "Ligado! Continua no WhatsApp" quando a ligação é feita.
- O ecrã tem também a contagem do prazo e o botão "Gerar novo código".

### 8.4 Estados e casos-limite
| Caso | Comportamento |
|---|---|
| Token expirado | No canal: "Este código já expirou. Volta à página e pede um novo." O ecrã oferece "Gerar novo". |
| Link já usado pela mesma pessoa | "Já estás ligado 👍", e continua a conversa |
| Link usado por outro número/chat | Recusa sem revelar de quem é a conta; avisa o dono no canal ligado; regista na auditoria |
| Troca de canal antes de ligar | Volta à escolha; o token antigo é invalidado |
| Registo duplicado (email já existe) | "Já tens conta — enviámos-te um link de entrada", sem confirmar a existência a terceiros |
| Número/chat já ligado a outra conta | Nunca reatribui; pede prova no canal antigo ou passa à equipa (consola admin) |
| Mensagem sem token de alguém desconhecido | Resposta curta com o link de registo; não cria conta automaticamente na V1 |
| Segundo canal | Só a partir do canal já verificado; mesma conta e memória |

### 8.5 Prevenção de takeover
- O token só liga uma conta que ainda não tem esse canal ligado.
- Uma identidade já verificada nunca muda de conta sem passar pela consola admin.
- Cada ligação e cada desligar ficam na auditoria, sem número completo nos metadados.
- O consultor recebe aviso no canal existente quando é ligado um segundo canal, com a opção "Não fui eu → desligar".

### 8.6 Políticas
- **WhatsApp:** a primeira mensagem tem de vir do consultor (abre a janela de 24h). Sem templates de marketing no arranque. Opt-in explícito para o briefing e o check-in.
- **Telegram:** só deep link `/start`; o bot não pode iniciar a conversa.
- **Privacidade:** termos e RGPD aceites no registo; o link e o QR não levam email nem telefone.

### 8.7 Diferenças face ao fluxo atual
| Atual (confirmado no código) | Alvo |
|---|---|
| Registo com email e password e confirmação de email antes de continuar (`/registo` → `/ligar-canal`) | Registo simples; confirmação feita pelo próprio canal ou link mágico |
| WhatsApp: o consultor escreve o telefone, recebe um código no ecrã e envia-o à mão ao número do Afonso | QR/link `wa.me` com o código já preenchido; telefone opcional no registo |
| WhatsApp: o código fica ligado a um telefone escrito antes; a conta fica "pendente" | Prova de posse = o número que envia a mensagem |
| Telegram: deep link com token já existe (`t.me/...?start=tg_…`), mas é gerado nas Definições (dashboard) e o token fica guardado em claro | Gerado no ecrã de ligação após o registo; guardar só o hash |
| Telegram também regista contas sozinho na primeira mensagem, sem registo web | Na V1, a primeira mensagem sem token recebe o link de registo (fecha o caminho paralelo) |
| A auditoria do início de ligação WhatsApp guarda o telefone completo | Guardar mascarado |
| Sem QR em desktop nem estado "à espera" | QR, contagem do prazo e mudança automática para "Ligado" |
| O segundo canal é ligado nas Definições (dashboard) | Ligado por conversa, a partir do canal já verificado |
| Depois de ligar não há pedido imediato de prioridades | Pede os 3 negócios prioritários de imediato |

### 8.8 Critérios de aceitação
- Do registo à primeira resposta no canal em menos de 90 s no mobile, medido em 5 ensaios.
- Os testes golden cobrem todos os estados de 8.4, com resposta certa em cada um.
- Teste negativo de takeover: um token usado por um terceiro não liga nada e o dono é avisado.
- Nenhum dado pessoal aparece no link, no QR ou nos registos de auditoria.
- A landing externa continua sem alterações.

### 8.9 Lugar no cronograma
Entra na preparação (semana −2 a −1) como ponto 9 da secção 3. É obrigatório antes do dia 1, porque os 15 consultores entram por este fluxo.

---

## 9. Arquitetura de billing (em análise — só plano)

### 9.1 Princípios
- Uma subscrição por **conta**. Os dois canais ficam associados à mesma conta e nunca pagam a dobrar.
- A fonte de verdade é o backend, que só muda através de webhooks do Stripe, verificados e idempotentes. O canal nunca decide se a conta está paga.
- O consultor tem de ter o primeiro valor antes de pagar: trial de 14 dias **sem cartão**.
- A memória nunca fica bloqueada ao expirar. O consultor consulta e exporta sempre; o que pára é a execução nova.
- O preço de **39 €/mês é uma hipótese**. Não se altera o catálogo em produção antes do piloto.

### 9.2 O que já existe (confirmado no código)
| Peça | Estado |
|---|---|
| Checkout Stripe embutido (`createSubscriptionCheckout`, `ui_mode: embedded_page`) | E |
| Compliance fiscal gerida pelo Stripe (`managed_payments`: IVA, faturas, fraude) | E (ativo no checkout) |
| Portal do cliente (`createBillingPortal`) | E |
| Webhook verificado com idempotência por `event_id` (`stripe_webhook_events`) | E |
| Sincronização de estados: trialing, active, past_due, unpaid, canceled, incomplete_expired, payment_failed (`billing-sync.ts`) | E |
| Trial de 14 dias sem cartão, um por conta, com "piso" do plano anterior (`trial.server.ts`, hook `trial-lifecycle`) | E |
| Gating por `effective_tier()` | E |
| Catálogo atual: Consultor 14,90 €, Pro 24,90 €, Team 39,90 € (mensal/anual) | E — **não bate** com a hipótese de 39 € plano único |
| Checkout só a partir de páginas do dashboard (`/planos`, Definições) | E — contradiz o Zero-UI |
| NIF/dados de faturação PT próprios | F (depende do que o checkout do Stripe recolhe) |
| Quotas do trial e antifraude (1 trial por número/chat/email) | P (1 por conta; não cruza número e chat) |
| Link de checkout de uso único enviado pela conversa | F |

### 9.3 Fluxo alvo
```text
registo -> canal ligado -> trial 14 dias (sem cartão, quotas)
  dia 1-2: primeiro valor (3 prioridades) | dia 10: resumo de valor + aviso
  dia 12: link seguro de checkout (uso único, 30 min, abre página mínima)
  -> Stripe Checkout -> webhook -> conta "active" -> confirmação no canal
  dia 14 sem pagamento -> "expirado": memória só de leitura/exportação; captura nova suspensa
```
- **Página de pagamento:** uma página mínima (`/pagar/<token>`), sem login, aberta a partir da conversa. Mostra o checkout embutido e regressa com "Já está, volta à conversa".
- **Portal:** "quero cancelar / mudar o cartão / ver faturas" na conversa leva a um link de uso único para o portal do Stripe.

### 9.4 Estados e comportamento
| Estado | Acesso | Mensagem no canal |
|---|---|---|
| trialing | completo, com quotas | lembretes nos dias 10 e 12 (no máximo 2) |
| active | completo | confirmação da ativação e do recibo |
| past_due | completo (período de tolerância de 7 dias) | 1 aviso com link para atualizar o pagamento |
| unpaid / expired | memória só de leitura e exportação; sem novos avisos proativos | 1 mensagem com o link de reativação; depois silêncio |
| canceled (fim do período) | acesso até `current_period_end`, depois igual a expired | confirmação da data |
| reativação | volta ao estado anterior, sem perder dados | "Bem-vindo de volta" |

### 9.5 Quotas e antifraude do trial
- **Quotas do trial:** por exemplo, 100 registos, 20 áudios, 20 imagens e 2 avisos por dia. Os números exatos dependem da medição de custo (meta abaixo de 5 €/mês).
- **Um trial por identidade:** mesmo número WhatsApp, chat Telegram ou email normalizado conta como a mesma pessoa.
- Limite de contas por número/IP no registo e auditoria das tentativas.

### 9.6 Impostos, faturação e RGPD (por validar com contabilista e jurista)
- O Stripe com compliance gerida emite as faturas e trata o IVA. **Falta validar** se isto cumpre a faturação portuguesa: certificação de software da AT e NIF do cliente na fatura. Em alternativa, ligar a um programa de faturação certificado.
- NIF opcional no checkout, para consultores com atividade aberta.
- **RGPD:**
  - dados de pagamento só no Stripe;
  - na base de dados só o estado e os ids;
  - retenção das faturas conforme a lei fiscal;
  - apagamento da conta sem apagar as faturas legais.
- Nenhuma destas regras se assume como cumprida sem confirmação.

### 9.7 Telegram e pagamentos (validar antes de implementar)
- O Telegram tem regras próprias para bens e serviços digitais vendidos **dentro** de bots: pode exigir Telegram Stars, e as lojas de apps têm regras próprias.
- **Antes de enviar links de checkout pelo Telegram, verificar:**
  - os Termos atuais da Bot Platform e de Pagamentos do Telegram;
  - se um link para uma página web externa é permitido para uma subscrição de um serviço que não é só o bot.
- Até haver essa validação, o upgrade feito a partir do Telegram é tratado como hipótese de risco.
- Alternativa segura: enviar o link por email ou pelo WhatsApp, se estiver ligado.
- O WhatsApp também tem políticas de comércio. Validar que enviar um link de pagamento da própria subscrição é permitido.

### 9.8 Pricing (hipótese)
- Um plano a 39 €/mês, com WhatsApp e Telegram incluídos e sem uso "ilimitado", com tetos justos.
- Opção anual a testar mais tarde.
- Os planos atuais (14,90 €, 24,90 €, 39,90 €) mantêm-se em produção até à decisão GO. Os consultores que já pagam ficam no plano que têm (grandfathering).
- Novos preços entram como preços novos no Stripe, sem alterar ids existentes.

### 9.9 Testes
- Webhook duplicado → efeito aplicado uma só vez.
- Eventos fora de ordem (`updated` antes de `created`) → estado final correto.
- Trial: o 2.º trial com o mesmo número, chat ou email é recusado.
- Expiração → memória legível e exportável; captura nova bloqueada com mensagem clara.
- `past_due` → tolerância de 7 dias, 1 só aviso, depois expira.
- Cancelamento → acesso até ao fim do período.
- Reativação → nenhum dado perdido.
- Link de checkout expirado ou já usado → recusado, com oferta de link novo.
- Os dois canais ligados → uma só subscrição, e a confirmação chega num só canal.
- Ensaio completo no ambiente de teste (cartão 4242, recusa, 3DS) antes de ativar pagamentos reais.

### 9.10 Lugar no cronograma
- **Durante o piloto (30 dias):** só trial, sem cobrança. A oferta de 39 € é feita no fim do piloto, para medir a conversão.
- **Antes da oferta:** link de checkout pela conversa, página mínima, estados da secção 9.4, validações jurídicas (9.6 e 9.7).
