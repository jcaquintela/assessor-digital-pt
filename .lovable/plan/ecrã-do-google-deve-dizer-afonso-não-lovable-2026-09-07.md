# Ecrã do Google deve dizer "Afonso", não "Lovable"

## O que se passa

Quando alguém entra com a conta Google, o ecrã de consentimento do Google mostra
o nome e o domínio de quem é dono das credenciais usadas. Neste momento a app usa
as credenciais geridas pela plataforma, por isso aparece o nome dela — não o Afonso.

Esse texto é controlado pelo Google, não pelo nosso código. Não há alteração de
código que o mude: é preciso passar a usar credenciais Google próprias, criadas
na conta Google da Saguii/Afonso.

## O que fazer

1. **Criar o projeto e o ecrã de consentimento no Google Cloud** (conta Google do
   Afonso/Saguii):
   - Nome da aplicação: `Afonso`
   - Email de apoio e logótipo do Afonso
   - Domínios autorizados: `meuafonso.com` e `lovable.app`
   - Âmbitos: `userinfo.email`, `userinfo.profile`, `openid`

2. **Criar as credenciais OAuth** (tipo "Aplicação Web") e colar como URL de
   redirecionamento autorizado o endereço de callback indicado nas Definições de
   Autenticação do backend (secção Google).

3. **Colar o Client ID e o Client Secret** nessas mesmas Definições de
   Autenticação → Métodos de início de sessão → Google. A partir daí o ecrã do
   Google passa a dizer "Afonso quer aceder à tua conta Google".

4. **Publicar o ecrã de consentimento** no Google (passar de "Em teste" para
   "Em produção"), senão só contas de teste conseguem entrar. Se forem pedidos
   apenas os âmbitos básicos acima, não é necessária revisão do Google.

5. **Verificar** com uma conta nova e uma conta já existente, em
   `app.meuafonso.com` e no ambiente de pré-visualização: o nome apresentado deve
   ser "Afonso" e o início de sessão deve continuar a funcionar nos dois casos.

## Notas técnicas

- O código de início de sessão (`src/routes/auth.tsx`, `lovable.auth.signInWithOAuth`)
  não muda — continua igual com credenciais próprias.
- O `redirect_uri` continua a ser a própria app; nada a alterar aí.
- Durante a troca de credenciais há uma janela curta em que sessões novas podem
  falhar se o URL de callback ainda não estiver na lista do Google — por isso o
  passo 2 tem de estar feito antes do passo 3.
- Sem acesso à conta Google da Saguii eu não consigo executar os passos 1, 2 e 4;
  posso acompanhar a configuração e validar o resultado depois.

## O que eu preciso de ti

Confirmação de que tens (ou consegues criar) um projeto no Google Cloud na conta
da Saguii. Depois disso, indico-te o URL de callback exato a colar.
