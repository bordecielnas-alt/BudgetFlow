// Contrat d'extraction commun à tous les fournisseurs d'IA : schéma JSON de la
// réponse et consignes. Reprend les règles du workflow N8N « BudgetConverter ».

export type RawStatement = {
  bank: string | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  total_debit: number | null;
  total_credit: number | null;
};

export type RawTransaction = {
  date: string;
  payee: string;
  description: string;
  amount: number;
  category: string;
  /** Absent des anciennes réponses : traité comme false. */
  category_unsure?: boolean;
};

export type RawExtraction = {
  statement: RawStatement;
  transactions: RawTransaction[];
};

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

// Schéma strict (additionalProperties: false, tout est requis) : accepté tel quel
// par Claude et OpenAI, converti pour Gemini dans providers.server.ts.
export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["statement", "transactions"],
  properties: {
    statement: {
      type: "object",
      additionalProperties: false,
      required: [
        "bank",
        "period_start",
        "period_end",
        "opening_balance",
        "closing_balance",
        "total_debit",
        "total_credit",
      ],
      properties: {
        bank: nullableString,
        period_start: nullableString,
        period_end: nullableString,
        opening_balance: nullableNumber,
        closing_balance: nullableNumber,
        total_debit: nullableNumber,
        total_credit: nullableNumber,
      },
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "payee", "description", "amount", "category", "category_unsure"],
        properties: {
          date: { type: "string" },
          payee: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          category: { type: "string" },
          category_unsure: { type: "boolean" },
        },
      },
    },
  },
} as const;

export function buildSystemPrompt(
  categories: string[],
  examples: Array<[string, string]> = [],
): string {
  const history = examples.length
    ? `\n\n## Habitudes de l'utilisateur
Catégories déjà validées pour des émetteurs connus. Applique-les au même tiers, même si le libellé varie un peu :
${examples.map(([payee, category]) => `- ${payee} → ${category}`).join("\n")}`
    : "";
  return `## Rôle
Tu extrais les opérations d'un relevé de compte bancaire (PDF ou scan) ou d'une capture / photo d'une transaction, et tu les catégorises.

## Opérations (transactions)
- Une entrée par opération du tableau des opérations, dans l'ordre du document, sur toutes les pages.
- Ignore les lignes qui ne sont pas des opérations : SOLDE PRÉCÉDENT, SOLDE AU …, NOUVEAU SOLDE, TOTAUX DES MOUVEMENTS, reports de page.
- date : date d'opération (première colonne), au format AAAA-MM-JJ. Si l'année manque, déduis-la de la période du relevé.
- amount : nombre décimal avec un point, sans symbole monétaire. Colonne Débit → montant négatif. Colonne Crédit → montant positif. Ne change jamais le signe ensuite.
- payee : le tiers, court et lisible (marchand, organisme, émetteur ou bénéficiaire d'un virement). Exemples : « CARTE X6035 22/11 PICARD SA 296 » → « PICARD » ; prélèvement « DE: Engie » → « Engie » ; « ECHEANCE PRET N°823… » → « Échéance prêt ».
- description : courte description en français (80 caractères maximum) de la nature de l'opération, en reprenant le motif utile (ex. « Paiement carte », « Prélèvement – abonnement fibre », « Virement reçu – remboursement prêt maison »). N'y recopie pas les références, numéros de mandat ou identifiants.
- category : exactement une catégorie de la liste ci-dessous, ou une chaîne vide si aucune ne convient.
- category_unsure : true si le tiers est ambigu ou inconnu et que la catégorie est une supposition (ou vide) ; false si elle est évidente.

## Catégories autorisées
${categories.map((category) => `- ${category}`).join("\n")}

Notes : « Santé » = médicaments, santé mentale, consultations médicales. « Voiture » = dépenses automobiles hors carburant. « Income » = salaires, revenus, intérêts, remboursements reçus.${history}

## Contrôles (statement)
Renseigne, s'ils figurent sur le document : nom de la banque, période (AAAA-MM-JJ), solde précédent / initial (opening_balance), nouveau solde / solde final (closing_balance), total des débits et total des crédits (valeurs positives). Sinon, mets null.

## Capture ou photo d'une transaction isolée
Une seule opération ; montant négatif pour un achat ou un paiement. Les champs de contrôle sont alors null.`;
}

export function buildUserPrompt(fileName: string, note: string): string {
  const parts = [`Fichier : ${fileName}. Extrais toutes les opérations selon les consignes.`];
  if (note.trim()) parts.push(`Précision de l'utilisateur : ${note.trim()}`);
  return parts.join("\n");
}
