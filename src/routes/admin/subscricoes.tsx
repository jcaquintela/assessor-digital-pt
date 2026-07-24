import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/subscricoes")({
  head: () => ({ meta: [{ title: "Subscrições — Admin" }] }),
  component: () => (
    <Placeholder title="Subscrições" desc="Gestão de planos e faturação. Ligar Stripe para ativar." />
  ),
});

function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{desc}</p>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground dark:border-slate-700">
        Em preparação.
      </div>
    </div>
  );
}