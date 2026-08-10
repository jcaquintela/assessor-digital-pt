import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaymentsStatus } from "./payments-status";

export type AdminInvoiceRow = {
  id: string;
  number: string | null;
  customerEmail: string | null;
  customerId: string | null;
  status: string | null;
  amount: number;
  currency: string;
  created: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  paymentIntentId: string | null;
  refunded: boolean;
};

export type AdminBillingReport = {
  status: PaymentsStatus;
  invoices: AdminInvoiceRow[];
  error: string | null;
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const getPaymentsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentsStatus> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readPaymentsStatus } = await import("./payments-status.server");
    return readPaymentsStatus(supabaseAdmin);
  });

export const getAdminBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminBillingReport> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readPaymentsStatus } = await import("./payments-status.server");
    const status = await readPaymentsStatus(supabaseAdmin);
    if (!status.connected || status.environment === "none") {
      return { status, invoices: [], error: status.error };
    }

    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(status.environment);
      const list = await stripe.invoices.list({ limit: 50 });
      const invoices: AdminInvoiceRow[] = list.data.map((inv: any) => ({
        id: inv.id ?? "",
        number: inv.number ?? null,
        customerEmail: inv.customer_email ?? null,
        customerId: typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
        status: inv.status ?? null,
        amount: (inv.amount_paid ?? inv.amount_due ?? 0) / 100,
        currency: (inv.currency ?? "eur").toUpperCase(),
        created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        hostedUrl: inv.hosted_invoice_url ?? null,
        pdfUrl: inv.invoice_pdf ?? null,
        paymentIntentId:
          typeof inv.payment_intent === "string"
            ? inv.payment_intent
            : (inv.payment_intent?.id ?? null),
        refunded: Boolean(inv.post_payment_credit_notes_amount),
      }));
      return { status, invoices, error: null };
    } catch (error) {
      return { status, invoices: [], error: getStripeErrorMessage(error) };
    }
  });

type ActionResult = { ok: boolean; message: string };

async function withStripe<T>(
  context: any,
  run: (stripe: any) => Promise<T>,
): Promise<ActionResult> {
  await assertAdmin(context.supabase, context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { readPaymentsStatus } = await import("./payments-status.server");
  const status = await readPaymentsStatus(supabaseAdmin);
  if (!status.connected || status.environment === "none") {
    return { ok: false, message: "Pagamentos não ligados." };
  }
  const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
  try {
    await run(createStripeClient(status.environment));
    return { ok: true, message: "Feito." };
  } catch (error) {
    return { ok: false, message: getStripeErrorMessage(error) };
  }
}

export const refundInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ paymentIntentId: z.string().min(3), amount: z.number().positive().optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ActionResult> =>
    withStripe(context, (stripe) =>
      stripe.refunds.create({
        payment_intent: data.paymentIntentId,
        ...(data.amount ? { amount: Math.round(data.amount * 100) } : {}),
      }),
    ),
  );

export const resendInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }): Promise<ActionResult> =>
    withStripe(context, (stripe) => stripe.invoices.sendInvoice(data.invoiceId)),
  );

export const retryInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }): Promise<ActionResult> =>
    withStripe(context, (stripe) => stripe.invoices.pay(data.invoiceId)),
  );