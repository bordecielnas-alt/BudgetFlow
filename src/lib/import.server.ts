// Transforme la réponse brute de l'IA en lignes à relire : normalisation, règles
// de catégorie, mémoire de l'historique, clé stable et détection des doublons.
import { createHash } from "node:crypto";

import type { CategorySource, ImportCandidate } from "@/lib/budget-types";
import {
  canonicalCategory,
  matchRule,
  normalizeText,
  recallCategory,
  similarPayees,
  type CategoryMemory,
  type CategoryRule,
} from "@/lib/categories";
import { normalizeDate } from "@/lib/csv";
import type { RawExtraction } from "@/lib/ai/extraction";

type ExistingEntry = {
  entry_date: string;
  amount: number;
  payee: string;
  account: string;
  source_key?: string | null;
};

export type PreviewContext = {
  account: string;
  categories: string[];
  rules: CategoryRule[];
  existing: ExistingEntry[];
  /** Catégories apprises sur l'historique (vide si absent). */
  memory?: CategoryMemory;
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

/**
 * Meilleure écriture existante pour une ligne : même clé d'abord, puis même compte
 * et émetteur ressemblant, émetteur ressemblant, même compte, et enfin n'importe laquelle.
 */
function pickMatch(
  candidates: ExistingEntry[],
  key: string,
  account: string,
  payee: string,
): { index: number; certain: boolean } | null {
  if (candidates.length === 0) return null;
  const sameAccount = (entry: ExistingEntry) =>
    normalizeText(entry.account) === normalizeText(account);
  const similar = (entry: ExistingEntry) => similarPayees(entry.payee, payee);
  const steps: Array<[(entry: ExistingEntry) => boolean, boolean]> = [
    [(entry) => entry.source_key === key, true],
    [(entry) => sameAccount(entry) && similar(entry), true],
    [similar, true],
    [sameAccount, false],
    [() => true, false],
  ];
  for (const [test, certain] of steps) {
    const index = candidates.findIndex(test);
    if (index >= 0) return { index, certain };
  }
  return null;
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
    const key = entryKey(context.account, entry_date, amount, rank);

    const candidates = pool.get(id) ?? [];
    const found = pickMatch(candidates, key, context.account, payee);
    const match = found ? candidates.splice(found.index, 1)[0]! : null;

    // Priorité : règle explicite > habitude apprise > proposition de l'IA.
    const rule = matchRule(context.rules, payee, description);
    const learned = context.memory ? recallCategory(context.memory, payee) : null;
    const aiCategory = canonicalCategory(context.categories, String(transaction.category ?? ""));
    const aiUnsure = transaction.category_unsure === true;

    let category = aiCategory;
    let source: CategorySource = aiCategory ? "ai" : "none";
    if (rule) {
      category = rule.category;
      source = "rule";
    } else if (learned) {
      category = learned.category;
      source = "history";
    }
    const hint = source !== "ai" && aiCategory && aiCategory !== category ? aiCategory : "";

    return {
      key,
      entry_type: amount < 0 ? "Dépenses" : "Recettes",
      entry_date,
      payee,
      description,
      amount,
      account: context.account,
      category,
      category_source: source,
      category_hint: hint,
      ai_unsure: source === "ai" || source === "none" ? aiUnsure || !category : false,
      duplicate_of: match
        ? {
            payee: match.payee,
            entry_date: match.entry_date,
            amount: Number(match.amount),
            confidence: found!.certain ? "certain" : "probable",
          }
        : null,
    } satisfies ImportCandidate;
  });
}
