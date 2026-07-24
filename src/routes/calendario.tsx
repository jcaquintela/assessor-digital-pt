import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDataHora } from "@/lib/demo-data";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário — Assessor do Consultor" },
      { name: "description", content: "Calendário interno do consultor." },
      { property: "og:title", content: "Calendário — Assessor do Consultor" },
      { property: "og:description", content: "Calendário interno do consultor." },
    ],
  }),
  component: CalendarioPage,
});

function CalendarioPage() {
  const { seguimentos } = useStore();
  const eventos = seguimentos
    .filter((s) => s.tipo === "Evento")
    .sort((a, b) => a.data.localeCompare(b.data));
  return (
    <AppShell>
      <PageHeader title="Calendário" subtitle="Vista interna dos compromissos." />
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle className="text-base">Próximos compromissos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {eventos.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{e.titulo}</div>
                  <div className="text-xs text-muted-foreground">{formatDataHora(e.data)}</div>
                </div>
                <Badge variant="outline" className="shrink-0"><CalendarIcon className="mr-1 h-3 w-3" />{e.hora}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Integrações</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Sincronize com o seu calendário externo (disponível numa próxima fase).</p>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Ligação a Google — em breve.")}>Ligar a Google Calendar</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Ligação a Microsoft — em breve.")}>Ligar a Microsoft Outlook</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}