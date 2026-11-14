# Plano consolidado: encerramento da V1.0, exportação self-service e aviso individual

Estado: só plano. Nada enviado, nenhum ZIP real, nada publicado, nenhum interruptor ligado. Piloto 3 continua NO-GO. Substitui a secção de entrega (D6) do plano de transição aprovado; o resto mantém-se.

## 1. O que muda face ao plano anterior
- A exportação passa a ser **self-service**: cada pessoa entra na sua área autenticada e gera/descarrega o seu ZIP. O proprietário já não envia ficheiros.
- A V2.0 **não herda documentos legados**: os documentos ficam só disponíveis para exportação até ao encerramento (decide D8 = "todos só no ZIP").
- Aviso individual por **email + WhatsApp**, com link para a área de exportação (nunca para o ZIP).

## 2. Calendário (proposto, sujeito a confirmação)
```text
E0  Exportador validado (contas internas + dry-run)       -> data E0
E0  Aviso 1 (email + WhatsApp): prazo E0+30 dias
E0+23 Lembrete (7 dias antes) só a quem ainda não exportou
E0+30 Encerramento V1: documentos e dados não migrados ficam
      inacessíveis na app (não apagados)
E0+30..E0+90 Janela de rollback/suporte; exportador disponível a pedido
E0+90+ Eliminação, só com aprovação específica e por lote
```
O prazo só começa quando o exportador estiver funcional e validado, nunca antes.

## 3. Exportação self-service
- Página autenticada "Os meus dados" (única página web nova; coerente com web mínima).
- Botão "Preparar exportação" -> o servidor gera o ZIP só com linhas `user_id = sessão` e ficheiros do caminho do próprio no armazenamento.
- Download por link assinado curto (15 min), emitido só a quem está autenticado; o ZIP nunca é público nem enviado por anexo.
- Limites: 1 exportação em preparação por conta, 3 por dia; ZIP apagado do espaço de exportações 7 dias depois.
- Conteúdo como no plano aprovado: documentos originais, CSV/JSON legíveis, conversas, manifesto (contagens, datas, sha256), `falhas.csv`, LEIA-ME. Nunca segredos, tokens, configurações internas ou dados de outras contas.
- Quem não consegue entrar (sem email/senha, só WhatsApp): o link do aviso é um link de entrada de uso único (o mecanismo "entrar" já existente), que abre a sessão e leva à página — não ao ZIP.

## 4. Avisos individuais
Email (principal):
- Enviado pelo sistema de email da app, a cada titular com email verificado.
- Conteúdo: o que muda, prazo, link para "Os meus dados", o que é mantido na V2.0, contacto de suporte, direitos RGPD.

WhatsApp (complementar):
- Só para quem tem WhatsApp ligado e consentimento registado para avisos de serviço.
- Fora da janela de 24 h só com template Meta aprovado (categoria UTILITY); criar e aguardar aprovação antes do E0.
- O texto não leva dados pessoais; só o link de entrada.

Registo e fallback:
- Cada envio registado no registo de entregas existente (aceite/enviado/entregue/lido/falhado), sem números nem conteúdo.
- "Aceite" não conta como entregue. Estado por titular: notificado-confirmado / só-aceite / falhou.
- Fallback: email falhou -> WhatsApp (se consentido) ; WhatsApp falhou ou sem consentimento -> email ; ambos falharam -> lista para contacto manual pelo proprietário e aviso visível na própria app/conversa na próxima utilização.
- Auditoria: quem lançou cada envio, quando, para quantos, resultados agregados.

## 5. RGPD, retenção e isolamento
- Direito de acesso/portabilidade cumprido pelo ZIP; pedido de apagamento continua possível (exporta primeiro se quiser).
- Retenção legal (faturação, auditoria, entregas, consentimentos) segue o plano aprovado; não entra no ZIP nem é apagado no encerramento.
- Testes obrigatórios: utilizador A nunca recebe linha/ficheiro de B; link assinado de A não serve a B; sem sessão -> recusa; ZIP sem colunas de segredo (teste sobre o inventário).
- Teste de isolamento de ficheiros num backend de testes isolado (pendente do proprietário) antes do E0.

## 6. Critérios
Para iniciar E0 (GO separado):
- Exportador testado com dados sintéticos e em 1 conta interna verificada manualmente.
- Template WhatsApp aprovado; email de aviso revisto pelo proprietário.
- Página "Os meus dados" publicada e testada fora de pré-visualização.

Para encerrar a V1 (E0+30):
- Cada titular com aviso confirmado ou fallback esgotado e registado.
- Lista de quem exportou / não exportou.
- Cópia de segurança confirmada.

Rollback:
- Antes de eliminar, encerrar = só esconder (interruptor por conta); desligar repõe acesso aos documentos.
- Prazo pode ser prolongado sem novo desenvolvimento; novo aviso só com aprovação.

## 7. Pontos de decisão do proprietário
- Confirmar 30 dias + lembrete a 7 dias, e a janela de 60 dias após o encerramento.
- Texto dos avisos (email e WhatsApp) e contacto de suporte.
- Base de consentimento para o WhatsApp de serviço (aviso contratual vs. consentimento explícito) — validar com jurista.
- Contas de teste/isolamento (76): excluídas dos avisos (proposta: sim).
- Confirmar D2 (histórico de conversa que a V2.0 mantém) e D1 (ZIP inclui cópia do que migra).

## Detalhes técnicos
- Rota autenticada `/_authenticated/os-meus-dados`; função servidor `prepareMyExport` (sessão -> `userId`, nunca parâmetro) e `getMyExportLink` (link assinado 15 min).
- Bucket privado `user-exports`, caminho `<user_id>/<export_id>.zip`, políticas só para o próprio e serviço.
- Tabelas aditivas `user_exports` (estado, contagens, sha256, falhas) e `shutdown_notices` (titular, canal, tentativa, estado ligado ao registo de entregas).
- Inventário `src/lib/export/inventory.ts` como única fonte do que entra no ZIP.
- Envio de avisos em lotes pequenos a partir da consola admin, com confirmação dupla; nada automático.
