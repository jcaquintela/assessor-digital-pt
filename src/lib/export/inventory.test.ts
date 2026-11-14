import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TABLE_CLASS } from "./inventory";

const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const pub = types.split("public: {")[1].split("Views:")[0];
const tables = [...pub.matchAll(/^      (\w+): \{\n        Row:/gm)].map((m) => m[1]);

describe("inventário de exportação", () => {
  it("todas as tabelas têm classe", () => {
    expect(tables.filter((t) => !TABLE_CLASS[t])).toEqual([]);
  });
  it("segredos e tokens nunca são exportados", () => {
    for (const t of ["email_connections", "calendar_connections", "app_user_connections", "dashboard_login_tokens", "telegram_link_tokens", "whatsapp_link_codes", "access_invites"])
      expect(TABLE_CLASS[t]).toBe("exclude");
  });
});
