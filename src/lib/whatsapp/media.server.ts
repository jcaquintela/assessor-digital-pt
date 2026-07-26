// Descarrega media do WhatsApp Cloud API pelo media id.
// Fluxo: GET /v20.0/{media-id} -> { url, mime_type }, depois GET url com Bearer.

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

export type WhatsAppMedia = {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
};

export async function downloadWhatsAppMedia(mediaId: string): Promise<WhatsAppMedia> {
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