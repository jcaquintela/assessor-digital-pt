// Impressão digital do conteúdo (SHA-256) para reconhecer reenvios do mesmo
// ficheiro. Puro e sem dependências de Node — corre no worker.

export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
