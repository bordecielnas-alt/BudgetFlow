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

// --- Émetteurs : signature stable et ressemblance ------------------------------

// Mots qui décrivent le moyen de paiement ou la forme juridique, pas le tiers.
const NOISE_WORDS = new Set([
  "carte",
  "cb",
  "prlv",
  "prelevement",
  "prel",
  "sepa",
  "vir",
  "virement",
  "recu",
  "emis",
  "paiement",
  "achat",
  "retrait",
  "dab",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "et",
  "sa",
  "sas",
  "sasu",
  "sarl",
  "eurl",
  "fr",
  "com",
  "www",
  "france",
]);

/** Mots significatifs d'un émetteur : sans chiffres, références ni mots de liaison. */
export function payeeTokens(payee: string): string[] {
  return normalizeText(payee)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3 && !/\d/.test(token) && !NOISE_WORDS.has(token));
}

/**
 * Clé de regroupement d'un émetteur : « CARTE X6035 PICARD SA 296 » et « Picard »
 * donnent la même signature. Repli sur le texte normalisé si aucun mot ne reste.
 */
export function payeeSignature(payee: string): string {
  const tokens = payeeTokens(payee);
  if (tokens.length > 0) return tokens.join(" ");
  return normalizeText(payee)
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string): string {
  return normalizeText(value).replace(/[^a-z]+/g, "");
}

/** Deux libellés désignent-ils vraisemblablement le même tiers ? */
export function similarPayees(a: string, b: string): boolean {
  const left = new Set(payeeTokens(a));
  if (payeeTokens(b).some((token) => left.has(token))) return true;
  const ca = compact(a);
  const cb = compact(b);
  if (ca.length < 4 || cb.length < 4) return false;
  return ca.includes(cb) || cb.includes(ca);
}

/** Motif de règle pour un émetteur : texte court, présent tel quel dans le libellé. */
export function suggestRulePattern(payee: string): string {
  const signature = payeeSignature(payee);
  if (signature && normalizeText(payee).includes(signature)) return signature.toUpperCase();
  const longest = [...payeeTokens(payee)].sort((a, b) => b.length - a.length)[0];
  return (longest ?? "").toUpperCase();
}

// --- Mémoire de catégorisation (apprise sur l'historique) ---------------------

export type MemoryHit = { category: string; label: string; weight: number; share: number };
export type CategoryMemory = Map<string, MemoryHit>;

type MemorySource = {
  payee: string;
  category: string;
  category_manual?: boolean | undefined;
  source?: string | undefined;
};

/**
 * Pour chaque émetteur déjà vu, la catégorie qui lui est le plus souvent donnée.
 * Une catégorie choisie à la main pèse 3, une catégorie acceptée telle quelle 1.
 */
export function buildCategoryMemory(entries: MemorySource[], categories: string[]): CategoryMemory {
  const tally = new Map<string, { label: string; votes: Map<string, number> }>();
  for (const entry of entries) {
    const category = canonicalCategory(categories, entry.category ?? "");
    const signature = payeeSignature(entry.payee ?? "");
    if (!category || !signature) continue;
    const weight = entry.category_manual || entry.source === "manual" ? 3 : 1;
    const slot = tally.get(signature) ?? { label: entry.payee.trim(), votes: new Map() };
    slot.votes.set(category, (slot.votes.get(category) ?? 0) + weight);
    tally.set(signature, slot);
  }

  const memory: CategoryMemory = new Map();
  for (const [signature, { label, votes }] of tally) {
    const total = [...votes.values()].reduce((sum, value) => sum + value, 0);
    const [category, weight] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]!;
    memory.set(signature, { category, label, weight, share: weight / total });
  }
  return memory;
}

/** Catégorie apprise pour cet émetteur, si elle est assez sûre pour primer sur l'IA. */
export function recallCategory(memory: CategoryMemory, payee: string): MemoryHit | null {
  const hit = memory.get(payeeSignature(payee));
  if (!hit) return null;
  return hit.weight >= 2 && hit.share >= 0.6 ? hit : null;
}

/** Exemples « émetteur → catégorie » les plus établis, à montrer à l'IA. */
export function memoryExamples(memory: CategoryMemory, limit = 60): Array<[string, string]> {
  return [...memory.values()]
    .filter((hit) => hit.share >= 0.6)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((hit) => [hit.label, hit.category]);
}

/** Couleur stable d'une catégorie, pour la repérer d'un coup d'œil. */
export function categoryColor(category: string): string {
  if (!category) return "var(--muted-foreground)";
  let hash = 0;
  for (const char of category) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 65% 52%)`;
}
