// Testes de equivalência do Channel Gateway.
// Objectivo: garantir que o payload cru de WhatsApp e Telegram normaliza
// para NormalizedInbound com o MESMO shape esperado pelo pipeline unificado.

import { describe, it, expect } from "vitest";
import { whatsappAdapter } from "./whatsapp-adapter";
import { telegramAdapter } from "./telegram-adapter";

function waTextPayload(body: string, from = "351912345678", id = "wamid.TEST_1") {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{ id, from, type: "text", text: { body } }],
        },
      }],
    }],
  };
}

function tgTextPayload(text: string, chatId = 123456789, updateId = 42) {
  return {
    update_id: updateId,
    message: {
      message_id: 7,
      chat: { id: chatId, type: "private" },
      from: { id: chatId, first_name: "Júlio", username: "julio" },
      text,
    },
  };
}

describe("channel-gateway equivalence", () => {
  it("ambos normalizam texto simples com o mesmo shape", () => {
    const [wa] = whatsappAdapter.parseUpdate(waTextPayload("Olá"));
    const [tg] = telegramAdapter.parseUpdate(tgTextPayload("Olá"));

    for (const n of [wa, tg]) {
      expect(n.messageType).toBe("text");
      expect(n.text).toBe("Olá");
      expect(n.media).toBeNull();
      expect(n.callback).toBeNull();
      expect(typeof n.externalConversationId).toBe("string");
      expect(n.externalMessageId.length).toBeGreaterThan(0);
      expect(n.receivedAt).toBeInstanceOf(Date);
    }

    expect(wa.channel).toBe("whatsapp");
    expect(tg.channel).toBe("telegram");
  });

  it("statuses de WhatsApp e updates vazios de Telegram são ignorados", () => {
    const waStatus = whatsappAdapter.parseUpdate({
      entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "delivered" }] } }] }],
    });
    const tgEmpty = telegramAdapter.parseUpdate({ update_id: 1 });
    expect(waStatus).toHaveLength(0);
    expect(tgEmpty).toHaveLength(0);
  });

  it("botões interactivos aparecem como callback com data", () => {
    const [wa] = whatsappAdapter.parseUpdate({
      entry: [{ changes: [{ value: { messages: [{
        id: "wamid.CB", from: "351912345678", type: "interactive",
        interactive: { button_reply: { id: "yes", title: "Sim" } },
      }] } }] }],
    });
    const [tg] = telegramAdapter.parseUpdate({
      update_id: 99,
      callback_query: {
        id: "cbq1",
        data: "Sim",
        from: { id: 1, first_name: "J" },
        message: { chat: { id: 111 } },
      },
    });
    expect(wa.messageType).toBe("callback");
    expect(tg.messageType).toBe("callback");
    expect(wa.callback?.data).toBe("Sim");
    expect(tg.callback?.data).toBe("Sim");
  });

  it("media (imagem) traz externalFileId em ambos os canais", () => {
    const [wa] = whatsappAdapter.parseUpdate({
      entry: [{ changes: [{ value: { messages: [{
        id: "wamid.IMG", from: "351912345678", type: "image",
        image: { id: "MEDIA_ID", mime_type: "image/jpeg", caption: "placa" },
      }] } }] }],
    });
    const [tg] = telegramAdapter.parseUpdate({
      update_id: 100,
      message: {
        message_id: 1,
        chat: { id: 111 },
        from: { id: 1 },
        caption: "placa",
        photo: [{ file_id: "small" }, { file_id: "big" }],
      },
    });
    expect(wa.messageType).toBe("image");
    expect(tg.messageType).toBe("image");
    expect(wa.media?.externalFileId).toBe("MEDIA_ID");
    expect(tg.media?.externalFileId).toBe("big");
    expect(wa.text).toBe("placa");
    expect(tg.text).toBe("placa");
  });
});