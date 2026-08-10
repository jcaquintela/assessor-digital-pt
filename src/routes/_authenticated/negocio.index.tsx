import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { formatEUR } from "@/lib/demo-data";
import { Receipt, Wallet, FileText, ChevronRight, Pencil, Download } from "lucide-react";
import { TierGate } from "@/components/tier-gate";
import { EditMovementDialog } from "@/components/negocio/edit-movement-dialog";
import { PaymentPortalButton } from "@/components/payment-portal-button";
import { exportMovements } from "@/lib/export/export.functions";
import { csvDate, dateStamp, downloadText, toCsv } from "@/lib/export/download";

export const Route = createFileRoute("/_authenticated/negocio/")({
  head: () => ({
    meta: [
      { title: "Faturação — Afonso" },
      { name: "description", content: "Visão geral de comissões, faturação, despesas e rentabilidade." },
      { property: "og:title", content: "Faturação — Afonso" },
      { property: "og:description", content: "Visão geral do negócio do consultor." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="Faturação">
      <NegocioPage />
    </TierGate>
  ),
});

type Movement = {
  id: string;
  type: string;
  description: string;
  category: string | null;
  amount: number;
  status: string;
  movement_date: string;
  opportunity_id: string | null;
  property_id: string | null;
};

// Estado -> tom do badge. Recebido é sage; tudo o que ainda é promessa é amber.
function statusTone(status: string): { cls: string; label: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "recebida" || s === "received" || s === "paga" || s === "paid") {
    return { cls: "c-badge ok", label: "Recebido" };
  }
  if (s === "faturada" || s === "invoiced") return { cls: "c-badge", label: "Faturada" };
  return { cls: "c-badge warn", label: "Previsto" };
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "via WhatsApp",
  telegram: "via Telegram",
  web: "via Dashboard",
};

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function formatDia(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

function NegocioPage() {
  const movs = useQuery({
    queryKey: ["financial_movements", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_movements")
        .select("id, type, description, category, amount, status, movement_date, opportunity_id, property_id")
        .order("movement_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Movement[];
    },
  });

  const rows = movs.data ?? [];
  const comissoes = rows.filter((m) => m.type === "commission");
  const despesas = rows.filter((m) => m.type === "expense");
  const [editId, setEditId] = useState<string | null>(null);
  const emEdicao = rows.find((m) => m.id === editId) ?? null;
  const fetchExport = useServerFn(exportMovements);
  const [aExportar, setAExportar] = useState(false);

  async function exportarCsv() {
    setAExportar(true);
    try {
      const data = await fetchExport();
      const csv = toCsv(
        ["Tipo", "Valor (EUR)", "Estado", "Data", "Descrição", "Categoria"],
        data.map((m) => [
          m.type === "expense" ? "Despesa" : "Comissão",
          Number(m.amount ?? 0),
          statusTone(m.status).label,
          csvDate(m.movement_date),
          m.description,
          m.category ?? "",
        ]),
      );
      downloadText(`negocio-afonso-${dateStamp()}.csv`, "text/csv", csv);
    } finally {
      setAExportar(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Faturação" subtitle="Tudo o que entra e sai, registado por conversa." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link to="/negocio/comissoes" className="c-btn">
          <Wallet className="h-4 w-4" /> Comissões <span className="c-muted">{comissoes.length}</span>
        </Link>
        <Link to="/negocio/despesas" className="c-btn">
          <Receipt className="h-4 w-4" /> Despesas <span className="c-muted">{despesas.length}</span>
        </Link>
        <Link to="/negocio/faturacao" className="c-btn">
          <FileText className="h-4 w-4" /> Faturação
        </Link>
        <button type="button" className="c-btn" onClick={exportarCsv} disabled={aExportar}>
          <Download className="h-4 w-4" /> {aExportar ? "A gerar…" : "CSV"}
        </button>
      </div>

      {movs.isLoading && <div className="c-muted text-sm">A carregar…</div>}

      {!movs.isLoading && rows.length === 0 && (
        <div className="c-empty">
          Ainda não há movimentos registados.
          <br />
          Diz ao teu assessor “recebi 3.000€ de comissão” ou envia o recibo da despesa.
        </div>
      )}

      <div className="grid min-w-0 gap-2">
        {rows.map((m) => {
          const tone = statusTone(m.status);
          const isExpense = m.type === "expense";
          const canal = (m as unknown as { source_channel?: string }).source_channel;
          const to = isExpense ? "/negocio/despesas/$id" : "/negocio/comissoes/$id";
          return (
            <Link key={m.id} to={to} params={{ id: m.id }} className="c-card c-card-hover block min-w-0 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{m.description}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={tone.cls}>{tone.label}</span>
                    <span className="c-badge">{isExpense ? "Despesa" : "Comissão"}</span>
                    {m.category && norm(m.category) !== (isExpense ? "despesa" : "comissao") && (
                      <span className="c-badge">{m.category}</span>
                    )}
                    {canal && CANAL_LABEL[canal] && <span className="c-badge">{CANAL_LABEL[canal]}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <div className="c-mono text-[14px] font-semibold">
                      {isExpense ? "−" : ""}
                      {formatEUR(Number(m.amount ?? 0))}
                    </div>
                    <div className="c-muted c-mono mt-0.5 text-[11px]">{formatDia(m.movement_date)}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Editar ${m.description}`}
                    className="c-badge"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditId(m.id); }}
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                  <ChevronRight className="c-muted h-4 w-4" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <EditMovementDialog
        movement={emEdicao}
        open={!!emEdicao}
        onOpenChange={(v) => { if (!v) setEditId(null); }}
      />
    </AppShell>
  );
}