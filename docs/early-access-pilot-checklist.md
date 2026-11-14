# Checklist — validação real do convite global e do piloto Early Access

Estado: por autorizar. Nada disto está ligado. Cada passo precisa de "OK" explícito do proprietário.

## 0. Pré-condições
- [ ] Código Early Access publicado (hoje só existe em desenvolvimento).
- [x] Composição final decidida pelo proprietário (14/11/2026): 5 lugares = Júlio Quintela, Iolanda Ventura, Pedro Cunha + 2 convidados por convite individual (uso único, 7 dias).
- [ ] Telmo Sousa sai do piloto: retirar APENAS o beta, depois de aprovação explícita do efeito (ver abaixo). Ainda é beta.
- [ ] Piloto em GO (critérios do fecho P0). Enquanto for NO-GO: nenhum convite gerado nem enviado.

### Efeito verificado de retirar o beta ao Telmo (só leitura, 14/11/2026)
- Conta única que corresponde: "Telmo Sousa", email @zome.pt, papel `consultant`, conta real.
- Plano guardado `base`, sem subscrição Stripe, faturação `none`, trial expirado em 24/08. Sem linha de acesso antecipado, sem flags próprias.
- Dados: 1 pessoa, 1 imóvel, 1 canal WhatsApp ligado; última mensagem 23/08/2026.
- Hoje recebe plano efetivo "hub" só por ser beta. Sem beta passa a `base`: perde os módulos acima de Base.
- WhatsApp: o código só bloqueia o Base ao LIGAR o canal; a ligação existente fica. A regra de produto diz que Base não inclui WhatsApp: se a ligação cair, não a pode refazer. Comportamento em conversa não testado em runtime.
- Nada é apagado: conta, dados, histórico e ligação ficam.

### Reserva de 2 convites (preparada, NÃO emitida)
- Emissor: Júlio (único beta com `access.referral_invites.v1`, a ligar só para ele no dia do GO).
- A quota técnica é 3 por beta: o 3.º convite tem de ficar por usar. Disciplina manual, ou limite próprio do piloto (alteração de código ainda não feita).
- Iolanda e Pedro Cunha não emitem (sem a flag).
- [ ] Teste real da reserva atómica de convites contra a base de dados (dois consumos em simultâneo → só um passa).

## 1. Ligar o bloqueio (afeta só contas NOVAS)
- [ ] Ler o estado dos interruptores antes.
- [ ] Ligar `access.early_access_gate.v1` para todos (é obrigatório: contas novas só ficam em espera com o bloqueio ligado para todos).
- [ ] Confirmar que nenhuma conta existente ganhou linha de acesso em espera.
- [ ] Confirmar que Júlio, Iolanda e Pedro Cunha continuam a falar com o Afonso normalmente.

## 2. Conta de teste (antes dos convidados reais)
- [ ] Registo web → WhatsApp por QR → "Olá Afonso" → resposta de acesso antecipado, sem trial.
- [ ] O mesmo pelo Telegram: o registo automático não dá acesso nem trial.
- [ ] Código inventado ou expirado → resposta neutra; 5 falhas/hora → bloqueio temporário.
- [ ] Painel (criar pessoa/imóvel, chat) bloqueado para a conta em espera.
- [ ] Códigos promocionais não dão acesso a uma conta em espera.
- [ ] Apagar a conta de teste no fim.

## 3. Convites do Júlio
- [ ] Ligar `access.referral_invites.v1` APENAS para a conta do Júlio (por conta, nunca para todos).
- [ ] Júlio pede "dá-me um convite" duas vezes → 2 códigos de 7 dias e "fica 1 por usar".
- [ ] Júlio partilha pessoalmente os códigos. Não usar a página de administração (não conta para a quota).
- [ ] Iolanda/Pedro Cunha ao pedir um convite → o Afonso responde normalmente, sem código.

## 4. Convidados
- [ ] Cada convidado: registo → QR → "Olá Afonso" → envia o código → "Convite aceite".
- [ ] Na mensagem comercial seguinte, os 14 dias arrancam uma única vez (confirmar datas em UTC).
- [ ] Na administração: convite "usado", com quem o deu, quem o usou e o canal.
- [ ] Verificar que nenhum convidado é a própria conta do Júlio com outro email/número.

## 5. Vigilância durante o piloto
- [ ] Diariamente: entradas bloqueadas, convites usados/expirados, falhas de envio.
- [ ] Nenhuma mensagem a terceiros sem confirmação explícita.

## 6. Recuo (rollback)
- [ ] Desligar `access.early_access_gate.v1` → toda a gente volta ao acesso anterior, sem perda de dados.
- [ ] Desligar `access.referral_invites.v1` para o Júlio → deixa de gerar convites; os já dados continuam válidos até expirarem ou serem anulados na administração.
