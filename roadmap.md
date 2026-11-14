
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
