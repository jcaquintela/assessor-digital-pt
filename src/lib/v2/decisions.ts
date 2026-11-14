// AFONSO 2.0 — rastreio das 50 decisões fechadas (14/11/2026).
// Estado honesto de cada decisão neste projeto. "dev" = implementado nesta
// base em desenvolvimento, sempre atrás de interruptor desligado ou ainda não
// ligado ao fluxo real. Nada aqui significa lançado.

export type DecisionStatus =
  | "existe" // já existia (V1/V2), possivelmente atrás de interruptor desligado
  | "parcial" // existe em parte; falta o resto descrito na nota
  | "dev" // implementado nesta sessão em desenvolvimento, desligado
  | "plano" // só planeado / decisão de produto pendente
  | "bloqueado" // depende de algo fora do código (credencial, jurídico, ambiente)
  | "conflito_v1"; // a V1 faz diferente; a V2 não altera a V1

export interface Decision {
  id: number;
  title: string;
  status: DecisionStatus;
  note: string;
  /** Ficheiros com a implementação (verificados pelo teste quando status = dev). */
  where?: string[];
}

export const AFONSO_V2_DECISIONS: readonly Decision[] = [
  { id: 1, title: "Plano único 29 €/mês, respeitar tempo pago e aviso", status: "parcial", note: "Regras puras (preço, data da mudança). Produto/preço de pagamento por criar — requer autorização.", where: ["src/lib/v2/subscription-lifecycle.ts"] },
  { id: 2, title: "Registo público, acesso inicial por convite", status: "existe", note: "Acesso antecipado + convites (interruptores desligados)." },
  { id: 3, title: "Memória comercial cross-channel, factos vs hipóteses", status: "parcial", note: "Conversa partilhada (desligada); confirmado/assumido só na qualificação." },
  { id: 4, title: "Tarefas internas autónomas; externas só com aprovação de conteúdo/destinatário/canal", status: "parcial", note: "Tarefas internas e emails com confirmação; vínculo formal conteúdo+destinatário+canal por generalizar." },
  { id: 5, title: "Máx. 1 intervenção não solicitada/dia, agrupada e pausável", status: "existe", note: "Teto global (desligado) e pausa de avisos nas preferências." },
  { id: 6, title: "V1 EOL em data fixa", status: "plano", note: "Plano de encerramento existe; data por definir." },
  { id: 7, title: "Isolamento de contas, acesso admin excecional auditado", status: "parcial", note: "RLS 105/105 tabelas e sem políticas abertas (auditoria de catálogo); suporte com consentimento auditado; E2E por fazer." },
  { id: 8, title: "Tolerância 7 dias, cancelamento no fim do período, exportação 30 dias, reativação, trial restringe", status: "dev", note: "Regras puras testadas; ainda não ligadas ao acesso real.", where: ["src/lib/v2/subscription-lifecycle.ts"] },
  { id: 9, title: "Sequência Júlio → piloto → convites → público", status: "dev", note: "Gates em cadeia; todos NO-GO.", where: ["src/lib/v2/gates.ts"] },
  { id: 10, title: "Suporte IA + escalamento humano", status: "parcial", note: "Modo suporte com consentimento; contacto humano por definir." },
  { id: 11, title: "North star: ações comerciais úteis confirmadas", status: "parcial", note: "Métricas decidido/preparado/executado (só leitura)." },
  { id: 12, title: "Piloto 14 dias, checkpoints 1/7/14", status: "dev", note: "Critérios no gate G2; documento por rever.", where: ["src/lib/v2/gates.ts"] },
  { id: 13, title: "Onboarding conversacional sem questionários", status: "existe", note: "Arranque leve e perfil por gotas." },
  { id: 14, title: "Voz de diretor comercial digital", status: "plano", note: "Prompts só mudam com 100 avaliações verdes." },
  { id: 15, title: "Inteligência de mercado com fontes verificáveis", status: "existe", note: "Portais + site público Zome (desligado)." },
  { id: 16, title: "Contexto de clientes/imóveis/oportunidades, NÃO CRM próprio", status: "dev", note: "Portal V2 sem áreas comerciais (desligado); memória fica na conversa.", where: ["src/lib/v2/portal-scope.ts"] },
  { id: 17, title: "Matching comprador/imóvel", status: "existe", note: "Oportunidades e match estrito (desligados)." },
  { id: 18, title: "Prioridades e pipeline contextual", status: "existe", note: "Briefing P1/P2/P3 e próxima melhor ação." },
  { id: 19, title: "Negociação e redação; envio só após aprovação", status: "parcial", note: "Sparring, risco de negócio, emails com confirmação." },
  { id: 20, title: "Inteligência documental com incerteza legal", status: "parcial", note: "Leitura de documentos; CMI bloqueado por jurídico." },
  { id: 21, title: "Integrações progressivas; CRM externo com consentimento", status: "dev", note: "Calendário/email existem; porta para CRM externo sem conectores.", where: ["src/lib/integrations/crm/port.ts"] },
  { id: 22, title: "Notas de voz bidirecionais", status: "parcial", note: "Entrada por voz existe; resposta em voz não existe." },
  { id: 23, title: "Leitura de imagens/vídeos sem edição", status: "parcial", note: "Imagens e documentos; vídeo não verificado." },
  { id: 24, title: "Diagnóstico de performance sob pedido", status: "parcial", note: "Mentor por níveis." },
  { id: 25, title: "Aprendizagem por feedback sem alterar salvaguardas", status: "parcial", note: "Correções e feedback guardados; salvaguardas fixas em código." },
  { id: 26, title: "Conhecimento especializado PT com fontes oficiais", status: "parcial", note: "Tabelas IMT/Selo datadas." },
  { id: 27, title: "Especialização por marca, docs isolados", status: "plano", note: "Não iniciado." },
  { id: 28, title: "Só plano individual; equipas no futuro", status: "existe", note: "Contas individuais." },
  { id: 29, title: "Sem quotas comerciais por funcionalidade", status: "conflito_v1", note: "V1 tem quota de Drive e módulos por plano; a V2 não usa quotas (regra pura), V1 inalterada.", where: ["src/lib/v2/subscription-lifecycle.ts"] },
  { id: 30, title: "Orquestração multimodelo com fallback", status: "existe", note: "Motor v3 → v2 → legado." },
  { id: 31, title: "Independência tecnológica, teste fora da Lovable", status: "bloqueado", note: "Teste de arranque externo por executar." },
  { id: 32, title: "RTO ≤ 4h, RPO ≤ 1h, backups independentes", status: "bloqueado", note: "Não validado; não prometer." },
  { id: 33, title: "Cockpit operacional admin", status: "dev", note: "Consola existente + página de decisões e gates.", where: ["src/routes/admin/v2.tsx"] },
  { id: 34, title: "Atualizações controladas, rollout e rollback", status: "parcial", note: "Interruptores por conta e entitlement de piloto." },
  { id: 35, title: "Fiabilidade IA por risco", status: "parcial", note: "Recibos de escrita e guarda de links." },
  { id: 36, title: "Defesa contra prompt injection", status: "existe", note: "Escudo de prompt e goldens; red team formal por fazer." },
  { id: 37, title: "Inspeção/correção/exportação/eliminação de dados", status: "dev", note: "Exportação ZIP self-service (desligada); eliminação por pedido ainda manual.", where: ["src/lib/v2/export/bundle.ts", "src/lib/v2/export/export.functions.ts", "src/routes/_authenticated/privacidade.tsx"] },
  { id: 38, title: "Super Admin com RBAC e auditoria", status: "existe", note: "Papéis separados e auditoria admin." },
  { id: 39, title: "Portal web mínimo", status: "dev", note: "Conta, subscrição, canais, integrações, privacidade (desligado).", where: ["src/lib/v2/portal-scope.ts", "src/routes/_authenticated/conta.tsx"] },
  { id: 40, title: "Personalização conversacional editável", status: "parcial", note: "Preferências por conversa." },
  { id: 41, title: "Diretor executivo comercial sem ação externa sem aprovação", status: "parcial", note: "Próxima melhor ação e execução assistida." },
  { id: 42, title: "Motor de oportunidades", status: "existe", note: "Desligado globalmente desde a ação preventiva." },
  { id: 43, title: "Planeamento comercial com metas aprovadas", status: "plano", note: "Não iniciado." },
  { id: 44, title: "Demonstração de valor sem causalidade inventada", status: "plano", note: "Métricas só para admin." },
  { id: 45, title: "Retenção por valor, reativação respeitando pausas", status: "plano", note: "Não iniciado." },
  { id: 46, title: "Posicionamento: copiloto de produtividade imobiliária", status: "dev", note: "Usado no portal V2.", where: ["src/lib/v2/portal-scope.ts"] },
  { id: 47, title: "Trial 14 dias na 1.ª ação comercial útil", status: "parcial", note: "Hoje começa na 1.ª mensagem comercial válida; regra V2 pura pronta.", where: ["src/lib/v2/subscription-lifecycle.ts"] },
  { id: 48, title: "Referências: 29 € de crédito, sem dinheiro, antifraude", status: "dev", note: "Regra pura; sem tabela nem crédito real.", where: ["src/lib/v2/referrals.ts"] },
  { id: 49, title: "Portugal primeiro, internacionalizável", status: "plano", note: "Textos só PT-PT; sem camada de traduções." },
  { id: 50, title: "Quatro gates GO/NO-GO com autorização expressa", status: "dev", note: "Todos NO-GO; nenhum autorizado.", where: ["src/lib/v2/gates.ts"] },
];
