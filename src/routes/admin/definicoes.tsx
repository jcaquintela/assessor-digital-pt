import { adminTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getGlobalReminderLead,
  setGlobalReminderLead,
} from "@/lib/admin/reminder-settings.functions";

const OPTIONS = [0, 5, 10, 15, 30, 60];

function ReminderLeadCard() {
  const qc = useQueryClient();
  const fetchLead = useServerFn(getGlobalReminderLead);
  const saveLead = useServerFn(setGlobalReminderLead);
  const { data } = useQuery({ queryKey: ["admin", "reminder-lead"], queryFn: () => fetchLead() });
  const [minutes, setMinutes] = useState<number>(0);
  useEffect(() => {
    if (typeof data?.minutes === "number") setMinutes(data.minutes);
  }, [data?.minutes]);
  const save = useMutation({
    mutationFn: (m: number) => saveLead({ data: { minutes: m } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reminder-lead"] });
      toast.success("Antecedência global guardada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-700">
      <h2 className="text-sm font-semibold">Antecedência dos lembretes</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Quanto tempo antes do compromisso o Afonso avisa, por defeito. Cada consultor pode escolher
        outro valor nas suas definições. Zero mantém o aviso à hora do compromisso.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMinutes(m); save.mutate(m); }}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              minutes === m
                ? "border-slate-900 bg-slate-900 text-slate-50 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-300 dark:border-slate-700"
            }`}
          >
            {m === 0 ? "À hora" : `${m} min antes`}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/definicoes")({
  head: () => ({ meta: [{ title: adminTitle("Definições") }] }),
  component: () => (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Definições</h1>
        <p className="text-sm text-muted-foreground">Preferências da plataforma.</p>
      </div>
      <ReminderLeadCard />
    </div>
  ),
});