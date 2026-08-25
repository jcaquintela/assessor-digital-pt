import { appTitle } from "@/lib/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/comunicacao/")({
  head: () => ({
    meta: [
      { title: appTitle("Comunicação") },
      {
        name: "description",
        content: "Histórico dos rascunhos de email preparados e das autorizações de envio.",
      },
      { property: "og:title", content: appTitle("Comunicação") },
      {
        property: "og:description",
        content: "Rascunhos de email preparados para ti e o registo de cada autorização.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComunicacaoPage,
});

type DraftRow = {
  id: string;
  to_name: string | null;
  to_emails: string[] | null;
  subject: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  channel: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "À espera da tua palavra",
  confirmed: "Autorizado",
  sent: "Autorizado e concluído",
  discarded: "Descartado",
  cancelled: "Cancelado",
};

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ComunicacaoPage() {
  const q = useQuery({
    queryKey: ["email-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_drafts")
        .select("id,to_name,to_emails,subject,status,created_at,sent_at,expires_at,channel")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as DraftRow[];
    },
  });

  const rows = q.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Comunicação"
        subtitle="Rascunhos de email preparados para ti. Nenhum segue sem a tua palavra."
      />
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" aria-hidden />
            Ainda não preparei nenhum rascunho de resposta. Pede-me para responder a um email.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              to="/comunicacao/rascunho/$id"
              params={{ id: r.id }}
              className="block"
            >
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.subject || "(sem assunto)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Para {r.to_name || r.to_emails?.[0] || "—"} · {when(r.created_at)}
                      {r.channel ? ` · ${r.channel}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      r.status === "sent"
                        ? "default"
                        : r.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
