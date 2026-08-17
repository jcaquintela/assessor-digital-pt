import { BRAND_NAME, appTitle } from "@/lib/brand";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BrandMark } from "@/components/brand-mark";
import { toast } from "sonner";
import { requestPasswordRecovery } from "@/lib/auth/password-recovery.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s['next'] === "string" ? s['next'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: appTitle("Entrar") },
      { name: "description", content: "Entra ou cria conta no Afonso, o teu assessor pessoal digital." },
      { property: "og:title", content: appTitle("Entrar") },
      { property: "og:description", content: "Entra ou cria conta no Afonso, o teu assessor pessoal digital." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  // Só caminhos relativos da própria app são aceites como destino.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const goNext = () => {
    if (safeNext) window.location.href = safeNext;
    else navigate({ to: "/", replace: true });
  };
  const [tab, setTab] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Sessão iniciada.");
    goNext();
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: safeNext ? `${window.location.origin}${safeNext}` : window.location.origin,
        data: { name },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada. Já pode entrar.");
    setTab("in");
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Contas sem email entregável (WhatsApp/Telegram) recebem o link pelo
      // canal; as restantes seguem pelo email normal.
      const r = await requestPasswordRecovery({ data: { email } });
      if (r.sendEmail) {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
      }
      toast.success(
        "Se a conta existir, enviámos instruções por email ou pela conversa com o Afonso.",
      );
    } catch {
      toast.error("Não consegui enviar agora. Tenta outra vez daqui a pouco.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: safeNext
        ? `${window.location.origin}/auth?next=${encodeURIComponent(safeNext)}`
        : window.location.origin,
    });
    setBusy(false);
    if (result.error) return toast.error(result.error.message ?? "Erro ao entrar com Google.");
    if (result.redirected) return;
    goNext();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <BrandMark size={36} />
          <div>
            <div className="text-sm font-semibold leading-tight">{BRAND_NAME}</div>
            <div className="text-xs text-muted-foreground">o teu assessor</div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {tab === "in" ? "Entrar" : tab === "up" ? "Criar conta" : "Recuperar palavra-passe"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "in" | "up" | "reset")}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="in">Entrar</TabsTrigger>
                <TabsTrigger value="up">Criar conta</TabsTrigger>
                <TabsTrigger value="reset">Recuperar</TabsTrigger>
              </TabsList>

              <TabsContent value="in">
                <form onSubmit={signIn} className="mt-4 space-y-3">
                  <Field label="Email" value={email} onChange={setEmail} type="email" />
                  <Field label="Palavra-passe" value={password} onChange={setPassword} type="password" />
                  <Button type="submit" className="w-full" disabled={busy}>Entrar</Button>
                </form>
              </TabsContent>

              <TabsContent value="up">
                <form onSubmit={signUp} className="mt-4 space-y-3">
                  <Field label="Nome" value={name} onChange={setName} />
                  <Field label="Email" value={email} onChange={setEmail} type="email" />
                  <Field label="Palavra-passe" value={password} onChange={setPassword} type="password" hint="Mínimo 6 caracteres" />
                  <Button type="submit" className="w-full" disabled={busy}>Criar conta</Button>
                </form>
              </TabsContent>

              <TabsContent value="reset">
                <form onSubmit={reset} className="mt-4 space-y-3">
                  <Field label="Email" value={email} onChange={setEmail} type="email" />
                  <p className="text-xs text-muted-foreground">
                    Enviamos um link para definires uma nova palavra-passe. Se só falas com o
                    Afonso por WhatsApp ou Telegram, o link chega aí.
                  </p>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "A enviar…" : "Enviar link de recuperação"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={google} disabled={busy}>
              Continuar com Google
            </Button>
            <div className="mt-4 rounded-lg border border-border p-3">
              <p className="text-[13px] font-medium">Ainda não tens conta?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cria a tua conta no plano Base — grátis e activo de imediato.
              </p>
              <Button asChild variant="secondary" className="mt-2 w-full">
                <Link to="/registo">Criar conta</Link>
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Só falas comigo pelo Telegram e não tens palavra-passe? Escreve{" "}
              <strong>entrar</strong> ao Afonso — ele envia-te um link de acesso válido por 15 minutos.
            </p>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              <Link to="/" className="underline-offset-2 hover:underline">Voltar à página inicial</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}