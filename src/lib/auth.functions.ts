import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const { isAuthenticated } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  const state = await getState();
  const authenticated = await isAuthenticated();
  return {
    authenticated,
    email: state.admin.email,
    // Révélé seulement à une session ouverte.
    mustChangePassword: authenticated && state.admin.must_change_password === true,
  };
});

function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 90 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

export const login = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        password: z.string().min(1).max(200),
        login: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { loginWaitMs, recordLoginFailure, recordLoginSuccess, signIn } =
      await import("@/lib/auth.server");
    const { getState } = await import("@/lib/store.server");

    const wait = loginWaitMs();
    if (wait > 0) {
      throw new Error(`Trop de tentatives échouées : réessayez dans ${formatWait(wait)}.`);
    }

    const state = await getState();
    const loginOk = !data.login || data.login.toLowerCase() === state.admin.email.toLowerCase();
    if (!loginOk || !(await signIn(data.password))) {
      recordLoginFailure();
      throw new Error("Identifiants incorrects");
    }
    recordLoginSuccess();
    return { ok: true as const, mustChangePassword: state.admin.must_change_password === true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { signOut } = await import("@/lib/auth.server");
  await signOut();
  return { ok: true as const };
});

export const changePassword = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        current: z.string().min(1).max(200),
        next: z.string().min(8, "8 caractères minimum").max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { isDefaultPassword, requireSession, verifyPassword, updatePassword } =
      await import("@/lib/auth.server");
    // Accessible avant le premier changement : c'est lui qui débloque l'application.
    await requireSession();
    if (!(await verifyPassword(data.current))) throw new Error("Mot de passe actuel incorrect");
    if (isDefaultPassword(data.next) || data.next === data.current) {
      throw new Error("Choisissez un nouveau mot de passe, différent de l'actuel.");
    }
    await updatePassword(data.next);
    return { ok: true as const };
  });

export const changeLogin = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        login: z.string().trim().min(3).max(200),
        current: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin, verifyPassword, updateEmail } = await import("@/lib/auth.server");
    await requireAdmin();
    if (!(await verifyPassword(data.current))) throw new Error("Mot de passe incorrect");
    await updateEmail(data.login);
    return { login: data.login };
  });
