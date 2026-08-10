import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/ui";
import { simulateBriefing, type SimulatedItem } from "@/lib/assessor/briefing-simulator";
import { runAllBriefingCases } from "@/lib/assessor/briefing-cases";

export const Route = createFileRoute("/admin/simulador-briefing")({
  head: () => ({
    meta: [
      { title: "Simulador do briefing · Afonso" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SimuladorPage,
});

const todayYmd = () => new Date().toISOString().slice(0, 10);

function SimuladorPage() {
  const [form, setForm] = useState({
    title: "Visita ao T3 das Antas",
    due_date: todayYmd(),
    due_time: "18:00",
    type: "visita",
    status: "pendente",
    outcome: "",
    archived: false,
    person: false,
    property: true,
    opportunity: false,
    from_calendar: true,
  });

  const item: SimulatedItem = useMemo(
    () => ({
      title: form.title,
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      type: form.type || null,
      status: form.status || null,
      outcome: form.outcome || null,
      archived_at: form.archived ? new Date().toISOString() : null,
      person_id: form.person ? "sim-person" : null,
      related_property_id: form.property ? "sim-property" : null,
      opportunity_id: form.opportunity ? "sim-opportunity" : null,
      from_calendar: form.from_calendar,
    }),
    [form],
  );

  const result = useMemo(() => simulateBriefing(item), [item]);

  const field = "w-full rounded-lg border border-[color:var(--line,#e5e7eb)] bg-transparent px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <PageTitle
        title="Simulador do briefing"
        sub="Testa título, data e ligações e vê se o compromisso entra ou sai do briefing. Nada é gravado — simulação pura."
      />

      <GoldenCases />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="admin-card rounded-xl border p-5">
          <h3 className="mb-4 text-sm font-medium">Compromisso hipotético</h3>
          <div className="space-y-3">
            <label className="block text-sm">
              Título
              <input
                className={field}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Data
                <input
                  type="date"
                  className={field}
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Hora (vazio = sem hora)
                <input
                  type="time"
                  className={field}
                  value={form.due_time}
                  onChange={(e) => setForm({ ...form, due_time: e.target.value })}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Tipo
                <input
                  className={field}
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  placeholder="visita, tarefa, chamada…"
                />
              </label>
              <label className="block text-sm">
                Estado
                <input
                  className={field}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  placeholder="pendente, concluído…"
                />
              </label>
            </div>
            <label className="block text-sm">
              Resultado registado
              <input
                className={field}
                value={form.outcome}
                onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                placeholder="vazio, concluido, cancelado, precisa_nova_acao…"
              />
            </label>

            <div className="space-y-2 pt-2 text-sm">
              {([
                ["from_calendar", "Veio de calendário externo (Google/Outlook)"],
                ["person", "Ligado a uma Pessoa"],
                ["property", "Ligado a um Imóvel"],
                ["opportunity", "Ligado a um Negócio"],
                ["archived", "Arquivado"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-card rounded-xl border p-5">
          <h3 className="mb-4 text-sm font-medium">Resultado</h3>
          <p
            className="mb-4 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              background: result.inAgenda ? "rgba(34,139,94,.10)" : "rgba(220,80,60,.10)",
              color: result.inAgenda ? "var(--sage, #1f7a55)" : "var(--coral, #b4432f)",
            }}
          >
            {result.inAgenda ? "Entra no briefing / agenda do dia" : "Fica fora do briefing"}
          </p>

          <ul className="space-y-2 text-sm">
            {result.steps.map((s) => (
              <li key={s.rule} className="flex gap-2">
                <span aria-hidden>{s.passed ? "✓" : "✗"}</span>
                <span>
                  <strong>{s.rule}</strong> — {s.detail}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Classificação</dt>
              <dd>{result.isEvent ? "Evento de agenda" : "Tarefa/seguimento"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Título de lazer</dt>
              <dd>{result.isLeisure ? "sim" : "não"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Gera check-in “Como correu?”</dt>
              <dd>{result.generatesCheckIn ? "sim" : "não"}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs opacity-70">
            Simulação em memória: não lê nem escreve registos reais.
          </p>
        </section>
      </div>
    </div>
  );
}

function GoldenCases() {
  const outcomes = useMemo(() => runAllBriefingCases(), []);
  const failed = outcomes.filter((o) => !o.passed);

  return (
    <section className="admin-card rounded-xl border p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Verificações automáticas ({outcomes.length} casos)</h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: failed.length ? "rgba(220,80,60,.10)" : "rgba(34,139,94,.10)",
            color: failed.length ? "var(--coral, #b4432f)" : "var(--sage, #1f7a55)",
          }}
        >
          {failed.length ? `${failed.length} a falhar` : "Todas a passar"}
        </span>
      </div>
      <p className="mb-3 text-xs opacity-70">
        Os mesmos casos correm num comando: <code>bun run test:briefing</code>. Para cobrir uma regra
        nova, acrescenta um caso à lista de casos golden do briefing.
      </p>
      <ul className="space-y-2 text-sm">
        {outcomes.map((o) => (
          <li key={o.case.name} className="flex gap-2">
            <span aria-hidden>{o.passed ? "✓" : "✗"}</span>
            <span>
              <strong>{o.case.name}</strong> — {o.case.rule}
              {!o.passed && <span className="block text-xs opacity-80">{o.failures.join(" | ")}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
