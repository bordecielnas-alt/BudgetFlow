// Stockage local auto-hébergé : un fichier unique dans DATA_DIR (SQLite si le
// runtime l'expose, sinon JSON atomique). Aucune dépendance externe, aucun
// service à démarrer : le volume ./data suffit.
import { promises as fs } from "node:fs";

import {
  DEFAULT_ACCOUNT,
  type AiProvider,
  type ImportRun,
  type UserSettings,
} from "@/lib/budget-types";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/lib/categories";

export type StoredEntry = {
  id: string;
  entry_type: string;
  entry_date: string;
  payee: string;
  amount: number;
  account: string;
  description: string;
  category: string;
  source: string;
  source_key: string | null;
  locally_modified: boolean;
  category_manual?: boolean;
  created_at: string;
  updated_at: string;
};

export type StoredSettings = UserSettings;

export type AiKeys = Partial<Record<AiProvider, string>>;

export type AppState = {
  version: number;
  sessionSecret: string;
  admin: {
    email: string;
    salt: string;
    hash: string;
    /** Mot de passe par défaut encore actif : changement exigé avant tout accès. */
    must_change_password?: boolean;
  };
  settings: StoredSettings;
  secrets: { ai_keys: AiKeys };
  entries: StoredEntry[];
  imports: ImportRun[];
};

export const DEFAULT_ADMIN_EMAIL = "admin@budget.local";
export const DEFAULT_ADMIN_PASSWORD = "@Tracking@";

export const DEFAULT_SETTINGS: StoredSettings = {
  theme: "midnight",
  density: "comfortable",
  currency: "EUR",
  date_format: "dd/MM/yyyy",
  ai_provider: "gemini",
  ai_model: "gemini-2.5-flash",
  default_account: DEFAULT_ACCOUNT,
  categories: DEFAULT_CATEGORIES,
  rules: DEFAULT_RULES,
  backup_enabled: true,
  backup_interval_hours: 24,
  backup_keep: 30,
  backup_last: null,
  ai_price_in: null,
  ai_price_out: null,
};

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(
  password: string,
  salt: string,
  iterations = 100_000,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      // Le runtime edge plafonne PBKDF2 à 100 000 itérations.
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

type Driver = {
  kind: "sqlite" | "json";
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
};

export function dataDir(): string {
  return process.env["DATA_DIR"] || "./data";
}

async function createDriver(): Promise<Driver> {
  const dir = dataDir();

  try {
    const mod: any = await import(/* @vite-ignore */ "node:sqlite");
    const DatabaseSync = mod?.DatabaseSync;
    if (!DatabaseSync) throw new Error("node:sqlite indisponible");
    await fs.mkdir(dir, { recursive: true });
    const db = new DatabaseSync(`${dir}/budget.db`);
    db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    return {
      kind: "sqlite",
      async read() {
        const row = db.prepare("SELECT value FROM kv WHERE key = 'state'").get();
        return row ? String(row.value) : null;
      },
      async write(value: string) {
        db.prepare(
          "INSERT INTO kv (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ).run(value);
      },
    };
  } catch {
    // Runtime sans node:sqlite : repli sur un fichier JSON atomique.
  }

  const file = `${dir}/budget.json`;
  return {
    kind: "json",
    async read() {
      try {
        return await fs.readFile(file, "utf8");
      } catch {
        return null;
      }
    },
    async write(value: string) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(`${file}.tmp`, value, "utf8");
      await fs.rename(`${file}.tmp`, file);
    },
  };
}

let driverPromise: Promise<Driver> | undefined;
function getDriver(): Promise<Driver> {
  if (!driverPromise) driverPromise = createDriver();
  return driverPromise;
}

async function freshState(): Promise<AppState> {
  const salt = randomHex(16);
  const envPassword = process.env["ADMIN_PASSWORD"];
  return {
    version: 1,
    sessionSecret: randomHex(32),
    admin: {
      email: process.env["ADMIN_EMAIL"] || DEFAULT_ADMIN_EMAIL,
      salt,
      hash: await hashPassword(envPassword || DEFAULT_ADMIN_PASSWORD, salt),
      must_change_password: !envPassword,
    },
    settings: { ...DEFAULT_SETTINGS },
    secrets: { ai_keys: {} },
    entries: [],
    imports: [],
  };
}

// --- Instantanés (sauvegarde complète hors secrets) ---------------------------

export const SNAPSHOT_FORMAT = "budgetflow-snapshot";

export type Snapshot = {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  exported_at: string;
  settings: StoredSettings;
  entries: StoredEntry[];
  imports: ImportRun[];
};

/** Tout sauf le compte admin, le secret de session et les clés API. */
export function makeSnapshot(state: AppState): Snapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    exported_at: new Date().toISOString(),
    settings: state.settings,
    entries: state.entries,
    imports: state.imports,
  };
}

export function parseSnapshot(text: string): Snapshot {
  let data: Partial<Snapshot>;
  try {
    data = JSON.parse(text) as Partial<Snapshot>;
  } catch {
    throw new Error("Fichier illisible : ce n'est pas du JSON valide.");
  }
  if (data.format !== SNAPSHOT_FORMAT || !Array.isArray(data.entries)) {
    throw new Error("Ce fichier n'est pas une sauvegarde BudgetFlow (budget-*.json).");
  }
  const invalid = data.entries.findIndex(
    (entry) =>
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.entry_date !== "string" ||
      typeof entry.amount !== "number",
  );
  if (invalid >= 0) throw new Error(`Sauvegarde invalide : écriture n°${invalid + 1} incomplète.`);
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    exported_at: String(data.exported_at ?? ""),
    settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
    entries: data.entries,
    imports: Array.isArray(data.imports) ? data.imports : [],
  };
}

