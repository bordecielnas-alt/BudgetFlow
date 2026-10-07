// Vérification hors ligne du pipeline d'import (sans appel IA) :
//   npx tsx scripts/pipeline-check.ts
// Simule la réponse d'une IA pour un relevé fictif de 25 opérations.
import assert from "node:assert/strict";

import type { RawExtraction } from "@/lib/ai/extraction";
import { EXTRACTION_SCHEMA } from "@/lib/ai/extraction";
import { toGeminiSchema } from "@/lib/ai/providers.server";
import { checkBalance } from "@/lib/balance";
import { withCost, knownPrice } from "@/lib/ai/pricing";
import {
  buildCategoryMemory,
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  payeeSignature,
  similarPayees,
} from "@/lib/categories";
import { makeSnapshot, parseSnapshot, type AppState } from "@/lib/store.server";
import { buildCandidates } from "@/lib/import.server";

const tx = (
  date: string,
  payee: string,
  amount: number,
  category = "",
  description = "",
  category_unsure = false,
) => ({
  date,
  payee,
  description,
  amount,
  category,
  category_unsure,
});

const raw: RawExtraction = {
  statement: {
    bank: "Banque Exemple",
    period_start: "2023-11-17",
    period_end: "2023-12-16",
    opening_balance: 472.41,
    closing_balance: 796.92,
    total_debit: 1868.99,
    total_credit: 2193.5,
  },
  transactions: [
    tx("2023-11-17", "Virement A", 850, "Revenus"),
    tx("2023-11-20", "Virement B", 28.5, "revenus"),
    tx("2023-11-20", "HUBAN", -28.5, "Divertissement et sortie"),
    tx("2023-11-21", "Banque", -0.78, "", "Cotisation option Norplus"),
    tx("2023-11-21", "Banque", -1.55, "", "Cotisation option Norplus"),
    tx("2023-11-21", "Banque", -16.1, "", "Cotisation Jazz"),
    tx("2023-11-21", "Banque", -8.05, "", "Cotisation Jazz Duo"),
    tx("2023-11-23", "PICARD", -89.12, "Alimentation"),
    tx("29/11/2023", "LIDL", -61.08, "Alimentation"),
    tx("2023-11-30", "Virement C", 850, "Revenus"),
    tx("2023-11-30", "PATISSERIE CUCCI", -8.75, "Alimentation"),
    tx("2023-11-30", "Vinted", -47.54, "Shopping"),
    tx("2023-12-04", "Virement D", 465, "Revenus"),
    tx("2023-12-05", "CHEZ UNCLE", -10.4, "Divertissement et sortie"),
    tx("2023-12-05", "SOGESSUR", -49.19, "Assurance"),
    tx("2023-12-05", "Kereis France", -25.23, "Crédit"),
    tx("2023-12-05", "Kereis France", -25.23, "Crédit"),
    tx("2023-12-05", "Échéance prêt", -990.76, "Maison"),
    tx("2023-12-06", "LIDL", -39.39, "Alimentation"),
    tx("2023-12-06", "Engie", -205.6, "Énergie"),
    tx("2023-12-07", "MATCH", -105.47, "Alimentation"),
    tx("2023-12-08", "CHRONOVET.FR", -57.88, "Animaux"),
    tx("2023-12-11", "Service des eaux", -35.28, "Énergie"),
    tx("2023-12-14", "Orange SA", -44.99, "Téléphone et internet"),
    tx("2023-12-15", "MARIE BLACHERE", -18.1, "Alimentation"),
  ],
};

const context = {
  account: "SG Joint",
  categories: DEFAULT_CATEGORIES,
  rules: DEFAULT_RULES,
  existing: [],
};
const first = buildCandidates(raw, context);

// Normalisation
assert.equal(first.length, 25);
assert.equal(first[8]!.entry_date, "2023-11-29", "date JJ/MM/AAAA convertie");
assert.equal(first[0]!.entry_type, "Recettes");
assert.equal(first[2]!.entry_type, "Dépenses");

// Catégories : règles prioritaires, casse corrigée, catégorie inconnue rejetée
assert.equal(first[1]!.category, "Revenus", "casse canonique");
assert.equal(first[3]!.category, "Assurance", "règle Cotisation via le libellé");
assert.equal(first[3]!.category_source, "rule");
assert.equal(first[15]!.category, "Assurance", "règle Kereis l'emporte sur l'IA");
assert.equal(first[17]!.category, "Crédit", "règle ECHEANCE PRET malgré les accents");
assert.equal(first[11]!.category, "", "catégorie hors liste ignorée");
assert.equal(first[11]!.category_source, "none");

// Clés : deux prélèvements identiques le même jour restent distincts
assert.notEqual(first[15]!.key, first[16]!.key);
assert.equal(new Set(first.map((row) => row.key)).size, 25);
assert.ok(first.every((row) => row.duplicate_of === null));

