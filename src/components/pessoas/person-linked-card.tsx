import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, Wallet, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatEUR } from "@/lib/demo-data";

type PropRow = { id: string; title: string; location: string | null; status: string | null; asking_price: number | null; value: number | null };
type MovRow = {
  id: string; type: string; description: string; amount: number; status: string;
  movement_date: string; property_id: string | null; opportunity_id: string | null;
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

async function fetchLinked(personId: string) {
  // 1. Oportunidades da pessoa -> imóveis e movimentos
  const { data: opps } = await supabase
    .from("opportunities")
    .select("id, property_id")
    .eq("person_id", personId);
  const oppIds = (opps ?? []).map((o) => o.id);
  const oppPropIds = (opps ?? []).map((o) => o.property_id).filter(Boolean) as string[];

  // 2. Imóveis onde é proprietária + imóveis das oportunidades
  const [ownedRes, oppPropsRes] = await Promise.all([
    supabase.from("properties").select("id,title,location,status,asking_price,value").eq("owner_person_id", personId),
    oppPropIds.length
      ? supabase.from("properties").select("id,title,location,status,asking_price,value").in("id", oppPropIds)
      : Promise.resolve({ data: [] as PropRow[] }),
  ]);

  const propMap = new Map<string, PropRow>();
  for (const r of [...((ownedRes.data as PropRow[]) ?? []), ...((oppPropsRes.data as PropRow[]) ?? [])]) {
    propMap.set(r.id, r);
  }
  const properties = [...propMap.values()];
  const propIds = properties.map((p) => p.id);

  // 3. Movimentos ligados às oportunidades ou aos imóveis da pessoa
  const filters: string[] = [];
  if (oppIds.length) filters.push(`opportunity_id.in.(${oppIds.join(",")})`);
  if (propIds.length) filters.push(`property_id.in.(${propIds.join(",")})`);
  let movements: MovRow[] = [];
  if (filters.length) {
    const { data } = await supabase
      .from("financial_movements")
      .select("id,type,description,amount,status,movement_date,property_id,opportunity_id")
      .or(filters.join(","))
      .order("movement_date", { ascending: false })
      .limit(20);
    movements = (data as MovRow[]) ?? [];
  }

  return { properties, movements };
}

export function PersonLinkedCard({ personId }: { personId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["person-linked", personId],
    queryFn: () => fetchLinked(personId),
  });

  const properties = data?.properties ?? [];
  const movements = data?.movements ?? [];

  const total = movements.reduce(
    (acc, m) => acc + (m.type === "despesa" ? -Number(m.amount ?? 0) : Number(m.amount ?? 0)),
    0,
  );

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Imóveis ligados ({properties.length})
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </h3>
          {!isLoading && properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem imóveis ligados a esta pessoa.</p>
          ) : (
            <div className="space-y-2">
              {properties.map((p) => (
                <Link
                  key={p.id}
                  to="/imoveis/$id"
                  params={{ id: p.id }}
                  className="block rounded-lg border border-border p-3 text-sm hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{p.title}</span>
                    {p.status && <Badge variant="secondary" className="shrink-0">{p.status}</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[p.location, formatEUR(Number(p.asking_price ?? p.value ?? 0))].filter(Boolean).join(" · ")}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-muted-foreground" /> Negócio ({movements.length})
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </h3>
          {!isLoading && movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem comissões ou despesas ligadas.</p>
          ) : (
            <>
              <div className="space-y-2">
                {movements.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate">{m.description}</span>
                      <span className={m.type === "despesa" ? "shrink-0 text-destructive" : "shrink-0 text-foreground"}>
                        {m.type === "despesa" ? "−" : "+"}{formatEUR(Number(m.amount ?? 0))}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDate(m.movement_date)} · {m.status}
                    </div>
                  </div>
                ))}
              </div>
              {movements.length > 0 && (
                <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-sm">
                  <span className="text-muted-foreground">Saldo associado</span>
                  <strong>{formatEUR(total)}</strong>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
