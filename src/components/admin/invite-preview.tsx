// Pré-visualização do convite: o admin lê a mensagem exata (código, número do
// Afonso e link mágico) antes de a enviar por WhatsApp ou Telegram.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { previewInviteMessage } from "@/lib/admin/acessos.functions";

export function InvitePreview({
  canal,
  nome,
  phone,
}: {
  canal: "whatsapp" | "telegram";
  nome?: string | null;
  phone?: string | null;
}) {
  const preview = useServerFn(previewInviteMessage);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "invite-preview", canal, nome ?? "", phone ?? ""],
    queryFn: () => preview({ data: { canal, nome: nome ?? null, phone: phone ?? null } }),
  });

  return (
    <div className="rounded-md border p-3 text-sm dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">
          Pré-visualização · {canal === "whatsapp" ? "WhatsApp" : "Telegram"}
        </p>
        <button
          type="button"
          className="admin-btn"
          disabled={!data?.texto}
          onClick={() => {
            if (!data?.texto) return;
            navigator.clipboard?.writeText(data.texto);
            toast.success("Mensagem copiada.");
          }}
        >
          Copiar
        </button>
      </div>
      {isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">A preparar a mensagem…</p>
      ) : error ? (
        <p className="mt-2 text-xs text-muted-foreground">Não foi possível preparar a pré-visualização.</p>
      ) : (
        <>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed">{data?.texto}</pre>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <li>Número do Afonso: {data?.numeroAfonso ?? "—"}</li>
            <li>Código de acesso: {data?.codigo ? "gerado no envio" : "não se aplica a este canal"}</li>
            <li>Link mágico: gerado no envio, válido uma única vez</li>
          </ul>
        </>
      )}
    </div>
  );
}
