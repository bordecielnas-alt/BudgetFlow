// Estimation du coût d'une analyse. Tarifs publics indicatifs en USD par million
// de tokens (entrée / sortie) ; modifiables dans Réglages → IA si votre tarif diffère.
import type { AiUsage } from "@/lib/budget-types";

export type ModelPrice = { input: number; output: number };

export const KNOWN_PRICES: Record<string, ModelPrice> = {
  // Anthropic
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // Google
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  // OpenAI
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
};

export function knownPrice(model: string): ModelPrice | null {
  return KNOWN_PRICES[model.replace(/^models\//, "")] ?? null;
}

/** Prix réglé par l'utilisateur, sinon tarif indicatif du modèle, sinon null. */
export function resolvePrice(
  model: string,
  override: { ai_price_in: number | null; ai_price_out: number | null },
): ModelPrice | null {
  if (override.ai_price_in !== null && override.ai_price_out !== null) {
    return { input: override.ai_price_in, output: override.ai_price_out };
  }
  return knownPrice(model);
}

export function withCost(
  tokens: { input_tokens: number; output_tokens: number },
  price: ModelPrice | null,
): AiUsage {
  const cost = price
    ? (tokens.input_tokens * price.input + tokens.output_tokens * price.output) / 1_000_000
    : null;
  return { ...tokens, cost_usd: cost };
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 0.1 ? 4 : 2,
  }).format(value);
}
