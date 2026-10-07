import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Les server functions sont des points d'entrée POST authentifiés par cookie :
// on refuse celles qui viennent d'un autre site (en-tête Sec-Fetch-Site / Origin).
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

//
// SQLite-backed cookie session (see src/lib/auth.server.ts). Supabase n'est
// pas utilisé par cette app — on n'enregistre donc PAS attachSupabaseAuth,
// sinon son appel à supabase.auth.getSession() plante côté client en Docker
// quand les VITE_SUPABASE_* ne sont pas définis, ce qui casse toutes les
// serverFn (signIn, me, signOut, …).
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