/** Remplace réglages, écritures et historique ; compte, session et clés API restent. */
export function applySnapshot(state: AppState, snapshot: Snapshot): void {
  state.settings = { ...snapshot.settings, backup_last: state.settings.backup_last };
  state.entries = snapshot.entries;
  state.imports = snapshot.imports;
}

// --- Chargement ---------------------------------------------------------------

let cache: AppState | undefined;
let loading: Promise<AppState> | undefined;
let writeChain: Promise<unknown> = Promise.resolve();

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

let quarantined: string | undefined;

/** Met de côté (une seule fois) un contenu illisible : il ne doit jamais être écrasé. */
async function quarantine(raw: string): Promise<string> {
  if (!quarantined) {
    const file = `${dataDir()}/budget.corrupt-${stamp()}.json`;
    await fs.writeFile(file, raw, "utf8");
    quarantined = file;
  }
  return quarantined;
}

/**
 * Restauration hors interface : un fichier DATA_DIR/restore.json (sauvegarde
 * budget-*.json) est appliqué au prochain chargement, puis renommé.
 */
async function takeRestoreFile(): Promise<Snapshot | null> {
  const file = `${dataDir()}/restore.json`;
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    const snapshot = parseSnapshot(text);
    await fs.rename(file, `${dataDir()}/restore.done-${stamp()}.json`);
    console.info(`[store] restauration depuis restore.json (${snapshot.entries.length} écritures)`);
    return snapshot;
  } catch (error) {
    await fs.rename(file, `${dataDir()}/restore.invalid-${stamp()}.json`).catch(() => undefined);
    console.error("[store] restore.json ignoré", error);
    return null;
  }
}

async function hydrate(parsed: AppState): Promise<{ state: AppState; changed: boolean }> {
  const state: AppState = {
    ...(await freshState()),
    ...parsed,
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    secrets: { ai_keys: parsed.secrets?.ai_keys ?? {} },
    entries: parsed.entries ?? [],
    imports: parsed.imports ?? [],
  };
  let changed = false;
  // Bases antérieures au drapeau : on vérifie une fois si le mot de passe par défaut est actif.
  if (state.admin.must_change_password === undefined) {
    const defaultHash = await hashPassword(DEFAULT_ADMIN_PASSWORD, state.admin.salt);
    state.admin.must_change_password = defaultHash === state.admin.hash;
    changed = true;
  }
  return { state, changed };
}

/**
 * Compte par défaut : le plus utilisé des écritures existantes, sinon « Compte 1 ».
 * Les écritures sans compte y sont rattachées. Renvoie true si l'état a changé.
 */
function assignDefaultAccount(state: AppState): boolean {
  let changed = false;
  if (!state.settings.default_account?.trim()) {
    const counts = new Map<string, number>();
    for (const entry of state.entries) {
      const name = entry.account?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const [mostUsed] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    state.settings.default_account = mostUsed ?? DEFAULT_ACCOUNT;
    changed = true;
  }
  for (const entry of state.entries) {
    if (!entry.account?.trim()) {
      entry.account = state.settings.default_account;
      changed = true;
    }
  }
  return changed;
}

async function load(): Promise<AppState> {
  const driver = await getDriver();
  const restore = await takeRestoreFile();
  const raw = await driver.read();

  let state: AppState | undefined;
  let changed = false;
  if (raw) {
    try {
      ({ state, changed } = await hydrate(JSON.parse(raw) as AppState));
    } catch {
      const copy = await quarantine(raw);
      if (!restore) {
        throw new Error(
          `Base de données illisible : rien n'a été écrasé (copie : ${copy}). Pour restaurer, ` +
            `copiez une sauvegarde exports/budget-*.json en ${dataDir()}/restore.json puis rechargez la page.`,
        );
      }
    }
  }
  if (!state) {
    state = await freshState();
    changed = true;
  }
  if (restore) {
    applySnapshot(state, restore);
    changed = true;
  }
  if (assignDefaultAccount(state)) changed = true;
  if (changed) await persist(state);
  return state;
}

export async function getState(): Promise<AppState> {
  if (cache) return cache;
  // Un seul chargement à la fois ; en cas d'échec, le suivant réessaie.
  loading ??= load().finally(() => {
    loading = undefined;
  });
  cache = await loading;
  return cache;
}

async function persist(state: AppState): Promise<void> {
  const driver = await getDriver();
  const payload = JSON.stringify(state);
  const run = writeChain.then(() => driver.write(payload));
  // La file continue après un échec, mais l'appelant reçoit l'erreur.
  writeChain = run.catch(() => undefined);
  try {
    await run;
  } catch (error) {
    console.error("[store] écriture impossible", error);
    throw new Error("Enregistrement impossible sur le disque (voir les journaux du serveur).");
  }
}

export async function mutate<T>(fn: (state: AppState) => T | Promise<T>): Promise<T> {
  const state = await getState();
  const result = await fn(state);
  await persist(state);
  return result;
}

const ENV_KEYS: Record<AiProvider, string> = {
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/** Clé API d'un fournisseur : celle saisie dans Réglages, sinon la variable d'environnement. */
export function aiKeyFor(state: AppState, provider: AiProvider): string {
  return state.secrets.ai_keys[provider] || process.env[ENV_KEYS[provider]] || "";
}

export function aiKeySource(state: AppState, provider: AiProvider): "settings" | "env" | null {
  if (state.secrets.ai_keys[provider]) return "settings";
  if (process.env[ENV_KEYS[provider]]) return "env";
  return null;
}

export function newId(): string {
  return crypto.randomUUID();
}
