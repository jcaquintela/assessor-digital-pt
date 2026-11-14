# Auditoria de fecho Afonso 2.0: relatório e plano P0/P1 para o piloto de 5 (14/11/2026, 15:30 UTC)

Âmbito: só leitura do código, da configuração e da base de dados. Nada foi alterado. **Não é uma auditoria independente**: foi feita pelo mesmo agente que construiu as funcionalidades. Não houve nenhum teste E2E real.

## 1. Evidência nova desde a auditoria anterior
- **Versão publicada: NÃO VERIFICADO.** A ferramenta de publicação não devolve o commit publicado. O último commit em desenvolvimento é `4398ad76`; os anteriores relevantes são `8d476292` (Zome), `11f73841` (avaliações) e `ef466ffd` (teto/lock/ligação).
- **Entregas WhatsApp (30 dias):** 274 envios automáticos: 172 falhados (63%), 82 lidos e 20 entregues. **A causa não fica registada**: `error_code` e `outside_window` estão vazios em todas as falhas. A hipótese da janela de 24 h continua por provar.
- **Teste de ficheiros (`storage-isolation.test.ts`):** usa o backend real (carrega e apaga ficheiros com sessões reais). **Não é um teste local seguro.** Na execução das 15:23 tocou no armazenamento de produção e falhou na limpeza, pelo que podem ter ficado ficheiros de teste. Fica **excluído** das execuções até ser isolado.
- **Resto da suite:** 2 223 testes passam em 288 ficheiros, todos locais ou com fixtures. **A suite não está verde**: há 1 ficheiro com falha persistente.

## 2. Tabela de estado
| Funcionalidade | Estado | Evidência |
|---|---|---|
| Motor v3 | ATIVO | flag `assessor.engine.v3` ON global |
| Modelos WhatsApp aprovados | ATIVO | `whatsapp.templates.approved` ON |
| Avisos proativos (pré-evento, silêncio, resumos) | ATIVO, 63% falham | `assessor_nudges`, `whatsapp_send_logs` |
| Oportunidades no canal | DESLIGADO | `assessor.opportunity_nudges.v1` OFF |
| Teto 1 aviso não pedido/dia | DESLIGADO (ledger vazio) | `daily-cap.ts`, `intervention-gate.server.ts` |
| Mensagens "limite atingido" | ATIVO (contra a decisão) | só se desligam com o teto ligado |
| Turno adiado sem lock | IMPLEMENTADO, publicação não verificada | `replayDeferredInbound` |
| Memória WhatsApp+Telegram partilhada | DESLIGADO | `cross-channel/scope.server.ts` |
| Ligação segura entre contas | DESLIGADO | `channel-link/cross-link.server.ts` |
| Action-first A comprador / B angariação / C negócio em risco | DESLIGADO; linha da flag inexistente | `qualification/`, `listing/`, `deal/`, `commercial/` |
| Pesquisa pública Zome + dedupe + ranking neutro | DESLIGADO (só em action-first) | `imoveis/zome-public*.ts` |
| Early access, convites, waitlist | DESLIGADO; 0 linhas | `access/early-access.server.ts` |
| Trial só após convite | DESLIGADO; hoje o trial começa ao clicar no canal | `subscription/trial.server.ts` |
| Stripe Checkout/Portal/webhook | IMPLEMENTADO; 0 pagantes; último evento 08/11 | `api/public/payments/webhook.ts` |
| RBAC super/support/consultor | IMPLEMENTADO; menu admin visível ao support | `lib/admin.functions.ts` |
| RGPD exportar/apagar | SÓ PLANO | sem código |
| Simplificação do admin e da web do consultor | SÓ PLANO | auditoria UX |
| Avaliação decidido/preparado/executado | IMPLEMENTADO (dev) | `eval/commercial-autonomy.ts` |
| Análise de segurança atual | NÃO VERIFICADO | profunda de 03/08; todas desatualizadas |
| E2E real em canais, pagamentos e Zome | NÃO VERIFICADO | nenhuma prova |

## 3. Bloqueadores GO/NO-GO (hoje: NO-GO)
1. Versão publicada desconhecida.
2. 63% dos avisos falham e a causa não fica registada.
3. Mais de 1 aviso por dia e mensagens "limite atingido" ainda a sair.
4. Isolamento de ficheiros entre contas sem prova; o teste mexe em produção.
5. Sem análise de segurança recente.
6. O trial começa no clique no canal (contra a decisão aprovada).
7. Zero ensaios reais dos cenários A/B/C, de convite→trial e de cross-channel.

## 4. Plano de correções

### P0: antes do piloto
1. **Identificar a versão publicada.** O proprietário confirma no histórico de publicação; eu comparo com os commits. *Prova:* commit publicado = commit testado.
2. **Registar a causa das falhas de entrega**: gravar o código de erro do webhook de estado do WhatsApp em `whatsapp_send_logs`, sem mudar envios. *Prova:* falhas novas com motivo.
3. **Avisos dentro da janela de 24 h ou por modelo aprovado**, de acordo com o motivo encontrado. *Prova:* entrega ≥ 90% numa conta de teste durante 3 dias.
4. **Ligar o teto só nas 5 contas** e acabar com as mensagens "limite atingido". *Prova:* ledger com no máximo 1 por dia por conta, 0 avisos de limite.
5. **Isolar o teste de ficheiros**: correr só com um backend de teste e nunca em produção; verificar e limpar ficheiros de teste que tenham ficado. *Prova:* 289/289 sem tocar em produção.
6. **Correr a análise de segurança profunda** (separador Segurança) e corrigir os críticos.
7. **Ligar o gate de acesso antecipado e os convites só no piloto.** *Prova:* ensaio real registo → QR → "Olá" → convite → 1.ª mensagem → trial, e nenhum trial ao clicar no canal.
8. **Criar a flag action-first, ligada só na conta do proprietário**; ensaio real de A/B/C com pesquisa Zome real. *Prova:* 1.ª ação útil até ao 3.º turno, links reais, 0 contactos a terceiros.
9. **Publicar** com aprovação do proprietário; reversão testada desligando as flags.

### P1: durante o piloto
10. Ensaio real cross-channel (pergunta no WhatsApp, "sim" no Telegram, executado 1 vez) e só depois ligar a memória partilhada.
11. Esconder "Avançadas" e Configuração do admin a support_admin.
12. RGPD mínimo: exportar e apagar conta.
13. Métricas com "entregue", e não "enviado".
14. Fase 0 da simplificação do admin.

## 5. Critérios GO
Todos os P0 cumpridos com a prova indicada, suite 100% verde sem efeitos externos, análise de segurança sem críticos e 3 dias seguidos dentro do teto e da taxa de entrega.

## Decisões pedidas
- Confirmas os 5 do piloto (Júlio, Iolanda, Pedro Cunha, Telmo + 1)?
- Autorizas começar pelos P0 1, 2, 5 e 6 (sem efeito para os consultores)?
