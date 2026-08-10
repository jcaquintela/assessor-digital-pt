import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  cancelPendingInvite,
  listPendingInvites,
  resendInvite,
  type PendingInviteRow,
} from "@/lib/admin/acessos.functions";

// Convites que não chegaram a sair (quase sempre: template da Meta ainda por
// aprovar). Ficam aqui à vista, com reenvio à mão — e saem sozinhos assim que
// o template for aprovado.
export function PendingInvitesBlock() {
  const listFn = useServerFn(listPendingInvites);
  const resendFn = useServerFn(resendInvite);
  const cancelFn = useServerFn(cancelPendingInvite);
  const [rows, setRows] = useState<PendingInviteRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const carregar = useCallback(() => {
    listFn({})
      .then(setRows)
      .catch(() => setRows([]));
  }, [listFn]);

  useEffect(carregar, [carregar]);

  const reenviar = async (id: string) => {
    setBusy(id);
    try {
      const r = await resendFn({ data: { id } });
      if (r.enviado) toast.success(`Enviado para ${r.destino ?? "o consultor"}.`);
      else toast.error(`Continua sem sair: ${r.erro ?? "motivo desconhecido"}`);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reenviar.");
    } finally {
      setBusy(null);
    }
  };

  const cancelar = async (id: string) => {
    setBusy(id);
    try {
      await cancelFn({ data: { id } });
      toast.success("Convite retirado da fila.");
      carregar();
    } finally {
      setBusy(null);
    }
  };

  if (!rows || rows.length === 0) return null;

  return (
    <section className="admin-card mt-4">
      <h2 className="admin-h2">Convites por reenviar</h2>
      <p className="mini" style={{ color: "var(--muted)" }}>
        Estes convites não chegaram a sair. Reenviam-se sozinhos quando o template do WhatsApp ficar aprovado — ou
        podes forçar agora.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-md border p-3 text-sm dark:border-slate-800">
            <div className="font-medium">{r.nome ?? r.email ?? "Consultor"}</div>
            <p className="mini" style={{ color: "var(--muted)" }}>
              {r.canal === "whatsapp" ? "WhatsApp" : "Telegram"}
              {r.destino ? ` · ${r.destino}` : ""} · {r.attempts} tentativa{r.attempts === 1 ? "" : "s"} ·{" "}
              {new Date(r.last_attempt_at).toLocaleString("pt-PT")}
              {r.status === "esgotado" ? " · tentativas esgotadas" : ""}
            </p>
            {r.reason && (
              <p className="mini mt-1" style={{ color: "var(--danger, #dc2626)" }}>{r.reason}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="admin-btn-primary"
                disabled={busy === r.id}
                onClick={() => reenviar(r.id)}
              >
                {busy === r.id ? "A reenviar…" : "Reenviar"}
              </button>
              <button type="button" className="admin-btn" disabled={busy === r.id} onClick={() => cancelar(r.id)}>
                Retirar da fila
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
