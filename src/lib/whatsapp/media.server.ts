// Descarrega media do WhatsApp Cloud API pelo media id.
// Fluxo: GET /v20.0/{media-id} -> { url, mime_type }, depois GET url com Bearer.

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

export type WhatsAppMedia = {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
};

export async function downloadWhatsAppMedia(mediaId: string): Promise<WhatsAppMedia> {
  return downloadWhatsAppMediaInner(mediaId);
}

/**
 * Carrega bytes para a Cloud API e devolve o media id, para depois enviar
 * como documento. Multipart directo ao Graph (o token nunca é registado).
 */
export async function uploadWhatsAppMedia(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { ok: false, error: "Credenciais WhatsApp em falta" };
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append(
      "file",
      new Blob([bytes as unknown as BlobPart], { type: mimeType }),
      fileName,
    );
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, error: `Meta media upload ${res.status}: ${text.slice(0, 200)}` };
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* noop */ }
    if (!json?.id) return { ok: false, error: "Meta media upload sem id" };
    return { ok: true, mediaId: String(json.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function downloadWhatsAppMediaInner(mediaId: string): Promise<WhatsAppMedia> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN not set");

  const metaRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    const t = await metaRes.text().catch(() => "");
    throw new Error(`Meta media metadata ${metaRes.status}: ${t.slice(0, 200)}`);
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!meta.url) throw new Error("Meta media metadata missing url");

  const bin = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!bin.ok) {
    const t = await bin.text().catch(() => "");
    throw new Error(`Meta media download ${bin.status}: ${t.slice(0, 200)}`);
  }
  const buf = await bin.arrayBuffer();
  const bytes = new Uint8Array(buf);
  return {
    bytes,
    mimeType: meta.mime_type ?? bin.headers.get("content-type") ?? "application/octet-stream",
    size: bytes.byteLength,
  };
}