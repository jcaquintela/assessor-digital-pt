import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/definicoes")({
  head: () => ({
    meta: [
      { title: "Definições — Assessor do Consultor" },
      { name: "description", content: "Preferências e integrações do consultor." },
      { property: "og:title", content: "Definições — Assessor do Consultor" },
      { property: "og:description", content: "Preferências e integrações do consultor." },
    ],
  }),
  component: DefinicoesPage,
});

function DefinicoesPage() {
  return (
    <AppShell>
      <PageHeader title="Definições" subtitle="Preferências e integrações futuras." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Perfil</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><strong>Nome:</strong> Consultor Demo</p>
            <p><strong>Email:</strong> consultor@demo.pt</p>
            <p><strong>Idioma:</strong> Português (Portugal)</p>
            <p><strong>Moeda:</strong> EUR</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Integrações</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("WhatsApp — em breve.")}>Ligar WhatsApp</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Google Calendar — em breve.")}>Ligar Google Calendar</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Microsoft Outlook — em breve.")}>Ligar Microsoft Outlook</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Faturação — em breve.")}>Faturação (Stripe)</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}