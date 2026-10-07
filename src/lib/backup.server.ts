// Sauvegarde périodique : export CSV horodaté dans DATA_DIR/exports.
import { promises as fs } from "node:fs";

import { CSV_HEADER, toCsv } from "@/lib/csv";
import { dataDir, getState, mutate } from "./store.server";

function exportsDir(): string {
  return `${dataDir()}/exports`;
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export type BackupFile = { name: string; size: number; created_at: string };

export async function listBackups(): Promise<BackupFile[]> {
  const dir = exportsDir();
  try {
    const names = await fs.readdir(dir);
    const files = await Promise.all(
      names
        .filter((name) => name.startsWith("budget-") && name.endsWith(".csv"))
        .map(async (name) => {
          const info = await fs.stat(`${dir}/${name}`);
          return { name, size: info.size, created_at: info.mtime.toISOString() };
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
  for (const file of files.slice(keep)) {
    await fs.rm(`${exportsDir()}/${file.name}`).catch(() => undefined);
  }
}

export async function runBackup(): Promise<{ file: string; rows: number }> {
  const state = await getState();
  const dir = exportsDir();
  await fs.mkdir(dir, { recursive: true });
  const now = new Date();
  const name = `budget-${stamp(now)}.csv`;
  const body = state.entries.length ? toCsv(state.entries) : `${CSV_HEADER}\n`;
  await fs.writeFile(`${dir}/${name}`, body, "utf8");
  await prune(state.settings.backup_keep);
  await mutate((s) => {
    s.settings.backup_last = now.toISOString();
  });
  return { file: name, rows: state.entries.length };
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
