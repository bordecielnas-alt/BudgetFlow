// Vérification hors ligne du pipeline d'import (sans appel IA) :
//   npx tsx scripts/pipeline-check.ts
// Simule la réponse d'une IA pour un relevé fictif de 25 opérations.
import assert from "node:assert/strict";

import type { RawExtraction } from "@/lib/ai/extraction";
import { EXTRACTION_SCHEMA } from "@/lib/ai/extraction";
import { toGeminiSchema } from "@/lib/ai/providers.server";
import { checkBalance } from "@/lib/balance";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/lib/categories";
import { buildCandidates } from "@/lib/import.server";

const tx = (date: string, payee: string, amount: number, category = "", description = "") => ({
  date,
  payee,
  description,
  amount,
  category,
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
    tx("2023-11-17", "Virement A", 850, "Income"),
    tx("2023-11-20", "Virement B", 28.5, "income"),
    tx("2023-11-20", "HUBAN", -28.5, "Divertissement et sortie"),
    tx("2023-11-21", "Banque", -0.78, "", "Cotisation option Norplus"),
    tx("2023-11-21", "Banque", -1.55, "", "Cotisation option Norplus"),
    tx("2023-11-21", "Banque", -16.1, "", "Cotisation Jazz"),
    tx("2023-11-21", "Banque", -8.05, "", "Cotisation Jazz Duo"),
    tx("2023-11-23", "PICARD", -89.12, "Alimentation"),
    tx("29/11/2023", "LIDL", -61.08, "Alimentation"),
    tx("2023-11-30", "Virement C", 850, "Income"),
    tx("2023-11-30", "PATISSERIE CUCCI", -8.75, "Alimentation"),
    tx("2023-11-30", "Vinted", -47.54, "Shopping"),
    tx("2023-12-04", "Virement D", 465, "Income"),
    tx("2023-12-05", "CHEZ UNCLE", -10.4, "Divertissement et sortie"),
    tx("2023-12-05", "SOGESSUR", -49.19, "Assurance"),
    tx("2023-12-05", "Kereis France", -25.23, "Crédit"),
    tx("2023-12-05", "Kereis France", -25.23, "Crédit"),
    tx("2023-12-05", "Échéance prêt", -990.76, "Maison"),
    tx("2023-12-06", "LIDL", -39.39, "Alimentation"),
    tx("2023-12-06", "Engie", -205.6, "Energie"),
    tx("2023-12-07", "MATCH", -105.47, "Alimentation"),
    tx("2023-12-08", "CHRONOVET.FR", -57.88, "Animaux"),
    tx("2023-12-11", "Service des eaux", -35.28, "Energie"),
    tx("2023-12-14", "Orange SA", -44.99, "Phone & Telecom"),
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
assert.equal(first[1]!.category, "Income", "casse canonique");
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

console.log("OK — pipeline d'import vérifié");
