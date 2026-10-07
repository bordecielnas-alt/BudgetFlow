// Analyses calculées côté navigateur à partir des écritures : budgets, comparaisons
// de périodes, abonnements récurrents et soldes par compte.
import { isIncome, type BudgetEntry } from "@/lib/budget-types";
import { payeeSignature } from "@/lib/categories";

type Entry = Pick<
  BudgetEntry,
  "entry_date" | "amount" | "entry_type" | "category" | "payee" | "account"
>;

const DAY = 86_400_000;

/** Montant signé : négatif pour une dépense, quel que soit le signe stocké (anciens CSV). */
export function signedAmount(entry: Pick<Entry, "amount" | "entry_type">): number {
  return isIncome(entry) ? Math.abs(entry.amount) : -Math.abs(entry.amount);
}

function days(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Période de même durée qui précède immédiatement [from, to]. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const length = days(to) - days(from) + 1;
  const iso = (value: number) => new Date(value * DAY).toISOString().slice(0, 10);
  return { from: iso(days(from) - length), to: iso(days(from) - 1) };
}

/** Variation relative en %, null si la base est nulle. */
export function change(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Mois disposant d'écritures, du plus récent au plus ancien. */
export function monthsWithData(entries: Entry[]): string[] {
  return [...new Set(entries.map((entry) => entry.entry_date.slice(0, 7)))]
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .sort()
    .reverse();
}

/** Mois courant s'il a des écritures, sinon le dernier mois renseigné. */
export function defaultMonth(entries: Entry[]): string {
  const current = new Date().toISOString().slice(0, 7);
  const months = monthsWithData(entries);
  return months.includes(current) || months.length === 0 ? current : months[0]!;
}

export type MonthTotals = { income: number; expense: number; byCategory: Map<string, number> };

export function monthTotals(entries: Entry[], month: string): MonthTotals {
  const byCategory = new Map<string, number>();
  let income = 0;
  let expense = 0;
  for (const entry of entries) {
    if (!entry.entry_date.startsWith(month)) continue;
    if (isIncome(entry)) {
      income += Math.abs(entry.amount);
      continue;
    }
    expense += Math.abs(entry.amount);
    const key = entry.category || "Sans catégorie";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Math.abs(entry.amount));
  }
  return { income, expense, byCategory };
}

// --- Budgets -------------------------------------------------------------------

export type BudgetStatus = {
  category: string;
  limit: number;
  spent: number;
  ratio: number;
  /** Dépense projetée en fin de mois au rythme actuel (mois en cours seulement). */
  projected: number | null;
};

