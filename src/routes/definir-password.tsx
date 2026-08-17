import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setDashboardPassword, skipPasswordSetup } from "@/lib/auth/password-setup.functions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { appTitle } from "@/lib/brand";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/definir-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: appTitle("Definir palavra-passe") },
      {
        name: "description",
        content: "Passo opcional para entrares no painel sem pedires um link novo.",
      },
      { property: "og:title", content: appTitle("Definir palavra-passe") },
      {
        property: "og:description",
        content: "Passo opcional para entrares no painel sem pedires um link novo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DefinirPasswordPage,
});

function DefinirPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/auth", replace: true });
      else setEmail(data.user.email ?? null);
    });
  }, [navigate]);

  const goOn = () => navigate({ to: "/", replace: true });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("A palavra-passe precisa de pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As palavras-passe não coincidem.");
    setBusy(true);
    try {
      const r = await setDashboardPassword({ data: { password } });
      if (!r.ok) {
        toast.error(r.message || "Não consegui guardar a palavra-passe.");
        return;
      }
      // Mudar a palavra-passe pode encerrar a sessão actual: voltamos a entrar
      // com as novas credenciais para o consultor não cair no ecrã de login.
      if (email) await supabase.auth.signInWithPassword({ email, password });
      toast.success("Palavra-passe definida. Já podes entrar com email e palavra-passe.");
      goOn();
    } catch {
      toast.error("Não consegui guardar a palavra-passe.");
    } finally {
      setBusy(false);
    }
  }

  async function agoraNao() {
    setBusy(true);
    try {
      await skipPasswordSetup();
    } catch {
      // Saltar nunca pode bloquear a entrada no painel.
    } finally {
      setBusy(false);
      goOn();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <BrandMark size={36} />
          <div>
            <div className="text-sm font-semibold leading-tight">{BRAND_NAME}</div>
            <div className="text-xs text-muted-foreground">o teu assessor</div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Queres definir uma palavra-passe?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Assim entras aqui diretamente no futuro, sem precisares de pedir um link novo. O link
              continua a funcionar na mesma.
            </p>
            <form onSubmit={guardar} className="mt-5 space-y-4">
              {email && (
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={email} readOnly disabled />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="pw">Nova palavra-passe</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirmar</Label>
                <Input
                  id="pw2"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "A guardar…" : "Definir palavra-passe"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={agoraNao}
              >
                Agora não
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}