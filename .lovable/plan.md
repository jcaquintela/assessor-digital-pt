# Auditoria global read-only Afonso AI 2.0 (14/11/2026, 15:30 UTC)

Nada foi alterado: código, base de dados, flags, prompts, contas, publicação e mensagens ficaram como estavam. Evidência: código atual, testes corridos agora, leituras SELECT à produção e resultados de segurança guardados.

## 1. Produção publicada vs desenvolvimento
- **Versão publicada: NÃO VERIFICADO.** Não consegui ler daqui que versão está publicada. Assumo que as Fases 1 e 2, o teto, o lock, a ligação segura, o action-first, a Zome, o early access e as avaliações estão **só em desenvolvimento**. Os commits recentes (`8d476292`, `11f73841`, `3a4257dc`) não têm publicação registada.
- **Base de dados:** uma só instância serve a pré-visualização e a produção. As tabelas novas (`account_access`, `access_invites`, `access_waitlist`, `proactive_daily_ledger`) **existem em produção**, vazias (0 linhas cada).
- **Migrações:** a pasta tem 174 ficheiros; o último é de 25/09. As tabelas de novembro existem na BD mas não aparecem nesta listagem. A rastreabilidade das migrações é **NÃO VERIFICADO**: é preciso confirmar que estão no histórico antes de publicar.

## 2. Flags efetivas em produção (lidas agora)
| Flag | Global | Contas |
|---|---|---|
| assessor.engine.v3 | ON | 1 |
| whatsapp.templates.approved / template.checkin_v2.approved | ON | 0 |
| assessor.opportunity_nudges.v1 | OFF (desligada hoje) | 0 |
| assessor.global_unsolicited_cap.v1 | OFF | 0 |
| assessor.cross_channel.v1 / cross_link.v1 | OFF | 0 |
| assessor.base_match_opportunity.v1 | OFF | 0 |
| access.early_access_gate.v1 / referral_invites.v1 / waitlist.v1 | OFF | 0 |
| assessor.design.v2 | OFF | 5 |
| assessor.supreme.v1 | OFF | 1 |
| assessor.engine.v2 | OFF | 0 |

**Não existe** uma flag `assessor.action_first_qualification.v1` na tabela. O código trata a ausência como desligada; a criação da linha é **NÃO VERIFICADO / pendente**.

## 3. Testes (corridos agora, 15:23 UTC)
- **288 de 289 ficheiros passam; 2 223 testes passam.**
- **A suite NÃO está totalmente verde.** O ficheiro `src/lib/assessor/storage-isolation.test.ts` falha por timeout na limpeza ("Hook timed out"). Por isso, **o isolamento de ficheiros entre contas com sessões reais não está provado** por esta execução.
- **Tipo de prova:** quase tudo é teste unitário ou com fixtures sintéticas. Não houve nenhum teste E2E real em WhatsApp ou Telegram, nem pagamento Stripe real, para as funcionalidades novas.
- **Segurança:** os resultados guardados não têm achados (pgscan, supply chain e MCP, de 14/11). Ainda assim, **todos estão "up_to_date: false"** e a análise profunda é de 03/08. A postura de segurança atual é **NÃO VERIFICADO**, por isso não declaro a app segura.

## 4. Inventário de funcionalidades
| Área | Estado | Caminho / evidência |
|---|---|---|
| Motor v3 (Observe→Reply) com recurso a v2/legado | IMPLEMENTADO, produção | flag engine.v3 ON |
| Proteção do system prompt | IMPLEMENTADO (dev) | `v3/prompt-shield.ts`; testes golden |
| Validade dos avisos (expiram em vez de sair atrasados) | IMPLEMENTADO (dev) | `nudge-expiry.ts` |
| Remarcação sem hora | IMPLEMENTADO (dev) | `reminders.server.ts` |
| Cartões de contacto WhatsApp/Telegram | IMPLEMENTADO (dev) | `shared-contact.server.ts` |
| Recibo de escrita ("fica anotado" só com escrita real) | IMPLEMENTADO (dev) | `v3/write-receipt.ts` |
| Oportunidades em `assessor_nudges` | FLAG OFF | `generateOpportunityDrafts` |
| Teto global de 1 aviso não pedido/dia | FLAG OFF | `daily-cap.ts`, `intervention-gate.server.ts`; ledger vazio |
| Turno adiado em vez de correr sem lock | IMPLEMENTADO sem flag (dev) | `replayDeferredInbound`; 0 adiados |
| Memória partilhada WhatsApp+Telegram | FLAG OFF | `cross-channel/scope.server.ts` |
| Ligação segura entre contas | FLAG OFF | `channel-link/cross-link.server.ts` |
| Action-first: comprador / angariação / negócio em risco | FLAG OFF (sem linha na tabela) | `qualification/`, `listing/`, `deal/`, `commercial/` |
| Simulador financeiro, orçamento provisório | IMPLEMENTADO atrás da flag | `commercial/financial-simulator.ts` |
| Pesquisa Zome pública + portais + dedupe | FLAG OFF | `imoveis/zome-public*.ts`, `qualification/dedupe.ts` |
| Early access, convites (3 por beta, 7 dias), waitlist | FLAG OFF | `access/early-access.server.ts`; 0 convites |
| Trial 14 dias depois do convite | FLAG OFF; sem gate, o trial **ainda começa ao clicar no canal** | `trial.server.ts` |
| Stripe Checkout/Portal/webhook | IMPLEMENTADO; 4 eventos, último 08/11; 0 pagantes | `api/public/payments/webhook.ts` |
| Avaliação de autonomia (decidido/preparado/executado) | IMPLEMENTADO (dev) | `eval/commercial-autonomy.ts`; 19 goldens na BD |
| Simplificação do admin e da web do consultor | SÓ PLANO | documento de auditoria UX |
| Exportar dados / apagar conta (RGPD) | NÃO IMPLEMENTADO | sem código |
| CMI por WhatsApp | BLOQUEADO (parecer jurídico) | memória do projeto |
| Satisfação / conversão comercial | NÃO VERIFICADO (sem dados) | 0 negócios beta registados |

