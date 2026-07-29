import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Trash2, Star, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listPersonPhones,
  addPersonPhone,
  deletePersonPhone,
  setPrimaryPhone,
} from "@/lib/people/people.functions";
import { ROLE_LABELS_PT, type DetectedRole } from "@/lib/people/detect";

interface PersonMeta {
  roles: DetectedRole[] | null;
  company: string | null;
  job_title: string | null;
  budget_min: number | null;
  budget_max: number | null;
  search_location: string | null;
  search_property_type: string | null;
  reference_source: string | null;
}

export function PersonExtrasCard({ personId }: { personId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listPersonPhones);
  const add = useServerFn(addPersonPhone);
  const del = useServerFn(deletePersonPhone);
  const setPrim = useServerFn(setPrimaryPhone);

  const [newPhone, setNewPhone] = useState("");

  const phonesQ = useQuery({
    queryKey: ["person-phones", personId],
    queryFn: () => list({ data: { personId } }),
  });

  const metaQ = useQuery({
    queryKey: ["person-meta", personId],
    queryFn: async (): Promise<PersonMeta | null> => {
      const { data, error } = await supabase
        .from("people")
        .select("roles, company, job_title, budget_min, budget_max, search_location, search_property_type, reference_source")
        .eq("id", personId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PersonMeta) ?? null;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const raw = newPhone.trim();
      if (!raw) return;
      await add({ data: { personId, raw, isPrimary: (phonesQ.data ?? []).length === 0 } });
    },
    onSuccess: () => {
      setNewPhone("");
      qc.invalidateQueries({ queryKey: ["person-phones", personId] });
      toast.success("Telefone adicionado.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { await del({ data: { id } }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["person-phones", personId] }),
  });

  const primMut = useMutation({
    mutationFn: async (id: string) => { await setPrim({ data: { id, personId } }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["person-phones", personId] }),
  });

  const phones = phonesQ.data ?? [];
  const meta = metaQ.data;
  const roles = (meta?.roles ?? []) as DetectedRole[];

  const budget = meta?.budget_max
    ? `Até ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(meta.budget_max)}`
    : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Papéis</h3>
          {roles.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem papéis atribuídos.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <Badge key={r} variant="secondary">{ROLE_LABELS_PT[r] ?? r}</Badge>
              ))}
            </div>
          )}
        </div>

        {(meta?.company || meta?.job_title) && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Empresa</h3>
            <p className="text-sm text-foreground/80">
              {meta.job_title ? `${meta.job_title} · ` : ""}{meta.company ?? ""}
            </p>
          </div>
        )}

        {(meta?.search_location || meta?.search_property_type || budget) && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Procura</h3>
            <p className="text-sm text-foreground/80">
              {[meta?.search_property_type, meta?.search_location, budget].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}

        {meta?.reference_source && (
          <div className="text-xs text-muted-foreground">
            Origem: {meta.reference_source}
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold">Telefones</h3>
          {phonesQ.isLoading && <p className="text-xs text-muted-foreground">A carregar…</p>}
          {phones.length === 0 && !phonesQ.isLoading && (
            <p className="text-xs text-muted-foreground">Sem telefones registados.</p>
          )}
          <div className="space-y-1.5">
            {phones.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{p.e164 ?? p.raw}</span>
                  {p.isPrimary && <Badge variant="outline" className="text-[10px]">Principal</Badge>}
                  {p.kind && <span className="text-xs text-muted-foreground">· {p.kind}</span>}
                </div>
                <div className="flex gap-1">
                  {!p.isPrimary && (
                    <Button size="icon" variant="ghost" onClick={() => primMut.mutate(p.id)} title="Marcar como principal">
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => delMut.mutate(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <Input
              placeholder="Adicionar telefone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMut.mutate(); } }}
            />
            <Button size="sm" onClick={() => addMut.mutate()} disabled={!newPhone.trim() || addMut.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}