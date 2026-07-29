import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFeatureFlags, upsertFeatureFlag } from "@/lib/admin.functions";
import { useAdminRole } from "./route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/admin/funcionalidades")({
  head: () => ({ meta: [{ title: "Funcionalidades — Admin" }] }),
  component: FlagsPage,
});

// Flags reais: cada chave só aparece aqui se tiver um ponto de leitura no
// motor. `readAt` documenta onde é lida — se ficar null, a flag não controla
// nada e é apresentada como "sem efeito".
const KNOWN_FLAGS: Record<string, { label: string; readAt: string | null }> = {
  "assessor.engine.v2": {
    label: "Motor conversacional v2",
    readAt: "isEngineV2Enabled → engine.server.ts:378",
  },
  "assessor.engine.v3": {
    label: "Reasoning Engine v3",
    readAt: "isEngineV3Enabled → engine.server.ts:367; proactive-tick.ts; proactivity.server.ts",
  },
  "assessor.supreme.v1": {
    label: "Assessor Supremo (prioridades + autonomia)",
    readAt: "isSupremeEnabled → priorities.functions.ts, autonomy.functions.ts",
  },
  "drive.v1": {
    label: "Drive Inteligente",
    readAt: null,
  },
};

function FlagsPage() {
  const { data: me } = useAdminRole();
  const isSuper = me?.role === "super_admin";
  const qc = useQueryClient();
  const list = useServerFn(listFeatureFlags);
  const upsert = useServerFn(upsertFeatureFlag);
  const { data: flags, isLoading } = useQuery({ queryKey: ["admin", "flags"], queryFn: () => list() });
  const mut = useMutation({
    mutationFn: (input: any) => upsert({ data: input }),
    onSuccess: () => { toast.success("Guardado."); qc.invalidateQueries({ queryKey: ["admin", "flags"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  // Fonte única: a tabela feature_flags. Nada é inventado no cliente.
  const rows = (flags ?? []).map((f: any) => ({
    ...f,
    label: KNOWN_FLAGS[f.key]?.label ?? f.key,
    readAt: KNOWN_FLAGS[f.key]?.readAt ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funcionalidades</h1>
        <p className="text-sm text-muted-foreground">
          Flags reais lidas pelo motor. Ativação global ou por utilizador (tabela de utilizadores da flag).
        </p>
      </div>
      {!isSuper && <p className="text-xs text-amber-600">Só super_admin pode alterar.</p>}
      <Card>
        <CardHeader><CardTitle className="text-base">Flags disponíveis</CardTitle></CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">A carregar…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Não existem flags registadas.</p>
          )}
          {rows.map((f) => <FlagRow key={f.key} flag={f} disabled={!isSuper} onSave={(v) => mut.mutate(v)} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function FlagRow({ flag, disabled, onSave }: { flag: any; disabled: boolean; onSave: (v: any) => void }) {
  const [enabled, setEnabled] = useState<boolean>(!!flag.enabled_globally);
  const inert = !flag.readAt;
  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{flag.label}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{flag.key}</code>
          {inert && (
            <span className="rounded-full border border-amber-300 px-2 py-0.5 text-[11px] text-amber-600">
              sem efeito
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{flag.description}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {inert ? "Sem ponto de leitura no motor — ligar não altera comportamento." : `Lida em: ${flag.readAt}`}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled || inert} />
          Ativo globalmente
        </label>
        <Button
          size="sm"
          disabled={disabled || inert}
          onClick={() => onSave({ key: flag.key, description: flag.description, enabled_globally: enabled, enabled_plans: flag.enabled_plans ?? [], rollout_percentage: flag.rollout_percentage ?? 0 })}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}