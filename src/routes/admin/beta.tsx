import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listBetaTesters,
  extendBeta,
  endBetaNow,
  convertBeta,
  createBetaInvites,
  runBetaExpiryNow,
  type BetaTester,
  type BetaInviteResult,
} from "@/lib/admin/beta.functions";
import { getMyAdminRole } from "@/lib/admin.functions";
import { Badge, Empty, PageTitle, SectionTitle } from "@/components/admin/ui";
import { TIER_DISPLAY_NAME, type SubscriptionTier } from "@/lib/subscription/tiers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/beta")({
  head: () => ({
    meta: [
      { title: "Beta testers — Afonso admin" },
      { name: "description", content: "Gestão dos períodos de teste: prazos, extensões e conversões." },
    ],
  }),
  component: BetaPage,
});

const TIERS: SubscriptionTier[] = ["base", "consultor", "pro", "hub"];

function fmt(v: string | null) {
  return v ? new Date(v).toLocaleDateString("pt-PT") : "—";
}

function BetaPage() {
  const qc = useQueryClient();
  const roleFn = useServerFn(getMyAdminRole);
  const listFn = useServerFn(listBetaTesters);
  const extendFn = useServerFn(extendBeta);
  const endFn = useServerFn(endBetaNow);
  const convertFn = useServerFn(convertBeta);
  const inviteFn = useServerFn(createBetaInvites);
  const expiryFn = useServerFn(runBetaExpiryNow);

  const { data: me } = useQuery({ queryKey: ["admin", "my-role"], queryFn: () => roleFn() });
  const isSuper = me?.role === "super_admin";
  const { data: testers, isPending } = useQuery({
    queryKey: ["admin", "beta-testers"],
    queryFn: () => listFn(),
  });

  const [extending, setExtending] = useState<BetaTester | null>(null);
  const [days, setDays] = useState(14);
  const [batchOpen, setBatchOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [template, setTemplate] = useState(
    "Olá {nome}! 👋\n\nTens acesso ao Afonso — o teu Assessor pessoal — durante {dias} dias no plano {plano}.\n\nEnvia este código por WhatsApp ou Telegram ao Afonso para começares:\n\n{codigo}\n\nFica à vontade para responder com dúvidas.",
  );
  const [generated, setGenerated] = useState<BetaInviteResult[] | null>(null);


  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "beta-testers"] });
  const run = (label: string, p: Promise<unknown>) =>
    p
      .then(() => {
        toast.success(label);
        invalidate();
      })
      .catch((e: Error) => toast.error(e.message || "Não foi possível concluir."));

  const batch = useMutation({
    mutationFn: async () => {
      const invites = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line, i) => {
          const [name, whatsapp, email, tier, d] = line.split(/\s*[,;]\s*/);
          if (!name) throw new Error(`Linha ${i + 1}: falta o nome.`);
          const t = (tier ?? "pro").toLowerCase();
          if (!TIERS.includes(t as SubscriptionTier)) throw new Error(`Linha ${i + 1}: plano inválido (${tier}).`);
          const nd = Number(d ?? 14);
          if (!Number.isFinite(nd) || nd < 1) throw new Error(`Linha ${i + 1}: dias inválidos.`);
          return {
            name,
            whatsapp: whatsapp ?? "",
            email: email ?? "",
            tier: t as SubscriptionTier,
            days: Math.round(nd),
          };
        });
      if (!invites.length) throw new Error("Escreve pelo menos uma linha.");
      return await inviteFn({ data: { invites } });
    },
    onSuccess: (r) => {
      setGenerated(r.codes);
      toast.success(`${r.codes.length} código(s) gerado(s).`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyAll = () => {
    if (!generated) return;
    const txt = generated
      .map(
        (g) =>
          `${g.name}${g.whatsapp ? ` (${g.whatsapp})` : ""} — ${TIER_DISPLAY_NAME[g.tier as SubscriptionTier]}, ${g.days} dias — código: ${g.code}`,
      )
      .join("\n");
    navigator.clipboard.writeText(txt).then(() => toast.success("Copiado."));
  };

  return (
    <div>
      <PageTitle
        title="Beta testers"
        sub="Quem está em período de teste, até quando, e o que fazer quando o prazo chega ao fim."
      />

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          className="admin-btn"
          disabled={!isSuper}
          onClick={() =>
            run("Expirações processadas.", expiryFn({ data: undefined as never }) as Promise<unknown>)
          }
        >
          Correr expiração agora
        </button>
        <button type="button" className="admin-btn-primary" disabled={!isSuper} onClick={() => setBatchOpen(true)}>
          + Convidar em lote
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Contacto</th>
            <th>Plano</th>
            <th>Início</th>
            <th>Fim</th>
            <th>Dias</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {isPending ? (
            <tr>
              <td colSpan={7} className="mini">A carregar…</td>
            </tr>
          ) : (testers ?? []).length === 0 ? (
            <tr>
              <td colSpan={7} className="mini">Ninguém em período de teste.</td>
            </tr>
          ) : (
            (testers ?? []).map((t) => {
              const urgent = t.days_left !== null && t.days_left < 3;
              return (
                <tr key={t.id}>
                  <td>{t.name || "—"}</td>
                  <td className="mini">
                    {t.phone || "—"}
                    <br />
                    <span style={{ color: "var(--muted)" }}>{t.email || "—"}</span>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{t.channel}</span>
                  </td>
                  <td>{TIER_DISPLAY_NAME[(t.tier as SubscriptionTier) ?? "base"] ?? t.tier}</td>
                  <td className="mini">{fmt(t.started_at)}</td>
                  <td className="mini">{fmt(t.expires_at)}</td>
                  <td style={urgent ? { color: "var(--coral)", fontWeight: 600 } : undefined}>
                    {t.days_left === null ? "sem prazo" : t.days_left < 0 ? "expirado" : `${t.days_left} d`}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={!isSuper}
                        onClick={() => {
                          setExtending(t);
                          setDays(14);
                        }}
                      >
                        Estender
                      </button>
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={!isSuper}
                        onClick={() =>
                          run("Teste terminado.", endFn({ data: { target_user_id: t.id } }) as Promise<unknown>)
                        }
                      >
                        Terminar agora
                      </button>
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={!isSuper}
                        onClick={() =>
                          run(
                            "Convertido em cliente.",
                            convertFn({ data: { target_user_id: t.id } }) as Promise<unknown>,
                          )
                        }
                      >
                        Converter
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <SectionTitle>Como funciona a expiração</SectionTitle>
      <p className="mini">
        Uma tarefa agendada corre de 5 em 5 minutos: quando a data de fim passa, a conta volta ao plano Base
        sozinha. A conta e os dados ficam intactos — só se perde o acesso aos módulos pagos. Cada mudança fica
        registada na auditoria.
      </p>

      {/* Estender */}
      <Dialog open={!!extending} onOpenChange={(o) => !o && setExtending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estender período de teste</DialogTitle>
            <DialogDescription>{extending?.name || extending?.email}</DialogDescription>
          </DialogHeader>
          <label className="text-sm">
            Dias a acrescentar
            <input
              type="number"
              min={1}
              max={365}
              className="admin-input mt-1 w-full"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <DialogFooter>
            <button type="button" className="admin-btn" onClick={() => setExtending(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              onClick={() => {
                const target = extending!;
                setExtending(null);
                run(
                  "Prazo estendido.",
                  extendFn({ data: { target_user_id: target.id, days } }) as Promise<unknown>,
                );
              }}
            >
              Estender
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lote */}
      <Dialog
        open={batchOpen}
        onOpenChange={(o) => {
          setBatchOpen(o);
          if (!o) {
            setGenerated(null);
            setRaw("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Convidar beta testers em lote</DialogTitle>
            <DialogDescription>
              Uma pessoa por linha: <code>nome, whatsapp, email, plano, dias</code>. Plano: base, consultor, pro
              ou hub. Cada linha gera um código de uso único.
            </DialogDescription>
          </DialogHeader>

          {generated ? (
            <div className="space-y-2 text-sm">
              {generated.map((g) => (
                <div key={g.code} className="rounded-md border p-2">
                  <strong>{g.name}</strong>{" "}
                  <span className="mini">
                    {g.whatsapp ?? "sem WhatsApp"} · {TIER_DISPLAY_NAME[g.tier as SubscriptionTier]} · {g.days} dias
                  </span>
                  <div className="font-mono text-base">{g.code}</div>
                </div>
              ))}
              <p className="mini">
                Envia a cada pessoa: “envia este código por WhatsApp ao Afonso”. É essa mensagem que cria a conta.
              </p>
            </div>
          ) : (
            <textarea
              className="admin-input min-h-40 w-full font-mono text-xs"
              placeholder={"Ana Silva, +351912345678, ana@exemplo.pt, pro, 14\nJoão Costa, +351913333444, , pro, 14"}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          )}

          <DialogFooter>
            {generated ? (
              <>
                <button type="button" className="admin-btn" onClick={copyAll}>
                  Copiar lista
                </button>
                <button type="button" className="admin-btn-primary" onClick={() => setBatchOpen(false)}>
                  Fechar
                </button>
              </>
            ) : (
              <>
                <button type="button" className="admin-btn" onClick={() => setBatchOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="admin-btn-primary"
                  disabled={!isSuper || batch.isPending}
                  onClick={() => batch.mutate()}
                >
                  {batch.isPending ? "A gerar…" : "Gerar códigos"}
                </button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
