import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computePropertyAttention } from "./attention.server";

export const getPropertyAttention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => computePropertyAttention(context.supabase, context.userId));
