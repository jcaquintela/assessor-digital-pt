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

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Afonso" },
      { name: "description", content: "Iniciar sessão ou criar conta no seu assessor pessoal." },
      { property: "og:title", content: "Entrar — Afonso" },
      { property: "og:description", content: "Iniciar sessão ou criar conta no seu assessor pessoal." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Sessão iniciada.");
    navigate({ to: "/", replace: true });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Se a conta existir, enviámos um email com instruções.");
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    setBusy(false);
    if (result.error) return toast.error(result.error.message ?? "Erro ao entrar com Google.");
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <BrandMark size={36} />
          <div>
            <div className="text-sm font-semibold leading-tight">Afonso</div>
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
                  <Button type="submit" className="w-full" disabled={busy}>Enviar email</Button>
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