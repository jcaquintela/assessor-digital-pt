# Cartões de contacto partilhados (vCard) por WhatsApp e Telegram

## O que confirmei

**1. Formato do WhatsApp.** Uma mensagem do tipo `contacts` traz uma lista de cartões, cada um com nome completo (e nome próprio/apelido separados), lista de telefones (com o número tal como está no telemóvel de quem partilha), lista de emails, empresa/departamento/cargo, moradas, sites e data de nascimento. Ou seja: chega tudo o que precisamos — nome, telefone, empresa, email.

**2. Hoje é ignorado.** A tradução de mensagens do WhatsApp só conhece texto, imagem, documento, áudio, botões e reações; tudo o resto cai em "não suportado" e o Afonso responde a frase que o consultor viu. No Telegram é igual — o cartão de contacto está explicitamente marcado como não suportado.

**3. É extensão natural, não mecanismo novo.** Já existe o caminho completo "cartão de visita fotografado → propor contacto → confirmar → criar pessoa → devolver o cartão para guardar no telemóvel", com pergunta de confirmação, botões, deteção de duplicados por telefone/email e envio do cartão nativo (Telegram) ou ficheiro .vcf. O cartão partilhado é a mesma coisa sem a parte da fotografia: em vez de ler a imagem, lemos os campos que já vêm prontos. Reaproveita-se o mesmo fluxo de confirmação e a mesma criação de pessoa.

**4. Paridade de canal confirmada.** O Telegram também entrega cartões de contacto (nome próprio, apelido, número e, quando existe, o cartão completo em texto). Formato diferente, mesma informação essencial — dá para normalizar os dois para o mesmo formato interno.

**5. Ambiguidades.** Cartão sem telefone mas com email: aceita-se na mesma. Sem telefone nem email: só nome — o Afonso diz que não dá para guardar assim e pede o número. Vários números: guarda-se o primeiro como principal e os restantes ficam associados à pessoa (já existe sítio próprio para números adicionais). Vários cartões numa só partilha: trata-se um de cada vez, começando pelo primeiro, para não haver perguntas encavalitadas.

## O que proponho construir

1. **Reconhecer o tipo "contacto"** nos dois canais e traduzi-lo para um formato interno único com nome, telefones, emails, empresa e cargo.
2. **Reutilizar o fluxo já existente** de proposta e confirmação: "Encontrei Jorge Ferraz (McDonalds), 9xx xxx xxx. Registo nos contactos?" → botões Sim/Não → cria a pessoa.
3. **Verificar antes se a pessoa já existe** (por telefone/email e por nome), para responder "já tinha o Jorge Ferraz" em vez de duplicar.
4. **Ligar ao pedido anterior**: quando o consultor escreveu "Guarda o contacto" e logo a seguir partilhou o cartão, a confirmação é dispensada — o pedido já estava feito.
5. **Números extra** guardados como números secundários da pessoa.

## Testes antes de dar por feito

1. Cartão do WhatsApp (o caso real do Jorge Ferraz) → propõe e cria a pessoa com nome, telefone e empresa.
2. Cartão do Telegram → mesmo resultado, mesma resposta.
3. Contacto já existente → não duplica, avisa que já o tinha.
4. Cartão só com nome → pede o número em vez de falhar.
5. Cartão com vários números → principal guardado, restantes associados.
6. "Guarda o contacto" seguido do cartão → grava sem voltar a perguntar.

## Nota técnica

Alterações concentradas em `whatsapp-adapter.ts` / `telegram-adapter.ts` (`classifyType` + extração para um novo `NormalizedInbound.contactCard`), um ramo novo em `routeInbound` (`ingest.server.ts`) e um módulo `shared-contact.server.ts` que converte o cartão para a interface `BusinessCard` já existente, reutilizando `proposeBusinessCardContact` / `confirmBusinessCardContact` e `resolvePersonForWrite`. Sem tabelas novas: `people` + `person_phones`.
