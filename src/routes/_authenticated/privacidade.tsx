import { appTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalShell } from "@/components/v2/portal-shell";
import { getMyPortalMode } from "@/lib/v2/portal.functions";
import { getMyExportBundle } from "@/lib/v2/export/export.functions";
import { buildExportZip, type ExportFailure, type ExportFile } from "@/lib/v2/export/bundle";
import { dateStamp } from "@/lib/export/download";

const DESC = "Vê, corrige, exporta ou pede para apagar os teus dados do Afonso.";

export const Route = createFileRoute("/_authenticated/privacidade")({
  head: () => ({
    meta: [
      { title: appTitle("Privacidade e dados") },
      { name: "description", content: DESC },
      { property: "og:title", content: appTitle("Privacidade e dados") },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  const modeFn = useServerFn(getMyPortalMode);
  const bundleFn = useServerFn(getMyExportBundle);
  const { data: mode } = useQuery({ queryKey: ["v2-portal-mode"], queryFn: () => modeFn() });
  const [busy, setBusy] = useState<string | null>(null);

  const runExport = async () => {
    setBusy("A juntar os teus dados…");
    try {
      const r = await bundleFn();
      if (!r.ok) {
        toast.error("A exportação ainda não está disponível na tua conta.");
        return;
      }
      const failures: ExportFailure[] = [...r.failures];
      const files: ExportFile[] = [];
      for (let i = 0; i < r.files.length; i++) {
        const f = r.files[i];
        setBusy(`A descarregar documentos (${i + 1} de ${r.files.length})…`);
        try {
          const res = await fetch(f.url);
          if (!res.ok) throw new Error(String(res.status));
          files.push({ name: f.name, mime: f.mime, bytes: new Uint8Array(await res.arrayBuffer()), createdAt: f.createdAt });
        } catch {
          failures.push({ item: `documento:${f.name}`, reason: "não foi possível descarregar" });
        }
      }
      setBusy("A preparar o ficheiro…");
      const { zip } = await buildExportZip({ generatedAt: r.generatedAt, tables: r.tables, files, failures });
      const url = URL.createObjectURL(new Blob([zip as unknown as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `afonso-os-meus-dados-${dateStamp()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (failures.length) toast.warning(`Exportação pronta. ${failures.length} item(ns) ficaram de fora — está tudo no manifesto.`);
      else toast.success("Exportação pronta.");
    } catch {
      toast.error("Não consegui preparar a exportação. Tenta outra vez daqui a pouco.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PortalShell title="Privacidade e dados" subtitle="Os teus dados são teus. Ninguém da equipa os vê sem o teu consentimento, e cada acesso fica registado.">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-medium">Exportar os meus dados</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Um ficheiro ZIP com os teus registos (JSON e CSV que abre no Excel), os documentos originais que enviaste e um
          manifesto com contagens, datas e falhas. Não inclui dados de outras pessoas com conta nem segredos de acesso.
        </p>
        <Button className="mt-4" onClick={runExport} disabled={!mode?.exportEnabled || !!busy}>
          <Download className="mr-2 h-4 w-4" aria-hidden />
          {busy ?? "Preparar exportação"}
        </Button>
        {!mode?.exportEnabled ? (
          <p className="mt-2 text-xs text-muted-foreground">Ainda não disponível na tua conta.</p>
        ) : null}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-medium">Ver e corrigir</h2>
        <p className="mt-1 text-muted-foreground">
          Pergunta ao Afonso o que ele sabe sobre uma pessoa, um imóvel ou um negócio, e diz-lhe o que está errado. Ele corrige na hora.
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-medium">Apagar</h2>
        <p className="mt-1 text-muted-foreground">
          Pede ao Afonso ou ao suporte para apagar a tua conta. Exporta primeiro se quiseres guardar alguma coisa. Alguns
          registos, como faturas, têm de ser guardados durante o prazo que a lei exige.
        </p>
      </section>
    </PortalShell>
  );
}
