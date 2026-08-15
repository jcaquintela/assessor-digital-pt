import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, MessageCircle, Copy, ExternalLink, Clock, Lock, CalendarDays, Mail, Check, AlertTriangle, CreditCard, Info } from "lucide-react";
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
import { canUseEmailModule } from "@/lib/subscription/email-gate";
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
import { GMAIL_CONNECTOR_ID } from "@/lib/email/gmail/provider";
import { OUTLOOK_CONNECTOR_ID } from "@/lib/email/outlook/provider";
import {
  getOutlookMailStatus,
  startOutlookMailConnect,
  disconnectOutlookMail,
} from "@/lib/email/outlook/outlook.functions";
import {
  getGmailStatus,
  startGmailConnect,
  disconnectGmail,
} from "@/lib/email/gmail/gmail.functions";
import {
  getActiveProviders,
  setActiveProviderFn,
} from "@/lib/providers/active.functions";
import { MAIL_PROVIDER_LABEL, type MailProvider } from "@/lib/email/providers";
import { decideContentAccess, listMyConsentRequests } from "@/lib/admin/consent.functions";

export const Route = createFileRoute("/_authenticated/definicoes")({
  head: () => ({
    meta: [
      { title: "Definições — Afonso" },
      { name: "description", content: "O teu assessor, autonomia, canal ligado e conta." },
      { property: "og:title", content: "Definições — Afonso" },
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

function RetentionHint() {
  return (
    <p className="c-muted mt-3 flex items-start gap-2 text-[12px] leading-relaxed">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Os teus dados são guardados durante 21 dias (conversas) e 7 dias (documentos).{" "}
        <Link to="/sobre-a-ia" className="underline underline-offset-2 hover:text-[var(--brass-dark)]">
          Ver política de retenção
        </Link>
        .
      </span>
    </p>
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
        <NotificacoesSection />
        <CanalSection />
        <CalendarioSection />
        <EmailSection />
        <PrivacidadeSection />
        <ContaSection />
      </div>
    </AppShell>
  );
}

/* ---------------- Privacidade das conversas ---------------- */

function PrivacidadeSection() {
  const listFn = useServerFn(listMyConsentRequests);
  const decideFn = useServerFn(decideContentAccess);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["consent-requests"],
    queryFn: () => listFn(),
  });
  const decide = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "denied" | "revoked" }) =>
      decideFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consent-requests"] });
      toast.success("Decisão registada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data ?? []) as {
    id: string;
    reason: string;
    status: string;
    expires_at: string | null;
    created_at: string;
  }[];
  const pending = rows.filter((r) => r.status === "pending");
  const live = rows.filter(
    (r) => r.status === "approved" && (!r.expires_at || new Date(r.expires_at) > new Date()),
  );

  return (
    <Section title="Privacidade das conversas">
      <p className="c-muted mb-3 text-sm">
        Ninguém da equipa lê as tuas conversas sem tu autorizares. Para resolver um problema podem pedir acesso —
        tu decides, dura 2 horas e fica registado.
      </p>
      {isLoading ? (
        <p className="c-muted text-sm">A carregar…</p>
      ) : pending.length === 0 && live.length === 0 ? (
        <p className="c-muted text-sm">Não há pedidos de acesso às tuas conversas.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((r) => (
            <div key={r.id} className="c-card p-3">
              <p className="text-sm">{r.reason}</p>
              <p className="c-muted mt-1 text-xs">
                Pedido em {new Date(r.created_at).toLocaleString("pt-PT")}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="c-btn tap-44"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, decision: "approved" })}
                >
                  Autorizar 2 horas
                </button>
                <button
                  type="button"
                  className="c-btn-ghost tap-44"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, decision: "denied" })}
                >
                  Recusar
                </button>
              </div>
            </div>
          ))}
          {live.map((r) => (
            <div key={r.id} className="c-card p-3">
              <p className="text-sm">
                Acesso autorizado{r.expires_at ? ` até ${new Date(r.expires_at).toLocaleString("pt-PT")}` : ""}.
              </p>
              <button
                type="button"
                className="c-btn-ghost tap-44 mt-2"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, decision: "revoked" })}
              >
                Retirar acesso agora
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
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
    reminder_lead_minutes?: number | null;
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
      <RetentionHint />
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
        <div>
          <label htmlFor="reminder-lead" className="c-eyebrow">Antecedência dos lembretes</label>
          <select
            id="reminder-lead"
            defaultValue={
              prefs.reminder_lead_minutes === null || prefs.reminder_lead_minutes === undefined
                ? "default"
                : String(prefs.reminder_lead_minutes)
            }
            onChange={(e) => save.mutate({
              reminder_lead_minutes: e.target.value === "default" ? null : Number(e.target.value),
            })}
            className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]"
          >
            <option value="default">
              Como está definido na plataforma ({((data as any).globalReminderLeadMinutes ?? 0) === 0
                ? "à hora"
                : `${(data as any).globalReminderLeadMinutes} min antes`})
            </option>
            <option value="0">À hora do compromisso</option>
            <option value="5">5 min antes</option>
            <option value="10">10 min antes</option>
            <option value="15">15 min antes</option>
            <option value="30">30 min antes</option>
            <option value="60">1 hora antes</option>
          </select>
          <p className="c-muted mt-2 text-[12px]">Aplica-se aos lembretes de tarefas e compromissos novos.</p>
        </div>
      </div>
    </Section>
  );
}

