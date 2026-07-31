import { describe, it, expect } from "vitest";
import { confirmBusinessCardContact } from "./business-card.server";

describe("cartão → contacto", () => {
  it("cria pessoa e vcf", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", "julio.quintela@saguii.com").maybeSingle();
    const userId = (prof as any).id;
    const card = { name: "Ricardo Sousa Martins", phone: "912345678", email: "ricardo.martins@douroprime.pt", company: "Imobiliária Douro Prime", jobTitle: "Diretor Comercial" };
    const res = await confirmBusinessCardContact({ supabase: supabaseAdmin, userId, channel: "whatsapp", card });
    console.log("RES", res.ok, res.reply, res.personId, res.vcard?.fileName, !!res.vcard?.signedUrl);
    expect(res.ok).toBe(true);
    if (res.personId) await supabaseAdmin.from("people").delete().eq("id", res.personId);
  }, 60000);
});
