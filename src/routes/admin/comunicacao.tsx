import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { getMyAdminRole } from "@/lib/admin.functions";
import {
  countSegment,
  listBroadcasts,
  sendBroadcast,
  SEGMENTS,
  type Segment,
} from "@/lib/admin/comunicacao.functions";
import { TIER_DISPLAY_NAME } from "@/lib/subscription/tiers";

export const Route = createFileRoute("/admin/comunicacao")({
  head: () => ({ meta: [{ title: "Comunicação — Afonso admin" }] }),
  component: ComunicacaoPage,
});

const CHANNELS = [
  { key: "email", label: "Email" },
  { key: "dashboard", label: "Dashboard" },
  { key: "whatsapp", label: "WhatsApp / Telegram" },
] as const;

function segmentLabel(s: Segment) {
  if (s === "all") return "Todos os consultores";
  if (s === "beta") return "Beta testers";
  if (s === "channel:whatsapp") return "Ligados por WhatsApp";
  if (s === "channel:telegram") return "Ligados por Telegram";
  return `Plano ${TIER_DISPLAY_NAME[s.split(":")[1] as keyof typeof TIER_DISPLAY_NAME]}`;
}

function ComunicacaoPage() {
  const qc = useQueryClient();
  const roleFn = useServerFn(getMyAdminRole);
  const countFn = useServerFn(countSegment);
  const listFn = useServerFn(listBroadcasts);
  const sendFn = useServerFn(sendBroadcast);

  const { data: me } = useQuery({ queryKey: ["admin", "my-role"], queryFn: () => roleFn() });
  const isSuper = me?.role === "super_admin";

  const [channel, setChannel] = useState<"email" | "dashboard" | "whatsapp">("dashboard");
  const [segment, setSegment] = useState<Segment>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data: count } = useQuery({
    queryKey: ["admin", "segment-count", segment],
    queryFn: () => countFn({ data: { segment } }),
  });
  const { data: history } = useQuery({ queryKey: ["admin", "broadcasts"], queryFn: () => listFn() });

  const blocked =
    channel === "email"
      ? "Provider de email não ligado. A mensagem é composta e fica registada no histórico como bloqueada, mas não sai."
      : channel === "whatsapp"
        ? "Sem templates aprovados pela Meta. Fora da janela de 24h o envio em massa está bloqueado."
        : null;

  const send = async () => {
    setSending(true);
    try {
      const res = await sendFn({
        data: { channel, segment, subject: subject.trim() || undefined, body: body.trim() },
      });
      if (res.blocked) {
        toast.warning(
          `Provider de email não ligado — nada saiu. Mensagem registada no histórico para ${res.recipients} destinatários.`,
        );
      } else {
        toast.success(
          channel === "email"
            ? `Email enviado para ${res.recipients} consultores.`
            : `Aviso publicado para ${res.recipients} consultores.`,
        );
      }
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="Comunicação"
        sub="Falar com os consultores em massa: avisos de produto, mudanças de plano, manutenção. Um canal de cada vez, sempre com segmento explícito."
      />

      <SectionTitle first>Nova mensagem</SectionTitle>
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
        <div className="mb-3 flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`admin-pill ${channel === c.key ? "active" : ""}`}
              onClick={() => setChannel(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className="mini mb-3 block" style={{ color: "var(--muted)" }}>
          Segmento
          <select
            className="admin-input mt-1 block w-full max-w-sm"
            value={segment}
            onChange={(e) => setSegment(e.target.value as Segment)}
          >
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>{segmentLabel(s)}</option>
            ))}
          </select>
          <span className="mt-1 block">{count?.count ?? "—"} destinatários neste segmento</span>
        </label>

        {channel === "email" ? (
          <label className="mini mb-3 block" style={{ color: "var(--muted)" }}>
            Assunto
            <input className="admin-input mt-1 block w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        ) : null}

        <label className="mini block" style={{ color: "var(--muted)" }}>
          Mensagem
          <textarea
            className="admin-input mt-1 block h-36 w-full"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreve como falarias com um consultor: direto, sem jargão."
          />
        </label>

        {blocked ? (
          <p className="mini mt-3 rounded-lg px-3 py-2" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>
            {blocked}
          </p>
        ) : (
          <p className="mini mt-3" style={{ color: "var(--muted)" }}>
            O aviso aparece no topo do dashboard do consultor até ele o dispensar.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="admin-btn-primary"
            disabled={!isSuper || sending || body.trim().length < 3 || channel === "whatsapp"}
            onClick={send}
          >
            {sending ? "A enviar…" : "Enviar"}
          </button>
          {!isSuper ? <span className="mini" style={{ color: "var(--muted)" }}>Só super admin pode enviar.</span> : null}
        </div>
        <Source>admin_broadcasts + dashboard_announcements</Source>
      </div>

      <SectionTitle>Histórico</SectionTitle>
      {(history ?? []).length === 0 ? (
        <Empty note="cada envio fica registado com canal, segmento e nº de destinatários">
          Ainda não enviaste nenhuma mensagem em massa.
        </Empty>
      ) : (
        <table>
          <thead>
            <tr><th>Quando</th><th>Canal</th><th>Segmento</th><th>Destinatários</th><th>Mensagem</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {(history ?? []).map((b) => (
              <tr key={b.id}>
                <td className="mini">{new Date(b.created_at).toLocaleString("pt-PT")}</td>
                <td className="mini">{b.channel === "dashboard" ? "Dashboard" : b.channel === "email" ? "Email" : "WhatsApp"}</td>
                <td className="mini">{segmentLabel(b.segment as Segment)}</td>
                <td className="mini">{b.recipients_count}</td>
                <td className="mini">{(b.subject ? `${b.subject} — ` : "") + b.body.slice(0, 80)}</td>
                <td>
                  <Badge tone={b.status === "sent" ? "ok" : "warn"}>
                    {b.status === "sent"
                      ? "Enviado"
                      : b.status === "bloqueado_sem_provider"
                        ? "Bloqueado (sem provider)"
                        : b.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
