import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — Admin" }] }),
  component: IntegracoesPage,
});

const items = [
  { name: "WhatsApp", status: "Planeado" },
  { name: "Google Calendar", status: "Planeado" },
  { name: "Microsoft Outlook", status: "Planeado" },
  { name: "Stripe", status: "Planeado" },
  { name: "OpenAI", status: "Planeado" },
];

function IntegracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">Estado das ligações externas ao nível da plataforma.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <Card key={i.name}>
            <CardHeader><CardTitle className="text-base">{i.name}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{i.status}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}