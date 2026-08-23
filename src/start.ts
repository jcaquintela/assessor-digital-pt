import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { auditSupportActions } from "@/lib/admin/support-audit-middleware";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Respostas atiradas (401 de autenticação, redirects, notFound) são fluxo
    // normal do router — reatirar sem as transformar em 500.
    if (error instanceof Response) {
      throw error;
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});


export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, auditSupportActions],
  requestMiddleware: [errorMiddleware],
}));
