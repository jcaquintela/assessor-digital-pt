import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  checkInviteSendability,
  issueInviteLink,
  type InviteSendability,
  type IssuedInvite,
} from "@/lib/admin/acessos.functions";

// Gera o convite real (link mágico + número do Afonso + código) para uma conta
// já criada. O admin copia e envia por onde quiser; se o canal já estiver
// ligado, pode mandar direto pelo Afonso.
export function InviteLinkDialog({
  userId,
  nome,
  onClose,
}: {
  userId: string;
  nome: string;
  onClose: () => void;
}) {
  const issueFn = useServerFn(issueInviteLink);
  const checkFn = useServerFn(checkInviteSendability);
  const [canal, setCanal] = useState<"whatsapp" | "telegram">("whatsapp");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<IssuedInvite | null>(null);
  const [envio, setEnvio] = useState<InviteSendability | null>(null);

  // Antes de mostrar o botão de envio confirmamos que há destino válido:
  // sem número (ou com número inválido) nunca chega a haver chamada à Meta.
  useEffect(() => {
    let vivo = true;
    setEnvio(null);
    checkFn({ data: { target_user_id: userId, canal } })
      .then((r) => vivo && setEnvio(r))
      .catch(() => vivo && setEnvio({ podeEnviar: false, destino: null, motivo: "Não foi possível verificar o destino." }));
    return () => {
      vivo = false;
    };
  }, [userId, canal, checkFn]);

  const gerar = async (enviar: boolean) => {
    setBusy(true);
    try {
      const r = await issueFn({ data: { target_user_id: userId, canal, enviar } });
      setRes(r);
      if (r.enviado) toast.success(`Enviado para ${r.destino ?? "o consultor"}.`);
      else if (r.erroEnvio) toast.error(`Falhou: ${r.erroEnvio}`);
      else toast.success("Link gerado. Copia e envia.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="admin-surface">
        <DialogHeader>
          <DialogTitle>Link de acesso — {nome}</DialogTitle>
          <DialogDescription>
            Gera o convite completo: link para finalizar o registo, número do Afonso e código de acesso. Cada link novo
            invalida o anterior por usar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="admin-input"
            value={canal}
            onChange={(e) => setCanal(e.target.value as "whatsapp" | "telegram")}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
          <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => gerar(false)}>
            {busy ? "A gerar…" : "Gerar link"}
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={busy || !envio?.podeEnviar}
            title={envio?.motivo ?? undefined}
            onClick={() => gerar(true)}
          >
            Gerar e enviar pelo Afonso
          </button>
        </div>

        {envio && !envio.podeEnviar && (
          <p className="mini mt-2" style={{ color: "var(--muted)" }}>{envio.motivo}</p>
        )}
        {envio?.podeEnviar && envio.destino && (
          <p className="mini mt-2" style={{ color: "var(--muted)" }}>Envio pelo Afonso para {envio.destino}.</p>
        )}

        {res && (
          <div className="mt-3 rounded-md border p-3 text-sm dark:border-slate-800">
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">{res.texto}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(res.texto);
                  toast.success("Mensagem copiada.");
                }}
              >Copiar mensagem</button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(res.url);
                  toast.success("Link copiado.");
                }}
              >Copiar só o link</button>
              {res.waUrl && (
                <a className="admin-btn" href={res.waUrl} target="_blank" rel="noreferrer">Abrir no WhatsApp</a>
              )}
            </div>
            {res.enviado && (
              <p className="mini mt-2" style={{ color: "var(--muted)" }}>
                Enviado para {res.destino ?? "o consultor"}
                {res.via === "template" ? " (template aprovado)" : ""} — confirmado pela Meta.
              </p>
            )}
            {res.erroEnvio && (
              <>
                <p className="mini mt-2" style={{ color: "var(--danger, #dc2626)" }}>Falhou: {res.erroEnvio}</p>
                <p className="mini" style={{ color: "var(--muted)" }}>
                  Ficou em “Convites por reenviar”: sai sozinho quando o template for aprovado, ou reenvia à mão a
                  partir da lista de utilizadores.
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <button type="button" className="admin-btn" onClick={onClose}>Fechar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
