# Auditoria só de leitura: beta testers (14/11/2026, 13:35 UTC)

Fonte: base de dados real, partilhada pela pré-visualização e pela versão publicada. Só foram feitas leituras e nada foi alterado. Um beta tester é uma conta com a marca de beta tester ligada e sem data de fim ou com data de fim ainda por chegar.

## Resumo
- **5 beta testers ativos**, todos ainda dentro do período. Não há nenhum expirado.
- Há 55 contas no total. Há 1 conta interna da equipa, que não é beta tester.
- **Ninguém usou o Afonso nos últimos 7 nem 14 dias.** Isto vale para todas as contas, não só para os beta testers. A última mensagem de um consultor foi a 03/11/2026.
- Nos últimos 30 dias, só 3 contas escreveram: 2 beta testers e 1 outra conta.
- As 12 mensagens dos beta testers nos últimos 30 dias chegaram todas pelo WhatsApp. Nenhuma veio pelo Telegram.
- Não há trials ativos nem ninguém a pagar.
- Não houve avisos proativos aos beta testers nos últimos 60 dias.
- Não há feedback registado.
- Nenhum negócio foi criado pelos beta testers e não há eventos de negócio registados.

## Por beta tester

| Beta tester | Plano | Canais ligados | Última mensagem | Mensagens 7d / 14d / 30d | Dias ativo em 30 | Pessoas / imóveis / negócios | Estado |
|---|---|---|---|---|---|---|---|
| Iolanda Ventura | Pro | WhatsApp + Telegram | 31/10 | 0 / 0 / 6 | 4 | 1 / 1 / 0 | Parada há 14 dias |
| Pedro Cunha | Pro | WhatsApp + Telegram | 21/10 | 0 / 0 / 6 | 2 | 1 / 1 / 0 | Parado há 24 dias |
| Pedro Guedes | Pro (trial terminado) | WhatsApp | 12/10 | 0 / 0 / 0 | 0 | 2 / 2 / 0 | Inativo há mais de 30 dias |
| Telmo Sousa | Base (trial terminado) | WhatsApp | 13/08 | 0 / 0 / 0 | 0 | 1 / 1 / 0 | Inativo desde agosto |
| João Morgado | Hub | WhatsApp | nunca | 0 / 0 / 0 | 0 | 0 / 0 / 0 | Nunca usou |

Não aparecem números de telefone nem emails. Não houve falhas de envio registadas nestas contas nos últimos 30 dias. Houve 12 registos de chamadas à IA e 8 ações executadas, tudo com origem nas duas contas ativas.

## Adesão e retenção (leitura honesta)
- Dos 5, só 2 estiveram ativos nos últimos 30 dias, e ninguém nos últimos 14.
- 1 nunca enviou uma mensagem.
- A retenção semanal atual é 0 de 5.
- A carteira registada é mínima: no máximo 2 pessoas e 2 imóveis por conta.

## Há dados para medir valor comercial?
**Não.** Não há negócios, eventos de negócio, avisos de oportunidade enviados, feedback, nem ninguém a pagar. Qualquer número de valor comercial seria inventado. O piloto precisa de uso real antes de haver métrica.

## Interruptores (estado real)

| Fase | Interruptor | Estado |
|---|---|---|
| Fase 1 | Oportunidades por aviso | **LIGADO para todos** (ver alerta) |
| Fase 2 | Conversa partilhada WhatsApp+Telegram | Desligado, sem contas |
| Pré-piloto | Teto de 1 aviso por dia | Desligado |
| Pré-piloto | Match no plano base | Desligado |
| Pré-piloto | Ligação segura entre contas | Desligado |
| Early Access | Bloqueio por convite / convites de beta testers / lista de espera | Todos desligados, sem contas |
| Outro | Motor v3 | Ligado para todos |
| Outro | Design v2 | Ligado para 5 contas |
| Outro | Supreme | Ligado para 1 conta |

**Alerta:** o interruptor de oportunidades da Fase 1 está ligado para todos na base de dados partilhada. A Fase 1 foi dada como não publicada. Se a versão publicada já incluir esse código, as oportunidades estão ativas em produção. Isto deve ser confirmado antes de qualquer outra coisa. Mesmo assim, não há avisos registados para os beta testers.

## Lacunas desta auditoria
- **Versão publicada vs desenvolvimento:** não consegui ver qual versão está publicada. Fica por confirmar se as Fases 1 a 3 e o Early Access já estão publicados. Pelo que foi registado nesta conversa, nada disto foi publicado.
- **Erros do motor:** não analisei os registos de erro em detalhe, além das falhas de envio, que foram zero.
- **Alcance:** a conta interna e as outras 49 contas não foram analisadas uma a uma.

## Próximos passos sugeridos (precisam da tua decisão)
1. Confirmar se a versão publicada inclui a Fase 1. Se não incluir, desligar o interruptor de oportunidades até publicar.
2. Contactar à mão os 5 beta testers, e o João Morgado primeiro, antes de iniciar o piloto. Se o tom de 1-para-1 for preferido, a mensagem deve ser escrita pela equipa.
3. Não tirar conclusões de valor comercial até haver pelo menos 2 semanas de uso real.
