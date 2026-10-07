import { getRequest, useSession } from "@tanstack/react-start/server";

import { getState, hashPassword, mutate } from "./store.server";

type SessionData = { admin?: boolean };

// Un cookie « Secure » est ignoré par le navigateur en HTTP simple (hors localhost) :
// on ne l'exige que si la requête arrive en HTTPS, directement ou via un reverse proxy.
function isHttps(): boolean {
  try {
    const request = getRequest();
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    return (forwarded ?? new URL(request.url).protocol.replace(":", "")) === "https";
  } catch {
    return true;
  }
}

async function sessionConfig() {
  const state = await getState();
  return {
    password: state.sessionSecret,
    name: "bt_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: { secure: isHttps() },
  };
}

export async function getAppSession() {
  return useSession<SessionData>(await sessionConfig());
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const session = await getAppSession();
    return session.data?.admin === true;
  } catch {
    return false;
  }
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Non authentifié");
}

export async function verifyPassword(password: string): Promise<boolean> {
  const state = await getState();
  if ((await hashPassword(password, state.admin.salt)) === state.admin.hash) return true;

  // Compatibilité : les comptes créés avant le passage à 100 000 itérations
  // stockent un hash à 120 000 itérations. On le valide puis on le remplace.
  try {
    const legacy = await hashPassword(password, state.admin.salt, 120_000);
    if (legacy === state.admin.hash) {
      await mutate(async (s) => {
        s.admin.hash = await hashPassword(password, s.admin.salt);
      });
      return true;
    }
  } catch {
    // runtime qui refuse 120 000 itérations : pas de repli possible
  }
  return false;
}

export async function signIn(password: string): Promise<boolean> {
  if (!(await verifyPassword(password))) return false;
  const session = await getAppSession();
  await session.update({ admin: true });
  return true;
}

export async function signOut(): Promise<void> {
  const session = await getAppSession();
  await session.clear();
}

export async function updatePassword(next: string): Promise<void> {
  await mutate(async (state) => {
    state.admin.hash = await hashPassword(next, state.admin.salt);
  });
}

export async function updateEmail(next: string): Promise<void> {
  await mutate((state) => {
    state.admin.email = next;
  });
}
