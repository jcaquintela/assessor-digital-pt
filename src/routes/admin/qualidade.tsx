import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getQualityOverview } from "@/lib/assessor/v3/quality.functions";
import { getTrustOverview } from "@/lib/assessor/v3/quality.functions";

export const Route = createFileRoute("/admin/qualidade")({
  component: QualidadePage,
});

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-300">
        <span>{label}</span><span>{value}/{max} · {pct}%</span>
      </div>
      <div className="h-2 rounded bg-slate-100 dark:bg-slate-800">
        <div className="h-2 rounded bg-slate-900 dark:bg-slate-100" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QualidadePage() {
  const fetchFn = useServerFn(getQualityOverview);
  const fetchTrust = useServerFn(getTrustOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "qualidade"],
    queryFn: () => fetchFn(),
  });
  const trustQ = useQuery({ queryKey: ["admin", "trust"], queryFn: () => fetchTrust() });

  if (isLoading) return <div className="text-sm text-slate-500">A carregar…</div>;
  if (error || !data) return <div className="text-sm text-red-600">Erro a carregar AQS.</div>;

  const maxAvg = Math.max(...data.daily.map((d) => d.avg ?? 0), 0.01);
  const trust = trustQ.data;
  const maxAts = trust ? Math.max(...trust.daily.map((d: any) => d.ats ?? 0), 1) : 1;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Qualidade do Assessor</h1>
        <p className="text-sm text-slate-500">
          Trust Mode v1 — ATS + AQS, correções e Top 10 falhas dos últimos 14 dias.
        </p>
      </header>

      {trust && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold">Definição de Pronto</h2>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
            {[
              ["ATS ≥ 90", trust.readiness.ats_ok, trust.pillars.ats ?? "—"],
              ["AQS ≥ 0.90", trust.readiness.aqs_ok, trust.pillars.aqs ?? "—"],
              ["Task ≥ 95%", trust.readiness.task_success_ok, trust.pillars.task_success ?? "—"],
              ["Correções < 3%", trust.readiness.corrections_ok, trust.pillars.corrections_rate ?? "—"],
              ["Contexto > 98%", trust.readiness.context_ok, trust.pillars.context_preservation ?? "—"],
            ].map(([label, ok, val]) => (
              <div key={label as string} className={`rounded-lg border p-2 ${ok ? "border-green-300 bg-green-50 dark:bg-green-900/20" : "border-slate-200 dark:border-slate-800"}`}>
                <div className="text-xs text-slate-500">{label as string}</div>
                <div className="font-mono">{String(val)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {trust && trust.daily.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold">ATS diário</h2>
          <div className="flex h-40 items-end gap-1">
            {trust.daily.map((d: any) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-emerald-600 dark:bg-emerald-400"
                  style={{ height: `${((d.ats ?? 0) / maxAts) * 100}%` }}
                  title={`${d.day} — ATS ${d.ats ?? "—"} (${d.n} turnos)`}
                />
                <span className="text-[10px] text-slate-500">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {trust && trust.topFailures.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold">Top 10 motivos de falha</h2>
          <ol className="space-y-1 text-sm">
            {trust.topFailures.map((f: any, i: number) => (
              <li key={f.label} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
                <span>{i + 1}. {f.label}</span>
                <span className="font-mono text-slate-500">{f.count} · {f.pct}%</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {trust && trust.corrections.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold">Últimas correções do consultor</h2>
          <div className="space-y-2 text-sm">
            {trust.corrections.slice(0, 10).map((c: any) => (
              <div key={c.id} className="rounded border border-slate-100 p-2 dark:border-slate-800">
                <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString("pt-PT")} · {c.category}</div>
                <div className="mt-1"><span className="text-slate-500">Assessor:</span> {c.original_message ?? "—"}</div>
                <div><span className="text-slate-500">Correção:</span> {c.correction_message}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold">AQS diário</h2>
        {data.daily.length === 0 ? (
          <p className="text-sm text-slate-500">Ainda sem turnos registados.</p>
        ) : (
          <div className="flex h-40 items-end gap-1">
            {data.daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-slate-900 dark:bg-slate-100"
                  style={{ height: `${((d.avg ?? 0) / maxAvg) * 100}%` }}
                  title={`${d.day} — ${d.avg ?? "—"} (${d.n} turnos)`}
                />
                <span className="text-[10px] text-slate-500">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold">Sinais (últimos 14 dias · {data.total} turnos)</h2>
        <div className="grid gap-3">
          <Bar label="Compreendeu à primeira" value={data.dist.understood_first_try} max={data.total} />
          <Bar label="Foi reformulado" value={data.dist.reformulated} max={data.total} />
          <Bar label="Executou com sucesso" value={data.dist.executed_successfully} max={data.total} />
          <Bar label="Tom humano" value={data.dist.human_tone} max={data.total} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold">Últimos 20 turnos com AQS &lt; 0.75</h2>
        {data.low.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum turno abaixo do limiar. </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 text-left">Quando</th>
                  <th className="py-2 text-left">Canal</th>
                  <th className="py-2 text-left">Score</th>
                  <th className="py-2 text-left">C1</th>
                  <th className="py-2 text-left">Ref</th>
                  <th className="py-2 text-left">Exec</th>
                  <th className="py-2 text-left">Tom</th>
                  <th className="py-2 text-left">Trace</th>
                </tr>
              </thead>
              <tbody>
                {data.low.map((r: any) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2">{new Date(r.created_at).toLocaleString("pt-PT")}</td>
                    <td className="py-2">{r.channel}</td>
                    <td className="py-2 font-mono">{r.score ?? "—"}</td>
                    <td className="py-2">{r.understood_first_try ? "✓" : "—"}</td>
                    <td className="py-2">{r.reformulated ? "✓" : "—"}</td>
                    <td className="py-2">{r.executed_successfully ? "✓" : "—"}</td>
                    <td className="py-2">{r.human_tone ? "✓" : "—"}</td>
                    <td className="py-2 font-mono text-xs text-slate-500">{r.trace_id ? r.trace_id.slice(0, 8) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}