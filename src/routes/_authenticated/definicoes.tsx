import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { resetAccount, seedDemoData } from "@/lib/seed-demo";
import { LogOut } from "lucide-react";

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
  const navigate = useNavigate();
  const { refresh } = useStore();
  const [email, setEmail] = useState<string>("");
  const [uid, setUid] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setUid(data.user?.id ?? "");
    });
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const loadDemo = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      await seedDemoData(uid);
      toast.success("Dados de demonstração carregados.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!uid) return;
    if (!confirm("Apagar todos os seus dados? Esta ação não pode ser revertida.")) return;
    setBusy(true);
    try {
      await resetAccount(uid);
      toast.success("Conta reposta.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Definições" subtitle="Preferências e integrações futuras." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Perfil</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><strong>Email:</strong> {email || "—"}</p>
            <p><strong>Idioma:</strong> Português (Portugal)</p>
            <p><strong>Moeda:</strong> EUR</p>
            <Button variant="outline" className="mt-3 w-full justify-start" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Terminar sessão
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Dados</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={loadDemo} disabled={busy}>
              Carregar dados de demonstração
            </Button>
            <Button variant="outline" className="w-full justify-start text-destructive" onClick={doReset} disabled={busy}>
              Repor conta (apagar tudo)
            </Button>
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