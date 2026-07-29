import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, User, Building2, StickyNote, ListChecks, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Hit = { type: "pessoa" | "imovel" | "nota" | "seguimento"; id: string; label: string; sub?: string };

const ICON = { pessoa: User, imovel: Building2, nota: StickyNote, seguimento: ListChecks } as const;
const ROUTE = {
  pessoa: (id: string) => ({ to: "/pessoas/$id", params: { id } }),
  imovel: (id: string) => ({ to: "/imoveis/$id", params: { id } }),
  nota: (id: string) => ({ to: "/diversos/$id", params: { id } }),
  seguimento: (id: string) => ({ to: "/seguimentos/$id", params: { id } }),
} as const;

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const [p, im, n, f] = await Promise.all([
        supabase.from("people").select("id,name,phone").ilike("name", like).limit(5),
        supabase.from("properties").select("id,title,location").ilike("title", like).limit(5),
        supabase.from("miscellaneous_items").select("id,title").ilike("title", like).limit(5),
        supabase.from("follow_ups").select("id,title,due_date").ilike("title", like).limit(5),
      ]);
      const merged: Hit[] = [
        ...((p.data as any[]) ?? []).map((r) => ({ type: "pessoa" as const, id: r.id, label: r.name, sub: r.phone ?? undefined })),
        ...((im.data as any[]) ?? []).map((r) => ({ type: "imovel" as const, id: r.id, label: r.title, sub: r.location ?? undefined })),
        ...((n.data as any[]) ?? []).map((r) => ({ type: "nota" as const, id: r.id, label: r.title })),
        ...((f.data as any[]) ?? []).map((r) => ({ type: "seguimento" as const, id: r.id, label: r.title })),
      ];
      setHits(merged);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const groups = useMemo(() => {
    const g: Record<Hit["type"], Hit[]> = { pessoa: [], imovel: [], nota: [], seguimento: [] };
    for (const h of hits) g[h.type].push(h);
    return g;
  }, [hits]);

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Pesquisa pessoas, imóveis, notas ou compromissos"
          className="h-9 pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {hits.length === 0 && !loading && (
            <div className="p-3 text-sm text-muted-foreground">Sem resultados.</div>
          )}
          {(["pessoa", "imovel", "seguimento", "nota"] as const).map((type) => {
            const arr = groups[type];
            if (!arr.length) return null;
            const Icon = ICON[type];
            const label = type === "pessoa" ? "Pessoas" : type === "imovel" ? "Imóveis" : type === "seguimento" ? "Compromissos" : "Notas";
            return (
              <div key={type} className="p-1">
                <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
                {arr.map((h) => (
                  <button
                    key={`${type}:${h.id}`}
                    type="button"
                    onClick={() => { setOpen(false); setQ(""); navigate(ROUTE[type](h.id) as any); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                    {h.sub && <span className="shrink-0 truncate text-xs text-muted-foreground">{h.sub}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}