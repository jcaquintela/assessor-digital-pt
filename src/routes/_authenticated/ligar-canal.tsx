import { appTitle } from "@/lib/brand";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink } from "lucide-react";
import { ChannelChoice } from "@/components/canais/channel-choice";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { createTelegramLinkToken, getTelegramLink } from "@/lib/telegram/link.functions";
import { getWhatsAppLink, startWhatsAppLink } from "@/lib/whatsapp/link.functions";
import { startWhatsAppTrial } from "@/lib/subscription/trial.functions";
import { CalendarStep, EmailStep } from "@/components/canais/onboarding-setup";
import { nextOnboardingStep, type OnboardingStep } from "@/lib/onboarding/steps";

export const Route = createFileRoute("/_authenticated/ligar-canal")({
  head: () => ({
    meta: [
      { title: appTitle("Escolhe o teu canal") },
      { name: "description", content: "WhatsApp com 14 dias grátis ou Telegram gratuito para sempre: escolhe por onde falas com o Afonso." },
      { property: "og:title", content: appTitle("Escolhe o teu canal") },
      { property: "og:description", content: "WhatsApp com 14 dias grátis ou Telegram gratuito para sempre: escolhe por onde falas com o Afonso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LigarCanalPage,
});

function LigarCanalPage() {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<"whatsapp" | "telegram" | null>(null);
  const [step, setStep] = useState<OnboardingStep>("canal");
  const goto = (from: OnboardingStep) => {
    const next = nextOnboardingStep(from);
    if (next === "fim") { navigate({ to: "/", replace: true }); return; }
    setStep(next);
  };

  if (step === "calendario") {
    return (
      <OnboardingShell
        eyebrow="Passo 2 de 3"
        title="Queres que veja a tua agenda?"
        intro="Nada é obrigatório: podes saltar e ligar mais tarde nas Definições."
      >
        <CalendarStep onNext={() => goto("calendario")} />
      </OnboardingShell>
    );
  }

  if (step === "email") {
    return (
      <OnboardingShell
        eyebrow="Passo 3 de 3"
        title="E a tua caixa de correio?"
        intro="Último passo — também podes deixar para depois."
      >
        <EmailStep onNext={() => goto("email")} />
      </OnboardingShell>
    );
  }

  return (
    <div className="consult-root min-h-dvh px-4 py-10">
      <main className={`mx-auto w-full ${choice === null ? "max-w-3xl" : "max-w-xl"}`}>
        <div className="mb-6 flex items-center gap-2">
          <BrandMark size={36} />
          <div>
            <div className="text-sm font-semibold leading-tight">Afonso</div>
            <div className="text-xs text-muted-foreground">o teu assessor</div>
          </div>
        </div>
        <p className="c-eyebrow">Passo 1 de 3</p>
        <h1 className="c-page-title mt-1">Escolhe por onde falamos</h1>
        <p className="c-muted mt-2 text-[14px] leading-relaxed">
          É a mesma conta e o mesmo histórico em qualquer canal — o que muda são as
          capacidades. Podes mudar depois nas Definições.
        </p>

        {choice === null && <ChannelChoice onChoose={setChoice} />}
        {choice === "whatsapp" && (
          <WhatsAppFlow onBack={() => setChoice(null)} onDone={() => goto("canal")} />
        )}
        {choice === "telegram" && (
          <TelegramFlow onBack={() => setChoice(null)} onDone={() => goto("canal")} />
        )}

        <p className="c-muted mt-6 text-[13px]">
          Preferes tratar disto depois?{" "}
          <button type="button" className="underline" onClick={() => goto("canal")}>
            Saltar este passo
          </button>
        </p>
      </main>
    </div>
  );
}

function OnboardingShell(props: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="consult-root min-h-dvh px-4 py-10">
      <main className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center gap-2">
          <BrandMark size={36} />
          <div>
            <div className="text-sm font-semibold leading-tight">Afonso</div>
            <div className="text-xs text-muted-foreground">o teu assessor</div>
          </div>
        </div>
        <p className="c-eyebrow">{props.eyebrow}</p>
        <h1 className="c-page-title mt-1">{props.title}</h1>
        <p className="c-muted mt-2 text-[14px] leading-relaxed">{props.intro}</p>
        {props.children}
        <p className="c-muted mt-6 text-[13px]">
          Preferes ver primeiro o painel? <Link to="/hoje" className="underline">Continuar sem ligar</Link>
        </p>
      </main>
    </div>
  );
}


function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="c-btn-ghost mt-4 min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={onBack}>
      Ver as duas opções
    </button>
  );
}

function TelegramFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getTelegramLink);
  const createToken = useServerFn(createTelegramLinkToken);

  const { data, isLoading } = useQuery({
    queryKey: ["telegram", "link"],
    queryFn: () => fetchStatus(),
    refetchInterval: (q) => ((q.state.data as { linked?: boolean } | undefined)?.linked ? false : 4000),
  });

  const link = useMutation({
    mutationFn: async () => createToken(),
    onSuccess: (r) => {
      window.open(r.url, "_blank", "noopener,noreferrer");
      toast.success("Abre o Telegram e carrega em Iniciar — ligo à tua conta automaticamente.");
      qc.invalidateQueries({ queryKey: ["telegram", "link"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="c-card mt-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="c-section-title">Telegram · plano Base</h2>
        <span className={data?.linked ? "c-badge ok" : "c-badge"}>
          {data?.linked ? "Ligado" : "Não ligado"}
        </span>
      </div>
      {isLoading ? (
        <p className="c-muted text-sm">A carregar…</p>
      ) : data?.linked ? (
        <>
          <p className="text-[13px]">
            Está ligado{data.displayName ? ` (${data.displayName})` : ""}. Já podes falar comigo.
          </p>
          <div className="mt-3">
            <button className="c-cta" onClick={onDone}>Continuar</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px]">
            O botão abre o Afonso no Telegram já identificado — carrega em Iniciar e
            esta página actualiza sozinha.
          </p>
          <div className="mt-3">
            <button className="c-cta" onClick={() => link.mutate()} disabled={link.isPending}>
              <ExternalLink className="h-3.5 w-3.5" /> Ligar Telegram
            </button>
          </div>
          <p className="c-muted mt-2 text-[12px]">
            A ligação é válida durante 15 minutos e só pode ser usada uma vez.
          </p>
          <BackLink onBack={onBack} />
        </>
      )}
    </section>
  );
}

function WhatsAppFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getWhatsAppLink);
  const doStart = useServerFn(startWhatsAppLink);
  const doTrial = useServerFn(startWhatsAppTrial);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["whatsapp", "link"],
    queryFn: () => fetchStatus(),
    refetchInterval: (q) =>
      (q.state.data as { status?: string } | undefined)?.status === "linked" ? false : 5000,
  });

  const start = useMutation({
    mutationFn: async () => {
      await doTrial();
      return doStart({ data: { phone } });
    },
    onSuccess: (r) => {
      setCode(r.code);
      qc.invalidateQueries({ queryKey: ["whatsapp", "link"] });
      toast.success("Período experimental começado. Envia o código pelo WhatsApp.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linked = data?.status === "linked";
  const message = code ? `Ligar a conta do Afonso. Código: ${code}` : "";
  const displayNumber = data?.displayNumber ? `+${data.displayNumber}` : null;

  return (
    <section className="c-card mt-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="c-section-title">WhatsApp · 14 dias grátis</h2>
        <span className={linked ? "c-badge ok" : "c-badge"}>{linked ? "Ligado" : "Não ligado"}</span>
      </div>

      {linked ? (
        <>
          <p className="text-[13px]">Está ligado. O período experimental de 14 dias está a contar.</p>
          <button className="c-cta mt-3" onClick={onDone}>
            Continuar
          </button>
        </>
      ) : (
        <>
          <label htmlFor="wa-phone" className="c-eyebrow">O teu número de WhatsApp</label>
          <input
            id="wa-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+351 932 893 767"
            value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={24}
            className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]"
          />
          <p className="c-muted mt-2 text-[12px]">
            Formato internacional, por exemplo +351932893767. Não pedimos cartão.
          </p>
          <button
            className="c-cta mt-3"
            onClick={() => start.mutate()}
            disabled={start.isPending || phone.replace(/\D+/g, "").length < 8}
          >
            Começar os 14 dias
          </button>

          {code && (
            <div className="mt-4 rounded-[10px] border border-[var(--line)] p-3">
              <p className="text-[13px]">
                Envia esta mensagem para {displayNumber ?? "o WhatsApp do Afonso"}, a partir do teu número:
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2">
                <code className="c-mono text-[15px] font-semibold tracking-wide">{message}</code>
                <button
                  className="c-btn-ghost"
                  onClick={() => navigator.clipboard.writeText(message).then(() => toast.success("Copiado."))}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </button>
              </div>
              <p className="c-muted mt-2 text-[12px]">Esta página actualiza sozinha assim que a mensagem chegar.</p>
            </div>
          )}
          <BackLink onBack={onBack} />
        </>
      )}
    </section>
  );
}