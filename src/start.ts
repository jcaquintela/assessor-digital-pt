import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { auditSupportActions } from "@/lib/admin/support-audit-middleware";

// IMPORTANTE: middleware de pedido tem de ser criado com type "request".
// Sem isto era criado como middleware de função e a resposta devolvida no
// catch nunca era reconhecida -> "forgot to return a response" -> 500.
const errorMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      // Respostas atiradas (redirects, notFound, 401) são fluxo normal do router.
      if (error instanceof Response) {
        return { response: error };
      }
      if (error != null && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      // Sessão expirada/ausente: devolver 401 em vez de página de erro 500.
      if (message.startsWith("Unauthorized")) {
        return {
          response: new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
        };
      }
      console.error(error);
      return {
        response: new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      };
    }
  },
);




export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, auditSupportActions],
  requestMiddleware: [errorMiddleware],
}));
