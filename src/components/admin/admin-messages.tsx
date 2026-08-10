// Separador "Mensagens" da ficha de consultor: uma pergunta de cada vez,
// enviada pelo WhatsApp que ele já usa, e a resposta ligada à pergunta.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge, Empty, SectionTitle, Source } from "@/components/admin/ui";
import {
  getConsultantMessages,
  markConsultantRepliesRead,
  sendConsultantQuestion,
} from "@/lib/admin/admin-messages.functions";
import { OUT_OF_WINDOW_WARNING } from "@/lib/admin/admin-messages";

function fmt(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-PT") : "—";
}

export function AdminMessagesPanel({ consultorId }: { consultorId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(getConsultantMessages);
  const sendFn = useServerFn(sendConsultantQuestion);
  const readFn = useServerFn(markConsultantRepliesRead);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["admin", "consultor", consultorId, "mensagens"],
    queryFn: () => listFn({ data: { consultorId } }),
    refetchInterval: 60_000,
  });

  const porLer = (data?.mensagens ?? []).some((m) => m.porLer);
  useEffect(() => {
    if (!porLer) return;
    readFn({ data: { consultorId } })
      .then(() => qc.invalidateQueries({ queryKey: ["admin", "respostas", "por-ler"] }))
      .catch(() => { /* leitura é best-effort */ });
  }, [porLer, consultorId, readFn, qc]);

  const janela = data?.janela;
  const bloqueado = !janela?.temWhatsApp || !janela?.aberta;

  const enviar = async () => {
    setBusy(true);
    try {
      const r = await sendFn({ data: { consultorId, pergunta: texto.trim() } });
      if (r.ok) {
        toast.success("Pergunta enviada.");
        setTexto("");
      } else {
        toast.error(r.aviso);
      }
      qc.invalidateQueries({ queryKey: ["admin", "consultor", consultorId, "mensagens"] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle>Mensagens</SectionTitle>
      <div className="admin-card p-4">
        {!janela?.temWhatsApp ? (
          <p className="mini" style={{ color: "var(--warn, #b45309)" }}>
            Esta conta não tem um número de WhatsApp válido associado — não é possível enviar.
          </p>
        ) : !janela.aberta ? (
          <p className="mini" style={{ color: "var(--warn, #b45309)" }}>
            {OUT_OF_WINDOW_WARNING}{" "}
            {janela.horasSemContacto == null
              ? "Este consultor ainda não escreveu ao Afonso."
              : `Última mensagem dele há ${Math.round(janela.horasSemContacto)} h.`}
          </p>
        ) : (
          <p className="mini" style={{ color: "var(--muted)" }}>
            Conversa aberta{janela.horasSemContacto == null ? "" : ` (última mensagem dele há ${Math.round(janela.horasSemContacto)} h)`} — a pergunta é entregue como mensagem normal.
          </p>
        )}
        <textarea
          className="admin-input mt-2 w-full"
          rows={3}
          maxLength={900}
          placeholder="Ex.: qual é o teu email Google?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="admin-btn-primary tap-44"
            disabled={busy || bloqueado || texto.trim().length < 3}
            onClick={enviar}
          >
            {busy ? "A enviar…" : "Enviar pergunta"}
          </button>
          <span className="mini" style={{ color: "var(--muted)" }}>
            A resposta dele nas próximas 48 h fica ligada a esta pergunta.
          </span>
        </div>
      </div>

      {isPending ? (
        <p className="sub mt-3">A carregar…</p>
      ) : (data?.mensagens.length ?? 0) === 0 ? (
        <Empty>Ainda não foi enviada nenhuma pergunta a este consultor.</Empty>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table>
            <thead>
              <tr><th>Enviada</th><th>Pergunta</th><th>Estado</th><th>Resposta</th><th>Respondida</th></tr>
            </thead>
            <tbody>
              {data!.mensagens.map((m) => (
                <tr key={m.id}>
                  <td className="mini whitespace-nowrap">{fmt(m.enviadoEm)}</td>
                  <td className="mini">{m.pergunta}</td>
                  <td>
                    <Badge tone={m.estado === "respondida" ? "ok" : m.estado === "pendente" ? "warn" : undefined}>
                      {m.estado}
                    </Badge>
                  </td>
                  <td className="mini">{m.resposta ?? "—"}</td>
                  <td className="mini whitespace-nowrap">{fmt(m.respondidoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Source>admin_messages × whatsapp_send_logs</Source>
    </div>
  );
}