# Checklist — validação real do convite global e do piloto Early Access

Estado: por autorizar. Nada disto está ligado. Cada passo precisa de "OK" explícito do proprietário.

## 0. Pré-condições
- [ ] Código Early Access publicado (hoje só existe em desenvolvimento).
- [x] Composição final decidida pelo proprietário (14/11/2026): 5 lugares = Júlio Quintela, Iolanda Ventura, Pedro Cunha + 2 convidados por convite individual (uso único, 7 dias).
- [x] Telmo Sousa fora do piloto SEM tocar no beta (decisão 14/11/2026): linha `excluded` em `pilot_participants`. Beta, plano, WhatsApp, dados e faturação intactos. Transição do beta fica para plano próprio.
- [x] Participação no piloto separada do beta: com `pilot.v2_entitlement.v1` ligado, as funções 2.0 só correm para participantes ativos (Júlio, Iolanda, Pedro Cunha + convidados).
- [ ] Piloto em GO (critérios do fecho P0). Enquanto for NO-GO: nenhum convite gerado nem enviado.

### Efeito verificado de retirar o beta ao Telmo (só leitura, 14/11/2026)
- Conta única que corresponde: "Telmo Sousa", email @zome.pt, papel `consultant`, conta real.
- Plano guardado `base`, sem subscrição Stripe, faturação `none`, trial expirado em 24/08. Sem linha de acesso antecipado, sem flags próprias.
- Dados: 1 pessoa, 1 imóvel, 1 canal WhatsApp ligado; última mensagem 23/08/2026.
- Hoje recebe plano efetivo "hub" só por ser beta. Sem beta passa a `base`: perde os módulos acima de Base.
- WhatsApp: o código só bloqueia o Base ao LIGAR o canal; a ligação existente fica. A regra de produto diz que Base não inclui WhatsApp: se a ligação cair, não a pode refazer. Comportamento em conversa não testado em runtime.
- Nada é apagado: conta, dados, histórico e ligação ficam.

### Reserva de 2 convites (preparada, NÃO emitida)
- Piloto `afonso_v2` em `no_go`: a base de dados recusa qualquer convite do piloto enquanto assim estiver.
- Teto global de 2 lugares (vivos + usados), 7 dias, uso único, sem duplicados (mesma mensagem ou mesmo pedido na administração). A quota geral de 3 dos beta não muda e não é usada.
- Quem emite e anula convites do piloto: o emissor designado (Júlio) ou qualquer Super Admin, pela conversa (WhatsApp/Telegram) ou pela página "Acesso antecipado" → "Piloto AFONSO 2.0". Support Admin só vê. Consultores (incl. Iolanda, Pedro Cunha) não emitem.
- Todos os caminhos passam pela mesma regra na base de dados; escrita direta de convites do piloto, reativação, prolongamento, anulação por fora e lugares sem convite são recusados.
- A página geral de convites da equipa não lista nem anula convites do piloto; convites gerais, links de onboarding, convites Telegram e códigos promocionais não dão lugar no piloto.
- Envio: o código aparece uma vez a quem o gerou, para partilhar pessoalmente. Envio automático pelo Afonso a uma conta em espera NÃO está implementado (decisão pendente).

### No dia do GO (cada passo com OK explícito)
- [ ] Passar `pilots.status` de `no_go` para `go`.
- [ ] Ligar `pilot.v2_invites.v1` só para quem vai pedir convites na conversa (Júlio e, se decidido, outro Super Admin). A página de administração não precisa deste interruptor.
- [ ] Ligar `pilot.v2_entitlement.v1` (global) ANTES de ligar qualquer função 2.0 globalmente.
- Recuo: desligar `pilot.v2_entitlement.v1` volta à regra anterior; `pilots.status = closed` desliga as funções 2.0 a todos os participantes.
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
- [ ] Ligar `pilot.v2_invites.v1` APENAS para a conta do Júlio (não é preciso `access.referral_invites.v1`).
- [ ] Júlio pede "dá-me um convite" duas vezes → 2 códigos de 7 dias; o 3.º pedido é recusado.
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
