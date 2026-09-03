// Fase 3 — ligação entre as fichas (pessoa, imóvel, negócio) e a eliminação
// permanente. O diagnóstico corre ANTES de a ficha mostrar seja o que for: se o
// registo estiver bloqueado por retenção legal, a opção "Eliminar" nem chega a
// aparecer — no caso das pessoas aparece "Anonimizar" no lugar dela.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PermanentDeleteDialog } from "@/components/records/permanent-delete-dialog";
import {
  anonymizePersonFn,
  assessEntityDeletionFn,
  permanentlyDeleteEntityFn,
} from "@/lib/records/entity-delete.functions";
import type { EntityDeleteAssessment, EntityDeleteType } from "@/lib/records/entity-delete";

export function useEntityDelete(input: {
  type: EntityDeleteType;
  id: string;
  /** Só vale a pena diagnosticar registos já arquivados. */
  enabled: boolean;
  onDone: () => void;
}) {
  const { type, id, enabled, onDone } = input;
  const qc = useQueryClient();
  const avaliar = useServerFn(assessEntityDeletionFn);
  const eliminar = useServerFn(permanentlyDeleteEntityFn);
  const anonimizar = useServerFn(anonymizePersonFn);

  const [aberto, setAberto] = useState<null | "eliminar" | "anonimizar">(null);

  const q = useQuery({
    queryKey: ["entity-delete-assessment", type, id],
    queryFn: () => avaliar({ data: { type, id } }) as Promise<EntityDeleteAssessment>,
    enabled: enabled && !!id,
    staleTime: 15_000,
  });

  const executar = useMutation({
    mutationFn: async (vars: { modo: "eliminar" | "anonimizar"; reason: string }) =>
      vars.modo === "anonimizar"
        ? anonimizar({ data: { id, reason: vars.reason } })
        : eliminar({ data: { type, id, reason: vars.reason } }),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.modo === "anonimizar" ? "Pessoa anonimizada." : "Registo eliminado para sempre.",
      );
      setAberto(null);
      void qc.invalidateQueries();
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const a = q.data;
  const podeEliminar = !!a?.canDelete;
  const podeAnonimizar = !!a?.canAnonymize;
  const bloqueio = a?.blocked ? a.blockReasons : [];

  const detalhes =
    aberto === "anonimizar"
      ? ["O nome, telefone e email são substituídos por um marcador.", "Negócios e comissões ficam intactos.", "Não é reversível."]
      : (a?.cascade ?? []).map((c) => `Elimina também ${c.label}.`);

  const dialogos = (
    <PermanentDeleteDialog
      open={aberto !== null}
      onOpenChange={(v) => !v && setAberto(null)}
      modo={aberto === "anonimizar" ? "anonimizar" : "eliminar"}
      alvo={a?.alvo ?? "este registo"}
      detalhes={detalhes}
      aExecutar={executar.isPending}
      onConfirm={(reason) =>
        executar.mutate({ modo: aberto === "anonimizar" ? "anonimizar" : "eliminar", reason })
      }
    />
  );

  return {
    assessment: a,
    aCarregar: q.isLoading,
    podeEliminar,
    podeAnonimizar,
    bloqueio,
    abrirEliminar: () => setAberto("eliminar"),
    abrirAnonimizar: () => setAberto("anonimizar"),
    dialogos,
  };
}
