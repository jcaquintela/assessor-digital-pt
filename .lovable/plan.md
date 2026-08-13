# Email diário (beta) não está a sair

## O que se passa

O envio de hoje (13/ago) chegou a ser tentado e falhou com esta resposta do serviço de email: o domínio meuafonso.com não está verificado.

Ou seja: o resumo foi gerado, aprovado e entregue ao serviço de email — o serviço é que recusou porque o domínio deixou de estar verificado na conta ligada ao projeto. Nada no código do resumo está partido; os envios de 6 e 7 de agosto saíram por esta mesma via.

Encontrei ainda um segundo problema, independente deste: o resumo de **10/ago** ficou aprovado e nunca saiu. A verificação automática corre de hora a hora mas só trata do dia corrente às 19h — se a aprovação chegar depois dessa hora, o email nunca é enviado.

## Passo que depende de ti (desbloqueia o envio)

Verificar o domínio meuafonso.com na conta de email ligada ao projeto (secção de domínios do serviço, adicionando os registos DNS que ele indicar). Isto não consigo fazer por ti. Enquanto não estiver verificado, qualquer envio continua a ser recusado.

Depois de verificado, valido com um envio de teste e reenvio o resumo de hoje.

## O que vou fazer no produto

1. **Aprovação tardia passa a enviar**
   Se aprovares o resumo depois das 19h, ele sai na verificação seguinte (de hora a hora), desde que a aprovação tenha menos de 24 horas. Resumos aprovados há mais tempo continuam a não sair sozinhos — só pelo botão de envio manual.

2. **A falha fica visível em vez de silenciosa**
   Em Comunicação, um resumo que falhou passa a mostrar o motivo em português simples ("o domínio de envio não está verificado", "sem beta testers ativos", etc.), com o botão de tentar novamente ao lado. Hoje o motivo só existe gravado na base de dados.

3. **Aviso preventivo no painel**
   Antes de aprovares, se o serviço de email não estiver operacional aparece um aviso no cartão do resumo — para não aprovares algo que vai falhar em silêncio às 19h.

## Detalhes técnicos

- `src/lib/admin/digest.server.ts`: `sendDigestForDate` passa a poder ser chamado para o último dia com resumo aprovado e não enviado (janela de 24h), não apenas para a data corrente; o cron `daily-digest` (de hora a hora) chama esse caminho fora da hora das 19h.
- Os motivos de falha guardados em `daily_digests.note` passam por um mapa de mensagens legíveis (padrão igual ao já usado em `misc-reason.ts`), consumido por `src/components/admin/daily-digest.tsx`.
- Verificação de saúde do envio: chamada leve ao serviço de email a partir do servidor, exposta ao cartão de resumo em `/admin/comunicacao`.
- Sem alterações de esquema na base de dados e sem novo agendamento — o cron existente já corre de hora a hora.