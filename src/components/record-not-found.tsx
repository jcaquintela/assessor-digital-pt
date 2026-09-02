import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { explainMissingRecord } from "@/lib/records/record-visibility.functions";
import { missingRecordCopy } from "@/lib/records/missing-record";

type Kind = "follow_up" | "person" | "property" | "opportunity" | "prospecting_lead" | "file";

/**
 * Ecrã de "registo não encontrado" que diz a verdade: se o registo existe
 * noutra conta, o consultor vê o email da sessão atual e pode trocar de conta
 * em vez de pensar que perdeu dados.
 */
export function RecordNotFound({
  kind,
  id,
  label,
  backTo,
  backLabel = "Voltar",
}: {
  kind: Kind;
  id: string;
  label: string;
  backTo: string;
  backLabel?: string;
}) {
  const navigate = useNavigate();
  const explain = useServerFn(explainMissingRecord);
  const { data } = useQuery({
    queryKey: ["missing-record", kind, id],
    queryFn: () => explain({ data: { kind, id } }),
    retry: false,
    staleTime: 60_000,
  });

  const copy = missingRecordCopy(data?.kind ?? "absent", {
    label,
    sessionEmail: data?.sessionEmail ?? null,
  });

  const trocarConta = async () => {
    const back = typeof window !== "undefined" ? window.location.pathname : backTo;
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: back } as never, replace: true });
  };

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => navigate({ to: backTo as never })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> {backLabel}
        </Button>
        {copy.showSwitchAccount && (
          <Button onClick={trocarConta}>
            <LogOut className="mr-1 h-4 w-4" /> Terminar sessão e entrar com outra conta
          </Button>
        )}
      </div>
    </>
  );
}
