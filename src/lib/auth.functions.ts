import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const { isAuthenticated } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  const state = await getState();
  return { authenticated: await isAuthenticated(), email: state.admin.email };
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        password: z.string().min(1).max(200),
        login: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { signIn } = await import("@/lib/auth.server");
    const { getState } = await import("@/lib/store.server");
    if (data.login) {
      const state = await getState();
      if (data.login.toLowerCase() !== state.admin.email.toLowerCase()) {
        throw new Error("Identifiants incorrects");
      }
    }
    const ok = await signIn(data.password);
    if (!ok) throw new Error("Identifiants incorrects");
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { signOut } = await import("@/lib/auth.server");
  await signOut();
  return { ok: true as const };
});

export const changePassword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        current: z.string().min(1).max(200),
        next: z.string().min(8).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin, verifyPassword, updatePassword } = await import("@/lib/auth.server");
    await requireAdmin();
    if (!(await verifyPassword(data.current))) throw new Error("Mot de passe actuel incorrect");
    await updatePassword(data.next);
    return { ok: true as const };
  });

export const changeLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
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
