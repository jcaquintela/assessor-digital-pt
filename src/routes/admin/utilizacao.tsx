import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/utilizacao")({
  head: () => ({ meta: [{ title: "Utilização — Afonso admin" }] }),
  component: () => (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Utilização</h1>
      <p className="text-sm text-muted-foreground">Consumo por utilizador e plano. Em preparação.</p>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground dark:border-slate-700">Em preparação.</div>
    </div>
  ),
});