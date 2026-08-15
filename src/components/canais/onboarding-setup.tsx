import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  CALENDAR_PROVIDERS,
  CALENDAR_PROVIDER_LABEL,
  type CalendarProvider,
} from "@/lib/calendar/providers";
import { getCalendarStatus, startCalendarConnect } from "@/lib/calendar/calendar.functions";
import { GMAIL_CONNECTOR_ID } from "@/lib/email/gmail/provider";
import { OUTLOOK_CONNECTOR_ID } from "@/lib/email/outlook/provider";
import { getGmailStatus, startGmailConnect } from "@/lib/email/gmail/gmail.functions";
import { getOutlookMailStatus, startOutlookMailConnect } from "@/lib/email/outlook/outlook.functions";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { emailStepMode, CALENDAR_LATER_NOTE } from "@/lib/onboarding/steps";

/** Abre o OAuth numa pop-up e espera pelo resultado (mesmo padrão das Definições). */
function waitForPopup(popup: Window, connectorId: string) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== connectorId ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") { resolve(); return; }
      popup.close();
      reject(new Error("A autorização não foi concluída."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("A janela foi fechada antes de concluir."));
    }, 500);
  });
}

export function CalendarStep({ onNext }: { onNext: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<CalendarProvider | null>(null);

  const status = useQuery({ queryKey: ["calendar-status"], queryFn: () => getCalendarStatus() });
  const ligado = (status.data ?? []).find((r) => r.connected)?.provider as CalendarProvider | undefined;

  const ligar = async (provider: CalendarProvider) => {
    const popup = window.open("", "afonso-calendar-oauth", "width=620,height=760");
    if (!popup) { toast.error("Permite janelas pop-up para ligares o calendário."); return; }
    setBusy(provider);
    try {
      const { authorizationUrl } = await startCalendarConnect({ data: { provider } });
      const done = waitForPopup(popup, provider);
      popup.location.href = authorizationUrl;
      await done;
      await qc.invalidateQueries({ queryKey: ["calendar-status"] });
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
      toast.success(`${CALENDAR_PROVIDER_LABEL[provider]} ligado.`);
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Não consegui ligar o calendário.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="c-card mt-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarDays className="c-muted h-4 w-4" />
        <h2 className="c-section-title">A tua agenda</h2>
      </div>
      <p className="c-muted text-[13px] leading-relaxed">
        Se ligares o calendário, o que combinarmos na conversa entra lá sozinho e eu aviso-te
        antes de cada compromisso. Uso só um calendário — escolhe o teu.
      </p>

      <div className="mt-4 grid gap-3">
        {CALENDAR_PROVIDERS.map((p) => {
          const isLigado = ligado === p;
          return (
            <div key={p} className="flex items-center justify-between rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
              <div>
                <div className="text-[13.5px] font-semibold">{CALENDAR_PROVIDER_LABEL[p]}</div>
                <span className={`c-badge mt-1 inline-flex${isLigado ? " ok" : ""}`}>
                  {isLigado ? "Ligado" : "Não ligado"}
                </span>
              </div>
              {isLigado ? (
                <span className="c-muted text-[12px]">Tratado</span>
              ) : (
                <button className="c-btn" disabled={busy !== null || Boolean(ligado)} onClick={() => ligar(p)}>
                  {busy === p ? "A ligar…" : "Ligar"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="c-cta" onClick={onNext}>
          {ligado ? "Continuar" : "Agora não"}
        </button>
        {!ligado && <span className="c-muted text-[12px]">{CALENDAR_LATER_NOTE}</span>}
      </div>
    </section>
  );
}

export function EmailStep({ onNext }: { onNext: () => void }) {
  const qc = useQueryClient();
  const tier = useEffectiveTier();
  const [busy, setBusy] = useState<string | null>(null);

  // Mesmo gate `effective_tier()` do resto do produto — nada de lógica nova.
  const mode = emailStepMode(tier.data?.tier);

  const gmail = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => getGmailStatus(),
    enabled: mode === "ligar",
  });
  const outlook = useQuery({
    queryKey: ["outlook-mail-status"],
    queryFn: () => getOutlookMailStatus(),
    enabled: mode === "ligar",
  });

  const ligar = async (
    id: string,
    label: string,
    start: () => Promise<{ authorizationUrl: string }>,
    queryKey: string,
  ) => {
    const popup = window.open("", `afonso-${id}-oauth`, "width=620,height=760");
    if (!popup) { toast.error("Permite janelas pop-up para ligares o email."); return; }
    setBusy(id);
    try {
      const { authorizationUrl } = await start();
      const done = waitForPopup(popup, id);
      popup.location.href = authorizationUrl;
      await done;
      await qc.invalidateQueries({ queryKey: [queryKey] });
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
      toast.success(`${label} ligado.`);
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Não consegui ligar o email.");
    } finally {
      setBusy(null);
    }
  };

  if (mode === "upsell") {
    return (
      <section className="c-card mt-6 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Mail className="c-muted h-4 w-4" />
          <h2 className="c-section-title">Email — no plano Pro</h2>
        </div>
        <p className="c-muted text-[13px] leading-relaxed">
          No plano Pro eu leio também a tua caixa de correio: digo-te o que interessa de gente
          conhecida e deixo respostas preparadas — nunca envio nada sozinho. Fica para quando
          quiseres; não precisas disto para começar.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="c-cta" onClick={onNext}>Terminar</button>
          <Link to="/subscricao" className="c-btn">Ver o plano Pro</Link>
        </div>
      </section>
    );
  }

  const cards = [
    {
      id: GMAIL_CONNECTOR_ID,
      label: "Gmail",
      connected: Boolean(gmail.data?.connected),
      start: () => startGmailConnect(),
      queryKey: "gmail-status",
    },
    {
      id: OUTLOOK_CONNECTOR_ID,
      label: "Outlook",
      connected: Boolean(outlook.data?.connected),
      start: () => startOutlookMailConnect(),
      queryKey: "outlook-mail-status",
    },
  ];
  const algumLigado = cards.some((c) => c.connected);

  return (
    <section className="c-card mt-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Mail className="c-muted h-4 w-4" />
        <h2 className="c-section-title">A tua caixa de correio</h2>
      </div>
      <p className="c-muted text-[13px] leading-relaxed">
        Faz parte do teu plano. Leio o que chega, aviso-te do que interessa e preparo respostas —
        nunca envio nada sozinho. Uso só uma caixa.
      </p>
      <div className="mt-4 grid gap-3">
        {cards.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
            <div>
              <div className="text-[13.5px] font-semibold">{c.label}</div>
              <span className={`c-badge mt-1 inline-flex${c.connected ? " ok" : ""}`}>
                {c.connected ? "Ligado" : "Não ligado"}
              </span>
            </div>
            {c.connected ? (
              <span className="c-muted text-[12px]">Tratado</span>
            ) : (
              <button
                className="c-btn"
                disabled={busy !== null || algumLigado}
                onClick={() => ligar(c.id, c.label, c.start, c.queryKey)}
              >
                {busy === c.id ? "A ligar…" : "Ligar"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="c-cta" onClick={onNext}>{algumLigado ? "Terminar" : "Agora não"}</button>
        {!algumLigado && (
          <span className="c-muted text-[12px]">Podes ligar depois em Definições › Email.</span>
        )}
      </div>
    </section>
  );
}
