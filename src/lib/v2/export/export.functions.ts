import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { V2_SELF_EXPORT_FLAG } from "../portal-scope";
import { EXPORT_TABLES, type ExportFailure } from "./bundle";

const PAGE = 1000;
const MAX_ROWS = 20_000;
const MAX_FILE_BYTES = 250 * 1024 * 1024;
const BUCKET = "assessor-files";

export type ExportBundleResponse =
  | { ok: false; reason: "not_enabled" }
  | {
      ok: true;
      generatedAt: string;
      tables: Array<{ table: string; rows: Record<string, any>[]; truncated: boolean }>;
      files: Array<{ name: string; mime: string; size: number; url: string; createdAt: string | null }>;
      failures: ExportFailure[];
    };

/**
 * Dados do próprio titular para o ZIP. Lê SEMPRE com o cliente do titular
 * (RLS aplica-se) e filtra pela coluna dona: nunca vê dados de outra conta.
 * Os documentos vêm como links temporários (10 min) do próprio titular.
 */
export const getMyExportBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExportBundleResponse> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isAccountFlagEnabled } = await import("@/lib/flags/account-flag.server");
    if (!(await isAccountFlagEnabled(supabaseAdmin, V2_SELF_EXPORT_FLAG, userId))) return { ok: false, reason: "not_enabled" };

    const failures: ExportFailure[] = [];
    const tables: Array<{ table: string; rows: Record<string, any>[]; truncated: boolean }> = [];
    for (const { table, owner } of EXPORT_TABLES) {
      const rows: Record<string, any>[] = [];
      let truncated = false;
      try {
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await (supabase.from(table as any) as any)
            .select("*")
            .eq(owner, userId)
            .order(owner === "id" ? "id" : "created_at", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          const page = ((data ?? []) as Record<string, unknown>[]).filter((r) => r[owner] === userId);
          rows.push(...page);
          if ((data ?? []).length < PAGE) break;
          if (rows.length >= MAX_ROWS) { truncated = true; break; }
        }
        tables.push({ table, rows, truncated });
        if (truncated) failures.push({ item: `dados:${table}`, reason: `limite de ${MAX_ROWS} registos atingido` });
      } catch {
        failures.push({ item: `dados:${table}`, reason: "leitura falhou" });
      }
    }

    const files: Array<{ name: string; mime: string; size: number; url: string; createdAt: string | null }> = [];
    try {
      const { data, error } = await (supabase.from("uploaded_files") as any)
        .select("id, user_id, original_file_name, mime_type, size_bytes, storage_path, created_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw new Error(error.message);
      let total = 0;
      const wanted: any[] = [];
      for (const r of (data ?? []) as any[]) {
        if (r.user_id !== userId) continue;
        const size = Number(r.size_bytes ?? 0);
        if (total + size > MAX_FILE_BYTES) {
          failures.push({ item: `documento:${r.original_file_name ?? r.id}`, reason: "não incluído: limite de tamanho do ZIP" });
          continue;
        }
        total += size;
        wanted.push(r);
      }
      for (let i = 0; i < wanted.length; i += 100) {
        const chunk = wanted.slice(i, i + 100);
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(chunk.map((r) => r.storage_path), 600);
        chunk.forEach((r, j) => {
          const s = signed?.[j];
          if (!s || s.error || !s.signedUrl) {
            failures.push({ item: `documento:${r.original_file_name ?? r.id}`, reason: "não foi possível preparar o download" });
            return;
          }
          files.push({ name: r.original_file_name || `documento-${r.id}`, mime: r.mime_type ?? "application/octet-stream", size: Number(r.size_bytes ?? 0), url: s.signedUrl, createdAt: r.created_at ?? null });
        });
      }
    } catch {
      failures.push({ item: "documentos", reason: "leitura falhou" });
    }

    return { ok: true, generatedAt: new Date().toISOString(), tables, files, failures };
  });
