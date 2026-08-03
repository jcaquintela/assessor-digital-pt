import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", async () => {
  const { createMiddleware } = await import("@tanstack/react-start");
  return { requireSupabaseAuth: createMiddleware({ type: "function" }).server(async ({ next }: any) => next({ context: { supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [{ role: "super_admin" }] }) }) }) }, userId: "u1" } })) };
});
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [{ id: "1", user_id: "u1", kind: "suggestion", body: "Drive", status: "novo", created_at: "x" }], error: null }) }), in: async () => ({ data: [] }) }) }),
  storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
} }));
import { listProductFeedback } from "@/lib/admin/feedback.functions";
describe("probe", () => { it("lists", async () => { const r: any = await listProductFeedback(); console.log(JSON.stringify(r)); expect(r.items).toHaveLength(1); }); });
