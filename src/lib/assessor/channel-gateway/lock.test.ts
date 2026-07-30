import { describe, it, expect } from "vitest";
import { withConversationLock } from "./lock.server";

// Fake do lock em BD com a mesma semântica do SQL:
// só adquire se não existir linha ou se locked_until já passou.
function makeLockSupabase() {
  const locks = new Map<string, { until: number; holder: string }>();
  return {
    async rpc(fn: string, args: any) {
      const key = `${args._user_id}|${args._channel}`;
      if (fn === "try_acquire_conversation_lock") {
        const cur = locks.get(key);
        if (cur && cur.until > Date.now()) return { data: false, error: null };
        locks.set(key, { until: Date.now() + args._ttl_seconds * 1000, holder: args._holder });
        return { data: true, error: null };
      }
      if (fn === "release_conversation_lock") {
        const cur = locks.get(key);
        if (cur && (!args._holder || cur.holder === args._holder)) locks.delete(key);
        return { data: null, error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    },
  };
}

describe("withConversationLock", () => {
  it("serializa dois turnos do mesmo consultor+canal", async () => {
    const supabase = makeLockSupabase();
    const events: string[] = [];
    const task = (tag: string) =>
      withConversationLock(supabase, "u1", "whatsapp", async () => {
        events.push(`start-${tag}`);
        await new Promise((r) => setTimeout(r, 40));
        events.push(`end-${tag}`);
      });
    await Promise.all([task("A"), task("B")]);
    // Nunca há dois "start" seguidos: um turno de cada vez.
    expect(events).toHaveLength(4);
    expect(events[0].startsWith("start")).toBe(true);
    expect(events[1]).toBe(`end-${events[0].slice(6)}`);
    expect(events[2].startsWith("start")).toBe(true);
    expect(events[3]).toBe(`end-${events[2].slice(6)}`);
  });

  it("não serializa consultores diferentes", async () => {
    const supabase = makeLockSupabase();
    let concurrent = 0;
    let maxConcurrent = 0;
    const task = (user: string) =>
      withConversationLock(supabase, user, "whatsapp", async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent -= 1;
      });
    await Promise.all([task("u1"), task("u2")]);
    expect(maxConcurrent).toBe(2);
  });

  it("liberta o lock mesmo quando o turno falha", async () => {
    const supabase = makeLockSupabase();
    await expect(
      withConversationLock(supabase, "u1", "whatsapp", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const ran = await withConversationLock(supabase, "u1", "whatsapp", async () => "ok");
    expect(ran).toBe("ok");
  });
});
