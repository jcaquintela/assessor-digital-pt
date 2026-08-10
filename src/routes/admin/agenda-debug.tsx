import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHojeOverview } from "@/lib/assessor/supreme/overview.functions";
import { buildAgendaView, isOver, type DayEvent } from "@/lib/agenda/day-events";
import { eventWindow, DEFAULT_EVENT_MINUTES } from "@/lib/assessor/supreme/event-window";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";
import { useNow } from "@/hooks/use-now";
import { PageTitle } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/agenda-debug")({
  component: AgendaDebugPage,
});

const TZ = "Europe/Lisbon";

function lisbonTime(d: Date | string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(d));
}

function Row({ ev, now }: { ev: DayEvent; now: Date }) {
  const { startIso, endIso } = eventWindow(
    { due_date: ev.date, due_time: ev.time },
    ev.minutes ?? DEFAULT_EVENT_MINUTES,
  );
  const over = isOver(ev, now);
  return (
    <tr className="border-t border-border/60">
      <td className="py-2 pr-3 font-medium">{ev.title}</td>
      <td className="py-2 pr-3 tabular-nums">{ev.date}</td>
      <td className="py-2 pr-3 tabular-nums">
        {ev.time ? `${lisbonTime(startIso)} – ${lisbonTime(endIso)}` : "dia inteiro"}
      </td>
      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{ev.minutes ?? DEFAULT_EVENT_MINUTES} min</td>
      <td className="py-2 pr-3">{over ? "terminado" : "por vir/a decorrer"}</td>
      <td className="py-2 font-mono text-[11px] text-muted-foreground">{ev.id}</td>
    </tr>
  );
}

function AgendaDebugPage() {
  const fetchOverview = useServerFn(getHojeOverview);
  const now = useNow();
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "agenda-debug"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
  });

  const items = (data?.summary.agenda.items ?? []) as DayEvent[];
  const view = buildAgendaView(items, now);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Debug da agenda (seletor central)"
        sub="O que o seletor central calcula agora, para a tua conta, no fuso Europe/Lisbon."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">Agora</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{lisbonTime(now)}</div>
          <div className="text-xs text-muted-foreground">
            {lisbonYmd(now)} · {TZ} · UTC {now.toISOString()}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">nextEvent</div>
          <div className="mt-1 text-lg font-semibold">
            {view.next ? `${view.next.time ?? "sem hora"} — ${view.next.title}` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">{view.cardMeta}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">Contagens</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {view.upcoming.length} por vir / {view.todayCount} hoje
          </div>
          <div className="text-xs text-muted-foreground">
            amanhã: {view.tomorrow ? `${view.tomorrow.time ?? "sem hora"} — ${view.tomorrow.title}` : "—"}
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
      {error && <p className="text-sm text-destructive">Falhou a leitura da agenda.</p>}

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">upcomingEvents(now) — {view.upcoming.length}</h2>
        {view.upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{view.emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">Título</th>
                  <th className="pb-2 pr-3">Dia</th>
                  <th className="pb-2 pr-3">Intervalo (Lisboa)</th>
                  <th className="pb-2 pr-3">Duração</th>
                  <th className="pb-2 pr-3">Estado</th>
                  <th className="pb-2">id</th>
                </tr>
              </thead>
              <tbody>
                {view.upcoming.map((ev) => <Row key={ev.id} ev={ev} now={now} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Todos os compromissos lidos (hoje + amanhã) — {items.length}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2 pr-3">Título</th>
                <th className="pb-2 pr-3">Dia</th>
                <th className="pb-2 pr-3">Intervalo (Lisboa)</th>
                <th className="pb-2 pr-3">Duração</th>
                <th className="pb-2 pr-3">Estado</th>
                <th className="pb-2">id</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ev) => <Row key={ev.id} ev={ev} now={now} />)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Dados lidos às {lisbonTime(dataUpdatedAt ? new Date(dataUpdatedAt) : null)} (atualiza a cada minuto);
          o relógio do seletor reavalia a cada 5 minutos e em cada foco da página.
        </p>
      </section>
    </div>
  );
}
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/agenda-debug')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/agenda-debug"!</div>
}
