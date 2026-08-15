import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SetInput = z.object({
  modality: z.enum(["calendar", "mail"]),
  provider: z.string().min(1).nullable(),
});

export const getActiveProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { activeCalendar, activeMail } = await import("./active.server");
    const [cal, mail] = await Promise.all([
      activeCalendar(context.userId),
      activeMail(context.userId),
    ]);
    return {
      calendar: { status: cal.status, provider: cal.provider, options: cal.options },
      mail: { status: mail.status, provider: mail.provider, options: mail.options },
    };
  });

export const setActiveProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { setActiveProvider } = await import("./active.server");
    await setActiveProvider(context.userId, data.modality, data.provider);
    return { ok: true };
  });
