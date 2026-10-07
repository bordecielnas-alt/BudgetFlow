// Catégories et règles de catégorisation, partagées client / serveur.

export type CategoryRule = {
  id: string;
  /** Texte recherché (insensible à la casse et aux accents) dans l'émetteur ou le libellé. */
  pattern: string;
  category: string;
};

// Reprise de la liste utilisée par le workflow N8N « BudgetConverter ».
export const DEFAULT_CATEGORIES = [
  "Alimentation",
  "Animaux",
  "Assurance",
  "Crédit",
  "Divertissement et sortie",
  "Energie",
  "Essence",
  "Maison",
  "Phone & Telecom",
  "Santé",
  "Travaux",
  "Vacances",
  "Voiture",
  "Income",
];

// Règles « Category automatic » du prompt N8N, rendues déterministes.
export const DEFAULT_RULES: CategoryRule[] = [
  { id: "default-kereis", pattern: "Kereis", category: "Assurance" },
  { id: "default-engie", pattern: "Engie", category: "Energie" },
  { id: "default-cotisation", pattern: "Cotisation", category: "Assurance" },
  { id: "default-sogessur", pattern: "SOGESSUR", category: "Assurance" },
  { id: "default-douaisis", pattern: "DOUAISIS ENVIRONNEMENT", category: "Energie" },
  { id: "default-pret", pattern: "ECHEANCE PRET", category: "Crédit" },
];

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Première règle dont le motif apparaît dans l'un des textes, sinon null. */
export function matchRule(rules: CategoryRule[], ...texts: string[]): CategoryRule | null {
  const haystack = normalizeText(texts.join(" "));
  for (const rule of rules) {
    const needle = normalizeText(rule.pattern);
    if (needle && haystack.includes(needle)) return rule;
  }
  return null;
}

/** Retrouve la catégorie officielle (casse exacte) correspondant à une proposition libre. */
export function canonicalCategory(categories: string[], proposal: string): string {
  const wanted = normalizeText(proposal);
  if (!wanted) return "";
  return categories.find((category) => normalizeText(category) === wanted) ?? "";
}
