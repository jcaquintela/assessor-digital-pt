import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { resetAccount } from "@/lib/seed-demo";
import { LogOut, MessageCircle, Copy, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ASSESSOR_NAME_DEFAULT, ASSESSOR_NAME_MAX, validateAssessorName } from "@/lib/assessor/assessor-name";
import { tierLabel } from "@/lib/subscription/tiers";
import {
  getWhatsAppLink,
  startWhatsAppLink,
  unlinkWhatsApp,
} from "@/lib/whatsapp/link.functions";
import { getSupremePreferences, updateSupremePreferences } from "@/lib/assessor/supreme/autonomy.functions";

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
  const [assessorName, setAssessorName] = useState<string>("Assessor");
  const [assessorNameDraft, setAssessorNameDraft] = useState<string>("Assessor");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
      setUid(data.user?.id ?? "");
      if (data.user?.id) {
        const { data: prof } = await supabase.from("profiles").select("account_kind, assessor_name" as never).eq("id", data.user.id).maybeSingle();
        if (prof && (prof as { account_kind?: string }).account_kind) {
          setAccountKind(((prof as { account_kind?: string }).account_kind === "demo" ? "demo" : "real"));
        }
        const nm = (prof as { assessor_name?: string } | null)?.assessor_name || "Assessor";
        setAssessorName(nm);
        setAssessorNameDraft(nm);
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

  const saveAssessorName = async () => {
    if (!uid) return;
    const v = validateAssessorName(assessorNameDraft);
    if (!v.ok) { toast.error(v.error ?? "Nome inválido."); return; }
    const { error } = await supabase.from("profiles").update({ assessor_name: v.value } as never).eq("id", uid);
    if (error) { toast.error(error.message); return; }
    setAssessorName(v.value);
    setAssessorNameDraft(v.value);
    toast.success("Nome do Assessor atualizado.");
  };

  const resetAssessorName = async () => {
    if (!uid) return;
    const { error } = await supabase.from("profiles").update({ assessor_name: ASSESSOR_NAME_DEFAULT } as never).eq("id", uid);
    if (error) { toast.error(error.message); return; }
    setAssessorName(ASSESSOR_NAME_DEFAULT);
    setAssessorNameDraft(ASSESSOR_NAME_DEFAULT);
    toast.success("Nome reposto.");
  };

  return (
    <AppShell>
      <PageHeader title="Definições" subtitle="Preferências, conta e integrações." />
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">Beta</Badge>
        <span>Revê sempre os rascunhos antes de confirmar. Os dados são reais e ficam na tua conta.</span>
      </div>
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
          <CardHeader><CardTitle className="text-base">Assessor</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="assessor-name">Nome do meu Assessor</Label>
            <Input
              id="assessor-name"
              value={assessorNameDraft}
              onChange={(e) => setAssessorNameDraft(e.target.value)}
              maxLength={ASSESSOR_NAME_MAX}
              placeholder="Assessor"
            />
            <p className="text-xs text-muted-foreground">Ex: "Maria", "Alex". Máx. {ASSESSOR_NAME_MAX} caracteres. Atual: {assessorName}.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveAssessorName} disabled={assessorNameDraft.trim() === assessorName}>Guardar</Button>
              <Button size="sm" variant="outline" onClick={resetAssessorName} disabled={assessorName === ASSESSOR_NAME_DEFAULT}>Repor "{ASSESSOR_NAME_DEFAULT}"</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Dados</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start text-destructive" onClick={doReset} disabled={busy}>
              Repor conta (apagar tudo)
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Integrações</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {["Google Calendar", "Microsoft Outlook", "Faturação (Stripe)"].map((name) => (
              <div key={name} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span>{name}</span>
                <Badge variant="outline" className="text-muted-foreground">Planeado</Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              O WhatsApp é a única integração activa — configura-a no cartão abaixo.
            </p>
          </CardContent>
        </Card>
        <WhatsAppSection />
        <SupremeSection />
      </div>
    </AppShell>
  );
}

function SupremeSection() {
  const qc = useQueryClient();
  const fetchPrefs = useServerFn(getSupremePreferences);
  const savePrefs = useServerFn(updateSupremePreferences);
  const { data } = useQuery({ queryKey: ["supreme", "prefs"], queryFn: () => fetchPrefs() });
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => savePrefs({ data: patch }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supreme", "prefs"] }); toast.success("Guardado."); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data?.enabled) return null;
  const prefs = (data.preferences ?? {}) as {
    morning_briefing_enabled?: boolean;
    morning_time?: string;
    autonomy_level?: string;
    max_daily_nudges?: number;
  };
  // Fonte de verdade para gating: efectiveAutonomy (já capado ao tier)
  // e autonomyAllowed (níveis desbloqueados). Backend recusa se subires.
  const level = (data as any).effectiveAutonomy ?? prefs.autonomy_level ?? "conservador";
  const allowed = new Set<string>(((data as any).autonomyAllowed as string[]) ?? ["conservador"]);
  const tier = (data as any).tier as string | undefined;
  const clamped = Boolean((data as any).autonomyClamped);
  return (
    <Card className="md:col-span-2 border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">Assessor Supremo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Autonomia do meu Assessor</Label>
          <div className="flex flex-wrap gap-2">
            {(["conservador", "balanced", "proativo"] as const).map((lvl) => {
              const isAllowed = allowed.has(lvl);
              return (
                <Button
                  key={lvl}
                  size="sm"
                  variant={level === lvl ? "default" : "outline"}
                  disabled={!isAllowed}
                  title={isAllowed ? undefined : `Disponível a partir de um plano superior (tens ${tierLabel(tier)}).`}
                  onClick={() => save.mutate({ autonomy_level: lvl })}
                >
                  {lvl === "balanced" ? "Equilibrado" : lvl === "conservador" ? "Conservador" : "Proativo"}
                  {!isAllowed ? " 🔒" : ""}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Conservador pede confirmação para quase tudo. Equilibrado executa ações de baixo risco. Proativo actua dentro dos limites permitidos. Ações sensíveis pedem sempre confirmação.
          </p>
          {clamped ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              A tua preferência guardada é mais alta que o teu plano actual permite. O Assessor está a operar em <strong>{level}</strong>. Se subires de plano, a preferência original volta a aplicar-se.
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="briefing-time">Hora do briefing da manhã</Label>
            <Input
              id="briefing-time"
              type="time"
              defaultValue={prefs.morning_time ?? "08:00"}
              onBlur={(e) => save.mutate({ morning_time: e.target.value })}
            />
            <Button
              size="sm"
              variant={prefs.morning_briefing_enabled === false ? "outline" : "default"}
              onClick={() => save.mutate({ morning_briefing_enabled: !(prefs.morning_briefing_enabled ?? true) })}
            >
              {prefs.morning_briefing_enabled === false ? "Ativar briefing" : "Desativar briefing"}
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-nudges">Máx. de sugestões por dia</Label>
            <Input
              id="max-nudges"
              type="number"
              min={0}
              max={20}
              defaultValue={prefs.max_daily_nudges ?? 6}
              onBlur={(e) => save.mutate({ max_daily_nudges: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Só as sugestões urgentes e importantes chegam ao WhatsApp.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WhatsAppSection() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getWhatsAppLink);
  const doStart = useServerFn(startWhatsAppLink);
  const doUnlink = useServerFn(unlinkWhatsApp);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp", "link"],
    queryFn: () => fetchStatus(),
    refetchInterval: (q) => {
      const s = (q.state.data as { status?: string } | undefined)?.status;
      return s === "pending" ? 5000 : false;
    },
  });

  const [phoneInput, setPhoneInput] = useState("");
  const [freshCode, setFreshCode] = useState<{ code: string; expiresAt: string } | null>(null);

  useEffect(() => {
    if (data?.phone && !phoneInput) setPhoneInput(formatDisplay(data.phone));
  }, [data?.phone, phoneInput]);

  // Clear the freshly-generated code once the account transitions to linked.
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
    onSuccess: () => {
      setFreshCode(null);
      qc.invalidateQueries({ queryKey: ["whatsapp", "link"] });
      toast.success("WhatsApp desassociado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = data?.status ?? "unlinked";
  const badge = useMemo(() => {
    if (status === "linked") return { label: "Ligado", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" };
    if (status === "pending") return { label: "Pendente", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
    return { label: "Não associado", cls: "bg-slate-500/10 text-slate-600 border-slate-500/30" };
  }, [status]);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </CardTitle>
          <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : status === "linked" ? (
          <LinkedView data={data!} onUnlink={() => unlink.mutate()} pending={unlink.isPending} />
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="wa-phone">Número de WhatsApp</Label>
              <Input
                id="wa-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+351 932 893 767"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                maxLength={24}
              />
              <p className="text-xs text-muted-foreground">
                Usa o formato internacional. Exemplo: +351932893767.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => start.mutate(phoneInput)}
                disabled={start.isPending || phoneInput.replace(/\D+/g, "").length < 8}
              >
                {data?.phone ? "Alterar número" : "Associar WhatsApp"}
              </Button>
              {data?.phone && status === "pending" && (
                <Button size="sm" variant="ghost" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
                  Cancelar
                </Button>
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
      </CardContent>
    </Card>
  );
}

function LinkedView({
  data,
  onUnlink,
  pending,
}: {
  data: { phone: string | null; linkedAt: string | null };
  onUnlink: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
        <div className="text-sm">
          <div className="font-medium">Número associado: {formatDisplay(data.phone ?? "")}</div>
          {data.linkedAt && (
            <div className="text-xs text-muted-foreground">
              Ligado em {new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.linkedAt))}
            </div>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onUnlink} disabled={pending}>
        Desassociar WhatsApp
      </Button>
    </div>
  );
}

function PendingCodeView({
  code,
  expiresAt,
  phone,
  displayNumber,
  attempts,
  onRegenerate,
  regenerating,
}: {
  code: string | null;
  expiresAt: string | null;
  phone: string | null;
  displayNumber: string | null;
  attempts: number;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [remaining, setRemaining] = useState<string>("");
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
  const waHref =
    displayNumber && message
      ? `https://wa.me/${displayNumber}?text=${encodeURIComponent(message)}`
      : null;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
      <p className="text-sm">
        Envia a mensagem abaixo, a partir do número <strong>{formatDisplay(phone ?? "")}</strong>, para o WhatsApp do Assessor.
      </p>
      {code ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
          <code className="text-lg font-semibold tracking-wider">{code}</code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(code).then(() => toast.success("Código copiado."));
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Existe um pedido pendente. O código foi mostrado quando foi gerado — se já não o tens, gera um novo.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {waHref && (
          <Button size="sm" asChild>
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir WhatsApp
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regenerating}>
          Gerar novo código
        </Button>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {remaining || "—"}
        </div>
      </div>
      {attempts > 0 && (
        <p className="text-xs text-amber-600">Tentativas usadas: {attempts} de 5.</p>
      )}
    </div>
  );
}

function formatDisplay(phone: string): string {
  const d = phone.replace(/\D+/g, "");
  if (!d) return phone;
  return `+${d}`;
}