export function budgetStatus(
  entries: Entry[],
  budgets: Record<string, number>,
  month: string,
  today = new Date(),
): BudgetStatus[] {
  const totals = monthTotals(entries, month).byCategory;
  const isCurrent = today.toISOString().slice(0, 7) === month;
  const [year, value] = month.split("-").map(Number) as [number, number];
  const length = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const elapsed = today.getUTCDate();
  return Object.entries(budgets)
    .filter(([, limit]) => limit > 0)
    .map(([category, limit]) => {
      const spent = totals.get(category) ?? 0;
      return {
        category,
        limit,
        spent,
        ratio: spent / limit,
        projected: isCurrent && elapsed < length ? (spent / elapsed) * length : null,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

// --- Abonnements et prélèvements récurrents -----------------------------------

export type Recurring = {
  signature: string;
  label: string;
  category: string;
  cadence: "mensuel" | "annuel";
  amount: number;
  monthlyCost: number;
  count: number;
  lastDate: string;
  lastAmount: number;
  /** Montant qui varie d'une fois à l'autre (facture d'énergie…), à l'inverse d'un abonnement. */
  variable: boolean;
  /** Changement de prix récent d'un abonnement (positif = hausse), null si stable. */
  priceChange: number | null;
  isNew: boolean;
  active: boolean;
};

/**
 * Dépenses d'un même tiers qui reviennent à intervalle régulier (≈ 1 mois ou 1 an)
 * pour un montant à peu près constant. La date de référence est la dernière écriture
 * connue, pour ne pas tout déclarer « arrêté » quand les imports ont du retard.
 */
export function detectRecurring(entries: Entry[]): Recurring[] {
  const expenses = entries.filter((entry) => !isIncome(entry) && entry.entry_date);
  if (expenses.length === 0) return [];
  const reference = Math.max(
    ...entries.map((entry) => days(entry.entry_date)).filter(Number.isFinite),
  );

  const groups = new Map<string, Entry[]>();
  for (const entry of expenses) {
    const signature = payeeSignature(entry.payee ?? "");
    if (!signature) continue;
    groups.set(signature, [...(groups.get(signature) ?? []), entry]);
  }

  const found: Recurring[] = [];
  for (const [signature, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    const gaps = sorted
      .slice(1)
      .map((entry, index) => days(entry.entry_date) - days(sorted[index]!.entry_date));
    const gap = median(gaps);
    const cadence = gap >= 25 && gap <= 35 ? "mensuel" : gap >= 340 && gap <= 390 ? "annuel" : null;
    if (!cadence) continue;
    // Deux occurrences mensuelles seulement : on ne retient que si c'est récent (nouvel abonnement).
    const firstDay = days(sorted[0]!.entry_date);
    if (cadence === "mensuel" && sorted.length < 3 && reference - firstDay > 75) continue;

    const amounts = sorted.map((entry) => Math.abs(entry.amount));
    const typical = median(amounts);
    const stable = amounts.filter((value) => Math.abs(value - typical) <= typical * 0.25).length;
    if (stable / amounts.length < 0.7) continue;

    const last = sorted.at(-1)!;
    const lastAmount = Math.abs(last.amount);
    const lastDay = days(last.entry_date);
    // Prix fixe (abonnement) si les montants s'écartent à peine de la médiane ;
    // sinon facture variable (énergie…), sans signal de hausse ou de baisse.
    const spread = median(amounts.map((value) => Math.abs(value - typical))) / typical;
    const variable = spread > 0.02;
    let priceChange: number | null = null;
    if (!variable) {
      // Dernier prix différent parmi les deux paiements précédents : hausse récente.
      for (let index = sorted.length - 2; index >= Math.max(0, sorted.length - 3); index--) {
        const delta = lastAmount - Math.abs(sorted[index]!.amount);
        if (Math.abs(delta) >= 0.01 && Math.abs(delta) / typical >= 0.01) {
          priceChange = delta;
          break;
        }
      }
    }
    found.push({
      signature,
      label: last.payee,
      category: last.category,
      cadence,
      amount: typical,
      monthlyCost: cadence === "mensuel" ? typical : typical / 12,
      count: sorted.length,
      lastDate: last.entry_date,
      lastAmount,
      variable,
      priceChange,
      isNew: reference - firstDay <= 70,
      active: reference - lastDay <= gap * 1.5 + 5,
    });
  }
  return found.sort((a, b) => Number(b.active) - Number(a.active) || b.monthlyCost - a.monthlyCost);
}

// --- Comptes -------------------------------------------------------------------

export type AccountSummary = {
  account: string;
  count: number;
  lastDate: string;
  /** Solde reconstitué depuis le dernier relevé importé, null sans relevé de référence. */
  balance: number | null;
  anchorDate: string | null;
  monthFlow: number;
};

export function accountSummaries(
  entries: Entry[],
  anchors: Record<string, { date: string; balance: number }>,
  month: string,
): AccountSummary[] {
  const byAccount = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = entry.account || "Sans compte";
    byAccount.set(key, [...(byAccount.get(key) ?? []), entry]);
  }
  return [...byAccount.entries()]
    .map(([account, list]) => {
      const anchor = anchors[account];
      const balance = anchor
        ? anchor.balance +
          list
            .filter((entry) => entry.entry_date > anchor.date)
            .reduce((sum, entry) => sum + signedAmount(entry), 0)
        : null;
      return {
        account,
        count: list.length,
        lastDate: list.reduce(
          (max, entry) => (entry.entry_date > max ? entry.entry_date : max),
          "",
        ),
        balance,
        anchorDate: anchor?.date ?? null,
        monthFlow: list
          .filter((entry) => entry.entry_date.startsWith(month))
          .reduce((sum, entry) => sum + signedAmount(entry), 0),
      };
    })
    .sort((a, b) => b.count - a.count);
}
