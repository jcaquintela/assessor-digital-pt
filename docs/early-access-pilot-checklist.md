# Checklist — validação real do convite global e do piloto Early Access

Estado: por autorizar. Nada disto está ligado. Cada passo precisa de "OK" explícito do proprietário.

## 0. Pré-condições
- [ ] Código Early Access publicado (hoje só existe em desenvolvimento).
- [ ] Beta testers do piloto confirmados: Júlio Quintela, Iolanda Ventura, Pedro Cunha.
- [ ] Decidido o caso Telmo Sousa (ainda é beta; sem beta perde o WhatsApp, porque o plano Base não o inclui).
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
