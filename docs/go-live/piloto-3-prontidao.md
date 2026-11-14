# Piloto fechado AFONSO AI 2.0 — prontidão (3 participantes)

Estado: **NO-GO** até aprovação separada do proprietário. Desenvolvimento apenas.

Participantes: Júlio Quintela, Iolanda Ventura, Pedro Cunha (lugares já ativos em `pilot_participants`).
Telmo: excluído do piloto; beta, plano, WhatsApp, dados e faturação intactos.
Convites: não necessários para os 3; teto de 2 futuros preservado (`issue_pilot_invite`). Nenhum emitido.

## Verificação reproduzível (local, sem efeitos externos)
`bun run test:pilot` — piloto/RBAC, early access, billing, teto global, lock, cross-link,
cross-channel, cenários A/B/C, avaliação de autonomia, Zome/orçamento, entregas, reserva atómica.

## Checklist GO
- [ ] Commit publicado = commit testado (histórico Publish do Lovable).
- [ ] Backend de testes isolado configurado (`TEST_SUPABASE_*` + opt-in) e `bun run test:isolation` verde lá.
- [ ] Decisão sobre pagamentos em modo de teste a darem plano real (ver riscos).
- [ ] Flags por conta só para os 3: `pilot.v2_entitlement.v1`, `assessor.cross_channel.v1`,
      `assessor.global_unsolicited_cap.v1`, `assessor.action_first_qualification.v1`, `assessor.opportunity_nudges.v1`.
- [ ] Teste real controlado num canal por participante (1 mensagem, lida no log de entregas).
- [ ] Plano de rollback: desligar as flags acima (sem migração de dados).
- [ ] Causa das falhas de entrega WhatsApp visível no log após publicação.

## Riscos restantes
1. CORRIGIDO EM DESENVOLVIMENTO (não publicado) — pagamentos de teste já não alteram planos de contas reais; checkout novo desligado por interruptor; Team/Hub só sob consulta.
2. CORRIGIDO EM DESENVOLVIMENTO — evento mais antigo que o último aplicado é ignorado; empate relê a subscrição.
3. MÉDIO — dependências transitivas com avisos (mcp-js, ferramentas de build); `zod` atualizado.
4. MÉDIO — isolamento de armazenamento entre contas não provado contra backend real.
5. BAIXO — tabela de reservas de mensagens cresce sem limpeza automática.

## Antes de publicar (compatibilidade V1)
- [ ] Suite completa verde com todos os interruptores desligados.
- [ ] Na pré-visualização, conta interna: mensagem simples, lembrete, briefing, página de subscrição (sem botões de subscrever).
- [ ] Rollback: desligar interruptores por conta; se o código falhar, repor a versão anterior no histórico Publish. Nada é apagado.
