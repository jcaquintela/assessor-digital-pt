import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { foldIncludes } from "@/lib/search/normalize";
import { listShareContacts, prepareFileShare } from "@/lib/drive/drive.functions";

/**
 * Prepara a partilha de um ficheiro por WhatsApp. Nunca envia sozinho:
 * abre o WhatsApp com a mensagem escrita, o consultor é que carrega em enviar.
 */
export function ShareWhatsAppDialog({
  fileId,
  fileName,
  open,
  onOpenChange,
}: {
  fileId: string | null;
  fileName?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const fetchContacts = useServerFn(listShareContacts);
  const prepare = useServerFn(prepareFileShare);

  const contactsQ = useQuery({
    queryKey: ["drive", "share-contacts"],
    queryFn: () => fetchContacts(),
    enabled: open,
  });
  const shareQ = useQuery({
    queryKey: ["drive", "share", fileId],
    queryFn: () => prepare({ data: { fileId: fileId! } }),
    enabled: open && !!fileId,
  });

  const contacts = (contactsQ.data ?? []).filter((c: any) => foldIncludes(c.name, q));

  const abrir = (phone?: string) => {
    const texto = shareQ.data?.text;
    if (!texto) return;
    const digits = (phone ?? "").replace(/\D/g, "");
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir no WhatsApp</DialogTitle>
          <DialogDescription>
            {fileName ? `"${fileName}"` : "Este ficheiro"} — escolhe com quem queres partilhar. O
            WhatsApp abre com a mensagem escrita; o envio é sempre teu.
          </DialogDescription>
        </DialogHeader>

        {shareQ.isLoading && <div className="c-muted text-sm">A preparar o link…</div>}
        {shareQ.error && (
          <div className="text-sm text-destructive">
            {(shareQ.error as any)?.message ?? "Não consegui preparar o ficheiro."}
          </div>
        )}

        {shareQ.data && (
          <div className="space-y-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar pessoa" />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {contacts.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  className="tap-44 flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => abrir(c.phone)}
                >
                  <span>{c.name}</span>
                  <span className="c-muted text-xs">{c.phone}</span>
                </button>
              ))}
              {!contactsQ.isLoading && contacts.length === 0 && (
                <div className="c-muted text-sm">Sem contactos com telefone guardado.</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => abrir()}>
                Escolher no WhatsApp
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareQ.data!.url);
                  toast.success("Link copiado (válido 24 horas).");
                }}
              >
                Copiar link
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
