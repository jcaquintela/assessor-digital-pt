import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Megaphone } from "lucide-react";
import { getMyAnnouncements } from "@/lib/admin/comunicacao.functions";

const DISMISS_KEY = "assessor.dismissed-announcements";

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function sameText(a?: string | null, b?: string | null) {
  const n = (s?: string | null) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return !!n(a) && n(a) === n(b);
}

export function AnnouncementBanner() {
  const fetchAnnouncements = useServerFn(getMyAnnouncements);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());
  const { data } = useQuery({
    queryKey: ["announcements", "mine"],
    queryFn: () => fetchAnnouncements(),
    staleTime: 5 * 60_000,
  });

  const announcement = (data ?? []).find((a) => !dismissed.includes(a.id));
  if (!announcement) return null;

  // Aviso com título e corpo iguais aparecia duas vezes seguidas.
  const body = sameText(announcement.title, announcement.body) ? null : announcement.body;

  const dismiss = () => {
    const next = [...dismissed, announcement.id];
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
  };

  return (
    <div className="mx-auto mb-4 flex max-w-6xl items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{announcement.title}</p>
        {body && (
          <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{body}</p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar aviso"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}