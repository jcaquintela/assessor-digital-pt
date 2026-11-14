# Plano: transição V1.0 -> V2.0 — o que migra, o que se exporta por titular, o que se retém

Estado: só plano. Nada executado, nenhum ZIP com dados reais, nenhum email, nenhuma eliminação. Piloto 3 continua NO-GO.

## 1. Facto estrutural que muda o desenho
V1.0 e V2.0 vivem hoje no **mesmo código e na mesma base de dados** (a V2.0 são interruptores por conta). Logo, "migrar" não é copiar para outro sistema: é **marcar o que a V2.0 continua a ler** e **retirar do alcance da V2.0** (arquivar, exportar, depois eliminar sob aprovação) o resto. Isto evita cópias, mantém rollback simples (desligar interruptores) e obriga a que nada seja apagado antes de exportação verificada.

Contagens aproximadas lidas agora (estimativas do motor da base, não exatas): 91 perfis, 2.803 mensagens, 749 seguimentos, 29 pessoas, 12 imóveis, 86 ficheiros registados, 100 objetos no armazenamento privado (~34 MB), 3,16 M linhas de auditoria.

## 2. Classificação (proposta)

### MIGRAR (a V2.0 continua a usar)
- Conta e identidade: `profiles` (campos de conta), `user_roles`, `pilot_participants`, `account_access`, `consultant_preferences`.
- Canais (identidade já verificada, sem religar): `channel_links`, `telegram_pairings`; ligação WhatsApp no perfil. **Decisão D3.**
- Contexto comercial: `people`, `person_phones`, `properties`, `property_interests`, `property_offers`, `opportunities`, `opportunity_properties`, `opportunity_events`, `deal_deadlines`, `follow_ups`, `reminders`, `routines`, `interactions`, `prospecting_leads`, `tags`/`entity_tags`.
- Contexto conversacional mínimo: `conversation_states` ativos, `pending_actions` em aberto, últimos N dias de `assessor_messages` (**Decisão D2**: proposta 90 dias).
- Pagamentos: só o estado no perfil (`billing_*`, `stripe_*`); nada se recria no Stripe. Trial: estado preservado tal como está.

### EXPORTAR ZIP (do titular, sai do alcance da V2.0)
- Documentos: `uploaded_files` + objetos do `assessor-files` do próprio, `file_links`, `folders`/`folder_items`, `file_categories`.
- Histórico conversacional anterior ao corte de D2; `miscellaneous_items`; `daily_digests` do próprio; `email_drafts`; `financial_movements`; `property_marketing_activities`; `property_categories`/`event_categories` personalizadas; `similar_listing_searches`; `product_feedback` do próprio; `content_access_consents` (o próprio registo de consentimentos).
- O ZIP também inclui uma cópia legível do que migra (direito de acesso/portabilidade completo). **Decisão D1.**

### RETER por obrigação legal / segurança (não vai no ZIP como dado do titular, não migra para uso funcional)
- Faturação: `subscription_events`, `stripe_webhook_events` (prazo fiscal; **Decisão D5**, proposta 10 anos para faturação).
- Auditoria e segurança: `admin_audit_logs`, `support_sessions`, `access_invite_attempts`, `invite_send_attempts`.
- Registos de entrega: `whatsapp_send_logs` (sem conteúdo; prazo curto, proposta 12 meses).
- Consentimentos e pedidos RGPD: prova mantida enquanto a conta existir + prazo de reclamação.

### EXCLUIR (nunca no ZIP, nunca exportado)
- Segredos e tokens: `email_connections`, `calendar_connections`, `app_user_connections(_aliases)` (tokens cifrados), `dashboard_login_tokens`, `telegram_link_tokens`, `whatsapp_link_codes`, `telegram_invites`, `access_invites` (hashes), `short_links` internos, `conversation_locks`, `inbound_message_claims`.
- Internos do produto: `assessor_ai_logs`, `assessor_reasoning_traces`, `assessor_tool_calls`, `assessor_quality_scores`, `assistant_*` (traces, shadow, golden, trust), `mentor_decisions`, `feature_flags*`, `app_settings`, `plan_configs`, `promo_codes`, `ai_model_rates`, `admin_*`, `pilots`, `product_telemetry_events`, `landing_page_visits`, `proactive_daily_ledger`, `assessor_nudges` (texto do aviso pode ir resumido: **D4**).
- Código-fonte, configurações, prompts, chaves: nunca.

## 3. Regra de dados de terceiros
Pessoas e imóveis do consultor são dados que **ele** recolheu como responsável/subcontratado: vão no ZIP dele. Excluem-se: dados de outras contas (mesmo a mesma pessoa noutra conta), notas marcadas confidenciais de outras contas, mensagens de grupo ou de outros consultores, dados de equipa/colegas fora da conta. Cada linha é incluída só se `user_id = titular` (ou ligada por chave a uma linha do titular), verificado duas vezes (consulta + validação no manifesto).

