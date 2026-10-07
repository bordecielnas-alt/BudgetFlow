import { getRequest, getRequestIP, useSession } from "@tanstack/react-start/server";

import { DEFAULT_ADMIN_PASSWORD, getState, hashPassword, mutate } from "./store.server";

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

/** Session ouverte, même si le mot de passe par défaut doit encore être changé. */
export async function requireSession(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Non authentifié");
}

export async function requireAdmin(): Promise<void> {
  await requireSession();
  const state = await getState();
  if (state.admin.must_change_password) {
    throw new Error("Changez d'abord le mot de passe par défaut.");
  }
}

// --- Limitation des tentatives de connexion ----------------------------------
// Par adresse IP, plus un compteur global (une IP via X-Forwarded-For peut être
// falsifiée). Au-delà des essais gratuits, l'attente double à chaque échec.

type Attempts = { failures: number; lockedUntil: number };
const attempts = new Map<string, Attempts>();
const LIMITS = { ip: 5, global: 20 } as const;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

function attemptKeys(): Array<[string, number]> {
  let ip = "inconnue";
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? ip;
  } catch {
    // hors requête (tests) : seul le compteur global s'applique vraiment
  }
  return [
    [`ip:${ip}`, LIMITS.ip],
    ["global", LIMITS.global],
  ];
}

/** Millisecondes à attendre avant le prochain essai (0 si autorisé). */
export function loginWaitMs(): number {
  const now = Date.now();
  return Math.max(0, ...attemptKeys().map(([key]) => (attempts.get(key)?.lockedUntil ?? 0) - now));
}

export function recordLoginFailure(): void {
  const now = Date.now();
  for (const [key, free] of attemptKeys()) {
    const slot = attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
    slot.failures += 1;
    if (slot.failures >= free) {
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (slot.failures - free));
      slot.lockedUntil = now + delay;
    }
    attempts.set(key, slot);
  }
}

export function recordLoginSuccess(): void {
  for (const [key] of attemptKeys()) attempts.delete(key);
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
    state.admin.must_change_password = false;
  });
}

export function isDefaultPassword(password: string): boolean {
  return password === DEFAULT_ADMIN_PASSWORD;
}

export async function updateEmail(next: string): Promise<void> {
  await mutate((state) => {
    state.admin.email = next;
  });
}
