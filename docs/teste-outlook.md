# Teste guiado — Outlook Calendar (Microsoft Graph)

Estado à partida (15/08/2026): 1 conta Outlook ligada — **Pedro Cunha (pedro.cunha@zome.pt)**, beta tester, tier pro, ligada a 06/08. Sincronização a correr sem erros (`calendar-poll` de 10 em 10 minutos).

Já exercitado em produção nessa conta: criação Afonso → Outlook (outbound) e alteração Outlook → Afonso (inbound), em 06/08 e 10/08.
**Nunca exercitado: cancelamento/remoção.** É o ponto crítico deste teste.

---

## Antes de começar

- Conta a usar: **de teste própria** (recomendado) ou a do Pedro Cunha com autorização dele.
- A sincronização automática corre a cada **10 minutos**. Em Definições existe "Sincronizar agora" para não esperar.
- Tem o Outlook aberto no browser (outlook.office.com) e o Afonso noutro separador.

## Passo 1 — Ligar
1. Definições → cartão **Microsoft Outlook** → **Ligar**.
2. Consentimento Microsoft (Calendars.ReadWrite + offline_access) → aceitar.
3. Popup fecha sozinho; o cartão passa a "Ligado" com hora da última sincronização.

✅ Esperado: sem aviso de "Voltar a ligar"; primeira sincronização acontece logo.
❌ Se ficar em "Voltar a ligar": erro de autorização — reportar a mensagem exata do cartão.

## Passo 2 — Criar no Afonso → confirmar no Outlook
1. No Afonso (WhatsApp/Telegram ou dashboard): *"Marca visita com o João amanhã às 15h"*.
2. Confirmar a proposta.
3. Definições → **Sincronizar agora**.
4. Abrir o Outlook no dia seguinte, 15:00.

✅ Esperado: evento com o título do compromisso, hora correta (Lisboa, não UTC).
⚠️ Verificar com atenção: **hora certa**. Um desvio de 1h significa problema de fuso.

## Passo 3 — Editar no Outlook → confirmar no Afonso
1. No Outlook, mudar a hora para 16:30 e o título para "Visita — remarcada".
2. Esperar até 10 min, ou **Sincronizar agora**.
3. Ver o compromisso no Afonso (Calendário ou Hoje).

✅ Esperado: hora e título atualizados **no mesmo compromisso** — não um segundo compromisso.
❌ Se aparecer duplicado: falha de mapeamento; guardar os dois cartões para diagnóstico.

## Passo 4 — Editar no Afonso → confirmar no Outlook
1. No Afonso: *"Passa a visita de amanhã para as 17h"*.
2. Sincronizar agora → ver Outlook.

✅ Esperado: o mesmo evento muda de hora. Sem duplicado.

## Passo 5 — Cancelar no Afonso → confirmar remoção no Outlook *(nunca testado)*
1. No Afonso: arquivar/cancelar o compromisso (cartão → Arquivar, ou *"Cancela a visita de amanhã"*).
2. Sincronizar agora → abrir o Outlook.

✅ Esperado: evento **desaparece do Outlook**; no Afonso o compromisso fica arquivado e não gera mais lembretes.
❌ Se ficar no Outlook: é o bug esperado desta ronda — anotar e reportar.

## Passo 6 — Cancelar no Outlook → confirmar remoção no Afonso *(nunca testado)*
1. Criar um evento novo no Afonso, sincronizar, confirmar que está no Outlook.
2. Apagar esse evento **no Outlook**.
3. Esperar 10 min ou Sincronizar agora.

✅ Esperado: no Afonso o compromisso sai da agenda e dos lembretes.
❌ Se continuar a aparecer (e pior, se disparar lembrete): reportar — é o pior cenário possível para a confiança do consultor.

## Passo 7 — Desligar
1. Definições → Microsoft Outlook → **Desligar**.

✅ Esperado: cartão volta a "Ligar"; eventos já existentes no Outlook **mantêm-se** (não apagamos o calendário de ninguém); o Afonso deixa de escrever lá.

---

## O que registar em cada passo
Passo | Funcionou? | Hora certa? | Duplicou? | Notas
---|---|---|---|---
1 Ligar | | — | — |
2 Criar → Outlook | | | |
3 Editar Outlook → Afonso | | | |
4 Editar Afonso → Outlook | | | |
5 Cancelar Afonso → Outlook | | — | — |
6 Cancelar Outlook → Afonso | | — | — |
7 Desligar | | — | — |
