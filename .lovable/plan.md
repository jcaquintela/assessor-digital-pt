# Adenda: early access por convites com registo aberto (Afonso 29 €/mês)

Esta adenda substitui o modelo anterior em que tudo era só por convite. Integra-se no plano de transição para o plano único: 29 €/mês com WhatsApp e Telegram em simultâneo. É só plano: não altera código, base de dados, Stripe, interruptores nem produção.

## 1. Decisões fechadas vs sugestões

| Tema | Estado |
|---|---|
| O registo web fica aberto. Qualquer pessoa cria conta, liga o WhatsApp por QR (ou o Telegram) e escreve "Olá Afonso" | FECHADA |
| Sem convite válido ou acesso beta, não há trial nem funções comerciais | FECHADA |
| Os 14 dias de trial, sem cartão, começam na primeira mensagem válida DEPOIS de o acesso ser ativado | FECHADA |
| Quem já tem acesso (beta testers e subscritores) mantém-no, sem convite retroativo | FECHADA |
| Cada beta tester ativo pode gerar 3 convites de uso único, válidos 7 dias, partilhados através do Afonso | FECHADA (quota inicial) |
| Não há recompensas em dinheiro por convidar | FECHADA |
| Lista de espera com consentimento de contacto e opção de aviso | FECHADA |
| Não revelar se um número ou email já tem conta | FECHADA |
| Preço de 29 €/mês | HIPÓTESE |
| Repor a quota de convites (por exemplo +3 por cada convidado que ative) | SUGESTÃO |
| Subscritores pagos também poderem convidar | SUGESTÃO, decisão pendente |
| Tempo de guarda da lista de espera (12 meses) | SUGESTÃO, precisa de validação jurídica |

## 2. O que já existe (lido no código)

- Existem convites só para Telegram, com página de administração. O código é gerado com aleatoriedade fraca, fica guardado em texto legível e dura 30 dias por defeito.
- As páginas "registo" e "auth" já permitem registo aberto.
- O Telegram cria conta sozinho na primeira mensagem, no plano base. Isto vai passar a criar só uma conta em espera, sem acesso.
- O plano de billing já tem trial único por pessoa. Hoje o trial pode arrancar na escolha do canal, o que tem de ser corrigido.

## 3. Estados da conta

```text
registered_waiting ──(convite válido / promoção admin)──> invited
invited ──(1.ª mensagem válida após ativação)──> activated → trialing (14 dias)
trialing ──(pagamento)──> subscribed
trialing ──(fim sem pagar)──> expired (os dados ficam guardados)
contas antigas com acesso ──(migração)──> trialing ou subscribed conforme o estado atual
```

- Estes estados vivem só no servidor. Só `trialing` e `subscribed` dão acesso às funções comerciais.
- O QR, a ligação do canal e o "Olá" em `registered_waiting` nunca criam trial.
- `activated` existe para registar o momento exato da ativação. O trial arranca na primeira mensagem válida seguinte, como no plano de billing.

## 4. Como funciona para o consultor

1. Regista-se na web, escolhe o canal, lê o QR (ou abre o link do Telegram) e escreve "Olá Afonso".
2. Se não tiver acesso, recebe esta resposta (PT-PT):
   > "Olá! Sou o Afonso 👋 Ainda estou em acesso antecipado, só por convite. Tens um código? Envia-mo aqui. Se não tiveres, posso pôr-te na lista de espera, ou podes pedir um convite a um colega que já me use."
3. Se enviar um código válido:
   > "Convite aceite. Bem-vindo! Tens 14 dias para me experimentar, sem cartão. Para começar, diz-me as 3 coisas mais importantes no teu negócio esta semana."
   Esta mensagem conta como a primeira mensagem válida, ou seja, o trial começa aqui.
4. Se o código for inválido, expirado ou já usado, a resposta é sempre a mesma:
   > "Esse código não está válido. Confirma com quem to enviou, ou entra na lista de espera."
5. Lista de espera:
   > "Posso avisar-te quando houver lugar. Aceitas que te contacte por aqui e por email só para isso? (sim/não)"
   Só fica registado depois de um "sim". Pode sair a qualquer momento escrevendo "sair da lista".
6. Qualquer outro pedido em espera recebe uma resposta curta a lembrar as duas opções. Nada é gravado como dado comercial.

## 5. Convites dados por beta testers

- O beta tester pede "dá-me um convite" e recebe um link ou código pronto a reencaminhar:
  > "Aqui tens um convite pessoal, válido 7 dias: [link]. Restam-te 2."
- O beta tester pode perguntar "os meus convites" para ver o estado de cada um e quantos lhe restam, e pode dizer "anula o convite X".
- A quota é verificada no servidor de forma atómica, por isso pedidos ao mesmo tempo não ultrapassam os 3.
- Cada convite guarda quem o deu e a sua origem (beta tester, admin ou lista de espera), para medir indicações.
- O Afonso nunca envia o convite a terceiros sozinho. É o consultor que o partilha.

## 6. Segurança e antifraude

