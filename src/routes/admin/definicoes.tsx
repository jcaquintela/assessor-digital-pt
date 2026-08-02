import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/definicoes")({
  head: () => ({ meta: [{ title: "Definições — Afonso admin" }] }),
  component: () => (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Definições</h1>
      <p className="text-sm text-muted-foreground">Preferências da plataforma. Em preparação.</p>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground dark:border-slate-700">Em preparação.</div>
    </div>
  ),
});