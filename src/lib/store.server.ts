// Stockage local auto-hébergé : un fichier unique dans DATA_DIR (SQLite si le
// runtime l'expose, sinon JSON atomique). Aucune dépendance externe, aucun
// service à démarrer : le volume ./data suffit.
import { promises as fs } from "node:fs";

import type { AiProvider, ImportRun, UserSettings } from "@/lib/budget-types";
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
  created_at: string;
  updated_at: string;
};

export type StoredSettings = UserSettings;

export type AiKeys = Partial<Record<AiProvider, string>>;

export type AppState = {
  version: number;
  sessionSecret: string;
  admin: { email: string; salt: string; hash: string };
  settings: StoredSettings;
  secrets: { ai_keys: AiKeys };
  entries: StoredEntry[];
  imports: ImportRun[];
};

export const DEFAULT_ADMIN_EMAIL = "admin@budget.local";
const DEFAULT_ADMIN_PASSWORD = "@Tracking@";

export const DEFAULT_SETTINGS: StoredSettings = {
  theme: "midnight",
  density: "comfortable",
  currency: "EUR",
  date_format: "dd/MM/yyyy",
  ai_provider: "gemini",
  ai_model: "gemini-2.5-flash",
  default_account: "",
  categories: DEFAULT_CATEGORIES,
  rules: DEFAULT_RULES,
  backup_enabled: true,
  backup_interval_hours: 24,
  backup_keep: 30,
  backup_last: null,
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
  return {
    version: 1,
    sessionSecret: randomHex(32),
    admin: {
      email: process.env["ADMIN_EMAIL"] || DEFAULT_ADMIN_EMAIL,
      salt,
      hash: await hashPassword(process.env["ADMIN_PASSWORD"] || DEFAULT_ADMIN_PASSWORD, salt),
    },
    settings: { ...DEFAULT_SETTINGS },
    secrets: { ai_keys: {} },
    entries: [],
    imports: [],
  };
}

let cache: AppState | undefined;
let writeChain: Promise<unknown> = Promise.resolve();

export async function getState(): Promise<AppState> {
  if (cache) return cache;
  const driver = await getDriver();
  const raw = await driver.read();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AppState;
      cache = {
        ...(await freshState()),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        secrets: { ai_keys: parsed.secrets?.ai_keys ?? {} },
        entries: parsed.entries ?? [],
        imports: parsed.imports ?? [],
      };
      return cache;
    } catch {
      // état corrompu : on repart d'un état neuf plutôt que de planter
    }
  }
  cache = await freshState();
  await persist(cache);
  return cache;
}

async function persist(state: AppState): Promise<void> {
  const driver = await getDriver();
  const payload = JSON.stringify(state);
  writeChain = writeChain
    .then(() => driver.write(payload))
    .catch((error) => {
      console.error("[store] écriture impossible", error);
    });
  await writeChain;
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
