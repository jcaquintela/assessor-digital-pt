# Adenda: lançamento por convite (Afonso 29 €/mês)

Faz parte do plano de transição para o plano único. Este documento é só plano: não altera produção, código, base de dados, Stripe nem interruptores.

## 1. Decisões fechadas vs sugestões

| Tema | Estado |
|---|---|
| Entrada no lançamento só por convite individual de uso único | DECISÃO FECHADA |
| Trial de 14 dias sem cartão, que começa na primeira mensagem válida depois de aceitar o convite | DECISÃO FECHADA (igual ao plano de billing) |
| Beta testers e subscritores atuais continuam sem precisar de convite | DECISÃO FECHADA |
| Página pública sem registo livre, com pedido de acesso / lista de espera | DECISÃO FECHADA |
| Interruptor próprio com possibilidade de voltar atrás | DECISÃO FECHADA |
| Preço de 29 €/mês | HIPÓTESE (não é decisão de preço) |
| Convite válido 7 dias | SUGESTÃO |
| Ritmo de entrada (ondas de 10, 25, 50 e depois semanal) | SUGESTÃO |
| Limite de convites por administrador ou por dia (20/dia) | SUGESTÃO |
| Convites por indicação de consultores | SUGESTÃO, fica fora da V1 |
| Tempo de guarda da lista de espera (12 meses) | SUGESTÃO, precisa de validação jurídica |

## 2. O que já existe (lido no código)

- Já existem convites só para Telegram, com página de administração (Convites). Mas o código é gerado com aleatoriedade fraca, fica guardado em texto legível, dura 30 dias por defeito e não serve para WhatsApp.
- Há duas páginas abertas de registo livre: "registo" e "auth".
- Uma conta Telegram é criada sozinha na primeira mensagem, no plano base.
- Já há associação por código entre WhatsApp e Telegram e uma ligação segura entre contas, que ficou desligada na fase anterior.

## 3. Como funciona o convite

```text
Admin emite → link/QR enviado ao convidado → convidado abre e escolhe o canal
→ primeira mensagem com o código de uso único → conta criada e canal ligado
→ trial de 14 dias começa nesta mensagem → convite fica "usado"
```

- **Estados:** emitido, enviado, aberto, usado, expirado, revogado.
- **Administração:** emitir (com nota, email ou telefone do destinatário, validade), revogar, reenviar (o código antigo deixa de valer), ver estado e histórico. Cada ação fica registada.
- **Ligação:** cada convite fica preso a uma conta e ao primeiro canal. O segundo canal liga-se pela associação segura que já existe, nunca com um segundo convite.

## 4. Segurança

- Código aleatório seguro com pelo menos 128 bits, dentro do link. Na base de dados só fica o resumo (hash) do código.
- O código é usado uma única vez através de uma operação única na base de dados, por isso dois usos ao mesmo tempo dão no máximo um sucesso.
- Respostas iguais para código inválido, expirado, usado ou revogado, para não revelar quais códigos existem. Há limite de tentativas por chat, número e endereço IP.
- O trial é único por pessoa (telefone, Telegram e email), como no plano de billing. Um novo convite nunca reinicia um trial já gasto.
- O convite não guarda dados pessoais no link.

## 5. Fechar todas as portas de entrada (com o interruptor ligado)

- As páginas "registo" e "auth" deixam de criar contas novas sem convite. O login de quem já tem conta continua.
- O Telegram deixa de criar conta sozinho: sem convite, recebe uma resposta neutra com o link da lista de espera.
- No WhatsApp, um número desconhecido sem código recebe a mesma resposta neutra.
- Também ficam fechados o Google, o "Sign in with Lovable", o MCP, as ligações entre contas, os convites Telegram antigos (que deixam de ser aceites, ou passam a valer só até expirarem) e as funções do servidor que criam perfis.
- Uma verificação no servidor recusa criar qualquer conta sem convite válido ou sem estar na lista de exceções. Isto não depende só do ecrã.

