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
