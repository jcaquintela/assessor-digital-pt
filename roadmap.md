
## CMI via WhatsApp (01/09/2026)
- [ ] **BLOQUEADO (agravado)** — âmbito corrigido: produto para o mercado (N clientes), não interno à Zome
- [ ] Sem DPA único: cada cliente é responsável pelo tratamento; exige Termos de Serviço multi-tenant
- [ ] Minuta é do cliente; erro de extração continua sem resposta de responsabilidade
- [ ] Decidir modelo: ferramenta neutra vs. papel ativo com estrutura legal própria
- [ ] Próximo passo: advogado SaaS B2B/RGPD multi-tenant (jurídico próprio, não da Zome)


## Briefing matinal enriquecido (31/08/2026)
- [x] Bucketing P1/P2/P3 (evento de hoje sempre P1)
- [x] Intervalo apertado (<15 min) como aviso informativo, sem nudge duplicado
- [x] Próximas 3 ações determinísticas
- [x] entityUrl(type, id) como fonte única de links
- [x] Limites de canal: 3 P1 + 2 P2, P3 por contagem, 1200 caracteres, corte honesto no template

## Briefing acionável (31/08/2026)
- [x] Etiqueta P1/P2/P3 visível em cada cartão do briefing (scores já existentes)
- [x] Confirmar/editar a ação a partir do cartão (nota de conclusão + edição rápida de título/data/hora)

## Investigação pendente (31/08/2026)
- [x] Rotinas: o que a secção /rotinas já faz e raio para expor por conversa
- [x] Definições por conversa: inventário de campos, leitura vs. edição, guardrails

## Fase 2 ACI V1 — conversa partilhada WhatsApp+Telegram (14/11/2026, NÃO publicar)
- [x] Interruptor `assessor.cross_channel.v1` (desligado; só contas incluídas)
- [x] Contexto, perguntas pendentes e confirmações por conta, com canal de origem preservado
- [x] Turno único por conta (lock transversal) + reserva atómica da confirmação (no máximo uma execução)
- [x] "Sim" no outro canal nunca confirma a ação errada (re-pergunta no canal atual)
- [x] Testes unitários, integração simulada e concorrência cross-channel
- [x] Análise (sem alterar) do teto de avisos e gating Pro → proposta
- [ ] Ligar o interruptor para contas piloto — aguarda aprovação explícita do proprietário
- [ ] Publicar Fase 1 + Fase 2 — aguarda aprovação explícita

## Correções pré-piloto (14/11/2026, NÃO publicar)
- [x] Teto global de 1 intervenção não solicitada/dia por conta, briefing+oportunidade consolidados (`assessor.global_unsolicited_cap.v1`, desligado)
- [x] Sem lock em 45s: mensagem adiada e retomada, nunca corre sem lock
- [x] Ligação segura WhatsApp↔Telegram de contas separadas, sem fusão automática (`assessor.cross_link.v1`, desligado)
- [x] Plano base: até 1 match estrito/dia (`assessor.base_match_opportunity.v1`, desligado)
- [ ] Teste real numa conta piloto — aguarda aprovação explícita do proprietário
- [ ] Publicar — aguarda aprovação explícita

## Early Access por convite — Fase 1 (14/11/2026, NÃO publicar)
- [x] Gate de acesso no ponto único de entrada (WhatsApp/Telegram), resposta early access PT-PT
- [x] Convites de uso único (3/beta tester, 7 dias), emissão/consumo atómicos, revogação, origem
- [x] Lista de espera com consentimento + gestão admin
- [x] Trial só após convite validado + 1.ª interação comercial posterior
- [x] Testes (concorrência, casos-limite), flags OFF
- [ ] Ligar interruptores para conta piloto e publicar — aguarda aprovação explícita

## Autonomia comercial transversal V2.0 (14/11/2026, NÃO publicar)
- [x] Critérios únicos de avaliação (1.ª ação útil ≤3 turnos, próximo passo, perguntas agrupadas, nada simulado/inventado, terceiros só com ok)
- [x] Replay das conversas de referência pontua autonomia (`expect.autonomy`, etiqueta `action_first`)
- [x] Métricas reais só de leitura para a administração (turnos/tempo, próximo passo, aceitação, seguimentos, negócios, proxies de satisfação)
- [x] Resposta de pesquisa de comprador termina com próximo passo e bloqueio antecipado (atrás do interruptor desligado)
- [ ] Aplicar a autonomia às respostas da IA fora da qualificação — exige mudar prompts (só com 100 avaliações verdes)
- [ ] Conversas de referência com etiqueta `action_first` na base — aguarda aprovação para escrever dados
- [ ] Avaliação direta de satisfação (pergunta ao consultor) — não existe; decisão de produto
- [ ] Ligar o interruptor/publicar — aguarda aprovação explícita

## Testes de aceitação A (comprador Miguel) e B (angariação ZMPT593612) (14/11/2026, NÃO publicar)
- [x] Angariação sem procura: diagnóstico de funil, preço divergente, concorrente sem conclusões, kit orgânico, plano 7 dias, pago só com evidência
- [x] Estados de ação (Executado só com ferramenta / Preparado / Aguarda aprovação / Sem acesso) nos dois casos
- [x] Comprador: mensagem ao comprador já preparada, preço com data, características e fonte nas propostas
- [x] Guarda de respostas da IA: retira afirmações de divulgação/publicação e de acompanhamento inexistente (interruptor ligado)
- [x] Avaliação: pedir licença para preparar, prometer sem entregar e prometer monitorização contam como falha; entrega concreta e verificabilidade de links medidas
- [ ] Verificar o anúncio do concorrente/portal da Zome — sem acesso; aguarda decisão sobre o site Zome
- [ ] Estatísticas reais do anúncio (impressões/cliques) — sem integração com os portais

