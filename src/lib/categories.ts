// Catégories et règles de catégorisation, partagées client / serveur.

export type CategoryRule = {
  id: string;
  /** Texte recherché (insensible à la casse et aux accents) dans l'émetteur ou le libellé. */
  pattern: string;
  category: string;
};

// Liste du workflow N8N « BudgetConverter », en français (nouvelles installations ;
// une base existante garde ses noms, renommables dans Réglages → Catégories).
export const DEFAULT_CATEGORIES = [
  "Alimentation",
  "Animaux",
  "Assurance",
  "Crédit",
  "Divertissement et sortie",
  "Énergie",
  "Essence",
  "Maison",
  "Téléphone et internet",
  "Santé",
  "Travaux",
  "Vacances",
  "Voiture",
  "Revenus",
];

// Règles « Category automatic » du prompt N8N, rendues déterministes.
export const DEFAULT_RULES: CategoryRule[] = [
  { id: "default-kereis", pattern: "Kereis", category: "Assurance" },
  { id: "default-engie", pattern: "Engie", category: "Énergie" },
  { id: "default-cotisation", pattern: "Cotisation", category: "Assurance" },
  { id: "default-sogessur", pattern: "SOGESSUR", category: "Assurance" },
  { id: "default-douaisis", pattern: "DOUAISIS ENVIRONNEMENT", category: "Énergie" },
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

/** Texte comparable : sans accents ni casse, ponctuation ramenée à des espaces. */
function loose(value: string): string {
  return ` ${normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Première règle dont le motif apparaît dans l'un des textes, sinon null. */
export function matchRule(rules: CategoryRule[], ...texts: string[]): CategoryRule | null {
  const haystack = loose(texts.join(" "));
  for (const rule of rules) {
    const needle = loose(rule.pattern).trim();
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

/**
 * Motif de règle pour un émetteur : la première suite de mots qui nomme le tiers,
 * sans moyen de paiement ni référence. « Livret A virement » → LIVRET A ;
 * « CARTE X1234 PICARD SA 09/10 » → PICARD ; « Veto Saint-Roch » → VETO SAINT ROCH.
 */
export function suggestRulePattern(payee: string): string {
  const words = loose(payee).trim().split(" ").filter(Boolean);
  const isNoise = (word: string) => NOISE_WORDS.has(word) || /\d/.test(word);
  let start = 0;
  while (start < words.length && isNoise(words[start]!)) start += 1;
  const picked: string[] = [];
  for (const word of words.slice(start)) {
    if (isNoise(word) || picked.length === 3) break;
    picked.push(word);
  }
  // Un seul mot très court (« SG ») matcherait trop de libellés.
  const pattern = picked.join(" ");
  return pattern.replace(/\s/g, "").length >= 3 ? pattern.toUpperCase() : "";
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

// Palette des catégories. Teintes autorisées seulement hors des couleurs qui ont
// un sens : rouge (erreurs, ~25), ambre (« à ranger », 60–100), vert (entrées,
// ~158) et indigo (accent, 260–290). Sept teintes, ordonnées pour que deux
// voisines s'opposent, puis trois paliers de clarté : 21 couleurs distinctes.
const CATEGORY_HUES = [190, 325, 122, 235, 350, 212, 302];
const CATEGORY_TIERS = [
  { l: 0.72, c: 0.13 },
  { l: 0.56, c: 0.13 },
  { l: 0.84, c: 0.08 },
];

let categoryOrder: string[] = [];
// Catégories absentes des Réglages (anciennes données) : rangées à la suite, dans
// l'ordre où on les rencontre, plutôt que par hachage (pas de collision).
const extraOrder: string[] = [];

/** Ordre des catégories des Réglages : deux voisines n'ont jamais la même couleur. */
export function setCategoryOrder(categories: string[]) {
  categoryOrder = categories;
}

const INCOME_NAMES = new Set(["revenus", "income", "salaire", "salaires"]);

/** Couleur stable d'une catégorie, pour la repérer d'un coup d'œil. */
export function categoryColor(category: string): string {
  if (!category) return "var(--muted-foreground)";
  if (INCOME_NAMES.has(normalizeText(category))) return "var(--income)";
  let index = categoryOrder.indexOf(category);
  if (index < 0) {
    if (!extraOrder.includes(category)) extraOrder.push(category);
    index = categoryOrder.length + extraOrder.indexOf(category);
  }
  const hue = CATEGORY_HUES[index % CATEGORY_HUES.length]!;
  const tier = CATEGORY_TIERS[Math.floor(index / CATEGORY_HUES.length) % CATEGORY_TIERS.length]!;
  return `oklch(${tier.l} ${tier.c} ${hue})`;
}

/** Noms hérités de l'ancienne application, proposés à la traduction. */
export const LEGACY_CATEGORY_NAMES: Record<string, string> = {
  Income: "Revenus",
  "Phone & Telecom": "Téléphone et internet",
  Energie: "Énergie",
};
