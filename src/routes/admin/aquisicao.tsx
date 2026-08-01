import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAfonsoAcquisition } from "@/lib/admin/afonso.functions";
import { Empty, Grid, MetricCard, PageTitle, SectionTitle, Source } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/aquisicao")({
  head: () => ({ meta: [{ title: "Aquisição — Afonso admin" }] }),
  component: AquisicaoPage,
});

function AquisicaoPage() {
  const fn = useServerFn(getAfonsoAcquisition);
  const { data, isPending } = useQuery({ queryKey: ["admin", "afonso", "acquisition"], queryFn: () => fn() });
  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const funnel = [
    { label: "1. Visitou a landing", value: data.landingVisits, source: "landing_page_visits · live" },
    { label: "2. Criou conta", value: data.baseAccounts, source: "profiles · live" },
    { label: "3. Ativou um canal", value: data.activatedChannel, source: "channel_links · live" },
    { label: "4. Viu proposta de plano", value: null as number | null, source: "por instrumentar" },
    { label: "5. Pagou", value: data.converted, source: "subscription_tier · live" },
  ];
  const top = funnel[0]!.value || 0;

  return (
    <div>
      <PageTitle
        title="Aquisição"
        sub="Do primeiro clique na landing page até ao primeiro pagamento."
      />

      <SectionTitle first>Funil</SectionTitle>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Passo</th><th>Pessoas</th><th>% do topo</th><th>Origem</th></tr></thead>
          <tbody>
            {funnel.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td className="mono">{s.value === null ? "—" : s.value}</td>
                <td className="mono mini">{s.value === null || !top ? "—" : `${Math.round((s.value / top) * 100)}%`}</td>
                <td className="mini" style={{ color: "var(--muted)" }}>{s.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mini mt-2" style={{ color: "var(--muted)" }}>
        As visitas chegam por um sinal anónimo da landing page (sem cookies, sem IP): só data, hora, caminho e domínio
        de origem. O passo "viu proposta de plano" fica a zero até a página de planos enviar esse sinal.
      </p>
      <Source>landing_page_visits × profiles × channel_links</Source>

      <SectionTitle>Números que já eram medidos</SectionTitle>
      <Grid cols={4}>
        <MetricCard label="Visitas à landing" value={data.landingVisits} sub="sinal anónimo da landing" source="landing_page_visits · live" />
        <MetricCard label="Início Telegram" value={data.telegramStarts} sub="contas Nível 0 criadas" source="channel_links · live" />
        <MetricCard
          label="Tentativas de acesso ao WhatsApp sem autorização"
          value={data.unauthorizedWhatsappAttempts}
          sub={`mensagens LIGAR- rejeitadas, vindas de ${data.unauthorizedWhatsappNumbers} número(s) distinto(s)`}
          source="assessor_messages · live"
        />
        <MetricCard label="Converteu" value={data.converted} sub="base → pago" source="subscription_tier · live" />
      </Grid>

      <SectionTitle>Tentativas de WhatsApp sem autorização</SectionTitle>
      {data.unauthorizedList.length === 0 ? (
        <Empty>Sem tentativas registadas.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Número (parcial)</th><th>Tentativas</th><th>Última tentativa</th></tr></thead>
            <tbody>
              {data.unauthorizedList.map((r) => (
                <tr key={r.masked}>
                  <td className="mono mini">{r.masked}</td>
                  <td className="mono">{r.count}</td>
                  <td className="mini whitespace-nowrap">
                    {r.lastAt ? new Date(r.lastAt).toLocaleString("pt-PT") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Source>assessor_messages (números mascarados, sem conteúdo)</Source>
      <p className="mini mt-3" style={{ color: "var(--muted)" }}>
        As tentativas rejeitadas não são pedidos de upgrade nem pessoas interessadas em pagar: é a contagem bruta de
        mensagens de números sem conta associada. O mesmo número pode ter tentado várias vezes.
      </p>
    </div>
  );
}
