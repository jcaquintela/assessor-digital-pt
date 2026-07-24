import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/suporte")({
  head: () => ({ meta: [{ title: "Suporte — Admin" }] }),
  component: () => (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Suporte</h1>
      <p className="text-sm text-muted-foreground">
        Fila de pedidos de suporte. Acesso a dados privados do consultor requer autorização explícita (ver Segurança).
      </p>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground dark:border-slate-700">Em preparação.</div>
    </div>
  ),
});