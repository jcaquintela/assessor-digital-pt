import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { formatEUR } from "@/lib/demo-data";
import { listProperties } from "@/lib/assessor/properties.functions";
import { propertyStatusLabel } from "@/lib/assessor/properties-status";
import { ChevronRight, FileText, Pencil, Search } from "lucide-react";
import { TierGate } from "@/components/tier-gate";
import { EditPropertyDialog } from "@/components/imoveis/edit-property-dialog";

const ORIGEM: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  web: "Dashboard",
  placa: "placa",
  prospecting: "placa",
};

export const Route = createFileRoute("/_authenticated/imoveis")({
  head: () => ({
    meta: [
      { title: "Imóveis — Assessor do Consultor" },
      { name: "description", content: "Carteira de imóveis em angariação." },
      { property: "og:title", content: "Imóveis — Assessor do Consultor" },
      { property: "og:description", content: "Carteira de imóveis em angariação." },
    ],
  }),
  component: () => (
    <TierGate min="consultor" title="Imóveis">
      <ImoveisPage />
    </TierGate>
  ),
});

function ImoveisPage() {
  const fetchList = useServerFn(listProperties);
  const { data: rows } = useQuery({
    queryKey: ["properties", "list"],
    queryFn: () => fetchList(),
  });
  const all = (rows ?? []) as any[];
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const emEdicao = all.find((p) => p.id === editId) ?? null;
  const term = q.trim().toLowerCase();
  const list = all.filter((i) =>
    !term ||
    [i.title, i.address, i.city, i.location, i.typology, i.property_type]
      .filter(Boolean).join(" ").toLowerCase().includes(term),
  );
  return (
    <AppShell>
      <PageHeader title="Imóveis" subtitle={`${all.length} em carteira`} />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar por morada, cidade ou tipo…"
          className="h-11 rounded-xl pl-9"
          style={{ background: "#fff", borderColor: "var(--line)" }}
        />
      </div>
      {all.length === 0 && (
        <div className="c-empty">
          Ainda não tens imóveis. Envia um documento ou descreve o imóvel ao teu assessor por WhatsApp.
        </div>
      )}
      {all.length > 0 && list.length === 0 && (
        <div className="c-empty">Nenhum imóvel corresponde a “{q}”.</div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((i: any) => {
          const localizacao = i.city || i.location || "";
          const tipo = i.typology || i.property_type || "";
          const origem = i.source_channel ? (ORIGEM[i.source_channel] ?? i.source_channel) : null;
          const angariado = i.status && i.status !== "em_angariacao" && i.status !== "por_angariar";
          return (
            <Link key={i.id} to="/imoveis/$id" params={{ id: i.id }} className="c-card c-card-hover block p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{i.title}</div>
                  <div className="c-muted mt-0.5 text-xs">
                    {[tipo, i.address || localizacao].filter(Boolean).join(" · ") || "Sem detalhes"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`c-badge ${angariado ? "ok" : "warn"}`}>{propertyStatusLabel(i.status)}</span>
                    {origem && <span className="c-badge">via {origem}</span>}
                    {i.file_count > 0 && (
                      <span className="c-badge c-mono"><FileText className="h-3 w-3" /> {i.file_count}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  {i.asking_price != null && (
                    <div className="c-mono text-sm font-semibold" style={{ color: "var(--ink)" }}>{formatEUR(Number(i.asking_price))}</div>
                  )}
                  <button
                    type="button"
                    aria-label={`Editar ${i.title}`}
                    className="c-badge"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditId(i.id); }}
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                  <ChevronRight className="h-4 w-4" style={{ color: "var(--muted)" }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <EditPropertyDialog
        property={emEdicao}
        open={!!emEdicao}
        onOpenChange={(v) => { if (!v) setEditId(null); }}
      />
    </AppShell>
  );
}