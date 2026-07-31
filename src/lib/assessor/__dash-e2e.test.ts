import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runInboundPipeline } from "./channel-gateway/ingest.server";
import { dashboardAdapter, buildDashboardInbound } from "./channel-gateway/dashboard-adapter";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

describe("escrita no painel (canal dashboard)", () => {
  it("passa pelo motor real e grava origem dashboard", async () => {
    const { data: prof } = await admin.from("profiles").select("id").eq("email", "ci-a@test.assessor.local").single();
    const userId = (prof as any).id as string;
    const inbound = buildDashboardInbound({ userId, text: "placa em Lisboa, 912345678", messageId: `dash_test_${Date.now()}` });
    await runInboundPipeline(dashboardAdapter, admin as any, inbound);

    const { data: msgs } = await admin
      .from("assessor_messages").select("role, content, channel, message_type, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(4);
    console.log("MENSAGENS:", JSON.stringify(msgs, null, 2));

    const { data: leads } = await admin
      .from("prospecting_leads").select("title, phone, location, status, source_channel")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(3);
    console.log("PLACAS:", JSON.stringify(leads, null, 2));

    const { data: pend } = await admin.from("pending_actions").select("intent, status, channel").eq("user_id", userId).order("created_at",{ascending:false}).limit(2);
    console.log("PENDENTES:", JSON.stringify(pend, null, 2));

    expect((msgs ?? []).some((m: any) => m.channel === "dashboard" && m.role === "user")).toBe(true);
    expect((msgs ?? []).some((m: any) => m.channel === "dashboard" && m.role === "assistant")).toBe(true);
  }, 120000);
});
