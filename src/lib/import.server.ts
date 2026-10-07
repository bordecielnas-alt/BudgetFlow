// Transforme la réponse brute de l'IA en lignes à relire : normalisation, règles
// de catégorie, clé stable et détection des doublons.
import { createHash } from "node:crypto";

import type { ImportCandidate } from "@/lib/budget-types";
import { canonicalCategory, matchRule, normalizeText, type CategoryRule } from "@/lib/categories";
import { normalizeDate } from "@/lib/csv";
import type { RawExtraction } from "@/lib/ai/extraction";

type ExistingEntry = { entry_date: string; amount: number; payee: string; account: string };

export type PreviewContext = {
  account: string;
  categories: string[];
  rules: CategoryRule[];
  existing: ExistingEntry[];
};

function toAmount(value: unknown): number {
  const number =
    typeof value === "number"
      ? value
      : Number(
          String(value ?? "")
            .replace(/\s/g, "")
            .replace(",", "."),
        );
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

/**
 * Clé déterministe : compte + date + montant + rang de l'opération parmi celles
 * de même date et même montant. Indépendante du libellé produit par l'IA, elle
 * reste identique quand on réimporte un relevé ou deux relevés qui se chevauchent.
 */
export function entryKey(account: string, date: string, amount: number, rank: number): string {
  const digest = createHash("sha256")
    .update(`${normalizeText(account)}|${date}|${amount.toFixed(2)}|${rank}`)
    .digest("hex");
  return `ia:${digest.slice(0, 24)}`;
}

export function buildCandidates(raw: RawExtraction, context: PreviewContext): ImportCandidate[] {
  // Écritures existantes regroupées par date + montant ; chacune ne peut
  // signaler qu'un seul doublon (deux prélèvements identiques le même jour).
  const pool = new Map<string, ExistingEntry[]>();
  for (const entry of context.existing) {
    const id = `${entry.entry_date}|${Number(entry.amount).toFixed(2)}`;
    pool.set(id, [...(pool.get(id) ?? []), entry]);
  }
  const ranks = new Map<string, number>();

  return raw.transactions.map((transaction) => {
    const amount = toAmount(transaction.amount);
    const entry_date = normalizeDate(String(transaction.date ?? ""));
    const payee = String(transaction.payee ?? "").trim();
    const description = String(transaction.description ?? "").trim();

    const id = `${entry_date}|${amount.toFixed(2)}`;
    const rank = ranks.get(id) ?? 0;
    ranks.set(id, rank + 1);

    const candidates = pool.get(id) ?? [];
    const sameAccount = candidates.findIndex(
      (entry) => normalizeText(entry.account) === normalizeText(context.account),
    );
    const matchIndex = sameAccount >= 0 ? sameAccount : candidates.length > 0 ? 0 : -1;
    const match = matchIndex >= 0 ? candidates.splice(matchIndex, 1)[0]! : null;

    const rule = matchRule(context.rules, payee, description);
    const aiCategory = canonicalCategory(context.categories, String(transaction.category ?? ""));
    const category = rule?.category ?? aiCategory;

    return {
      key: entryKey(context.account, entry_date, amount, rank),
      entry_type: amount < 0 ? "Dépenses" : "Recettes",
      entry_date,
      payee,
      description,
      amount,
      account: context.account,
      category,
      category_source: rule ? "rule" : aiCategory ? "ai" : "none",
      duplicate_of: match
        ? { payee: match.payee, entry_date: match.entry_date, amount: Number(match.amount) }
        : null,
    } satisfies ImportCandidate;
  });
}
