import { describe, expect, it } from "vitest";
import {
  appendKeepQuestion,
  buildAudioKeepQuestion,
  isSocialAudio,
  shouldAskKeepAudio,
  summariseAudio,
} from "./audio-keep";
import { pendingSlot } from "../pending-slots";

describe("guardo ou descarto — regra generalizada do áudio", () => {
  it("áudio sem registo estruturado (a pensar em voz alta) gera pergunta", () => {
    const t =
      "Estou só a pensar em voz alta: talvez faça sentido mudar a forma como apresento a avaliação aos proprietários, começar pelo mercado e só depois pelo preço.";
    expect(isSocialAudio(t)).toBe(false);
    expect(shouldAskKeepAudio(t)).toBe(true);
    const q = buildAudioKeepQuestion(summariseAudio(t));
    expect(q).toContain("Já percebi o essencial deste áudio");
    expect(q).toContain("Guardo o ficheiro no Drive Inteligente, ou descarto?");
  });

  it("áudios sociais não geram pergunta", () => {
    for (const t of ["Olá!", "Ok", "Obrigado", "bom dia"]) {
      expect(isSocialAudio(t)).toBe(true);
      expect(shouldAskKeepAudio(t)).toBe(false);
    }
  });

  it("a pergunta não é repetida se já estiver na resposta", () => {
    const q = buildAudioKeepQuestion("ideia sobre avaliações");
    expect(appendKeepQuestion("Feito.", q)).toBe(`Feito.\n\n${q}`);
    expect(appendKeepQuestion(q, q)).toBe(q);
  });

  it("vive numa ranhura própria, sem competir com o assunto principal", () => {
    expect(pendingSlot("confirm_keep_audio")).toBe("media");
    expect(pendingSlot("audio_breakdown")).toBe("main");
    expect(pendingSlot("choosing_document")).toBe("documents");
  });
});
