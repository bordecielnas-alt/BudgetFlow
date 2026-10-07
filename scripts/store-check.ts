// Vérification hors ligne du stockage : une base illisible n'est jamais écrasée,
// et restore.json permet de repartir d'une sauvegarde.
//   npx tsx scripts/store-check.ts
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "budgetflow-store-"));
process.env["DATA_DIR"] = dir;

// Base SQLite dont l'état JSON est tronqué (écriture interrompue, disque plein…).
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(`${dir}/budget.db`);
db.exec("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
const corrupt = '{"version":1,"entries":[{"id":"precieux"';
db.prepare("INSERT INTO kv (key, value) VALUES ('state', ?)").run(corrupt);

const store = await import("@/lib/store.server");

await assert.rejects(store.getState(), /illisible : rien n'a été écrasé/);
const raw = db.prepare("SELECT value FROM kv WHERE key = 'state'").get() as { value: string };
assert.equal(raw.value, corrupt, "la base abîmée reste intacte");
const copies = readdirSync(dir).filter((name) => name.startsWith("budget.corrupt-"));
assert.equal(copies.length, 1, "une copie mise de côté");
assert.equal(readFileSync(join(dir, copies[0]!), "utf8"), corrupt);

// Nouvel essai : toujours refusé, sans multiplier les copies.
await assert.rejects(store.getState());
assert.equal(readdirSync(dir).filter((name) => name.startsWith("budget.corrupt-")).length, 1);

// Une sauvegarde déposée en restore.json débloque la situation sans redémarrage.
const snapshot = {
  format: "budgetflow-snapshot",
  version: 1,
  exported_at: "2026-10-01T00:00:00Z",
  settings: { default_account: "" },
  entries: [{ id: "a", entry_date: "2026-09-01", amount: -12.5, payee: "LIDL", account: "" }],
  imports: [],
};
writeFileSync(join(dir, "restore.json"), JSON.stringify(snapshot));
const state = await store.getState();
assert.equal(state.entries.length, 1);
assert.equal(state.settings.default_account, "Compte 1", "compte par défaut nommé");
assert.equal(state.entries[0]!.account, "Compte 1", "écriture sans compte rattachée au compte par défaut");
assert.equal(
  state.admin.must_change_password,
  true,
  "nouveau compte : mot de passe par défaut à changer",
);
assert.ok(
  readdirSync(dir).some((name) => name.startsWith("restore.done-")),
  "restore.json renommé",
);

console.log("OK — stockage vérifié");
