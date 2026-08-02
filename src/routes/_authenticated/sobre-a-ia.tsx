import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { AI_DISCLOSURE } from "@/lib/assessor/ai-disclosure";
import { Brain, Shield, Lock, Eye, Trash2, MessageSquare, FileText, Mic } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sobre-a-ia")({
  head: () => ({
    meta: [
      { title: "Sobre a IA — Afonso" },
      { name: "description", content: "Como o Afonso usa inteligência artificial e trata os teus dados." },
      { property: "og:title", content: "Sobre a IA — Afonso" },
      { property: "og:description", content: "Como o Afonso usa inteligência artificial e trata os teus dados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SobreAPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="c-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-[var(--brass-dark)]" />
        <h2 className="c-section-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SobreAPage() {
  return (
    <AppShell>
      <PageHeader
        title="Sobre a IA"
        subtitle="Transparência sobre como o Afonso funciona e trata os teus dados."
      />

      <div className="flex flex-col gap-4">
        {/* Disclosure destacado */}
        <div
          className="rounded-[13px] border px-5 py-4"
          style={{
            borderColor: "var(--brass)",
            background: "rgba(184,134,59,.08)",
          }}
        >
          <p className="text-[15px] font-medium leading-relaxed" style={{ color: "var(--ink)" }}>
            {AI_DISCLOSURE}
          </p>
          <p className="c-muted mt-2 text-sm leading-relaxed">
            Esta é a frase de abertura que recebes na primeira mensagem, em qualquer canal — WhatsApp,
            Telegram ou dashboard. O objetivo é deixar claro, desde o início, que estás a falar com um
            sistema automático, não com uma pessoa.
          </p>
        </div>

        <Section icon={Brain} title="O que faço">
          <p className="c-muted text-sm leading-relaxed">
            Sou um assistente pessoal para consultores imobiliários. Ajudo-te a organizar o dia,
            lembrar seguimentos, registar pessoas, imóveis, negócios e documentos, e a pensar a
            próxima ação. Não sou um CRM — trabalho por conversa, como um assessor humano ao teu
            lado.
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
            <li className="flex items-start gap-2">
              <span className="text-[var(--brass-dark)]">•</span>
              <span>Interpreto o que me escreves em português de Portugal.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--brass-dark)]">•</span>
              <span>Consulto a tua base de dados para dar respostas contextualizadas.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--brass-dark)]">•</span>
              <span>Proponho rascunhos de ações; só executo depois da tua confirmação.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--brass-dark)]">•</span>
              <span>Aprendo com as tuas correções para melhorar as respostas seguintes.</span>
            </li>
          </ul>
        </Section>

        <Section icon={Shield} title="Como trato os dados desta interação">
          <p className="c-muted text-sm leading-relaxed">
            Os dados que me envias — mensagens, contactos, imóveis, ficheiros — são processados para
            te prestar o serviço. Nunca uso esses dados para treinar modelos de IA de terceiros, nem
            os vendo ou partilho fora do que é estritamente necessário para o Afonso funcionar.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 flex items-center gap-2">
                <Lock className="h-4 w-4 text-[var(--brass-dark)]" />
                <span className="text-sm font-medium">Acesso protegido</span>
              </div>
              <p className="c-muted text-xs leading-relaxed">
                Cada consultor só vê os seus próprios dados. A equipa de suporte só acede ao conteúdo
                real das tuas conversas com a tua autorização explícita e temporária.
              </p>
            </div>
            <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 flex items-center gap-2">
                <Eye className="h-4 w-4 text-[var(--brass-dark)]" />
                <span className="text-sm font-medium">Transparência</span>
              </div>
              <p className="c-muted text-xs leading-relaxed">
                Podes consultar, alterar ou apagar os teus dados a qualquer momento. Os rascunhos e
                registos só existem porque tu os confirmaste.
              </p>
            </div>
            <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-[var(--brass-dark)]" />
                <span className="text-sm font-medium">Retenção limitada</span>
              </div>
              <p className="c-muted text-xs leading-relaxed">
                Aplica-se o plano Base: conversas mantidas durante 21 dias e documentos até 100 MB
                por 7 dias, salvo subires de plano. Depois do downgrade, a conta entra em modo de
                arquivo durante 90 dias.
              </p>
            </div>
            <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[var(--brass-dark)]" />
                <span className="text-sm font-medium">Provedores de IA</span>
              </div>
              <p className="c-muted text-xs leading-relaxed">
                Uso modelos de IA através do Lovable AI Gateway. Os pedidos são enviados de forma
                segura e não incluem identificadores desnecessários.
              </p>
            </div>
          </div>
        </Section>

        <p className="c-muted text-xs leading-relaxed">
          Se quiseres saber mais sobre os teus direitos ou pedir esclarecimentos, contacta a equipa
          pelo menu de Suporte. Podes também rever as tuas escolhas de privacidade em
          Definições &gt; Privacidade das conversas.
        </p>
      </div>
    </AppShell>
  );
}
