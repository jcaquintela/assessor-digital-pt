import { createFileRoute } from "@tanstack/react-router";
import { Empty, PageTitle, SectionTitle } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/faturacao")({
  head: () => ({ meta: [{ title: "Faturação — Afonso admin" }] }),
  component: FaturacaoPage,
});

function FaturacaoPage() {
  return (
    <div>
      <PageTitle title="Faturação" sub="Ações sobre pagamentos — não métricas. Reserva o lugar até o Stripe estar ligado." />

      <Empty note="quando ligado: reembolsar, reenviar fatura, resolver pagamento falhado, ver histórico por conta">
        Stripe ainda não ligado — sem faturas, sem pagamentos a gerir.
      </Empty>

      <SectionTitle>Ações previstas</SectionTitle>
      <table>
        <thead><tr><th>Ação</th><th>Onde se aplica</th></tr></thead>
        <tbody>
          <tr><td>Reembolsar</td><td className="mini">por subscrição, parcial ou total</td></tr>
          <tr><td>Reenviar fatura</td><td className="mini">por email registado</td></tr>
          <tr><td>Resolver pagamento falhado</td><td className="mini">retry manual ou downgrade automático</td></tr>
        </tbody>
      </table>
    </div>
  );
}