- Código aleatório seguro, com pelo menos 128 bits no link. Pode haver também uma versão curta para escrever à mão, com limite de tentativas. Na base de dados só fica guardado o resumo (hash) do código.
- O código só pode ser usado uma vez, através de uma operação única na base de dados.
- Respostas iguais em todos os casos de erro. Há limite de tentativas por chat, número e endereço IP.
- O convite não serve para quem o deu, nem para outra conta da mesma pessoa. O trial é único por telefone, Telegram e email, e um convite novo nunca reinicia um trial já gasto.
- Sinais de alerta: muitos convidados sem uso, padrões de contas em série. Nesses casos, a quota do beta tester congela e fica em revisão manual.
- Respostas neutras: nunca dizer "este número já tem conta".

## 7. Fechar as portas alternativas

Todos os caminhos de entrada passam por uma única verificação de acesso no servidor:

- Web: registo e login, Google e "Sign in with Lovable".
- WhatsApp e Telegram: o Telegram deixa de criar conta com acesso sozinho.
- MCP e chat do painel.
- Convites Telegram antigos.
- Ligação de um segundo canal: herda o acesso da conta, só com prova de posse.
- Funções de servidor que criam perfis.

Sem acesso, o motor do Afonso não corre e só a resposta de early access é enviada.

## 8. Administração

- Emitir convites manuais, promover pessoas da lista de espera, revogar convites, ajustar ou congelar a quota de um beta tester.
- Ver o funil e a árvore de indicações. Cada ação fica registada.

## 9. Casos-limite

- Conta com os dois canais: um só convite e um só trial.
- Código enviado no canal B quando a conta foi criada no canal A: ativa a mesma conta, se o canal já estiver associado.
- Convite que expira enquanto está a ser usado: vale o momento em que é consumido.
- Conta que é revogada depois de usar o convite: o acesso mantém-se. Retirá-lo é uma decisão do admin.
- Beta tester que perde o acesso: os convites dele que ainda não foram usados são anulados.
- Alguém que pediu para apagar os dados: sai da lista de espera e os convites ligados a essa pessoa são anulados.
- Mensagens fora de horas ou ao domingo: a resposta de early access responde a uma mensagem do consultor, por isso é permitida.

## 10. Lançamento gradual e voltar atrás

- Interruptores, todos desligados até haver aprovação:
  - `access.early_access_gate.v1`: a verificação de acesso.
  - `access.referral_invites.v1`: os convites dados por beta testers, ativados por conta.
  - `access.waitlist.v1`: a lista de espera.
- Ordem: (1) migrar quem já tem acesso para os estados novos; (2) ligar a verificação para contas novas; (3) ligar os convites para 2–3 beta testers; (4) ligar para todos os beta testers.
- Voltar atrás: desligar a verificação. As contas em espera passam a comportar-se como hoje, com trial no primeiro contacto válido. Convites, lista de espera e indicações ficam guardados.

## 11. Métricas

- Funil: registo → canal ligado → "Olá" → convite validado → trial iniciado → primeiro resultado útil em menos de 2 minutos → uso no dia 7 e no dia 14 → subscrição → retenção ao dia 28.
- Indicações: convites gerados, usados e convertidos por beta tester, e o fator viral (convidados ativos por cada consultor ativo).
- Lista de espera: entradas, consentimentos dados e promoções a convite.
- São correlações, não causas: comparar ondas de entrada.

## 12. Privacidade

- O consentimento para a lista de espera é separado e explícito, com finalidade e prazo de guarda.
- O convite não leva dados pessoais.
- A origem do convite só é visível ao admin e, de forma agregada, ao próprio beta tester. O beta tester vê se o convite foi usado, mas não vê os dados do convidado.

## 13. Testes antes de ligar

1. Registo web, QR e "Olá" sem convite → estado `registered_waiting`, sem trial.
2. Telegram ou WhatsApp sem convite → resposta de early access e nenhum dado comercial gravado.
3. Código válido → trial começa nessa mensagem; o mesmo código usado uma segunda vez é recusado.
4. Duas pessoas a usar o mesmo código ao mesmo tempo → só uma ativação.
5. Quarto convite pedido por um beta tester → recusado; pedidos em paralelo também não passam de 3.
6. Código expirado, revogado ou inventado → a mesma resposta neutra.
7. MCP, chat do painel, Google ou ligação de um segundo canal sem acesso → bloqueado.
8. Contas antigas → acesso mantido.
9. Desligar os interruptores → volta o comportamento atual.

## 14. Decisões pendentes (checklist)

- [ ] Regra para repor a quota de convites.
- [ ] Subscritores pagos podem convidar?
- [ ] Revisão jurídica do texto de consentimento e do prazo de guarda.
- [ ] Destino dos convites Telegram antigos.
- [ ] Validar o texto final das mensagens.
- [ ] Autorizar o formulário de lista de espera na página pública meuafonso.com.

## Detalhes técnicos

- Planeado de forma aditiva:
  - `account_access` (estado e momentos de cada mudança).
  - `access_invites` (`token_hash`, `issuer_user_id`, `source`, `status`, `expires_at`, `used_by`, `used_channel`).
  - `invite_quotas`.
  - `waitlist_requests` (com consentimento).
  - Funções atómicas `consume_access_invite` e `issue_referral_invite`.
- A verificação de acesso entra no ponto único de mensagens recebidas, antes do motor.
- O início do trial usa o ponto definido no plano de billing.