// Leitura leve do nome (evita import circular de estilos/hooks pesados).
function useAssessorNameLite() {
  return useAssessorNameLiteImpl();
}

/* ---------------- Notificações proativas ---------------- */

function NotificacoesSection() {
  const qc = useQueryClient();
  const fetchPrefs = useServerFn(getSupremePreferences);
  const savePrefs = useServerFn(updateSupremePreferences);
  const { data } = useQuery({ queryKey: ["supreme", "prefs"], queryFn: () => fetchPrefs() });
  const { channels } = useLinkedChannel();
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => savePrefs({ data: patch }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supreme", "prefs"] }); toast.success("Guardado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const prefs = (data?.preferences ?? {}) as {
    proactive_push_enabled?: boolean;
    evening_checkin_enabled?: boolean;
    evening_checkin_time?: string;
    morning_time?: string;
    confirm_document_send?: boolean;
  };
  const on = prefs.proactive_push_enabled === true;
  const hasChannel = (channels ?? []).length > 0;

  return (
    <Section title="Notificações proativas">
      <p className="c-muted text-[13px] leading-relaxed">
        De manhã recebes as prioridades do dia. Ao fim da tarde pergunto-te como correram os
        seguimentos, com botões para responderes num toque.
      </p>
      <div className="mt-4 flex items-center justify-between gap-4 rounded-[13px] border border-[var(--line)] p-4">
        <div>
          <p className="text-[13.5px] font-semibold">Receber notificações proativas</p>
          <p className="c-muted mt-1 text-[12px]">
            {hasChannel ? "Chegam pelo teu canal principal." : "Liga o WhatsApp ou o Telegram primeiro."}
          </p>
        </div>
        <button
          className={on ? "c-btn" : "c-btn-ghost"}
          disabled={!hasChannel || save.isPending}
          onClick={() => save.mutate({ proactive_push_enabled: !on })}
        >
          {on ? "Ligado" : "Desligado"}
        </button>
      </div>
      {on && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="push-manha" className="c-eyebrow">Hora do push da manhã</label>
            <input
              id="push-manha" type="time" defaultValue={(prefs.morning_time ?? "08:00").slice(0, 5)}
              onBlur={(e) => save.mutate({ morning_time: e.target.value })}
              className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]"
            />
          </div>
          <div>
            <label htmlFor="push-tarde" className="c-eyebrow">Hora do check-in da tarde</label>
            <input
              id="push-tarde" type="time" defaultValue={(prefs.evening_checkin_time ?? "18:00").slice(0, 5)}
              onBlur={(e) => save.mutate({ evening_checkin_time: e.target.value })}
              className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]"
            />
            <button
              className="c-btn mt-2"
              onClick={() => save.mutate({ evening_checkin_enabled: !(prefs.evening_checkin_enabled ?? true) })}
            >
              {prefs.evening_checkin_enabled === false ? "Ativar check-in" : "Desativar check-in"}
            </button>
          </div>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-4 rounded-[13px] border border-[var(--line)] p-4">
        <div>
          <p className="text-[13.5px] font-semibold">Perguntar antes de enviar um documento</p>
          <p className="c-muted mt-1 text-[12px]">
            Quando escolheres um documento na conversa, confirmo contigo antes de o enviar.
          </p>
        </div>
        <button
          className={prefs.confirm_document_send ? "c-btn" : "c-btn-ghost"}
          disabled={save.isPending}
          onClick={() => save.mutate({ confirm_document_send: !prefs.confirm_document_send })}
        >
          {prefs.confirm_document_send ? "Ligado" : "Desligado"}
        </button>
      </div>
      <RetentionHint />
      <p className="c-muted mt-3 text-[12px] leading-relaxed">
        No WhatsApp, se já passaram mais de 24 horas desde a tua última mensagem, a Meta só deixa
        passar mensagens com template aprovado — nesse caso o envio fica em espera até à aprovação.
      </p>
    </Section>
  );
}

