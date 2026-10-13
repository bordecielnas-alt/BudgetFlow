import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { CategoryDot } from "@/components/CategoryPicker";
import { Money, PageHeader } from "@/components/page";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEntries } from "@/hooks/useEntries";
import { formatMoney, formatMonth, isIncome, type BudgetEntry } from "@/lib/budget-types";
import { categoryColor } from "@/lib/categories";
import { shiftMonth } from "@/lib/insights";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/detail")({
  head: () => ({
    meta: [
      { title: "Détail — BudgetFlow" },
      {
        name: "description",
        content: "Sorties mois par mois et par catégorie, avec le budget moyen mensuel.",
      },
    ],
  }),
  component: DetailPage,
});

const UNCATEGORIZED = "Sans catégorie";

/** Colonne affichée : un mois, ou une année repliée (somme de ses mois). */
type Column = { key: string; label: string; year: string; months: string[]; folded: boolean };

/** Montant compact d'une cellule : « 1 234 € », vide pour zéro. */
const cellMoney = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function DetailPage() {
  const { data: entries = [], isLoading } = useEntries();
  const [account, setAccount] = useState("__all");
  // Années dépliées choisies par l'utilisateur ; par défaut, seule la plus récente.
  const [openYears, setOpenYears] = useState<Set<string> | null>(null);

  const accounts = useMemo(
    () => [...new Set(entries.map((entry) => entry.account).filter(Boolean))].sort(),
    [entries],
  );

  const data = useMemo(() => {
    const expenses = entries.filter(
      (entry) =>
        !isIncome(entry) &&
        /^\d{4}-\d{2}/.test(entry.entry_date) &&
        (account === "__all" || entry.account === account),
    );
    // cellule « catégorie|mois » → montant
    const cells = new Map<string, number>();
    const cellEntries = new Map<string, BudgetEntry[]>();
    const byCategory = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const entry of expenses) {
      const month = entry.entry_date.slice(0, 7);
      const category = entry.category || UNCATEGORIZED;
      const amount = Math.abs(entry.amount);
      cells.set(`${category}|${month}`, (cells.get(`${category}|${month}`) ?? 0) + amount);
      const list = cellEntries.get(`${category}|${month}`) ?? [];
      list.push(entry);
      cellEntries.set(`${category}|${month}`, list);
      byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
      byMonth.set(month, (byMonth.get(month) ?? 0) + amount);
    }
    // Tous les mois entre la première et la dernière sortie, y compris les mois vides.
    const known = [...byMonth.keys()].sort();
    const months: string[] = [];
    if (known.length > 0) {
      for (let m = known[0]!; m <= known[known.length - 1]!; m = shiftMonth(m, 1)) months.push(m);
    }
    const categories = [...byCategory.entries()]
      .sort((a, b) => (a[0] === UNCATEGORIZED ? 1 : b[0] === UNCATEGORIZED ? -1 : b[1] - a[1]))
      .map(([name]) => name);
    const total = [...byMonth.values()].reduce((sum, value) => sum + value, 0);
    return { cells, cellEntries, byCategory, byMonth, months, categories, total };
  }, [entries, account]);

  const years = useMemo(
    () => [...new Set(data.months.map((month) => month.slice(0, 4)))],
    [data.months],
  );
  const open = openYears ?? new Set(years.slice(-1));

  const columns = useMemo<Column[]>(
    () =>
      years.flatMap((year): Column[] => {
        const months = data.months.filter((month) => month.startsWith(year));
        if (!open.has(year)) return [{ key: year, label: year, year, months, folded: true }];
        return months.map((month) => ({
          key: month,
          label: formatMonth(month),
          year,
          months: [month],
          folded: false,
        }));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [years, data.months, openYears],
  );

  const monthCount = data.months.length;
  const average = monthCount > 0 ? data.total / monthCount : 0;

  const cell = (category: string, column: Column) =>
    column.months.reduce((sum, month) => sum + (data.cells.get(`${category}|${month}`) ?? 0), 0);
  const columnTotal = (column: Column) =>
    column.months.reduce((sum, month) => sum + (data.byMonth.get(month) ?? 0), 0);

  function toggleYear(year: string) {
    const next = new Set(open);
    if (next.has(year)) next.delete(year);
    else next.add(year);
    setOpenYears(next);
  }

  const allOpen = years.length > 0 && years.every((year) => open.has(year));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Détail"
        description="Sorties par catégorie et par mois, hors revenus."
        actions={
          accounts.length > 1 && (
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="h-9 w-40" aria-label="Compte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Tous les comptes</SelectItem>
                {accounts.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement des données…</p>
      ) : monthCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune sortie : importez un relevé pour commencer.
        </p>
      ) : (
        <>
          <section className="flex flex-wrap gap-x-12 gap-y-4 rounded-xl border bg-card p-5 sm:p-6">
            <div>
              <p className="text-sm text-muted-foreground">Budget moyen mensuel</p>
              <p className="num mt-1 text-[2.25rem] font-semibold leading-none tracking-[-0.025em]">
                {formatMoney(average)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Sorties hors revenus, sur {monthCount} mois ({formatMonth(data.months[0]!)} –{" "}
                {formatMonth(data.months[monthCount - 1]!)})
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total des sorties</p>
              <p className="num mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.025em]">
                {formatMoney(data.total)}
              </p>
            </div>
          </section>

          <section className="rounded-xl border bg-card" aria-label="Sorties par catégorie et par mois">
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
              <p className="text-xs text-muted-foreground">
                Cliquez sur une année pour afficher ou masquer ses mois.
              </p>
              <button
                type="button"
                onClick={() => setOpenYears(allOpen ? new Set() : new Set(years))}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary-text hover:bg-accent"
              >
                {allOpen ? "Tout replier" : "Tout déplier"}
              </button>
            </div>
            <div className="overflow-x-auto border-t">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-20 min-w-44 border-b bg-card px-4 text-left align-bottom font-medium text-muted-foreground"
                    >
                      Catégorie
                    </th>
                    {years.map((year) => {
                      const span = columns.filter((column) => column.year === year).length;
                      const isOpen = open.has(year);
                      return (
                        <th
                          key={year}
                          colSpan={span}
                          className="border-b border-l px-2 pt-2 text-left font-medium"
                        >
                          <button
                            type="button"
                            onClick={() => toggleYear(year)}
                            aria-expanded={isOpen}
                            className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                            {year}
                          </button>
                        </th>
                      );
                    })}
                    <th
                      rowSpan={2}
                      className="border-b border-l bg-muted/40 px-3 text-right align-bottom font-medium"
                    >
                      Moyenne
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        / mois
                      </span>
                    </th>
                  </tr>
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "whitespace-nowrap border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground",
                          (column.folded || column.months[0]!.endsWith("-01")) && "border-l",
                        )}
                      >
                        {column.folded ? "Total" : column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((category) => (
                    <tr key={category} className="group" style={rowTint(category)}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b bg-(--row) px-4 py-2 text-left font-normal group-hover:bg-(--row-hover)"
                      >
                        <span className="flex items-center gap-2">
                          <CategoryDot category={category === UNCATEGORIZED ? "" : category} />
                          <span className="truncate">{category}</span>
                        </span>
                      </th>
                      {columns.map((column) => {
                        const value = cell(category, column);
                        return (
                          <td
                            key={column.key}
                            className={cn(
                              "num whitespace-nowrap border-b bg-(--row) p-0 text-right group-hover:bg-(--row-hover)",
                              (column.folded || column.months[0]!.endsWith("-01")) && "border-l",
                              column.folded && "font-medium",
                              value === 0 && "px-3 py-2 text-muted-foreground/50",
                            )}
                          >
                            {value === 0 ? (
                              "–"
                            ) : (
                              <CellDetail
                                category={category}
                                label={column.folded ? column.year : column.label}
                                value={value}
                                entries={column.months.flatMap(
                                  (month) => data.cellEntries.get(`${category}|${month}`) ?? [],
                                )}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="num whitespace-nowrap border-b border-l bg-(--row-strong) px-3 py-2 text-right font-medium group-hover:bg-(--row-hover)">
                        {cellMoney.format((data.byCategory.get(category) ?? 0) / monthCount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-muted px-4 py-3 text-left font-semibold"
                    >
                      Total
                    </th>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "num whitespace-nowrap bg-muted px-3 py-3 text-right",
                          (column.folded || column.months[0]!.endsWith("-01")) && "border-l",
                        )}
                      >
                        {cellMoney.format(columnTotal(column))}
                        {column.folded && column.months.length > 0 && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {cellMoney.format(columnTotal(column) / column.months.length)} / mois
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="num whitespace-nowrap border-l bg-muted px-3 py-3 text-right text-primary-text">
                      {cellMoney.format(average)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Fond léger de la ligne, teinté par la couleur de la catégorie (opaque pour la colonne figée). */
function rowTint(category: string): CSSProperties {
  const color = category === UNCATEGORIZED ? "var(--muted-foreground)" : categoryColor(category);
  return {
    "--row": `color-mix(in srgb, ${color} 11%, var(--card))`,
    "--row-strong": `color-mix(in srgb, ${color} 17%, var(--card))`,
    "--row-hover": `color-mix(in srgb, ${color} 24%, var(--card))`,
  } as CSSProperties;
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Montant cliquable : liste les opérations qui le composent. */
function CellDetail({
  category,
  label,
  value,
  entries,
}: {
  category: string;
  label: string;
  value: number;
  entries: BudgetEntry[];
}) {
  const sorted = [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="num w-full px-3 py-2 text-right underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=open]:underline"
          aria-label={`${category}, ${label} : ${formatMoney(value)}, voir les opérations`}
        >
          {cellMoney.format(value)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <CategoryDot category={category === UNCATEGORIZED ? "" : category} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {category} · {label}
          </p>
          <span className="num text-sm font-semibold">{formatMoney(value)}</span>
        </div>
        <ul className="max-h-72 divide-y overflow-y-auto px-1">
          {sorted.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
              <span className="num w-10 shrink-0 text-xs text-muted-foreground">
                {shortDate(entry.entry_date)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{entry.payee || "Sans tiers"}</span>
                {entry.description && entry.description !== entry.payee && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {entry.description}
                  </span>
                )}
              </span>
              <Money value={-Math.abs(entry.amount)} className="text-sm" />
            </li>
          ))}
        </ul>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {sorted.length} opération{sorted.length > 1 ? "s" : ""}
        </p>
      </PopoverContent>
    </Popover>
  );
}
