// Golden: cartões de contacto partilhados nativamente (WhatsApp/Telegram).
import { describe, it, expect } from "vitest";
import { whatsappAdapter } from "./channel-gateway/whatsapp-adapter";
import { telegramAdapter } from "./channel-gateway/telegram-adapter";
import {
  sharedContactToCard,
  looksLikeSaveContactRequest,
  missingContactReply,
} from "./shared-contact";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { findExistingPersonForCard, hadRecentSaveRequest } from "./shared-contact.server";

function waContactsPayload(contacts: any[]) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: "wamid.1",
            from: "351912345678",
            type: "contacts",
            contacts,
          }],
        },
      }],
    }],
  };
}

const JORGE = {
  name: { formatted_name: "Jorge Ferraz", first_name: "Jorge", last_name: "Ferraz" },
  phones: [{ phone: "+351 913 456 789", wa_id: "351913456789" }],
  emails: [{ email: "jorge@mcd.pt" }],
  org: { company: "McDonalds", title: "Gerente" },
};

describe("cartão de contacto partilhado", () => {
  it("G1 — WhatsApp: cartão do Jorge Ferraz vira contacto completo", () => {
    const [inbound] = whatsappAdapter.parseUpdate(waContactsPayload([JORGE]));
    expect(inbound!.messageType).toBe("contact");
    const { card, extraPhones } = sharedContactToCard(inbound!.contacts![0]!);
    expect(card).toEqual({
      name: "Jorge Ferraz",
      phone: "+351913456789",
      email: "jorge@mcd.pt",
      company: "McDonalds",
      jobTitle: "Gerente",
    });
    expect(extraPhones).toEqual([]);
  });

  it("G2 — Telegram: contacto nativo dá o mesmo resultado", () => {
    const [inbound] = telegramAdapter.parseUpdate({
      update_id: 5,
      message: {
        message_id: 9,
        chat: { id: 777 },
        contact: {
          phone_number: "+351913456789",
          first_name: "Jorge",
          last_name: "Ferraz",
          vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:Jorge Ferraz\nORG:McDonalds\nTITLE:Gerente\nEMAIL:jorge@mcd.pt\nEND:VCARD",
        },
      },
    });
    expect(inbound!.messageType).toBe("contact");
    const { card } = sharedContactToCard(inbound!.contacts![0]!);
    expect(card?.name).toBe("Jorge Ferraz");
    expect(card?.phone).toBe("+351913456789");
    expect(card?.company).toBe("McDonalds");
    expect(card?.email).toBe("jorge@mcd.pt");
  });

  it("G3 — contacto já existente não é duplicado", async () => {
    const supabase = makeFakeSupabase({
      people: [{ id: "p1", user_id: "u1", name: "Jorge Ferraz", phone: "+351913456789" }],
      person_phones: [],
    });
    const { card } = sharedContactToCard(
      whatsappAdapter.parseUpdate(waContactsPayload([JORGE]))[0]!.contacts![0]!,
    );
    const hit = await findExistingPersonForCard(supabase, "u1", card!);
    expect(hit?.id).toBe("p1");
  });

  it("G4 — cartão só com nome pede o contacto em vez de falhar", () => {
    const [inbound] = whatsappAdapter.parseUpdate(
      waContactsPayload([{ name: { formatted_name: "Ana Sousa" }, phones: [], emails: [] }]),
    );
    const parsed = sharedContactToCard(inbound!.contacts![0]!);
    expect(parsed.card).toBeNull();
    expect(parsed.missing).toBe("phone");
    expect(missingContactReply(parsed)).toMatch(/número/i);
  });

  it("G5 — vários números: principal + secundários", () => {
    const [inbound] = whatsappAdapter.parseUpdate(
      waContactsPayload([{
        name: { formatted_name: "Rui Lopes" },
        phones: [{ phone: "+351912000000" }, { phone: "+351933111222" }],
      }]),
    );
    const parsed = sharedContactToCard(inbound!.contacts![0]!);
    expect(parsed.card?.phone).toBe("+351912000000");
    expect(parsed.extraPhones).toEqual(["+351933111222"]);
  });

  it("G6 — 'Guarda o contacto' antes do cartão dispensa a confirmação", async () => {
    expect(looksLikeSaveContactRequest("Guarda o contacto")).toBe(true);
    expect(looksLikeSaveContactRequest("bom dia")).toBe(false);
    const supabase = makeFakeSupabase({
      assessor_messages: [{
        id: "m1", user_id: "u1", channel: "whatsapp", role: "user",
        content: "Guarda o contacto", created_at: new Date().toISOString(),
      }],
    });
    await expect(hadRecentSaveRequest(supabase, "u1", "whatsapp")).resolves.toBe(true);
  });
});