## 5. Discrepância dos avisos
- **Explicada:** os 110 avisos "enviados" foram todos para a conta do proprietário. 103 falharam a entrega no WhatsApp; os outros 3 beta tiveram 0.
- **Ainda ativa:** houve **25 avisos "sent" nos últimos 7 dias**, com o teto desligado. Continua possível mais de 1 aviso por dia e continuam a sair avisos "limite atingido".
- **"Enviado" não é "entregue"**: as métricas têm de usar `whatsapp_send_logs`.

## 6. Top 10 riscos
1. A versão publicada é desconhecida: não se sabe o que os 4 beta recebem hoje.
2. Os avisos em produção ultrapassam a decisão de 1 por dia e mandam "limite atingido".
3. 94% dos avisos falham a entrega (janela de 24 h do WhatsApp ou modelos aprovados): o produto proativo não chega ao consultor.
4. O teste de isolamento de ficheiros entre contas falha: o risco de fuga entre contas não está descartado.
5. Sem análise de segurança recente: a profunda é de 03/08.
6. Com o gate desligado, o trial começa ao clicar no canal, o que contradiz a decisão aprovada.
7. A flag action-first não existe na tabela: a ativação depende de criar a linha, sem ensaio prévio.
8. Migrações de novembro não visíveis na pasta: risco de divergência entre o código e a BD.
9. RGPD: sem exportação nem apagamento de conta. Os consentimentos de acesso do suporte só existem no painel web.
10. Zero E2E reais em canais (pesquisa Zome real, confirmação cross-channel, convite→trial). As provas são unitárias ou com fixtures.

## 7. Plano de fecho priorizado (para aprovar; cada passo é separado)
1. **Confirmar a versão publicada** e o histórico de migrações (só leitura). Prova: commit publicado identificado.
2. **Corrigir o teste de isolamento** de ficheiros e repetir até ficar verde. Prova: 289/289.
3. **Correr uma análise de segurança profunda** (separador Segurança) e tratar os críticos.
4. **Ligar o teto global** só para os 5 do piloto e confirmar 0 avisos "limite atingido". Prova: ledger com no máximo 1 por dia por conta durante 3 dias.
5. **Diagnosticar as falhas de entrega WhatsApp** (modelos aprovados fora da janela de 24 h). Prova: taxa de entrega ≥ 90% numa conta de teste.
6. **Criar a linha da flag action-first** OFF; ligá-la só na conta do proprietário; ensaio real dos 3 cenários com pesquisa Zome real.
7. **Ligar o gate de acesso antecipado e os convites** só no piloto; ensaio real registo → QR → "Olá" → convite → 1.ª mensagem → trial.
8. **Ensaio cross-channel real**: pergunta no WhatsApp, "sim" no Telegram, executado uma só vez.
9. **Publicar** só depois de 1–8, com o proprietário a aprovar.
10. **RGPD mínimo** (exportar/apagar) antes de abrir para fora do piloto.

## 8. GO/NO-GO do piloto de 5 pessoas
**GO só se tudo for verdade:**
- versão publicada conhecida e igual à testada;
- suite 100% verde e análise de segurança sem críticos;
- no máximo 1 aviso não pedido por dia por conta, 0 avisos "limite atingido", durante 3 dias;
- entrega WhatsApp ≥ 90% nos avisos;
- 3 cenários action-first com uma ação útil até ao 3.º turno, links reais e 0 contactos a terceiros sem aprovação;
- convite → trial ensaiado de ponta a ponta, sem trial ao clicar no canal;
- confirmação cross-channel executada exatamente 1 vez;
- reversão confirmada desligando as flags.

**NO-GO** se falhar qualquer um dos pontos acima, sobretudo os pontos 2, 3 e 4 dos riscos.

## Decisões para o proprietário
- Autorizar os passos 1–3 (verificação e testes, sem efeito para os consultores)?
- Os 5 do piloto: Júlio, Iolanda, Pedro Cunha, Telmo e mais quem? O Telmo continua beta?