## 4. Estrutura do ZIP (legível por não técnicos)
```text
afonso-export-<data>-<id-curto>.zip
  LEIA-ME.pdf / LEIA-ME.txt   o que contém, o que não contém e porquê, contacto
  manifesto.json               versão, titular (id interno), data UTC, por ficheiro: contagem, sha256, tamanho
  manifesto.csv                o mesmo em tabela
  conta/perfil.json            dados de conta (sem segredos)
  contactos/pessoas.csv, telefones.csv
  imoveis/imoveis.csv, interesses.csv, propostas.csv
  negocios/oportunidades.csv, prazos.csv
  tarefas/seguimentos.csv, lembretes.csv, rotinas.csv
  conversas/<canal>/<ano-mes>.txt + conversas.json
  documentos/<pasta>/<nome original>    ficheiros originais
  documentos/indice.csv        nome, tipo, data, pasta, sha256
  falhas.csv                   o que não se conseguiu exportar e porquê
  hashes.sha256                verificação integral
```
CSV em UTF-8 com BOM, separador `;` (Excel PT), datas em hora de Lisboa + UTC no JSON.

## 5. Geração, acesso e entrega segura
- Gerado só por Super Admin, a pedido, um titular de cada vez, com motivo registado em auditoria; sem geração em massa automática.
- Função no servidor com cliente privilegiado **apenas depois** de verificar papel; leitura filtrada por titular; testes de que nunca aparece linha de outra conta.
- ZIP cifrado (AES-256) guardado num espaço privado de exportações; **não anexar ao email**. Email do proprietário leva só um link assinado de uso limitado (7 dias, 3 descargas) e a palavra-passe segue por outro canal (WhatsApp/Telegram do titular ou telefone). **Decisão D6.**
- Registo: gerado / descarregado / expirado / apagado, sem dados pessoais nos logs.
- Exportações apagadas automaticamente após 30 dias.

## 6. Ordem e rollback
```text
F0 Decisões D1-D7 do proprietário
F1 Gerador em desenvolvimento + testes com dados sintéticos (sem dados reais)
F2 Dry-run: só manifestos (contagens) por titular, sem ficheiros — aprovação
F3 Exportação real de 1 conta interna (Júlio) — verificação manual — aprovação
F4 Exportações dos restantes titulares — envio pelo proprietário
F5 V2.0 deixa de ler o que foi "exportado" (interruptor por conta; dados ficam intactos)
F6 Janela de rollback (proposta 60 dias): desligar interruptor repõe V1
F7 Eliminação dos dados não migrados: só com aprovação específica, por lote, com prova de export entregue
```
Dependências da base partilhada: qualquer alteração de esquema afeta a app publicada; tudo aditivo; nenhum `DROP`/`DELETE` antes de F7; cópia de segurança confirmada antes de F7.

## 7. Casos a tratar
Contas de teste/isolamento (76): não exportar, decisão separada de eliminação. Contas fundidas (`merged`): exportar pela conta de destino. Contas sem email: entrega pelo canal. Ficheiros registados sem objeto (ou vice-versa): listados em `falhas.csv`. Titular que pede apagamento: segue RGPD, export primeiro se quiser.

## 8. Pontos de decisão do proprietário
- D1 O ZIP inclui também cópia do que migra? (proposta: sim)
- D2 Quanto histórico de conversa a V2.0 mantém? (proposta: 90 dias + pendentes)
- D3 Canais ficam ligados sem religar? (proposta: sim, identidade já verificada)
- D4 Avisos enviados vão no ZIP como texto? (proposta: só os que o titular recebeu)
- D5 Prazos de retenção legal (faturação 10 anos, auditoria 2 anos, entregas 12 meses) — validar com jurista.
- D6 Entrega: link assinado + palavra-passe noutro canal, ou outro método?
- D7 Data de corte e janela de rollback (proposta 60 dias).
- D8 Documentos: a V2.0 deixa de os ter (só no ZIP) ou mantém os ligados a negócios ativos?

## Detalhes técnicos
- Novo módulo `src/lib/export/` (inventário declarativo tabela -> classe -> colunas permitidas; colunas de segredo nunca listadas = proibidas por omissão).
- Teste que falha se surgir tabela nova sem classificação.
- ZIP gerado em servidor com streaming (compatível com Worker); cifra AES-256; objetos lidos do armazenamento por caminho do titular.
- Bucket privado `user-exports` com políticas só para Super Admin; link assinado com expiração.
