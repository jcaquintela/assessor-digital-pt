import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, MessageCircle, Copy, ExternalLink, Clock, Lock, CalendarDays, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ASSESSOR_NAME_DEFAULT, ASSESSOR_NAME_MAX, validateAssessorName } from "@/lib/assessor/assessor-name";
import { tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";
import { CHANNEL_LABEL, maskContact, useLinkedChannel } from "@/lib/assessor/use-linked-channel";
import {
  getWhatsAppLink,
  startWhatsAppLink,
  unlinkWhatsApp,
} from "@/lib/whatsapp/link.functions";
import { getSupremePreferences, updateSupremePreferences } from "@/lib/assessor/supreme/autonomy.functions";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";

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
        <AssessorNameSection />
        <SupremeSection />
        <CanalSection />
        <CalendarioSection />
        <ContaSection />
      </div>
    </AppShell>
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
  const { channel, externalId, linkedAt, loading } = useLinkedChannel();

  if (loading) {
    return <Section title="Canal ligado"><p className="c-muted text-sm">A carregar…</p></Section>;
  }

  if (channel && externalId) {
    return (
      <Section title="Canal ligado">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="c-avatar"><MessageCircle className="h-4 w-4" /></div>
            <div>
              <div className="text-[14px] font-semibold">{CHANNEL_LABEL[channel]}</div>
              <div className="c-mono c-muted text-[12.5px]">{maskContact(channel, externalId)}</div>
            </div>
          </div>
          <span className="c-badge ok">Ligado</span>
        </div>
        {linkedAt && (
          <p className="c-muted mt-3 text-[12px]">
            Ligado em {new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(linkedAt))}.
          </p>
        )}
      </Section>
    );
  }

  return <WhatsAppSection />;
}

/* ---------------- Calendário (em breve) ---------------- */

function CalendarioSection() {
  return (
    <Section title="Calendário">
      <div className="grid gap-3 sm:grid-cols-2">
        {["Google Calendar", "Microsoft Outlook"].map((nome) => (
          <div key={nome} className="flex items-center justify-between rounded-[13px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="c-muted h-4 w-4" />
              <div>
                <div className="text-[13.5px] font-semibold">{nome}</div>
                <span className="c-badge mt-1 inline-flex">Em breve</span>
              </div>
            </div>
            <button className="c-btn" disabled>Ligar</button>
          </div>
        ))}
      </div>
      <p className="c-muted mt-3 text-[12px] leading-relaxed">
        Quando ligares o calendário, os compromissos que combinares na conversa entram lá sozinhos.
      </p>
    </Section>
  );
}

/* ---------------- Conta ---------------- */

function ContaSection() {
  const navigate = useNavigate();
  const { data: tierData } = useEffectiveTier();
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
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="c-eyebrow">Email</dt>
          <dd className="mt-1 truncate text-[13.5px]">{email || "—"}</dd>
        </div>
        <div>
          <dt className="c-eyebrow">Plano</dt>
          <dd className="mt-1 text-[13.5px]">{tierLabel(tierData?.tier)}</dd>
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
