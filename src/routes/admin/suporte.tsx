import { createFileRoute } from "@tanstack/react-router";
import { PageTitle, SectionTitle, Empty, Source } from "@/components/admin/ui";
import { adminTitle } from "@/lib/brand";

export const Route = createFileRoute("/admin/suporte")({
  head: () => ({ meta: [{ title: adminTitle("Suporte") }] }),
  component: SuportePage,
});

function SuportePage() {
  return (
    <div>
      <PageTitle
        title="Suporte"
        sub="Ajudar um consultor sem abrir a conversa dele. O acesso a conteúdo é sempre pedido, nunca assumido."
      />

      <SectionTitle first>Pedidos em aberto</SectionTitle>
      <Empty note="quando existir um pedido, aparece aqui com o consentimento associado">
        Nenhum pedido de suporte em aberto.
      </Empty>

      <SectionTitle>Privacidade</SectionTitle>
      <div
        className="rounded-xl border p-4 text-sm leading-relaxed"
        style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink-soft)" }}
      >
        <p>
          Por defeito, administradores não podem ver conversas, ficheiros nem fichas de clientes de um consultor. O
          conteúdo pertence a quem o escreveu.
        </p>
        <p className="mt-3">
          Para investigar um problema concreto, o consultor tem de dar consentimento explícito e temporário. Todo o
          acesso concedido fica registado na Auditoria: quem entrou, quando, e porquê.
        </p>
        <Source>políticas RLS por utilizador em todas as tabelas de domínio</Source>
      </div>
    </div>
  );
}
