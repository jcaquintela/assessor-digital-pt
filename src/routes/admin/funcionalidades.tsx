import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFeatureFlags, upsertFeatureFlag } from "@/lib/admin.functions";
import { useAdminRole } from "./route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/admin/funcionalidades")({
  head: () => ({ meta: [{ title: "Funcionalidades — Admin" }] }),
  component: FlagsPage,
});

const DEFAULT_FLAGS = [
  { key: "chat_ai", description: "Chat com interpretação por IA" },
  { key: "audio", description: "Registo por áudio" },
  { key: "google_calendar", description: "Integração Google Calendar" },
  { key: "microsoft_calendar", description: "Integração Microsoft Calendar" },
  { key: "whatsapp", description: "Entrada por WhatsApp" },
  { key: "financial", description: "Módulo financeiro" },
  { key: "receipt_ocr", description: "Leitura de recibos" },
  { key: "crm_integrations", description: "Integrações CRM" },
];

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

  const byKey = new Map<string, any>((flags ?? []).map((f: any) => [f.key, f]));
  const rows = DEFAULT_FLAGS.map((d) => ({ ...d, ...(byKey.get(d.key) ?? {}) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funcionalidades</h1>
        <p className="text-sm text-muted-foreground">Ativação global, por plano ou rollout percentual.</p>
      </div>
      {!isSuper && <p className="text-xs text-amber-600">Só super_admin pode alterar.</p>}
      <Card>
        <CardHeader><CardTitle className="text-base">Flags disponíveis</CardTitle></CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">A carregar…</p>}
          {rows.map((f) => <FlagRow key={f.key} flag={f} disabled={!isSuper} onSave={(v) => mut.mutate(v)} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function FlagRow({ flag, disabled, onSave }: { flag: any; disabled: boolean; onSave: (v: any) => void }) {
  const [enabled, setEnabled] = useState<boolean>(!!flag.enabled_globally);
  const [rollout, setRollout] = useState<number>(flag.rollout_percentage ?? 0);
  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="font-medium">{flag.key}</div>
        <div className="text-xs text-muted-foreground">{flag.description}</div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled} />
          Ativo globalmente
        </label>
        <label className="flex items-center gap-2 text-xs">
          Rollout
          <Input type="number" min={0} max={100} value={rollout} onChange={(e) => setRollout(Number(e.target.value))} className="w-20" disabled={disabled} />
          %
        </label>
        <Button size="sm" disabled={disabled} onClick={() => onSave({ key: flag.key, description: flag.description, enabled_globally: enabled, enabled_plans: flag.enabled_plans ?? [], rollout_percentage: rollout })}>
          Guardar
        </Button>
      </div>
    </div>
  );
}