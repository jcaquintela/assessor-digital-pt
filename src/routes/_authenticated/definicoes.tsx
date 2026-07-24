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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

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
  const [accountKind, setAccountKind] = useState<"real" | "demo">("real");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
      setUid(data.user?.id ?? "");
      if (data.user?.id) {
        const { data: prof } = await supabase.from("profiles").select("account_kind").eq("id", data.user.id).maybeSingle();
        if (prof && (prof as { account_kind?: string }).account_kind) {
          setAccountKind(((prof as { account_kind?: string }).account_kind === "demo" ? "demo" : "real"));
        }
      }
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const marcar = async (kind: "real" | "demo") => {
    if (!uid) return;
    const { error } = await supabase.from("profiles").update({ account_kind: kind } as never).eq("id", uid);
    if (error) { toast.error(error.message); return; }
    setAccountKind(kind);
    toast.success(kind === "demo" ? "Conta marcada como demonstração." : "Conta marcada como real.");
  };

  const loadDemo = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      await seedDemoData(uid);
      await marcar("demo");
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
      <Alert className="mb-4 border-amber-500/40 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle>Piloto — validação de conceito</AlertTitle>
        <AlertDescription>
          Esta aplicação está em piloto de 14 dias. Reveja sempre os rascunhos antes de confirmar. Os dados são reais e persistem na sua conta.
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Perfil</CardTitle>
              <Badge variant={accountKind === "demo" ? "secondary" : "default"}>{accountKind === "demo" ? "Demonstração" : "Real"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><strong>Email:</strong> {email || "—"}</p>
            <p><strong>Idioma:</strong> Português (Portugal)</p>
            <p><strong>Moeda:</strong> EUR</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant={accountKind === "real" ? "default" : "outline"} onClick={() => marcar("real")}>Marcar como real</Button>
              <Button size="sm" variant={accountKind === "demo" ? "default" : "outline"} onClick={() => marcar("demo")}>Marcar como demo</Button>
            </div>
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