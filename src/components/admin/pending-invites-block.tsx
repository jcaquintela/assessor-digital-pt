import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  cancelPendingInvite,
  listPendingInvites,
  prepareManualInvite,
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
  const manualFn = useServerFn(prepareManualInvite);
  const [rows, setRows] = useState<PendingInviteRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manual, setManual] = useState<
    Record<string, { texto: string; original: string; url: string; waNumber: string | null }>
  >({});

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

  // Template ainda por aprovar? Preparamos o texto, o admin revê/edita e envia à mão.
  const prepararManual = async (id: string) => {
    setBusy(id);
    try {
      const r = await manualFn({ data: { id } });
      setManual((m) => ({
        ...m,
        [id]: { texto: r.texto, original: r.texto, url: r.url, waNumber: r.waNumber },
      }));
      toast.success("Mensagem pronta a rever. O link anterior por usar deixa de servir.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível preparar a mensagem.");
    } finally {
      setBusy(null);
    }
  };

  const copiarTexto = async (id: string) => {
    const texto = manual[id]?.texto.trim();
    if (!texto) return toast.error("A mensagem está vazia.");
    await navigator.clipboard.writeText(texto);
    toast.success("Mensagem copiada.");
  };

  const abrirWhatsapp = (id: string) => {
    const item = manual[id];
    const texto = item?.texto.trim();
    if (!texto) return toast.error("A mensagem está vazia.");
    if (!item?.waNumber) return toast.error("Sem número de WhatsApp válido nesta conta.");
    if (item.url && !texto.includes(item.url)) {
      toast.warning("Atenção: o link de acesso já não está na mensagem.");
    }
    window.open(`https://wa.me/${item.waNumber}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };

  // Editou de mais? Volta ao texto tal como o Afonso o gerou, sem gerar link novo.
  const reporOriginal = (id: string) => {
    setManual((m) => (m[id] ? { ...m, [id]: { ...m[id]!, texto: m[id]!.original } } : m));
    toast.success("Texto original reposto.");
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
              <button type="button" className="admin-btn" disabled={busy === r.id} onClick={() => prepararManual(r.id)}>
                {manual[r.id] ? "Gerar nova mensagem" : "Preparar mensagem"}
              </button>
            </div>
            {manual[r.id] && (
              <div className="mt-2">
                <label className="mini" style={{ color: "var(--muted)" }} htmlFor={`msg-${r.id}`}>
                  Revê ou ajusta antes de enviar
                </label>
                <textarea
                  id={`msg-${r.id}`}
                  className="mt-1 w-full rounded-md border p-2 text-sm dark:border-slate-800 dark:bg-transparent"
                  rows={6}
                  maxLength={4000}
                  value={manual[r.id]!.texto}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, [r.id]: { ...m[r.id]!, texto: e.target.value } }))
                  }
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="admin-btn" onClick={() => copiarTexto(r.id)}>
                    Copiar mensagem
                  </button>
                  {r.canal === "whatsapp" && (
                    <button type="button" className="admin-btn" onClick={() => abrirWhatsapp(r.id)}>
                      Abrir no WhatsApp
                    </button>
                  )}
                  {manual[r.id]!.texto !== manual[r.id]!.original && (
                    <button type="button" className="admin-btn" onClick={() => reporOriginal(r.id)}>
                      Repor texto original
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
