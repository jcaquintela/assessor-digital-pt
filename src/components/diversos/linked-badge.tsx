// Mostra, de forma visível, a quem/que imóvel uma nota ficou associada.
// Sem isto a associação era silenciosa e impossível de verificar a olho.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Home, User } from "lucide-react";

export function usePersonName(id?: string | null) {
  return useQuery({
    queryKey: ["misc-linked", "person", id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("name").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as { name?: string } | null)?.name ?? null;
    },
  });
}

export function usePropertyLabel(id?: string | null) {
  return useQuery({
    queryKey: ["misc-linked", "property", id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("title, address, location")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      const r = data as { title?: string; address?: string; location?: string } | null;
      return r ? r.title || r.address || r.location || "Imóvel" : null;
    },
  });
}

export function MiscLinkedBadges({
  personId,
  propertyId,
  className,
}: {
  personId?: string | null;
  propertyId?: string | null;
  className?: string;
}) {
  const person = usePersonName(personId);
  const property = usePropertyLabel(propertyId);
  if (!personId && !propertyId) return null;
  return (
    <div className={"flex flex-wrap items-center gap-1.5 " + (className ?? "")}>
      {personId ? (
        <span className="c-badge ok" title="Pessoa associada a esta nota">
          <User className="h-3 w-3" /> Associado a: {person.data ?? "…"}
        </span>
      ) : null}
      {propertyId ? (
        <span className="c-badge ok" title="Imóvel associado a esta nota">
          <Home className="h-3 w-3" /> Associado a: {property.data ?? "…"}
        </span>
      ) : null}
    </div>
  );
}