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
