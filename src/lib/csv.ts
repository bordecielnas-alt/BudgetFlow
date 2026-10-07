// Import / export CSV de la table budget (sauvegardes, reprise depuis l'ancienne app).

export type RawRow = Record<string, unknown>;

export type NormalizedRow = {
  entry_type: string;
  entry_date: string;
  payee: string;
  amount: number;
  account: string;
  description: string;
  category: string;
  source_key: string;
};

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((value) => value.trim());
}

export function parseCsv(text: string): RawRow[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  // Les exports français utilisent souvent « ; » : on retient le séparateur le plus présent.
  const header = lines[0]!;
  const delimiter = header.split(";").length > header.split(",").length ? ";" : ",";
  const headers = splitCsvLine(header, delimiter);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    const row: RawRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function pick(row: RawRow, keys: string[]): string {
  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    lowered.set(key.trim().toLowerCase(), value);
  }
  for (const key of keys) {
    const value = lowered.get(key.toLowerCase());
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

export function normalizeDate(input: string): string {
  if (!input) return "";
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = input.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]!.padStart(2, "0")}-${fr[1]!.padStart(2, "0")}`;
  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function normalizeAmount(input: string): number {
  if (!input) return 0;
  const cleaned = input
    .replace(/\s/g, "")
    .replace(/[€$]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function normalizeType(input: string, amount: number): string {
  const value = input.trim();
  if (value) return value;
  return amount >= 0 ? "Recettes" : "Dépenses";
}

/**
 * La table source expose exactement :
 * id,Type,Date,Payee,Amount,Account,Description,Category,createdAt,updatedAt
 * L'identifiant `id` est la clé de rapprochement (déduplication / mise à jour).
 */
export function normalizeRows(rows: RawRow[]): {
  rows: NormalizedRow[];
  skipped: number;
  missingId: number;
} {
  const normalized: NormalizedRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let missingId = 0;

  for (const raw of rows) {
    const source =
      raw &&
      typeof raw === "object" &&
      "json" in raw &&
      raw["json"] &&
      typeof raw["json"] === "object"
        ? (raw["json"] as RawRow)
        : raw;

    const entry_date = normalizeDate(pick(source, ["Date", "date", "entry_date", "Jour"]));
    const amount = normalizeAmount(pick(source, ["Amount", "amount", "Montant", "montant"]));
    const sourceKey = pick(source, ["id", "ID", "Id", "row_id", "uuid", "source_key"]);

    if (!sourceKey) {
      missingId += 1;
      skipped += 1;
      continue;
    }
    if (!entry_date || seen.has(sourceKey)) {
      skipped += 1;
      continue;
    }
    seen.add(sourceKey);

    normalized.push({
      entry_type: normalizeType(pick(source, ["Type", "type", "entry_type", "Nature"]), amount),
      entry_date,
      payee: pick(source, ["Payee", "payee", "Bénéficiaire", "Beneficiaire", "Emetteur"]),
      amount,
      account: pick(source, ["Account", "account", "Compte"]),
      description: pick(source, ["Description", "description", "Libellé", "Libelle", "Note"]),
      category: pick(source, ["Category", "category", "Catégorie", "Categorie"]),
      source_key: sourceKey,
    });
  }

  return { rows: normalized, skipped, missingId };
}

export function parsePayload(text: string, contentType: string): RawRow[] {
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("[") || trimmed.startsWith("{");
  if (contentType.includes("json") || looksJson) {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as RawRow[];
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["data", "rows", "items", "results", "budget"]) {
        const value = record[key];
        if (Array.isArray(value)) return value as RawRow[];
      }
      return [record as RawRow];
    }
    return [];
  }
  return parseCsv(trimmed);
}

export const CSV_HEADER =
  "id,Type,Date,Payee,Amount,Account,Description,Category,createdAt,updatedAt";

export function toCsv(
  rows: Array<{
    id?: string;
    source_key?: string | null;
    entry_type: string;
    entry_date: string;
    payee: string;
    amount: number;
    account: string;
    description: string;
    category: string;
    created_at?: string;
    updated_at?: string;
  }>,
): string {
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = rows.map((row) =>
    [
      escape(row.source_key ?? row.id ?? ""),
      escape(row.entry_type),
      row.entry_date,
      escape(row.payee),
      row.amount.toFixed(2),
      escape(row.account),
      escape(row.description),
      escape(row.category),
      row.created_at ?? "",
      row.updated_at ?? "",
    ].join(","),
  );
  return [CSV_HEADER, ...lines].join("\n");
}