## Motor de Decisão Comercial — P0 (14/11/2026, NÃO publicar)
- [x] P0-1 Detetor de risco (prazos, avaliação, CPCV, desistência, baixa procura, financiamento, alegações)
- [x] P0-2 Simulador financeiro (90% do menor valor, IMT/Selo 2026, IMT Jovem, estimativas ditas, pré-aprovação ≠ aprovação)
- [x] P0-3 Próxima melhor ação com porquê, responsável, prazo e recomendação de parar
- [x] P0-4 Execução assistida: mensagens preparadas, tarefas pendentes, "cria as tarefas" → Executado (idempotente)
- [x] Cenários A (Miguel), B (ZMPT593612) e C (385k/365k) com testes de aceitação e casos limite
- [ ] P1: memória de negócio, prazos proativos, negociação, aprendizagem — aguarda autorização
- [ ] Atualizar as tabelas de IMT/Selo quando sair o Orçamento de 2027

## Correção pré-piloto pagamentos/checkout (14/11/2026, NÃO publicar)
- [x] Pagamentos de teste só mexem em contas da lista de teste; nunca em contas reais
- [x] Ordem dos eventos: evento antigo ignorado, empate relê a subscrição
- [x] Checkout novo atrás de `billing.checkout_enabled.v1` (desligado); Team/Hub só sob consulta
- [ ] Backend de testes isolado — BLOQUEADO: proprietário cria projeto de testes e adiciona os segredos TEST_SUPABASE_*
- [ ] Lista de contas de teste de faturação — aguarda decisão do proprietário
- [ ] Publicação e rollout de 3 — aguarda GO separado

## Encerramento V1.0 + exportação self-service (14/11/2026, só plano)
- [x] Plano consolidado (docs/go-live/encerramento-v1-plano.md)
- [ ] Decisões do proprietário: prazos 30/7/60 dias, textos dos avisos, base de consentimento WhatsApp, exclusão das contas de teste, D1/D2
- [ ] Exportador e página "Os meus dados" — aguarda autorização de implementação
- [ ] Template WhatsApp e envio de avisos — aguarda GO separado

## AFONSO 2.0 — 50 decisões (14/11/2026, desenvolvimento, NÃO publicar)
- [x] Inventário V1/V2 e plano por dependências (docs/v2/afonso-2-0-inventario-e-plano.md)
- [x] Auditoria de isolamento por catálogo (105/105 com RLS, sem políticas abertas)
- [x] Portal mínimo V2 sem áreas comerciais (`v2.minimal_portal.v1`, desligado)
- [x] Exportação ZIP self-service do titular (`v2.self_export.v1`, desligado)
- [x] Regras puras: subscrição 29 €, tolerância 7d, exportação 30d, trial na 1.ª ação útil, referências 29 € crédito
- [x] Porta para CRM externo com consentimento (sem conectores)
- [x] 4 gates GO/NO-GO + estado das 50 decisões no admin (todos NO-GO)
- [ ] Ambiente de testes independente + E2E isolamento/WhatsApp/Telegram — BLOQUEADO: projeto e segredos TEST_SUPABASE_*
- [ ] Produto/preço 29 € e ligar ciclo de vida ao acesso real — aguarda autorização
- [ ] Antecedência do aviso de preço e retenção das referências — decisão do proprietário
- [ ] Menu V2 nas páginas Subscrição/Canais/Definições
- [ ] Ligar interruptores para Júlio (G1) — aguarda autorização expressa


## Staging independente AFONSO 2.0 (14/11/2026, NÃO publicar)
- [x] Inspeção de limites (projetos, rascunhos, segredos, tarefas agendadas, migrações)
- [x] Verificação de isolamento + dados sintéticos + barreira na base (testes verdes)
- [ ] Criar projeto separado (remix) — aguarda o proprietário
- [ ] Bot Telegram de teste, número WhatsApp de teste, Stripe de teste próprio — aguarda o proprietário
- [ ] Ligar a restrição de destinatários aos envios no staging e correr E2E — depende dos passos anteriores

## Staging AFONSO 2.0 — preparação (14/11/2026, nada executado)
- [x] V1: número de exemplo real trocado por "+351 9XX XXX XXX" em Ligar canal e Definições
- [x] Endereço, remetente e bot por ambiente (produção igual; staging nunca usa produção)
- [x] Esquema V2 limpo e reprodutível para o staging (`staging-install/`), pesquisa de dados reais = 0
- [x] Vulnerabilidades das bibliotecas documentadas, sem atualizações
- [ ] Credenciais de teste próprias no staging (bot, número Meta, pagamentos de teste, email) — proprietário
- [ ] Aplicar S2-00…S2-99 no staging — aguarda autorização expressa
- [ ] Ensaio numa base descartável antes do staging — aguarda autorização (pedido "sem executar migrations")
- [ ] Previews de admin com "ola@meuafonso.com" (só texto) — por decidir
