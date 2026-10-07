import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizeRows, parsePayload } from "@/lib/csv";

const entryPatch = z.object({
  entry_type: z.string().max(60).optional(),
  entry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ attendu)")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Date inexistante")
    .optional(),
  payee: z.string().max(300).optional(),
  amount: z.number().finite().optional(),
  account: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(120).optional(),
});

export const listEntries = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  const { maybeRunBackup } = await import("@/lib/backup.server");
  await requireAdmin();
  await maybeRunBackup();
  const state = await getState();
  return [...state.entries].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
});

export const createEntry = createServerFn({ method: "POST" })
  .validator((input) => entryPatch.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate, newId } = await import("@/lib/store.server");
    await requireAdmin();
    const now = new Date().toISOString();
    return mutate((state) => {
      const amount = data.amount ?? 0;
      const entry = {
        id: newId(),
        entry_type: data.entry_type || (amount > 0 ? "Recettes" : "Dépenses"),
        entry_date: data.entry_date || now.slice(0, 10),
        payee: data.payee ?? "",
        amount,
        account: data.account?.trim() || state.settings.default_account,
        description: data.description ?? "",
        category: data.category ?? "",
        source: "manual",
        source_key: null,
        locally_modified: true,
        category_manual: Boolean(data.category),
        created_at: now,
        updated_at: now,
      };
      state.entries.unshift(entry);
      return entry;
    });
  });

export const updateEntry = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.string().min(1), patch: entryPatch }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      const entry = state.entries.find((row) => row.id === data.id);
      if (!entry) throw new Error("Écriture introuvable");
      Object.assign(entry, data.patch, {
        locally_modified: true,
        updated_at: new Date().toISOString(),
      });
      // Une catégorie corrigée à la main sert d'exemple aux prochains imports.
      if (data.patch.category !== undefined) entry.category_manual = Boolean(data.patch.category);
      return { ok: true as const };
    });
  });

/** Même modification sur plusieurs écritures (catégorie, compte…) en une écriture disque. */
export const updateEntries = createServerFn({ method: "POST" })
  .validator((input) =>
    z.object({ ids: z.array(z.string().min(1)).min(1).max(10000), patch: entryPatch }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      const ids = new Set(data.ids);
      const now = new Date().toISOString();
      let updated = 0;
      for (const entry of state.entries) {
        if (!ids.has(entry.id)) continue;
        Object.assign(entry, data.patch, { locally_modified: true, updated_at: now });
        if (data.patch.category !== undefined) entry.category_manual = Boolean(data.patch.category);
        updated += 1;
      }
      return { updated };
    });
  });

const storedEntry = z.object({
  id: z.string().min(1).max(100),
  entry_type: z.string().max(60),
  entry_date: z.string().max(30),
  payee: z.string().max(300),
  amount: z.number().finite(),
  account: z.string().max(120),
  description: z.string().max(1000),
  category: z.string().max(120),
  source: z.string().max(40),
  source_key: z.string().max(200).nullable(),
  locally_modified: z.boolean(),
  category_manual: z.boolean().optional(),
  created_at: z.string().max(40),
  updated_at: z.string().max(40),
});

/** Annule une suppression : les écritures reviennent telles quelles (même id). */
export const restoreEntries = createServerFn({ method: "POST" })
  .validator((input) => z.object({ entries: z.array(storedEntry).min(1).max(10000) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      const known = new Set(state.entries.map((entry) => entry.id));
      const back = data.entries
        .filter((entry) => !known.has(entry.id))
        .map(({ category_manual, ...entry }) => ({
          ...entry,
          category_manual: category_manual === true,
        }));
      state.entries.push(...back);
      state.entries.sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      return { restored: back.length };
    });
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      state.entries = state.entries.filter((row) => row.id !== data.id);
      return { ok: true as const };
    });
  });

export const deleteEntries = createServerFn({ method: "POST" })
  .validator((input) =>
    z.object({ ids: z.array(z.string().min(1)).min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      const ids = new Set(data.ids);
      const before = state.entries.length;
      state.entries = state.entries.filter((row) => !ids.has(row.id));
      return { deleted: before - state.entries.length };
    });
  });

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  await requireAdmin();
  const state = await getState();
  return state.settings;
});

export const saveSettings = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        theme: z.string().max(40).optional(),
        density: z.string().max(40).optional(),
        currency: z.string().max(10).optional(),
        date_format: z.string().max(40).optional(),
        default_account: z.string().trim().max(120).optional(),
        categories: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
        rules: z
          .array(
            z.object({
              id: z.string().min(1).max(100),
              pattern: z.string().trim().min(1).max(200),
              category: z.string().trim().min(1).max(120),
            }),
          )
          .max(500)
          .optional(),
        backup_enabled: z.boolean().optional(),
        backup_interval_hours: z.number().min(1).max(720).optional(),
        backup_keep: z.number().min(1).max(500).optional(),
        ai_price_in: z.number().min(0).max(10_000).nullable().optional(),
        ai_price_out: z.number().min(0).max(10_000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      Object.assign(state.settings, data);
      return state.settings;
    });
  });

