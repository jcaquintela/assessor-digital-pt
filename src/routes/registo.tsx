import { BRAND_NAME, appTitle } from "@/lib/brand";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { listPublishedPlans } from "@/lib/subscription/plans.functions";
import { MODULE_LABEL, planSummary, tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";
import { AI_DISCLOSURE } from "@/lib/assessor/ai-disclosure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/registo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: appTitle("Criar conta") },
      { name: "description", content: "Cria a tua conta no plano Base, grátis, e liga o Afonso em minutos." },
      { property: "og:title", content: appTitle("Criar conta") },
      { property: "og:description", content: "Cria a tua conta no plano Base, grátis, e liga o Afonso em minutos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegistoPage,
});

const ORDER: SubscriptionTier[] = ["base", "consultor", "pro", "hub"];

function euro(v: number | null | undefined): string {
  if (v === null || v === undefined) return "Sob consulta";
  if (v === 0) return "Grátis";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v) + "/mês";
}

function RegistoPage() {
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listPublishedPlans);
  const { data } = useQuery({ queryKey: ["plans", "published"], queryFn: () => fetchPlans() });
  const prices = new Map((data?.plans ?? []).map((p) => [p.tier, p]));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: u }) => {
      if (u.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: res, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/ligar-canal`, data: { name } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (res.session) {
      toast.success("Conta criada no plano Base.");
      navigate({ to: "/ligar-canal", replace: true });
      return;
    }
    setPending(true);
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    setBusy(false);
    if (result.error) return toast.error(result.error.message ?? "Erro ao entrar com Google.");
    if (result.redirected) return;
    navigate({ to: "/ligar-canal", replace: true });
  };

  return (
    <div className="consult-root min-h-screen px-4 py-10">
      <main className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-center gap-2">
          <BrandMark size={36} />
          <div>
            <div className="text-sm font-semibold leading-tight">{BRAND_NAME}</div>
            <div className="text-xs text-muted-foreground">assistente de IA</div>
          </div>
        </div>

        <p className="c-eyebrow">Criar conta</p>
        <h1 className="c-page-title mt-1">Cria a conta e escolhes o canal a seguir</h1>
        <p className="c-muted mt-2 max-w-2xl text-[14px] leading-relaxed">
          {AI_DISCLOSURE} Falas com um sistema automático, não com uma pessoa.
          A conta é grátis e fica activa de imediato. Logo a seguir escolhes por onde
          falamos: WhatsApp com 14 dias grátis do plano Consultor (sem cartão) ou
          Telegram gratuito para sempre no plano Base. É sempre a mesma conta e o
          mesmo histórico em qualquer canal, e podes mudar depois.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER.map((tier) => {
            const s = planSummary(tier);
            const cfg = prices.get(tier);
            const selectable = tier === "base";
            return (
              <article
                key={tier}
                className="c-card flex flex-col p-5"
                style={selectable ? { borderColor: "var(--brass-dark)" } : { opacity: 0.65 }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px] font-semibold">{tierLabel(tier)}</h2>
                  <span className="c-badge">{selectable ? "Escolhido" : "Em breve"}</span>
                </div>
                <div className="mt-1 text-[18px] font-semibold" style={{ color: "var(--brass-dark)" }}>
                  {euro(cfg?.price_month)}
                </div>
                <p className="c-eyebrow mt-4">Autonomia</p>
                <p className="text-[13.5px]">{s.autonomyLabel}</p>
                <p className="c-eyebrow mt-4">Áreas do painel</p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {s.modules.map((m) => (
                    <li key={m.path} className="flex items-center gap-2 text-[13px]">
                      {m.available ? (
                        <Check className="h-3.5 w-3.5" style={{ color: "var(--sage-dark, var(--sage))" }} />
                      ) : (
                        <Lock className="c-muted h-3.5 w-3.5" />
                      )}
                      <span className={m.available ? "" : "c-muted"}>{MODULE_LABEL[m.path]}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Button type="button" className="w-full" disabled={!selectable}>
                    {selectable ? "Plano Base seleccionado" : "Em breve"}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="c-card mx-auto mt-10 max-w-md p-5">
          {pending ? (
            <>
              <h2 className="c-section-title">Confirma o teu email</h2>
              <p className="mt-2 text-[13.5px]">
                Enviei-te um email para <strong>{email}</strong>. Carrega no link e voltas
                directamente para ligares o teu canal.
              </p>
              <p className="c-muted mt-3 text-[12px]">
                <Link to="/auth" className="underline">Já confirmei — entrar</Link>
              </p>
            </>
          ) : (
            <>
              <h2 className="c-section-title">Os teus dados</h2>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Palavra-passe</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">Mínimo 6 caracteres</p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Criar conta no plano Base
                </Button>
              </form>
              <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={google} disabled={busy}>
                Continuar com Google
              </Button>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Já tens conta? <Link to="/auth" className="underline">Entrar</Link>
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}