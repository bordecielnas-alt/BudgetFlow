// Sauvegarde périodique dans DATA_DIR/exports : un CSV des écritures (lisible
// dans un tableur) et un instantané JSON complet (réglages, catégories, règles,
// historique des imports), restaurable depuis Réglages → Sauvegardes.
import { promises as fs } from "node:fs";

import { CSV_HEADER, toCsv } from "@/lib/csv";
import {
  applySnapshot,
  dataDir,
  getState,
  makeSnapshot,
  mutate,
  parseSnapshot,
} from "./store.server";

function exportsDir(): string {
  return `${dataDir()}/exports`;
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export type BackupFile = {
  name: string;
  kind: "csv" | "json";
  size: number;
  created_at: string;
};

const BACKUP_NAME = /^budget-[\w-]+\.(csv|json)$/;

export async function listBackups(): Promise<BackupFile[]> {
  const dir = exportsDir();
  try {
    const names = await fs.readdir(dir);
    const files = await Promise.all(
      names
        .filter((name) => BACKUP_NAME.test(name))
        .map(async (name) => {
          const info = await fs.stat(`${dir}/${name}`);
          return {
            name,
            kind: name.endsWith(".json") ? ("json" as const) : ("csv" as const),
            size: info.size,
            created_at: info.mtime.toISOString(),
          };
        }),
    );
    return files.sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

async function prune(keep: number): Promise<void> {
  if (keep <= 0) return;
  const files = await listBackups();
  for (const kind of ["csv", "json"] as const) {
    for (const file of files.filter((item) => item.kind === kind).slice(keep)) {
      await fs.rm(`${exportsDir()}/${file.name}`).catch(() => undefined);
    }
  }
}

export async function runBackup(label = ""): Promise<{ file: string; rows: number }> {
  const state = await getState();
  const dir = exportsDir();
  await fs.mkdir(dir, { recursive: true });
  const now = new Date();
  const base = `budget-${stamp(now)}${label ? `-${label}` : ""}`;
  const csv = state.entries.length ? toCsv(state.entries) : `${CSV_HEADER}\n`;
  await fs.writeFile(`${dir}/${base}.csv`, csv, "utf8");
  await fs.writeFile(`${dir}/${base}.json`, JSON.stringify(makeSnapshot(state)), "utf8");
  await prune(state.settings.backup_keep);
  await mutate((s) => {
    s.settings.backup_last = now.toISOString();
  });
  return { file: `${base}.json`, rows: state.entries.length };
}

/** Contenu d'une sauvegarde, par son nom (aucun chemin accepté). */
export async function readBackup(name: string): Promise<string> {
  if (!BACKUP_NAME.test(name)) throw new Error("Nom de sauvegarde invalide");
  try {
    return await fs.readFile(`${exportsDir()}/${name}`, "utf8");
  } catch {
    throw new Error("Sauvegarde introuvable");
  }
}

/** Restaure un instantané JSON, après avoir sauvegardé l'état actuel. */
export async function restoreBackup(text: string): Promise<{ rows: number; safety: string }> {
  const snapshot = parseSnapshot(text);
  const safety = await runBackup("avant-restauration");
  await mutate((state) => applySnapshot(state, snapshot));
  return { rows: snapshot.entries.length, safety: safety.file };
}

// Déclenchement paresseux : appelé depuis les lectures, sans planificateur externe.
export async function maybeRunBackup(): Promise<void> {
  try {
    const state = await getState();
    const { backup_enabled, backup_interval_hours, backup_last } = state.settings;
    if (!backup_enabled) return;
    const intervalMs = Math.max(1, backup_interval_hours) * 3_600_000;
    if (backup_last && Date.now() - new Date(backup_last).getTime() < intervalMs) return;
    await runBackup();
  } catch (error) {
    console.error("[backup] échec de la sauvegarde périodique", error);
  }
}
