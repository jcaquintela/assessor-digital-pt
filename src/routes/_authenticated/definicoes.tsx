import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, MessageCircle, Copy, ExternalLink, Clock, Lock, CalendarDays, Check, AlertTriangle, CreditCard } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ASSESSOR_NAME_DEFAULT, ASSESSOR_NAME_MAX, validateAssessorName } from "@/lib/assessor/assessor-name";
import { MODULE_LABEL, planSummary, tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";
import { isPlaceholderEmail, isValidEmail } from "@/lib/profile/email";
import { CHANNEL_LABEL, maskContact, useLinkedChannel } from "@/lib/assessor/use-linked-channel";
import { createTelegramLinkToken, getTelegramLink, unlinkTelegram } from "@/lib/telegram/link.functions";
import {
  getWhatsAppLink,
  startWhatsAppLink,
  unlinkWhatsApp,
} from "@/lib/whatsapp/link.functions";
import { getSupremePreferences, updateSupremePreferences } from "@/lib/assessor/supreme/autonomy.functions";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import {
  CALENDAR_PROVIDERS,
  CALENDAR_PROVIDER_LABEL,
  type CalendarProvider,
} from "@/lib/calendar/providers";
import {
  getCalendarStatus,
  startCalendarConnect,
  disconnectCalendar,
  syncCalendarNow,
} from "@/lib/calendar/calendar.functions";

export const Route = createFileRoute("/_authenticated/definicoes")({
  head: () => ({
    meta: [
      { title: "Definições — Assessor do Consultor" },
      { name: "description", content: "O teu assessor, autonomia, canal ligado e conta." },
      { property: "og:title", content: "Definições — Assessor do Consultor" },
      { property: "og:description", content: "O teu assessor, autonomia, canal ligado e conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DefinicoesPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="c-card p-5">
      <h2 className="c-section-title mb-4">{title}</h2>
      {children}
    </section>
  );
}

function DefinicoesPage() {
  return (
    <AppShell>
      <PageHeader title="Definições" subtitle="O teu assessor, autonomia, canal e conta." />
      <div className="flex flex-col gap-4">
        <PerfilSection />
        <AssessorNameSection />
        <PlanoSection />
        <SupremeSection />
        <CanalSection />
        <CalendarioSection />
        <ContaSection />
      </div>
    </AppShell>
  );
}

/* ---------------- O teu perfil ---------------- */

function PerfilSection() {
  const [uid, setUid] = useState("");
  const [saved, setSaved] = useState<{ name: string; email: string }>({ name: "", email: "" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setLoading(false); return; }
      setUid(data.user.id);
      const { data: prof } = await supabase
        .from("profiles").select("name, email" as never).eq("id", data.user.id).maybeSingle();
      const p = (prof as { name?: string | null; email?: string | null } | null) ?? {};
      const next = { name: p.name ?? "", email: p.email ?? data.user.email ?? "" };
      setSaved(next); setName(next.name); setEmail(next.email);
      setLoading(false);
    })();
  }, []);

  const placeholder = isPlaceholderEmail(saved.email);
  const dirty = name.trim() !== saved.name || email.trim() !== saved.email;

  const save = async () => {
    if (!uid) return;
    const nm = name.trim();
    const em = email.trim();
    if (!nm) { toast.error("Diz-nos como te chamas."); return; }
    if (!isValidEmail(em)) { toast.error("Escreve um email válido que uses mesmo."); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ name: nm, email: em } as never).eq("id", uid);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSaved({ name: nm, email: em });
    toast.success("Perfil atualizado.");
  };

  return (
    <Section title="O teu perfil">
      {loading ? (
        <p className="c-muted text-sm">A carregar…</p>
      ) : (
        <>
          {placeholder && (
            <div
              className="mb-4 flex items-start gap-2 rounded-[13px] border px-3 py-2.5 text-[13px]"
              style={{ borderColor: "var(--amber)", background: "rgba(214,158,46,.10)", color: "var(--amber)" }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Falta confirmar o teu email — sem ele não recebes comunicações importantes.</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="perfil-nome" className="c-eyebrow">O teu nome</label>
              <input
                id="perfil-nome" value={name} onChange={(e) => setName(e.target.value)}
                maxLength={80} placeholder="Como te chamas"
                className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus-visible:border-[var(--brass)]"
              />
            </div>
            <div>
              <label htmlFor="perfil-email" className="c-eyebrow">O teu email</label>
              <input
                id="perfil-email" type="email" inputMode="email" autoComplete="email"
                value={placeholder && email === saved.email ? "" : email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={placeholder ? "email@exemplo.pt" : undefined}
                className="mt-1 w-full rounded-[10px] border bg-white px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus-visible:border-[var(--brass)]"
                style={{ borderColor: placeholder ? "var(--amber)" : "var(--line)" }}
              />
            </div>
          </div>
          <p className="c-muted mt-2 text-[12px]">
            Este é o teu nome e o teu email — não o do teu assessor.
          </p>
          <button className="c-cta mt-3" onClick={save} disabled={saving || !dirty}>Guardar</button>
        </>
      )}
    </Section>
  );
}

/* ---------------- Plano e subscrição ---------------- */

function PlanoSection() {
  const { data: tierData } = useEffectiveTier();
  const summary = planSummary(tierData?.tier);
  const incluidos = summary.modules.filter((m) => m.available);
  const bloqueados = summary.modules.filter((m) => !m.available);

  return (
    <Section title="Plano e subscrição">
      <div className="flex flex-wrap items-center gap-2">
        <span className="c-badge ok">{tierLabel(summary.tier)}</span>
        <span className="c-muted text-[13px]">Autonomia até <strong>{summary.autonomyLabel}</strong>.</span>
      </div>

      <p className="c-eyebrow mt-4">Áreas disponíveis</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {incluidos.map((m) => (
          <li key={m.path} className="c-pill inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> {MODULE_LABEL[m.path]}
          </li>
        ))}
      </ul>
      {bloqueados.length > 0 && (
        <>
          <p className="c-eyebrow mt-4">Só em planos superiores</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {bloqueados.map((m) => (
              <li key={m.path} className="c-pill c-muted inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> {MODULE_LABEL[m.path]} · {tierLabel(m.min)}+
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <a className="c-cta" href="/planos#planos" target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" /> Comparar planos
        </a>
        <button className="c-btn" disabled>
          <CreditCard className="h-4 w-4" /> Faturação
        </button>
        <span className="c-badge">Em breve</span>
      </div>
      <p className="c-muted mt-3 text-[12px] leading-relaxed">
        A mudança de plano ainda não é automática. Quando a faturação estiver ligada, tratas de tudo por aqui.
      </p>
    </Section>
  );
}

/* ---------------- O teu assessor ---------------- */

function AssessorNameSection() {
  const [uid, setUid] = useState("");
  const [name, setName] = useState(ASSESSOR_NAME_DEFAULT);
  const [draft, setDraft] = useState(ASSESSOR_NAME_DEFAULT);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUid(data.user.id);
      const { data: prof } = await supabase
        .from("profiles").select("assessor_name" as never).eq("id", data.user.id).maybeSingle();
      const nm = (prof as { assessor_name?: string } | null)?.assessor_name || ASSESSOR_NAME_DEFAULT;
      setName(nm); setDraft(nm);
    })();
  }, []);

  const save = async () => {
    if (!uid) return;
    const v = validateAssessorName(draft);
    if (!v.ok) { toast.error(v.error ?? "Nome inválido."); return; }
    const { error } = await supabase.from("profiles").update({ assessor_name: v.value } as never).eq("id", uid);
    if (error) { toast.error(error.message); return; }
    setName(v.value); setDraft(v.value);
    toast.success("Nome do teu assessor atualizado.");
  };

  const reset = async () => {
    if (!uid) return;
    const { error } = await supabase.from("profiles").update({ assessor_name: ASSESSOR_NAME_DEFAULT } as never).eq("id", uid);
    if (error) { toast.error(error.message); return; }
    setName(ASSESSOR_NAME_DEFAULT); setDraft(ASSESSOR_NAME_DEFAULT);
    toast.success("Nome reposto.");
  };

  return (
    <Section title="O teu assessor">
      <div className="flex items-center gap-3">
        <div className="c-avatar">{(name || "A").trim().charAt(0).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <label htmlFor="assessor-name" className="c-eyebrow">Nome</label>
          <input
            id="assessor-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={ASSESSOR_NAME_MAX}
            placeholder={ASSESSOR_NAME_DEFAULT}
            className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus-visible:border-[var(--brass)]"
          />
        </div>
      </div>
      <p className="c-muted mt-2 text-[12px]">
        É assim que o tratas na conversa. Máx. {ASSESSOR_NAME_MAX} caracteres. Atual: {name}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="c-cta" onClick={save} disabled={draft.trim() === name}>Guardar</button>
        <button className="c-btn" onClick={reset} disabled={name === ASSESSOR_NAME_DEFAULT}>
          Repor "{ASSESSOR_NAME_DEFAULT}"
        </button>
      </div>
    </Section>
  );
}

/* ---------------- Autonomia ---------------- */

const AUTONOMY_META = [
  { key: "conservador", label: "Conservador", desc: "Pede confirmação para quase tudo.", min: "base" as SubscriptionTier },
  { key: "balanced", label: "Equilibrado", desc: "Executa ações de baixo risco sozinho.", min: "consultor" as SubscriptionTier },
  { key: "proativo", label: "Proativo", desc: "Atua dentro dos limites permitidos.", min: "pro" as SubscriptionTier },
];

function SupremeSection() {
  const qc = useQueryClient();
  const fetchPrefs = useServerFn(getSupremePreferences);
  const savePrefs = useServerFn(updateSupremePreferences);
  const { data } = useQuery({ queryKey: ["supreme", "prefs"], queryFn: () => fetchPrefs() });
  const { name: assessorName } = useAssessorNameLite();
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => savePrefs({ data: patch }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supreme", "prefs"] }); toast.success("Guardado."); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data?.enabled) return null;

  const prefs = (data.preferences ?? {}) as {
    morning_briefing_enabled?: boolean; morning_time?: string;
    autonomy_level?: string; max_daily_nudges?: number;
  };
  const level = (data as any).effectiveAutonomy ?? prefs.autonomy_level ?? "conservador";
  const allowed = new Set<string>(((data as any).autonomyAllowed as string[]) ?? ["conservador"]);
  const tier = (data as any).tier as string | undefined;
  const clamped = Boolean((data as any).autonomyClamped);

  return (
    <Section title={`Autonomia do ${assessorName}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        {AUTONOMY_META.map((opt) => {
          const isAllowed = allowed.has(opt.key);
          const active = level === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={!isAllowed}
              onClick={() => save.mutate({ autonomy_level: opt.key })}
              className="rounded-[13px] border p-4 text-left transition-colors"
              style={{
                borderColor: active ? "var(--brass)" : "var(--line)",
                background: active ? "rgba(184,134,59,.10)" : isAllowed ? "#fff" : "var(--paper-2)",
                opacity: isAllowed ? 1 : 0.7,
                cursor: isAllowed ? "pointer" : "not-allowed",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold">{opt.label}</span>
                {active ? <Check className="h-4 w-4 text-[var(--brass-dark)]" /> : null}
                {!isAllowed ? <Lock className="c-muted h-3.5 w-3.5" /> : null}
              </div>
              <p className="c-muted mt-1.5 text-[12px] leading-relaxed">{opt.desc}</p>
              {!isAllowed && (
                <span className="c-badge mt-2 inline-flex">plano {tierLabel(opt.min)}+</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="c-muted mt-3 text-[12px] leading-relaxed">
        Ações sensíveis pedem sempre confirmação, seja qual for o nível. Plano atual: {tierLabel(tier)}.
      </p>
      {clamped ? (
        <p className="mt-2 text-[12px]" style={{ color: "var(--amber)" }}>
          A tua preferência guardada é mais alta do que o plano atual permite. Está a operar em <strong>{level}</strong> —
          se subires de plano, volta ao que tinhas escolhido.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="briefing-time" className="c-eyebrow">Hora do briefing da manhã</label>
          <input
            id="briefing-time" type="time" defaultValue={prefs.morning_time ?? "08:00"}
            onBlur={(e) => save.mutate({ morning_time: e.target.value })}
            className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]"
          />
          <button
            className="c-btn mt-2"
            onClick={() => save.mutate({ morning_briefing_enabled: !(prefs.morning_briefing_enabled ?? true) })}
          >
            {prefs.morning_briefing_enabled === false ? "Ativar briefing" : "Desativar briefing"}
          </button>
        </div>
        <div>
          <label htmlFor="max-nudges" className="c-eyebrow">Máx. de sugestões por dia</label>
          <input
            id="max-nudges" type="number" min={0} max={20} defaultValue={prefs.max_daily_nudges ?? 6}
            onBlur={(e) => save.mutate({ max_daily_nudges: Number(e.target.value) })}
            className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]"
          />
          <p className="c-muted mt-2 text-[12px]">Só as sugestões urgentes e importantes te chegam ao telemóvel.</p>
        </div>
      </div>
    </Section>
  );
}

// Leitura leve do nome (evita import circular de estilos/hooks pesados).
function useAssessorNameLite() {
  const [name, setName] = useState(ASSESSOR_NAME_DEFAULT);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("profiles").select("assessor_name" as never).eq("id", data.user.id).maybeSingle();
      setName((prof as { assessor_name?: string } | null)?.assessor_name || ASSESSOR_NAME_DEFAULT);
    })();
  }, []);
  return { name };
}

/* ---------------- Canal ligado ---------------- */

function CanalSection() {
  const { channels, primary, loading } = useLinkedChannel();

  if (loading) {
    return <Section title="Canal ligado"><p className="c-muted text-sm">A carregar…</p></Section>;
  }

  if (channels.length > 0) {
    return (
      <>
        <Section title="Canal ligado">
          <div className="space-y-3">
            {channels.map((c) => (
              <div key={c.channel} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="c-avatar"><MessageCircle className="h-4 w-4" /></div>
                  <div>
                    <div className="flex items-center gap-2 text-[14px] font-semibold">
                      {CHANNEL_LABEL[c.channel]}
                      {c.channel === primary && <span className="c-badge ok">Principal</span>}
                    </div>
                    <div className="c-mono c-muted text-[12.5px]">{maskContact(c.channel, c.externalId)}</div>
                    {c.linkedAt && (
                      <div className="c-muted text-[12px]">
                        Ligado em {new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(c.linkedAt))}.
                      </div>
                    )}
                  </div>
                </div>
                <span className="c-badge">Ligado</span>
              </div>
            ))}
          </div>
          <p className="c-muted mt-3 text-[12px]">
            {primary === "whatsapp"
              ? "Lembretes e avisos que eu inicio vão sempre por WhatsApp. O Telegram continua a funcionar para o que me escreveres por lá."
              : "Lembretes e avisos que eu inicio vão por Telegram. Se ligares o WhatsApp, passa a ser o canal principal."}
          </p>
        </Section>
        <TelegramSection />
      </>
    );
  }

  return (
    <>
      <WhatsAppSection />
      <TelegramSection />
    </>
  );
}

/* ---------------- Telegram (deep link com token de uso único) ---------------- */

function TelegramSection() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getTelegramLink);
  const createToken = useServerFn(createTelegramLinkToken);
  const doUnlink = useServerFn(unlinkTelegram);

  const { data, isLoading } = useQuery({
    queryKey: ["telegram", "link"],
    queryFn: () => fetchStatus(),
    refetchInterval: (q) => ((q.state.data as { linked?: boolean } | undefined)?.linked ? false : 5000),
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

  const unlink = useMutation({
    mutationFn: async () => doUnlink(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram", "link"] });
      toast.success("Telegram desligado desta conta.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="c-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="c-section-title">Telegram</h2>
        <span className={data?.linked ? "c-badge ok" : "c-badge"}>
          {data?.linked ? "Ligado" : "Não ligado"}
        </span>
      </div>
      {isLoading ? (
        <p className="c-muted text-sm">A carregar…</p>
      ) : data?.linked ? (
        <>
          <p className="text-[13px]">
            O teu Telegram{data.displayName ? ` (${data.displayName})` : ""} está ligado a esta conta — falas comigo
            pelos dois canais e é sempre a mesma memória.
          </p>
          <div className="mt-3">
            <button className="c-btn-ghost" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
              Desligar Telegram
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px]">
            Liga o Telegram a <strong>esta</strong> conta. Sem perguntas e sem risco de criares uma conta separada — o
            botão abre o Afonso já identificado.
          </p>
          <div className="mt-3">
            <button className="c-cta" onClick={() => link.mutate()} disabled={link.isPending}>
              <ExternalLink className="h-3.5 w-3.5" /> Ligar Telegram
            </button>
          </div>
          <p className="c-muted mt-2 text-[12px]">A ligação é válida durante 15 minutos e só pode ser usada uma vez.</p>
        </>
      )}
    </section>
  );
}

/* ---------------- Calendário ---------------- */

function CalendarioSection() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<CalendarProvider | null>(null);

  const status = useQuery({
    queryKey: ["calendar-status"],
    queryFn: () => getCalendarStatus(),
  });

  const waitForPopup = (popup: Window, provider: CalendarProvider) =>
    new Promise<void>((resolve, reject) => {
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
          event.data?.connectorId !== provider ||
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
      await qc.invalidateQueries({ queryKey: ["follow_ups"] });
      toast.success(`${CALENDAR_PROVIDER_LABEL[provider]} ligado.`);
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Não consegui ligar o calendário.");
    } finally {
      setBusy(null);
    }
  };

  const desligar = async (provider: CalendarProvider) => {
    setBusy(provider);
    try {
      await disconnectCalendar({ data: { provider } });
      await qc.invalidateQueries({ queryKey: ["calendar-status"] });
      toast.success(`${CALENDAR_PROVIDER_LABEL[provider]} desligado.`);
    } catch {
      toast.error("Não consegui desligar.");
    } finally {
      setBusy(null);
    }
  };

  const sincronizar = async () => {
    setBusy("google_calendar");
    try {
      const r = await syncCalendarNow();
      const applied = r.reduce((n, x) => n + x.applied, 0);
      await qc.invalidateQueries({ queryKey: ["follow_ups"] });
      await qc.invalidateQueries({ queryKey: ["calendar-status"] });
      toast.success(applied > 0 ? `${applied} alteração(ões) trazida(s) do calendário.` : "Já estava tudo em dia.");
    } catch {
      toast.error("Não consegui sincronizar agora.");
    } finally {
      setBusy(null);
    }
  };

  const rows = status.data ?? CALENDAR_PROVIDERS.map((p) => ({
    provider: p, connected: false, lastPolledAt: null as string | null, lastError: null as string | null,
  }));
  const algumLigado = rows.some((r) => r.connected);

  return (
    <Section title="Calendário">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.provider} className="flex items-center justify-between rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="c-muted h-4 w-4" />
              <div>
                <div className="text-[13.5px] font-semibold">{CALENDAR_PROVIDER_LABEL[r.provider as CalendarProvider]}</div>
                <span className={`c-badge mt-1 inline-flex${r.connected ? " ok" : ""}`}>
                  {r.connected ? "Ligado" : "Não ligado"}
                </span>
              </div>
            </div>
            {r.connected ? (
              <button className="c-btn" disabled={busy !== null} onClick={() => desligar(r.provider as CalendarProvider)}>
                Desligar
              </button>
            ) : (
              <button className="c-btn" disabled={busy !== null} onClick={() => ligar(r.provider as CalendarProvider)}>
                {busy === r.provider ? "A ligar…" : "Ligar"}
              </button>
            )}
          </div>
        ))}
      </div>
      {algumLigado && (
        <div className="mt-3 flex items-center gap-3">
          <button className="c-btn" disabled={busy !== null} onClick={sincronizar}>Sincronizar agora</button>
          <span className="c-muted text-[12px]">
            A verificação automática corre sozinha de 10 em 10 minutos.
          </span>
        </div>
      )}
      <p className="c-muted mt-3 text-[12px] leading-relaxed">
        Os compromissos que combinares na conversa entram no teu calendário sozinhos, e o que marcares
        directamente no calendário aparece aqui. Se editares dos dois lados ao mesmo tempo, fica a
        alteração mais recente.
      </p>
    </Section>
  );
}

/* ---------------- Conta ---------------- */

function ContaSection() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Section title="Conta">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="c-eyebrow">Email de acesso</dt>
          <dd className="mt-1 truncate text-[13.5px]">{email || "—"}</dd>
        </div>
        <div>
          <dt className="c-eyebrow">Idioma</dt>
          <dd className="mt-1 text-[13.5px]">Português (Portugal) · EUR</dd>
        </div>
      </dl>
      <button className="c-btn mt-4" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Terminar sessão
      </button>
    </Section>
  );
}

/* ---------------- Associação de WhatsApp (só quando não há canal) ---------------- */

function WhatsAppSection() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getWhatsAppLink);
  const doStart = useServerFn(startWhatsAppLink);
  const doUnlink = useServerFn(unlinkWhatsApp);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp", "link"],
    queryFn: () => fetchStatus(),
    refetchInterval: (q) => ((q.state.data as { status?: string } | undefined)?.status === "pending" ? 5000 : false),
  });

  const [phoneInput, setPhoneInput] = useState("");
  const [freshCode, setFreshCode] = useState<{ code: string; expiresAt: string } | null>(null);

  useEffect(() => {
    if (data?.phone && !phoneInput) setPhoneInput(formatDisplay(data.phone));
  }, [data?.phone, phoneInput]);

  useEffect(() => {
    if (data?.status === "linked" && freshCode) setFreshCode(null);
  }, [data?.status, freshCode]);

  const start = useMutation({
    mutationFn: async (phone: string) => doStart({ data: { phone } }),
    onSuccess: (r) => {
      setFreshCode({ code: r.code, expiresAt: r.expiresAt });
      qc.invalidateQueries({ queryKey: ["whatsapp", "link"] });
      toast.success("Código gerado. Envia-o pelo WhatsApp.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: async () => doUnlink({ data: { keepPhone: true } }),
    onSuccess: () => { setFreshCode(null); qc.invalidateQueries({ queryKey: ["whatsapp", "link"] }); toast.success("WhatsApp desassociado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = data?.status ?? "unlinked";
  const badge = useMemo(() => {
    if (status === "linked") return { label: "Ligado", cls: "c-badge ok" };
    if (status === "pending") return { label: "Pendente", cls: "c-badge warn" };
    return { label: "Não associado", cls: "c-badge" };
  }, [status]);

  return (
    <section className="c-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="c-section-title">Canal ligado</h2>
        <span className={badge.cls}>{badge.label}</span>
      </div>
      {isLoading ? (
        <p className="c-muted text-sm">A carregar…</p>
      ) : (
        <>
          <label htmlFor="wa-phone" className="c-eyebrow">Número de WhatsApp</label>
          <input
            id="wa-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+351 932 893 767"
            value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} maxLength={24}
            className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]"
          />
          <p className="c-muted mt-2 text-[12px]">Usa o formato internacional. Exemplo: +351932893767.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="c-cta"
              onClick={() => start.mutate(phoneInput)}
              disabled={start.isPending || phoneInput.replace(/\D+/g, "").length < 8}
            >
              {data?.phone ? "Alterar número" : "Associar WhatsApp"}
            </button>
            {data?.phone && status === "pending" && (
              <button className="c-btn-ghost" onClick={() => unlink.mutate()} disabled={unlink.isPending}>Cancelar</button>
            )}
          </div>
          {(freshCode || data?.pendingCode) && (
            <PendingCodeView
              code={freshCode?.code ?? null}
              expiresAt={freshCode?.expiresAt ?? data?.pendingCode?.expiresAt ?? null}
              phone={data?.phone ?? null}
              displayNumber={data?.displayNumber ?? null}
              attempts={data?.pendingCode?.attempts ?? 0}
              onRegenerate={() => start.mutate(phoneInput || data?.phone || "")}
              regenerating={start.isPending}
            />
          )}
        </>
      )}
    </section>
  );
}

function PendingCodeView({
  code, expiresAt, phone, displayNumber, attempts, onRegenerate, regenerating,
}: {
  code: string | null; expiresAt: string | null; phone: string | null;
  displayNumber: string | null; attempts: number; onRegenerate: () => void; regenerating: boolean;
}) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setRemaining("Expirado"); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const message = code ? `Ligar a conta do Assessor. Código: ${code}` : "";
  const waHref = displayNumber && message ? `https://wa.me/${displayNumber}?text=${encodeURIComponent(message)}` : null;

  return (
    <div className="mt-4 rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
      <p className="text-[13px]">
        Envia a mensagem abaixo, a partir do número <strong>{formatDisplay(phone ?? "")}</strong>, para o WhatsApp do teu assessor.
      </p>
      {code ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2">
          <code className="c-mono text-[17px] font-semibold tracking-wider">{code}</code>
          <button className="c-btn-ghost" onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Código copiado."))}>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </button>
        </div>
      ) : (
        <p className="c-muted mt-2 text-[12px]">
          Existe um pedido pendente. O código foi mostrado quando foi gerado — se já não o tens, gera um novo.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {waHref && (
          <a className="c-cta" href={waHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir WhatsApp
          </a>
        )}
        <button className="c-btn" onClick={onRegenerate} disabled={regenerating}>Gerar novo código</button>
        <div className="c-muted ml-auto flex items-center gap-1 text-[12px]">
          <Clock className="h-3.5 w-3.5" /> {remaining || "—"}
        </div>
      </div>
      {attempts > 0 && <p className="mt-2 text-[12px]" style={{ color: "var(--amber)" }}>Tentativas usadas: {attempts} de 5.</p>}
    </div>
  );
}

function formatDisplay(phone: string): string {
  const d = phone.replace(/\D+/g, "");
  return d ? `+${d}` : phone;
}
