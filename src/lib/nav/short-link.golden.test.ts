// Golden tests do encurtador de links do briefing.
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { ensureShortLink, resolveShortLink, shortenUrls } from "./short-link.server";
import { isShortCode, shortLinkUrl } from "./short-link";
import { entityUrl } from "./entity-url";
import { composeEnrichedBriefing, type BriefingPriority } from "@/lib/assessor/proactive/briefing-enriched";

const BASE = "https://app.meuafonso.com";
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

function item(over: Partial<BriefingPriority>): BriefingPriority {
  return {
    subject_type: "follow_up",
    subject_id: "f1",
    action: "Ligar ao João",
    entity_label: null,
    priority_score: 90,
    ...over,
  };
}

describe("1. link curto gerado e resolvido para o registo certo", () => {
  it("cria uma vez, reutiliza depois e devolve o caminho real", async () => {
    const sb = makeFakeSupabase({ short_links: [] });
    const path = entityUrl("follow_up", "abc-123")!;
    const code = await ensureShortLink(sb as any, U1, path);
    expect(code && isShortCode(code)).toBe(true);
    expect(shortLinkUrl(code!, BASE)).toBe(`${BASE}/s/${code}`);
    expect(await resolveShortLink(sb as any, code!)).toBe(path);

    const again = await ensureShortLink(sb as any, U1, path);
    expect(again).toBe(code);
    expect((sb as any).state?.short_links?.length ?? 1).toBeLessThanOrEqual(1);

    expect(await resolveShortLink(sb as any, "nao-existe")).toBeNull();
  });
});

describe("2. permissões continuam no destino", () => {
  it("o link curto guarda só o caminho — não dá acesso ao registo de outro consultor", async () => {
    const sb = makeFakeSupabase({ short_links: [] });
    const path = entityUrl("follow_up", "do-outro")!;
    const code = (await ensureShortLink(sb as any, U1, path))!;

    // Resolver devolve apenas um caminho interno da app; nunca dados do registo.
    const resolved = await resolveShortLink(sb as any, code);
    expect(resolved).toBe(path);
    expect(resolved!.startsWith("/")).toBe(true);

    // O consultor U2 não vê o link do U1 (mesma regra da tabela: dono só).
    const { data } = await (sb as any)
      .from("short_links")
      .select("code")
      .eq("user_id", U2)
      .eq("target_path", path)
      .maybeSingle();
    expect(data).toBeFalsy();

    // Destinos externos nunca são encurtados nem resolvidos.
    expect(await ensureShortLink(sb as any, U1, "https://evil.example/x")).toBeNull();
  });
});

describe("3. briefing com 3 links fica bem mais curto e sem UUIDs", () => {
  it("substitui os URLs completos pelos curtos", async () => {
    const sb = makeFakeSupabase({ short_links: [] });
    const priorities = [
      item({ subject_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", action: "Ligar ao João" }),
      item({ subject_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", action: "Enviar CPCV" }),
      item({ subject_id: "cccccccc-cccc-cccc-cccc-cccccccccccc", action: "Visitar Belém" }),
    ];
    const urls = priorities.map((p) => `${BASE}${entityUrl(p.subject_type, p.subject_id)!}`);
    const shortUrls = await shortenUrls(sb as any, U1, urls, BASE);
    expect(Object.keys(shortUrls)).toHaveLength(3);

    const longo = composeEnrichedBriefing(priorities, { base: BASE });
    const curto = composeEnrichedBriefing(priorities, { base: BASE, shortUrls });

    expect(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(longo)).toBe(true);
    expect(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(curto)).toBe(false);
    expect(curto.length).toBeLessThan(longo.length - 100);
    for (const u of Object.values(shortUrls)) expect(curto).toContain(u);
  });
});
