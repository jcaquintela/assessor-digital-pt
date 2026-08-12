import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listOrphanOpportunities,
  searchOriginLeads,
  setOpportunityOriginLead,
} from "@/lib/admin/origin-traceability.functions";
import type { LeadCandidate, OrphanOpportunity } from "@/lib/admin/origin-traceability.server";

export const Route = createFileRoute("/admin/rastreabilidade-origem")({
  component: RastreabilidadeOrigemPage,
  head: () => ({
    meta: [
      { title: "Rastreabilidade de origem · Admin" },
      {
        name: "description",
        content:
          "Negócios sem origem registada e leads de prospeção correspondentes, para ligar a origem à mão.",
      },
      { property: "og:title", content: "Rastreabilidade de origem · Admin" },
      {
        property: "og:description",
        content: "Ligar negócios sem origem ao lead de prospeção que lhes deu início.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function leadLabel(l: LeadCandidate) {
  return l.title || l.contact_name || l.location || "Lead sem título";
}

function RastreabilidadeOrigemPage() {
  const list = useServerFn(listOrphanOpportunities);
  const search = useServerFn(searchOriginLeads);
  const save = useServerFn(setOpportunityOriginLead);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "rastreabilidade-origem"],
    queryFn: () => list(),
  });

  const [q, setQ] = useState("");
  const [onlyWithCandidates, setOnlyWithCandidates] = useState(false);
  const [picker, setPicker] = useState<OrphanOpportunity | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [manual, setManual] = useState<LeadCandidate[] | null>(null);

  const mut = useMutation({
    mutationFn: (v: { opportunityId: string; leadId: string | null }) => save({ data: v as never }),
    onSuccess: () => {
      toast.success("Origem registada.");
      setPicker(null);
      setManual(null);
      setLeadQuery("");
      qc.invalidateQueries({ queryKey: ["admin", "rastreabilidade-origem"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não consegui gravar a origem."),
  });

  const searchMut = useMutation({
    mutationFn: (v: { opportunityId: string; query: string }) => search({ data: v as never }),
    onSuccess: (r: any) => setManual(r as LeadCandidate[]),
    onError: (e: any) => toast.error(e?.message ?? "Não consegui procurar leads."),
  });

  const all: OrphanOpportunity[] = (data as any)?.items ?? [];
  const totalOrphans: number = (data as any)?.totalOrphans ?? 0;
  const totalOpportunities: number = (data as any)?.totalOpportunities ?? 0;

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((o) => (onlyWithCandidates ? o.candidates.length > 0 : true))
      .filter((o) =>
        !needle
          ? true
          : [o.title, o.person_name, o.property_title, o.consultant_name, o.consultant_email]
              .filter(Boolean)
              .some((t) => String(t).toLowerCase().includes(needle)),
      );
  }, [all, q, onlyWithCandidates]);

  const withCandidates = all.filter((o) => o.candidates.length > 0).length;
  const coverage =
    totalOpportunities > 0
      ? Math.round(((totalOpportunities - totalOrphans) / totalOpportunities) * 100)
      : 100;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Rastreabilidade de origem</h1>
        <p className="text-sm text-muted-foreground">
          Negócios que não têm registo de onde vieram. Quando houver um lead de prospeção
          correspondente, liga-o aqui à mão — nada é atribuído automaticamente.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{totalOrphans}</div>
          <div className="text-sm text-muted-foreground">negócios sem origem</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{withCandidates}</div>
          <div className="text-sm text-muted-foreground">com lead provável sugerido</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-semibold">{coverage}%</div>
          <div className="text-sm text-muted-foreground">negócios com origem conhecida</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={onlyWithCandidates ? "default" : "outline"}
          onClick={() => setOnlyWithCandidates((v) => !v)}
        >
          Só com sugestão
        </Button>
        <div className="ml-auto w-full max-w-xs">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar negócio ou consultor…"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          Nada por resolver aqui. Todos os negócios listados têm origem registada.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((o) => (
            <li key={o.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{o.title || "Negócio sem título"}</div>
                  <div className="text-sm text-muted-foreground">
                    {[o.person_name, o.property_title].filter(Boolean).join(" · ") || "sem pessoa ou imóvel"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {o.consultant_name || o.consultant_email || "consultor desconhecido"} · criado a{" "}
                    {fmt(o.created_at)}
                    {o.stage ? ` · ${o.stage}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPicker(o);
                    setManual(null);
                    setLeadQuery("");
                  }}
                >
                  Procurar lead
                </Button>
              </div>

              {o.candidates.length > 0 && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    Leads prováveis
                  </div>
                  {o.candidates.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <span className="font-medium">{leadLabel(c)}</span>{" "}
                        <span className="text-muted-foreground">
                          {[c.contact_name, c.location].filter(Boolean).join(" · ")}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {c.reason} · {fmt(c.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{Math.round(c.score * 100)}%</Badge>
                        <Button
                          size="sm"
                          disabled={mut.isPending}
                          onClick={() => mut.mutate({ opportunityId: o.id, leadId: c.id })}
                        >
                          É esta a origem
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!picker} onOpenChange={(v) => !v && setPicker(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Escolher a origem</DialogTitle>
            <DialogDescription>
              Leads de prospeção de {picker?.consultant_name || picker?.consultant_email || "este consultor"}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              placeholder="Nome, morada ou contacto…"
            />
            <Button
              disabled={!picker || searchMut.isPending}
              onClick={() =>
                picker && searchMut.mutate({ opportunityId: picker.id, query: leadQuery })
              }
            >
              Procurar
            </Button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {manual === null ? (
              <p className="text-sm text-muted-foreground">Procura para ver os leads deste consultor.</p>
            ) : manual.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
            ) : (
              manual.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded border p-2">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium">{leadLabel(c)}</div>
                    <div className="text-xs text-muted-foreground">
                      {[c.contact_name, c.location].filter(Boolean).join(" · ")} · {fmt(c.created_at)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={mut.isPending}
                    onClick={() => picker && mut.mutate({ opportunityId: picker.id, leadId: c.id })}
                  >
                    Ligar
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
