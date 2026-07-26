import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listUploadedFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("uploaded_files")
      .select(
        "id, channel, original_file_name, mime_type, size_bytes, processing_status, classification, error_code, error_message, related_resource_type, related_resource_id, storage_path, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getUploadedFileSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("uploaded_files")
      .select("storage_path, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || (row as any).user_id !== userId) throw new Error("Ficheiro não encontrado.");
    const path = (row as any).storage_path as string;
    if (!path) throw new Error("Ficheiro sem caminho de armazenamento.");
    const { data: signed, error: sErr } = await supabase.storage
      .from("assessor-files")
      .createSignedUrl(path, 300);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Não foi possível gerar link.");
    return { url: signed.signedUrl, expiresIn: 300 };
  });

export const deleteUploadedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("uploaded_files")
      .select("storage_path, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || (row as any).user_id !== userId) throw new Error("Ficheiro não encontrado.");
    const path = (row as any).storage_path as string | null;
    if (path) {
      await supabase.storage.from("assessor-files").remove([path]);
    }
    const { error: delErr } = await supabase.from("uploaded_files").delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });