import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Megaphone } from "lucide-react";
import { dismissAnnouncement, getMyAnnouncements } from "@/lib/admin/comunicacao.functions";

export function sameText(a?: string | null, b?: string | null) {
  const n = (s?: string | null) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return !!n(a) && n(a) === n(b);
}

// Aspeto exato do aviso no dashboard. Reutilizado na pré-visualização do admin.
export function AnnouncementCard({
  title,
  body,
  onDismiss,
}: {
  title: string;
  body?: string | null;
  onDismiss?: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-6xl items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {body && (
          <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{body}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dispensar aviso"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AnnouncementBanner() {
  const fetchAnnouncements = useServerFn(getMyAnnouncements);
  const dismissFn = useServerFn(dismissAnnouncement);
  const qc = useQueryClient();
  // Só para esconder já o banner enquanto o servidor grava.
  const [hidden, setHidden] = useState<string[]>([]);
  const { data } = useQuery({
    queryKey: ["announcements", "mine"],
    queryFn: () => fetchAnnouncements(),
    staleTime: 5 * 60_000,
  });

  const announcement = (data ?? []).find((a) => !hidden.includes(a.id));
  if (!announcement) return null;

  // Aviso com título e corpo iguais aparecia duas vezes seguidas.
  const body = sameText(announcement.title, announcement.body) ? null : announcement.body;

  const dismiss = async () => {
    const id = announcement.id;
    setHidden((prev) => [...prev, id]);
    try {
      await dismissFn({ data: { announcementId: id } });
    } catch {
      /* fica escondido nesta sessão; volta a aparecer se a gravação falhou */
    }
    qc.invalidateQueries({ queryKey: ["announcements", "mine"] });
  };

  return (
    <div className="mb-4">
      <AnnouncementCard title={announcement.title} body={body} onDismiss={dismiss} />
    </div>
  );
}