import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Leituras dedicadas às exportações. Sempre com o cliente autenticado
// (RLS aplica-se como o próprio consultor) e filtradas por user_id.

export const exportPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("people")
      .select("name, phone, email, relationship_type, summary, created_at")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      name: string;
      phone: string | null;
      email: string | null;
      relationship_type: string | null;
      summary: string | null;
      created_at: string;
    }>;
  });

export const exportProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("properties")
      .select("title, address, city, location, property_type, typology, status, asking_price, value, source_channel, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  });

export const exportMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("financial_movements")
      .select("type, description, category, amount, status, movement_date, created_at")
      .eq("user_id", userId)
      .order("movement_date", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  });