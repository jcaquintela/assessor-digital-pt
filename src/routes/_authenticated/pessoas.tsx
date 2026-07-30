import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { formatData } from "@/lib/demo-data";
import { ChevronRight, Search } from "lucide-react";

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
    </AppShell>
  );
}