export const backupNow = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { runBackup } = await import("@/lib/backup.server");
  await requireAdmin();
  return runBackup();
});

export const getBackups = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { listBackups } = await import("@/lib/backup.server");
  const { getState } = await import("@/lib/store.server");
  await requireAdmin();
  const state = await getState();
  return { files: await listBackups(), last: state.settings.backup_last };
});

const backupName = z.object({ name: z.string().min(1).max(200) });

export const downloadBackup = createServerFn({ method: "POST" })
  .validator((input) => backupName.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { readBackup } = await import("@/lib/backup.server");
    await requireAdmin();
    return { name: data.name, text: await readBackup(data.name) };
  });

/** Restaure une sauvegarde JSON du serveur (name) ou envoyée depuis le navigateur (text). */
export const restoreBackupFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z.union([backupName, z.object({ text: z.string().min(2).max(50_000_000) })]).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { readBackup, restoreBackup } = await import("@/lib/backup.server");
    await requireAdmin();
    const text = "name" in data ? await readBackup(data.name) : data.text;
    return restoreBackup(text);
  });

/**
 * Renomme une catégorie dans la liste, les règles et toutes les écritures. Si le
 * nouveau nom existe déjà, les deux catégories sont fusionnées.
 */
export const renameCategory = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        from: z.string().trim().min(1).max(120),
        to: z.string().trim().min(1, "Nom de catégorie vide").max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      const { settings } = state;
      settings.categories = settings.categories.includes(data.to)
        ? settings.categories.filter((name) => name !== data.from)
        : settings.categories.map((name) => (name === data.from ? data.to : name));
      for (const rule of settings.rules) {
        if (rule.category === data.from) rule.category = data.to;
      }
      let renamed = 0;
      for (const entry of state.entries) {
        if (entry.category !== data.from) continue;
        entry.category = data.to;
        renamed += 1;
      }
      return { renamed };
    });
  });

/** Renomme un compte sur toutes ses écritures, son historique d'import et le compte par défaut. */
export const renameAccount = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        from: z.string().trim().min(1).max(120),
        to: z.string().trim().min(1, "Nom de compte vide").max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      let renamed = 0;
      for (const entry of state.entries) {
        if (entry.account !== data.from) continue;
        entry.account = data.to;
        renamed += 1;
      }
      for (const run of state.imports) {
        if (run.account === data.from) run.account = data.to;
      }
      if (state.settings.default_account === data.from) state.settings.default_account = data.to;
      return { renamed };
    });
  });

export const importRows = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        text: z.string().min(1).max(5_000_000),
        contentType: z.string().default("text/csv"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate, newId } = await import("@/lib/store.server");
    await requireAdmin();

    const parsed = parsePayload(data.text, data.contentType);
    const { rows, skipped } = normalizeRows(parsed);

    if (rows.length === 0) {
      return {
        added: 0,
        updated: 0,
        unchanged: 0,
        skipped,
        protected: 0,
        total: 0,
        message: "Aucune ligne exploitable (la colonne id est obligatoire).",
      };
    }

    return mutate((state) => {
      const byKey = new Map(
        state.entries.filter((row) => row.source_key).map((row) => [row.source_key as string, row]),
      );
      const now = new Date().toISOString();
      let added = 0;
      let updated = 0;

      let protectedRows = 0;

      for (const row of rows) {
        const current = byKey.get(row.source_key);
        if (current) {
          // Ligne éditée localement : jamais écrasée par un import (clé = id).
          if (current.locally_modified) {
            protectedRows += 1;
            continue;
          }
          Object.assign(current, row, {
            account: row.account || state.settings.default_account,
            source: "csv",
            locally_modified: false,
            updated_at: now,
          });
          updated += 1;
        } else {
          state.entries.unshift({
            ...row,
            account: row.account || state.settings.default_account,
            id: newId(),
            source: "csv",
            locally_modified: false,
            created_at: now,
            updated_at: now,
          });
          added += 1;
        }
      }

      return {
        added,
        updated,
        unchanged: 0,
        skipped,
        protected: protectedRows,
        total: rows.length,
        message: `${added} ajout(s), ${updated} mise(s) à jour par id, ${protectedRows} protégée(s), ${skipped} ignorée(s).`,
      };
    });
  });
