import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listGoldens, runGoldenSuite, getShadowOverview } from "@/lib/assessor/v3/golden.functions";

export const Route = createFileRoute("/admin/goldens")({
  component: GoldensPage,
});

function GoldensPage() {
  const list = useServerFn(listGoldens);
  const run = useServerFn(runGoldenSuite);
  const shadow = useServerFn(getShadowOverview);
  const qc = useQueryClient();

  const goldensQ = useQuery({ queryKey: ["admin", "goldens"], queryFn: () => list() });
  const shadowQ = useQuery({ queryKey: ["admin", "shadow"], queryFn: () => shadow() });

  const runAll = useMutation({
    mutationFn: (goldenId?: string) => run({ data: { releaseRef: new Date().toISOString().slice(0, 19), goldenId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "goldens"] }),
  });

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Golden Conversations & Shadow Mode</h1>
          <p className="text-sm text-slate-500">
            Regressão zero em conversas canónicas + comparação com estratégia alternativa.
          </p>
        </div>
        <button
          onClick={() => runAll.mutate(undefined)}
          disabled={runAll.isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {runAll.isPending ? "A correr…" : "Correr suite"}
        </button>
      </header>

      {runAll.data && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 font-medium">Release {runAll.data.releaseRef}</div>
          <ul className="space-y-1">
            {runAll.data.summaries.map((s) => (
              <li key={s.id} className="flex justify-between">
                <span>{s.slug}</span>
                <span className={s.passed ? "text-green-600" : "text-red-600"}>
                  {s.passed ? "✓" : `✗ ${s.failures} falhas`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">Conversas canónicas</h2>
        {goldensQ.isLoading && <div className="text-sm text-slate-500">A carregar…</div>}
        <div className="space-y-2">
          {(goldensQ.data?.goldens ?? []).map((g: any) => (
            <div key={g.id} className="rounded border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{g.title}</div>
                  <div className="text-xs text-slate-500">{g.slug} · {(g.turns as any[])?.length ?? 0} turnos · {(g.tags as string[])?.join(", ") || "sem tags"}</div>
                  {g.description && <div className="mt-1 text-xs text-slate-500">{g.description}</div>}
                </div>
                <div className="text-right text-xs">
                  {g.latest_run ? (
                    <span className={g.latest_run.passed ? "text-green-600" : "text-red-600"}>
                      {g.latest_run.passed ? "✓ passou" : "✗ falhou"}
                      <div className="text-slate-500">{new Date(g.latest_run.created_at).toLocaleString("pt-PT")}</div>
                    </span>
                  ) : (
                    <span className="text-slate-400">nunca correu</span>
                  )}
                  <button
                    onClick={() => runAll.mutate(g.id)}
                    className="mt-2 block rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Correr
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">Shadow Mode (últimos 14 dias)</h2>
        {shadowQ.data ? (
          <>
            <div className="mb-4 text-xs text-slate-500">{shadowQ.data.total} execuções amostradas</div>
            <div className="mb-4 grid gap-2 md:grid-cols-2">
              {shadowQ.data.strategies.map((s: any) => (
                <div key={s.strategy} className="rounded border border-slate-100 p-2 text-sm dark:border-slate-800">
                  <div className="font-medium">{s.strategy}</div>
                  <div className="text-xs text-slate-500">
                    {s.n} runs · mesma ação {s.same_action_pct}% · mesma resposta {s.same_reply_pct}%
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-xs">
              {shadowQ.data.recent.slice(0, 8).map((r: any) => (
                <div key={r.id} className="rounded border border-slate-100 p-2 dark:border-slate-800">
                  <div className="text-slate-500">{new Date(r.created_at).toLocaleString("pt-PT")} · {r.strategy}</div>
                  <div>baseline: <span className="font-mono">{r.diff?.baseline_action}</span> → shadow: <span className="font-mono">{r.diff?.shadow_action}</span></div>
                  {r.reply && <div className="mt-1 text-slate-600 dark:text-slate-300">{r.reply}</div>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-500">Sem dados.</div>
        )}
      </section>
    </div>
  );
}