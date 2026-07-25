# Webhook WhatsApp (Meta Cloud API)

> Nota técnica: nesta stack (TanStack Start em Cloudflare Workers) os
> endpoints HTTP públicos vivem como rotas de servidor, não como Supabase
> Edge Functions. Esta rota cumpre exatamente o mesmo papel — URL público,
> sem autenticação, pronto para a Meta chamar.

## Endpoint

- **Nome da rota (equivalente ao "nome da function"):** `whatsapp-webhook`
- **Ficheiro:** `src/routes/api/public/whatsapp-webhook.ts`
- **URL pública (produção):**
  `https://assessor-digital-pt.lovable.app/api/public/whatsapp-webhook`
- **URL de preview (estável):**
  `https://project--bf908ebc-1146-4c4f-a804-92bbc45c4e1a-dev.lovable.app/api/public/whatsapp-webhook`

Configura este URL na Meta em *WhatsApp → Configuration → Webhook → Callback URL*.
O prefixo `/api/public/` faz bypass à autenticação do site, portanto a Meta
consegue aceder sem cabeçalhos extra.

## Secret

A rota lê `WHATSAPP_VERIFY_TOKEN` do ambiente. Configura-o em:

**Backend → Secrets** (Lovable Cloud) com o nome exato `WHATSAPP_VERIFY_TOKEN`.

O valor deve ser igual ao *Verify Token* que introduzires na consola da Meta.

## Testar a verificação (GET)

```bash
curl -i "https://assessor-digital-pt.lovable.app/api/public/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=12345"
```

- Token correto → `200 OK`, body `12345`, `content-type: text/plain`.
- Token incorreto ou `hub.mode` diferente de `subscribe` → `403 Forbidden`.

## Receção de eventos (POST)

A Meta envia POST com JSON. Nesta primeira versão a rota apenas:

1. Lê o corpo bruto e escreve-o em `console.log` (visível nos logs da app).
2. Devolve `200 OK` imediatamente para evitar retries.

## Limitações desta primeira versão

- Não valida a assinatura `X-Hub-Signature-256` (App Secret). Adicionar antes
  de processar mensagens reais.
- Não persiste mensagens em base de dados.
- Não invoca IA nem gera respostas.
- Não envia mensagens de volta para o WhatsApp.
- Sem rate-limit próprio além do da plataforma.

Próximo passo natural: validar assinatura HMAC com `WHATSAPP_APP_SECRET`,
persistir em `assessor_messages` com `channel = 'whatsapp'` e ligar ao
parser existente.