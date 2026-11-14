// Golden: nenhuma mensagem a terceiros sai sem confirmação explícita.
import { describe, expect, it } from "vitest";
import { TOOL_SPECS } from "./v2/tools";
import { sendConfirmedDraft } from "@/lib/email/reply-draft.server";

describe("ações externas exigem aprovação", () => {
  it("o modelo não tem nenhuma ferramenta que envie a terceiros", () => {
    const names = TOOL_SPECS.map((t: any) => t.function?.name ?? t.name);
    // As únicas ferramentas com "send/envia" falam com o próprio consultor
    // (send_reminder_now) ou só propõem um rascunho (compose_email_to_contact).
    const outbound = names.filter((n: string) => /send|share|forward|notify|whatsapp|telegram|sms/i.test(n));
    expect(outbound).toEqual(["send_reminder_now"]);
    expect(names).toContain("compose_email_to_contact");
  });

  it("o envio de email sem confirmação explícita é bloqueado", async () => {
    await expect(
      sendConfirmedDraft({ userId: "u", draftId: "d", confirmationText: "", channel: "whatsapp", confirmed: false }),
    ).rejects.toThrow(/confirmação explícita/);
  });
});
