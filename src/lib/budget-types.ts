import type { CategoryRule } from "@/lib/categories";

export type AiProvider = "gemini" | "anthropic" | "openai";

export type BudgetEntry = {
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
  /** Catégorie choisie par l'utilisateur (relecture d'import ou table Data). */
  category_manual?: boolean;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  theme: string;
  density: string;
  currency: string;
  date_format: string;
  ai_provider: AiProvider;
  ai_model: string;
  default_account: string;
  categories: string[];
  rules: CategoryRule[];
  backup_enabled: boolean;
  backup_interval_hours: number;
  backup_keep: number;
  backup_last: string | null;
  /** Tarif du modèle en USD par million de tokens (null : tarif indicatif intégré). */
  ai_price_in: number | null;
  ai_price_out: number | null;
};

export type SyncReport = {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  protected: number;
  total: number;
  message: string;
};

/** Contrôles extraits de l'en-tête / pied du relevé (null si absents). */
export type StatementInfo = {
  bank: string | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  total_debit: number | null;
  total_credit: number | null;
};

export type BalanceCheck = {
  status: "ok" | "mismatch" | "unavailable";
  message: string;
};

/** D'où vient la catégorie proposée à la relecture. */
export type CategorySource = "rule" | "history" | "ai" | "manual" | "none";

/** Tokens consommés par une analyse et coût estimé (USD, null si tarif inconnu). */
export type AiUsage = {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
};

export type ImportCandidate = {
  key: string;
  entry_type: string;
  entry_date: string;
  payee: string;
  description: string;
  amount: number;
  account: string;
  category: string;
  category_source: CategorySource;
  /** Autre catégorie plausible (proposition de l'IA écartée par l'historique), sinon "". */
  category_hint: string;
  /** L'IA signale qu'elle hésite sur la catégorie. */
  ai_unsure: boolean;
  /**
   * Écriture existante de même date et même montant. « certain » : même clé ou
   * émetteur ressemblant ; « probable » : émetteur différent, à vérifier.
   */
  duplicate_of: {
    payee: string;
    entry_date: string;
    amount: number;
    confidence: "certain" | "probable";
  } | null;
};

export type ImportPreview = {
  file_name: string;
  provider: AiProvider;
  model: string;
  statement: StatementInfo;
  check: BalanceCheck;
  candidates: ImportCandidate[];
  usage: AiUsage | null;
};

export type ImportRun = {
  id: string;
  ran_at: string;
  file_name: string;
  provider: AiProvider;
  model: string;
  account: string;
  period_start: string | null;
  period_end: string | null;
  /** Solde final imprimé sur le relevé (conservé pour l'historique des imports). */
  closing_balance?: number | null;
  rows_added: number;
  usage?: AiUsage | null;
};

/** Compte utilisé par défaut, renommable dans Réglages. */
export const DEFAULT_ACCOUNT = "Compte 1";

export const ENTRY_TYPES = ["Dépenses", "Recettes", "Transfert", "Épargne"] as const;

export const AI_PROVIDERS: Array<{ id: AiProvider; label: string; defaultModel: string }> = [
  { id: "gemini", label: "Google Gemini", defaultModel: "gemini-2.5-flash" },
  { id: "anthropic", label: "Anthropic Claude", defaultModel: "claude-opus-5-5" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-5-mini" },
];

export function isIncome(entry: Pick<BudgetEntry, "entry_type" | "amount">): boolean {
  const type = entry.entry_type.toLowerCase();
  if (type.startsWith("recette") || type.startsWith("rentr")) return true;
  if (type.startsWith("dépense")) return false;
  return entry.amount > 0;
}

export function formatMoney(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  const labels = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  const index = Number(month) - 1;
  return `${labels[index] ?? month} ${year?.slice(2) ?? ""}`;
}
