import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { formatData } from "@/lib/demo-data";
import { ChevronRight, Download, Pencil, Search } from "lucide-react";
import { EditPersonDialog } from "@/components/pessoas/edit-person-dialog";
import { exportPeople } from "@/lib/export/export.functions";
import { buildVCards, csvDate, dateStamp, downloadText, toCsv } from "@/lib/export/download";

export const Route = createFileRoute("/_authenticated/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas — Assessor do Consultor" },
      { name: "description", content: "Clientes, potenciais, proprietários e referenciadores." },
      { property: "og:title", content: "Pessoas — Assessor do Consultor" },
      { property: "og:description", content: "Clientes, potenciais, proprietários e referenciadores." },
    ],
  }),
  component: PessoasPage,
});

function PessoasPage() {
  const { pessoas, loading } = useStore();
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const emEdicao = pessoas.find((p) => p.id === editId) ?? null;
  const fetchPeople = useServerFn(exportPeople);
  const [aExportar, setAExportar] = useState<"csv" | "vcf" | null>(null);

  async function exportar(tipo: "csv" | "vcf") {
    setAExportar(tipo);
    try {
      const rows = await fetchPeople();
      const stamp = dateStamp();
      if (tipo === "csv") {
        const csv = toCsv(
          ["Nome", "Telefone", "Email", "Relação", "Notas", "Criado em"],
          rows.map((p) => [p.name, p.phone, p.email, p.relationship_type, p.summary, csvDate(p.created_at)]),
        );
        downloadText(`pessoas-afonso-${stamp}.csv`, "text/csv", csv);
      } else {
        const vcf = buildVCards(
          rows.map((p) => ({ name: p.name, phone: p.phone, email: p.email, note: p.summary })),
        );
        downloadText(`contactos-afonso-${stamp}.vcf`, "text/vcard", vcf);
      }
    } finally {
      setAExportar(null);
    }
  }

  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const filtradas = pessoas.filter((p) => {
    if (!term) return true;
    const byText = (p.nome + " " + p.email + " " + p.resumo).toLowerCase().includes(term);
    const byPhone = digits.length >= 3 && p.telefone.replace(/\D/g, "").includes(digits);
    return byText || byPhone;
  });

  return (
    <AppShell>
      <PageHeader
        title="Pessoas"
        subtitle={`${pessoas.length} contacto${pessoas.length === 1 ? "" : "s"} · registados por conversa`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="c-btn" onClick={() => exportar("csv")} disabled={aExportar !== null}>
          <Download className="h-4 w-4" /> {aExportar === "csv" ? "A gerar…" : "CSV"}
        </button>
        <button type="button" className="c-btn" onClick={() => exportar("vcf")} disabled={aExportar !== null}>
          <Download className="h-4 w-4" /> {aExportar === "vcf" ? "A gerar…" : "Contactos (.vcf)"}
        </button>
      </div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar por nome ou telefone…"
          className="h-11 rounded-xl pl-9"
          style={{ background: "#fff", borderColor: "var(--line)" }}
        />
      </div>
      {loading && pessoas.length === 0 && (
        <p className="c-muted text-sm">A carregar…</p>
      )}
      {!loading && pessoas.length === 0 && (
        <div className="c-empty">
          Ainda não tens contactos. Fala com o teu assessor por WhatsApp para os registar.
        </div>
      )}
      {!loading && pessoas.length > 0 && filtradas.length === 0 && (
        <div className="c-empty">Nenhum contacto corresponde a “{q}”.</div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filtradas.map((p) => (
          <Link key={p.id} to="/pessoas/$id" params={{ id: p.id }} className="c-card c-card-hover block p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{p.nome}</div>
                <div className="c-mono c-muted mt-0.5 text-xs">
                  {[p.telefone, p.email].filter(Boolean).join(" · ") || "sem contacto"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="c-badge">{p.relacao}</span>
                <button
                  type="button"
                  aria-label={`Editar ${p.nome}`}
                  className="c-badge"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditId(p.id); }}
                >
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <ChevronRight className="h-4 w-4" style={{ color: "var(--muted)" }} />
              </div>
            </div>
            {p.resumo && <p className="c-soft mt-2 line-clamp-2 text-[13.5px]">{p.resumo}</p>}
            {p.proximaAcao && (
              <div className="mt-3 text-xs font-semibold" style={{ color: "var(--brass-dark)" }}>
                Próx.: {p.proximaAcao} {p.proximaAcaoData ? `· ${formatData(p.proximaAcaoData)}` : ""}
              </div>
            )}
          </Link>
        ))}
      </div>
      <EditPersonDialog
        pessoa={emEdicao}
        open={!!emEdicao}
        onOpenChange={(v) => { if (!v) setEditId(null); }}
      />
    </AppShell>
  );
}