## 6. Quem fica de fora da regra

- Contas que já existem quando o interruptor é ligado, beta testers e subscritores com ou sem pagamento: entram numa lista de exceções no dia de ativação e não precisam de convite.
- A equipa interna fica numa lista de permissões própria.

## 7. Lista de espera (página pública)

- Pede nome, email, telefone opcional, agência ou zona opcional, e um consentimento explícito e separado. Diz para que servem os dados e por quanto tempo ficam guardados.
- Tem proteção contra bots e limite de pedidos, e responde sempre o mesmo, mesmo que o email já esteja na lista.
- Quem está na lista pode pedir para sair ou para apagar os dados. O admin promove pedidos a convite.
- A página pública meuafonso.com não é alterada sem acesso e autorização. Aqui só se planeia o formulário e o destino dos dados.

## 8. Limites e entrada progressiva

- Um teto global de convites ativos e um teto diário, ambos configuráveis (sugestão acima).
- Avançar de onda só quando a ativação e a saúde técnica forem aceitáveis (critérios na secção 9).

## 9. Métricas

Funil: convite emitido → aberto → usado (ativação) → primeiro resultado útil em menos de 2 minutos → uso no dia 7 e no dia 14 → conversão a pagante no fim do trial → retenção ao dia 28.

- Medidas por onda e por canal, com o tempo entre cada passo.
- É correlação, não prova de causa: comparar ondas, não pessoas.
- Avisos de alerta: muitas tentativas inválidas, uso do mesmo convite em vários sítios, contas criadas fora do fluxo (o objetivo é zero).

## 10. Interruptor e voltar atrás

- Interruptor `access.invite_only.v1`, desligado por defeito. Com ele desligado, tudo funciona como hoje.
- Ao ligar: criar primeiro a lista de exceções e só depois ligar.
- Voltar atrás: desligar o interruptor. Convites, lista de espera e trials ficam guardados, e nada é apagado.

## 11. Testes de fuga (antes de ligar)

1. Criar conta direto nas páginas "registo" e "auth" e diretamente no sistema de contas, sem convite → recusado.
2. Primeira mensagem no Telegram sem convite → nenhuma conta criada.
3. Número de WhatsApp desconhecido → nenhuma conta criada.
4. Google, Lovable e MCP com um email novo → recusado.
5. Convite usado, expirado, revogado ou inventado → a mesma resposta neutra.
6. Duas pessoas a usar o mesmo convite ao mesmo tempo → só uma conta.
7. Ligação de um segundo canal sem prova de posse → recusada.
8. Beta tester ou subscritor existente → entra normalmente.
9. O trial começa na primeira mensagem válida e não no momento em que o convite é aceite.
10. Desligar o interruptor → volta o comportamento atual.

## 12. Checklist e decisões pendentes do proprietário

- [ ] Confirmar a validade de 7 dias.
- [ ] Confirmar os tetos e as ondas de entrada.
- [ ] Decidir se os convites Telegram antigos que ainda não foram usados se mantêm ou são revogados.
- [ ] Rever com jurista o texto de consentimento e o tempo de guarda da lista de espera.
- [ ] Decidir o canal de envio do convite (email ou manual pelo admin).
- [ ] Autorizar o formulário na página pública meuafonso.com.
- [ ] Rever a lista de exceções antes de ligar o interruptor.
- [ ] Ter todos os testes de fuga verdes antes de qualquer ativação.

## Detalhes técnicos

- Planeado de forma aditiva: tabela `access_invites` (`token_hash`, `status`, `expires_at`, `revoked_at`, `used_by`, `used_channel`, `wave`), função de uso único atómica `consume_access_invite`, tabelas `access_allowlist` e `waitlist_requests`, gancho no momento de criação de conta e verificação na criação de perfil.
- Reaproveita o padrão de `telegram_invites` e `admin/convites`, mas com hash e `crypto.getRandomValues`.
- O início do trial usa o mesmo ponto já definido no plano de billing.
