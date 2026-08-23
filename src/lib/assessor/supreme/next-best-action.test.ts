import { describe, expect, it } from "vitest";
import {
  isWeekendYmd,
  selectNextBestAction,
  type NbaCandidate,
} from "./next-best-action";

const imovel = (over: Partial<NbaCandidate> = {}): NbaCandidate => ({
  key: "imovel_parado:p1",
  kind: "imovel_parado",
  label: "o T3 da Rua das Flores",
  reason: "está parado há 22 dias, sem visitas nem alterações",
  action: "Atualizar as fotos e o texto do anúncio antes de mexer no preço.",
  days: 22,
  value: 250000,
  to: "/imoveis/p1",
  contactsThirdParty: false,
  ...over,
});

describe("Próxima melhor ação — nível 2", () => {
  it("1) prioridades vazias + 1 imóvel parado há 22 dias → variante C com o imóvel nomeado", () => {
    const s = selectNextBestAction({ candidates: [imovel()] });
    expect(s).not.toBeNull();
    expect(s!.variant).toBe("C");
    expect(s!.text).toBe(
      "Não há nada a arder. Se tivesse de escolher uma coisa, era o T3 da Rua das Flores — está parado há 22 dias, sem visitas nem alterações.",
    );
    expect(s!.to).toBe("/imoveis/p1");
  });

  it("2) nenhum candidato de nível 2 → não força sugestão nenhuma", () => {
    expect(selectNextBestAction({ candidates: [] })).toBeNull();
  });

  it("3) sugestão de ontem ignorada + só 1 candidato válido → repete a mesma", () => {
    const s = selectNextBestAction({
      candidates: [imovel()],
      previous: { key: "imovel_parado:p1", clicked: false },
    });
    expect(s!.key).toBe("imovel_parado:p1");
  });

  it("4) sugestão de ontem ignorada + 2 candidatos de valor comparável → alterna", () => {
    const outro = imovel({
      key: "imovel_parado:p2",
      label: "o T2 da Avenida Central",
      value: 240000,
      days: 31,
      to: "/imoveis/p2",
    });
    const s = selectNextBestAction({
      candidates: [imovel(), outro],
      previous: { key: "imovel_parado:p1", clicked: false },
    });
    expect(s!.key).toBe("imovel_parado:p2");
    expect(s!.text).toContain("o T2 da Avenida Central");
  });

  it("4b) valores muito diferentes não são alternativa: mantém o candidato de topo", () => {
    const pequeno = imovel({ key: "imovel_parado:p3", value: 60000, to: "/imoveis/p3" });
    const s = selectNextBestAction({
      candidates: [imovel(), pequeno],
      previous: { key: "imovel_parado:p1", clicked: false },
    });
    expect(s!.key).toBe("imovel_parado:p1");
  });

  it("5) fim de semana → nunca sugere ação que envolva contactar terceiros", () => {
    const negocio: NbaCandidate = {
      key: "negocio_arrefecer:d1",
      kind: "negocio_frio",
      label: "o negócio da família Silva",
      reason: "está sem contacto registado há 18 dias",
      action: "Ligar ao comprador para saber da proposta.",
      days: 18,
      value: 900000,
      to: "/negocios/d1",
      contactsThirdParty: true,
    };
    const s = selectNextBestAction({ candidates: [negocio, imovel()], isWeekend: true });
    expect(s!.key).toBe("imovel_parado:p1");
    expect(s!.text.startsWith("Fim de semana calmo.")).toBe(true);

    // Só há candidatos que envolvem terceiros: cala-se.
    expect(selectNextBestAction({ candidates: [negocio], isWeekend: true })).toBeNull();
    expect(isWeekendYmd("2026-08-23")).toBe(true);
    expect(isWeekendYmd("2026-08-24")).toBe(false);
  });

  it("agregado sem nome próprio usa variante B", () => {
    const diversos: NbaCandidate = {
      key: "diversos:inbox",
      kind: "diversos",
      label: null,
      reason: "tens 17 notas por classificar, a mais antiga há 12 dias",
      action: "Classificar as notas em Diversos.",
      days: 12,
      value: null,
      to: "/diversos",
      contactsThirdParty: false,
    };
    const s = selectNextBestAction({ candidates: [diversos] });
    expect(s!.variant).toBe("B");
    expect(s!.text).toContain("Queres começar por aí?");
  });
});
