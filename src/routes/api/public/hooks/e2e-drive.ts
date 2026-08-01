// HARNESS TEMPORÁRIO — prova real do Drive Inteligente. Remover após o teste.
import { createFileRoute } from "@tanstack/react-router";

const USER = "08d24695-a12c-4954-887a-81a71215a87e";

export const Route = createFileRoute("/api/public/hooks/e2e-drive")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { autoLinkAndSuggest, applyLinkSuggestion } = await import("@/lib/drive/link-suggestions.server");
        const log: any = {};
        const stamp = Date.now();
        const personName = `Mariana Drive ${stamp}`;
        const propTitle = `Apartamento Rua do Teste Drive ${stamp}`;
        const dealTitle = `Negócio Drive ${stamp}`;

        const { data: person } = await supabaseAdmin.from("people")
          .insert({ user_id: USER, name: personName } as never).select("id").single();
        const { data: prop } = await supabaseAdmin.from("properties")
          .insert({ user_id: USER, title: propTitle } as never).select("id").single();
        const { data: deal } = await supabaseAdmin.from("opportunities")
          .insert({ user_id: USER, title: dealTitle } as never).select("id").single();

        const { data: file } = await supabaseAdmin.from("uploaded_files").insert({
          user_id: USER,
          channel: "dashboard",
          original_file_name: "CPCV teste.pdf",
          internal_file_name: `e2e-${stamp}.pdf`,
          mime_type: "application/pdf",
          storage_path: `e2e/${stamp}.pdf`,
          processing_status: "processed",
          extracted_text: `Contrato relativo ao ${propTitle}. Proprietária: ${personName}. Referente ao ${dealTitle}.`,
        } as never).select("id").single();

        log.created = { person: person?.id, property: prop?.id, deal: deal?.id, file: file?.id };

        const auto = await autoLinkAndSuggest({
          supabase: supabaseAdmin,
          userId: USER,
          channel: "dashboard",
          fileId: file!.id,
          fileLabel: "o CPCV teste",
        });
        log.auto = { linked: auto.linked, suggested: auto.suggested, reply: auto.reply };

        const { data: pending } = await supabaseAdmin.from("pending_actions")
          .select("id, intent, structured_payload, pending_question, status")
          .eq("user_id", USER).eq("intent", "suggest_file_link")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        log.pending = pending;

        if (pending) {
          log.applied = await applyLinkSuggestion(supabaseAdmin, USER, (pending as any).structured_payload);
          await supabaseAdmin.from("pending_actions").update({ status: "executed" } as never).eq("id", (pending as any).id);
        }

        const { data: links } = await supabaseAdmin.from("file_links")
          .select("entity_type, entity_id, relation_type, created_by").eq("file_id", file!.id);
        log.links_after = links;

        // Grafo: ficheiros relacionados a partir da Pessoa
        const { listRelatedFiles } = await import("@/lib/drive/related-files.server");
        try {
          log.graph_from_person = await listRelatedFiles(supabaseAdmin, USER, "person", person!.id);
        } catch (e: any) { log.graph_error = String(e?.message ?? e); }

        if (new URL("http://x/?" ).searchParams) { /* noop */ }
        // limpeza
        await supabaseAdmin.from("file_links").delete().eq("file_id", file!.id);
        await supabaseAdmin.from("uploaded_files").delete().eq("id", file!.id);
        await supabaseAdmin.from("pending_actions").delete().eq("user_id", USER).eq("intent", "suggest_file_link");
        await supabaseAdmin.from("opportunities").delete().eq("id", deal!.id);
        await supabaseAdmin.from("properties").delete().eq("id", prop!.id);
        await supabaseAdmin.from("people").delete().eq("id", person!.id);

        return new Response(JSON.stringify(log, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