function useAssessorNameLiteImpl() {
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
  return <CalendarioSectionInner />;
}

/**
 * Escolha explícita do provedor ativo por modalidade. Só aparece quando há
 * mais do que um ligado — com um só, não há nada a decidir.
 */
function ActiveProviderPicker(props: {
  modality: "calendar" | "mail";
  labels: Record<string, string>;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["active-providers"], queryFn: () => getActiveProviders() });
  const state = props.modality === "calendar" ? q.data?.calendar : q.data?.mail;
  const [saving, setSaving] = useState(false);
  if (!state || state.options.length < 2) return null;

  const escolher = async (provider: string) => {
    setSaving(true);
    try {
      await setActiveProviderFn({ data: { modality: props.modality, provider } });
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
      toast.success(`${props.labels[provider] ?? provider} passou a ser o principal.`);
    } catch {
      toast.error("Não consegui guardar a escolha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
      <div className="text-[13px] font-semibold">
        {props.modality === "calendar" ? "Calendário principal" : "Caixa de correio principal"}
      </div>
      <p className="c-muted mt-1 text-[12px]">
        {state.status === "needs_choice"
          ? "Tens os dois ligados. Escolhe qual devo usar — não uso os dois ao mesmo tempo."
          : "É este que eu uso. Podes trocar quando quiseres."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {state.options.map((p) => (
          <button
            key={p}
            className={`c-btn${state.provider === p ? " ok" : ""}`}
            disabled={saving}
            onClick={() => escolher(p)}
          >
            {state.provider === p ? "✓ " : ""}{props.labels[p] ?? p}
          </button>
        ))}
      </div>
    </div>
  );
}

function CalendarioSectionInner() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<CalendarProvider | null>(null);
  const [mudar, setMudar] = useState(false);

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
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
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
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
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
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
      toast.success(applied > 0 ? `${applied} alteração(ões) trazida(s) do calendário.` : "Já estava tudo em dia.");
    } catch {
      toast.error("Não consegui sincronizar agora.");
    } finally {
      setBusy(null);
    }
  };

  const rows = status.data ?? CALENDAR_PROVIDERS.map((p) => ({
    provider: p, connected: false, lastPolledAt: null as string | null, lastError: null as string | null,
    needsReconnect: false,
  }));
  const algumLigado = rows.some((r) => r.connected);
  // Um cartão por modalidade: com um provedor ligado só se vê esse. O outro
  // aparece a pedido, em "Mudar de provedor" — nunca dois lado a lado.
  const visiveis = algumLigado && !mudar ? rows.filter((r) => r.connected) : rows;

  return (
    <Section title="Calendário">
      <div className={`grid gap-3${visiveis.length > 1 ? " sm:grid-cols-2" : ""}`}>
        {visiveis.map((r) => (
          <div key={r.provider} className="flex items-center justify-between rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="c-muted h-4 w-4" />
              <div>
                <div className="text-[13.5px] font-semibold">{CALENDAR_PROVIDER_LABEL[r.provider as CalendarProvider]}</div>
                <span className={`c-badge mt-1 inline-flex${r.connected && !r.needsReconnect ? " ok" : ""}`}>
                  {r.needsReconnect ? "Autorização expirada" : r.connected ? "Ligado" : "Não ligado"}
                </span>
                {r.needsReconnect && (
                  <p className="c-muted mt-1 text-[12px]">
                    O acesso deixou de ser válido. Volta a ligar para o Afonso continuar a ver a tua agenda.
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {(!r.connected || r.needsReconnect) && (
                <button className="c-btn" disabled={busy !== null} onClick={() => ligar(r.provider as CalendarProvider)}>
                  {busy === r.provider ? "A ligar…" : r.needsReconnect ? "Voltar a ligar" : "Ligar"}
                </button>
              )}
              {r.connected && (
                <button className="c-btn" disabled={busy !== null} onClick={() => desligar(r.provider as CalendarProvider)}>
                  Desligar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {algumLigado && rows.some((r) => !r.connected) && (
        <button className="c-btn mt-3" onClick={() => setMudar((v) => !v)}>
          {mudar ? "Deixar como está" : "Mudar de provedor"}
        </button>
      )}
      {mudar && (
        <p className="c-muted mt-2 text-[12px]">
          Liga o novo calendário e desliga o antigo — eu uso só um.
        </p>
      )}
      {algumLigado && (
        <div className="mt-3 flex items-center gap-3">
          <button className="c-btn" disabled={busy !== null} onClick={sincronizar}>Sincronizar agora</button>
          <span className="c-muted text-[12px]">
            A verificação automática corre sozinha de 10 em 10 minutos.
          </span>
        </div>
      )}
      <ActiveProviderPicker modality="calendar" labels={CALENDAR_PROVIDER_LABEL} />
      <p className="c-muted mt-3 text-[12px] leading-relaxed">
        Os compromissos que combinares na conversa entram no teu calendário sozinhos, e o que marcares
        directamente no calendário aparece aqui. Se editares dos dois lados ao mesmo tempo, fica a
        alteração mais recente.
      </p>
    </Section>
  );
}

/* ---------------- Email (Gmail + Outlook) ---------------- */

type MailCardProps = {
  label: string;
  connectorId: string;
  queryKey: string;
  popupName: string;
  note?: string;
  expiredNote?: string;
  load: () => Promise<{ connected: boolean; needsReconnect: boolean; emailAddress: string | null }>;
  start: () => Promise<{ authorizationUrl: string }>;
  stop: () => Promise<unknown>;
};

function MailProviderCard(props: MailCardProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: [props.queryKey],
    queryFn: () => props.load(),
  });

  const waitForPopup = (popup: Window) =>
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
          event.data?.connectorId !== props.connectorId ||
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

  const ligar = async () => {
    const popup = window.open("", props.popupName, "width=620,height=760");
    if (!popup) { toast.error("Permite janelas pop-up para ligares o email."); return; }
    setBusy(true);
    try {
      const { authorizationUrl } = await props.start();
      const done = waitForPopup(popup);
      popup.location.href = authorizationUrl;
      await done;
      await qc.invalidateQueries({ queryKey: [props.queryKey] });
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
      toast.success(`${props.label} ligado.`);
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Não consegui ligar o email.");
    } finally {
      setBusy(false);
    }
  };

  const desligar = async () => {
    setBusy(true);
    try {
      await props.stop();
      await qc.invalidateQueries({ queryKey: [props.queryKey] });
      await qc.invalidateQueries({ queryKey: ["active-providers"] });
      toast.success(`${props.label} desligado.`);
    } catch {
      toast.error("Não consegui desligar.");
    } finally {
      setBusy(false);
    }
  };

  const r = status.data ?? { connected: false, needsReconnect: false, emailAddress: null as string | null };

  return (
    <div className="flex items-center justify-between rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
          <div className="flex items-center gap-3">
            <Mail className="c-muted h-4 w-4" />
            <div>
              <div className="text-[13.5px] font-semibold">{props.label}</div>
              <span className={`c-badge mt-1 inline-flex${r.connected && !r.needsReconnect ? " ok" : ""}`}>
                {r.needsReconnect ? "Autorização expirada" : r.connected ? "Ligado" : "Não ligado"}
              </span>
              {r.connected && r.emailAddress && (
                <p className="c-muted mt-1 text-[12px]">{r.emailAddress}</p>
              )}
              {r.needsReconnect && props.expiredNote && (
                <p className="c-muted mt-1 text-[12px]">{props.expiredNote}</p>
              )}
              {!r.connected && props.note && (
                <p className="c-muted mt-1 text-[12px]">{props.note}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(!r.connected || r.needsReconnect) && (
              <button className="c-btn" disabled={busy} onClick={ligar}>
                {busy ? "A ligar…" : r.needsReconnect ? "Voltar a ligar" : "Ligar"}
              </button>
            )}
            {r.connected && (
              <button className="c-btn" disabled={busy} onClick={desligar}>Desligar</button>
            )}
          </div>
    </div>
  );
}

function EmailSection() {
  const tier = useEffectiveTier();
  const active = useQuery({ queryKey: ["active-providers"], queryFn: () => getActiveProviders() });
  const [mudar, setMudar] = useState(false);

  // Gate de plano: o mesmo `effective_tier()` usado no resto do produto.
  // `past_due` não corta — quem já é Pro continua a ler o email.
  if (tier.data && !canUseEmailModule(tier.data.tier)) {
    return (
      <Section title="Email">
        <div className="rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
          <div className="flex items-center gap-3">
            <Mail className="c-muted h-4 w-4" />
            <div className="text-[13.5px] font-semibold">Email — plano Pro</div>
          </div>
          <p className="c-muted mt-2 text-[12px] leading-relaxed">
            Com o plano Pro eu leio a tua caixa de correio, digo-te o que interessa de gente
            conhecida e preparo respostas — sem nunca enviar nada sozinho.
          </p>
          <Link to="/subscricao" className="c-btn mt-3 inline-flex">Ver o plano Pro</Link>
        </div>
      </Section>
    );
  }

  const cards: Array<{ id: MailProvider; card: React.ReactNode }> = [
    {
      id: "gmail",
      card: (
        <MailProviderCard
          key="gmail"
          label="Gmail"
          connectorId={GMAIL_CONNECTOR_ID}
          queryKey="gmail-status"
          popupName="afonso-gmail-oauth"
          expiredNote="O Google corta o acesso de 7 em 7 dias enquanto estamos em testes. Volta a ligar e continuo daí."
          load={() => getGmailStatus()}
          start={() => startGmailConnect()}
          stop={() => disconnectGmail()}
        />
      ),
    },
    {
      id: "outlook",
      card: (
        <MailProviderCard
          key="outlook"
          label="Outlook"
          connectorId={OUTLOOK_CONNECTOR_ID}
          queryKey="outlook-mail-status"
          popupName="afonso-outlook-mail-oauth"
          note="É a mesma ligação do teu Outlook Calendar. Vais ver um novo ecrã de autorização — é normal, é só para acrescentar o email."
          expiredNote="Perdi o acesso à tua caixa de correio. Volta a ligar e continuo daí."
          load={() => getOutlookMailStatus()}
          start={() => startOutlookMailConnect()}
          stop={() => disconnectOutlookMail()}
        />
      ),
    },
  ];
  const ligados = (active.data?.mail.options ?? []) as MailProvider[];
  const visiveis = ligados.length > 0 && !mudar
    ? cards.filter((c) => ligados.includes(c.id))
    : cards;

  return (
    <Section title="Email">
      <div className={`grid gap-3${visiveis.length > 1 ? " sm:grid-cols-2" : ""}`}>
        {visiveis.map((c) => c.card)}
      </div>
      {ligados.length > 0 && ligados.length < cards.length && (
        <button className="c-btn mt-3" onClick={() => setMudar((v) => !v)}>
          {mudar ? "Deixar como está" : "Mudar de provedor"}
        </button>
      )}
      {mudar && (
        <p className="c-muted mt-2 text-[12px]">
          Liga a nova caixa e desliga a antiga — eu consulto só uma.
        </p>
      )}
      <ActiveProviderPicker
        modality="mail"
        labels={MAIL_PROVIDER_LABEL as Record<MailProvider, string>}
      />
      <p className="c-muted mt-3 text-[12px] leading-relaxed">
        O Afonso lê o teu email e prepara rascunhos, mas nunca envia nada sozinho. O calendário
        continua em "Calendário" — aqui é só a caixa de correio.
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

  const message = code ? `Ligar a conta do ${ASSESSOR_NAME_DEFAULT}. Código: ${code}` : "";
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