// Contrôle de solde
const ok = checkBalance(raw.statement, first);
assert.equal(ok.status, "ok", ok.message);
const missing = checkBalance(raw.statement, first.slice(1));
assert.equal(missing.status, "mismatch");
console.log("solde complet  :", ok.message);
console.log("ligne manquante:", missing.message);

// Réimport du même relevé : tout est reconnu, même avec des libellés différents
const existing = first.map((row) => ({
  ...row,
  source_key: row.key,
  payee: row.payee.toUpperCase() + " (autre libellé)",
}));
const again = buildCandidates(raw, { ...context, existing });
assert.ok(
  again.every((row) => row.duplicate_of !== null),
  "toutes les lignes signalées",
);
assert.deepEqual(
  again.map((row) => row.key),
  first.map((row) => row.key),
  "clés stables",
);

// Un seul Kereis déjà en base : seul le premier est signalé
const oneKereis = buildCandidates(raw, { ...context, existing: [existing[15]!] });
assert.ok(oneKereis[15]!.duplicate_of);
assert.equal(oneKereis[16]!.duplicate_of, null);

// Schéma Gemini : pas d'additionalProperties, types nullables convertis
const gemini = JSON.stringify(toGeminiSchema(EXTRACTION_SCHEMA));
assert.ok(!gemini.includes("additionalProperties"));
assert.ok(gemini.includes('"type":"NUMBER","nullable":true'));
assert.ok(!gemini.includes('"null"'));

// Réimport : même clé → doublon certain
assert.ok(again.every((row) => row.duplicate_of?.confidence === "certain"));

// Même date et montant mais autre tiers, autre compte : doublon seulement probable
const stranger = {
  entry_date: "2023-11-23",
  amount: -89.12,
  payee: "Pharmacie du Centre",
  account: "Livret",
};
const probable = buildCandidates(raw, { ...context, existing: [stranger] });
assert.equal(probable[7]!.duplicate_of?.confidence, "probable", "émetteur différent");
const similar = buildCandidates(raw, {
  ...context,
  existing: [{ ...stranger, payee: "CARTE X6035 23/11 PICARD SA 296" }],
});
assert.equal(similar[7]!.duplicate_of?.confidence, "certain", "même tiers, libellé différent");

// Émetteurs : signature et ressemblance
assert.equal(payeeSignature("CARTE X6035 22/11 PICARD SA 296"), "picard");
assert.equal(payeeSignature("Picard"), "picard");
assert.ok(similarPayees("MARIE BLACHERE", "Marie Blachère SAS"));
assert.ok(!similarPayees("LIDL", "Orange SA"));

// Mémoire : catégorie choisie à la main > IA ; règle > mémoire ; IA incertaine signalée
const memory = buildCategoryMemory(
  [
    {
      payee: "CARTE X1234 VINTED 12/11",
      category: "Divertissement et sortie",
      category_manual: true,
    },
    { payee: "Lidl", category: "Maison", category_manual: true },
    { payee: "Kereis France", category: "Crédit", category_manual: true },
    { payee: "Orange", category: "Téléphone et internet" }, // une seule occurrence non confirmée
  ],
  DEFAULT_CATEGORIES,
);
const learned = buildCandidates(
  {
    ...raw,
    transactions: [...raw.transactions, tx("2023-12-16", "Inconnu SARL", -12, "", "", true)],
  },
  { ...context, memory },
);
assert.equal(learned[11]!.category, "Divertissement et sortie", "Vinted appris");
assert.equal(learned[11]!.category_source, "history");
assert.equal(learned[8]!.category, "Maison", "l'habitude prime sur l'IA");
assert.equal(learned[8]!.category_hint, "Alimentation", "proposition IA gardée en indice");
assert.equal(learned[15]!.category, "Assurance", "la règle prime sur l'habitude");
assert.equal(learned[23]!.category_source, "ai", "une seule occurrence ne suffit pas");
assert.equal(learned[25]!.ai_unsure, true, "IA incertaine");
assert.equal(learned[0]!.ai_unsure, false);

// Instantané : aller-retour, et refus d'un fichier étranger
const snapshotState = {
  settings: { ...context, default_account: "Joint" },
  entries: [{ id: "a", entry_date: "2024-01-01", amount: -3 }],
  imports: [],
} as unknown as AppState;
const restored = parseSnapshot(JSON.stringify(makeSnapshot(snapshotState)));
assert.equal(restored.entries.length, 1);
assert.equal(restored.settings.default_account, "Joint");
assert.throws(() => parseSnapshot('{"entries": []}'), /pas une sauvegarde/);
assert.throws(() => parseSnapshot("pas du json"), /illisible/);

// Coût : 1 M tokens en entrée + 1 M en sortie sur Opus 5.5 = 4 + 20 USD
assert.equal(
  withCost({ input_tokens: 1e6, output_tokens: 1e6 }, knownPrice("claude-opus-5-5")).cost_usd,
  24,
);
assert.equal(withCost({ input_tokens: 10, output_tokens: 10 }, null).cost_usd, null);

console.log("OK — pipeline d'import vérifié");
