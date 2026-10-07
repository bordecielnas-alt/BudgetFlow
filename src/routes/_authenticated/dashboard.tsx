import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Inbox,
  X,
} from "lucide-react";

import { CategoryDot } from "@/components/CategoryPicker";
import { EmptyState, Money, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEntries } from "@/hooks/useEntries";
import { formatMoney, formatMonth, isIncome, type BudgetEntry } from "@/lib/budget-types";
import { categoryColor } from "@/lib/categories";
import { change, previousRange, shiftMonth } from "@/lib/insights";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Vue d'ensemble — BudgetFlow" },
      {
        name: "description",
        content: "Entrées et sorties d'argent par période et par catégorie.",
      },
    ],
  }),
  component: DashboardPage,
});

type Scope = "month" | "year" | "all" | "custom";
type Filters = { category?: string; bucket?: string };

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const today = () => new Date().toISOString().slice(0, 10);

function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

function rangeOf(scope: Scope, anchor: string, custom: { from: string; to: string }) {
  if (scope === "month")
    return { from: `${anchor.slice(0, 7)}-01`, to: lastDay(anchor.slice(0, 7)) };
  if (scope === "year")
    return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
  if (scope === "custom") return custom;
  return { from: "0000-01-01", to: "9999-12-31" };
}

function titleOf(scope: Scope, anchor: string, custom: { from: string; to: string }) {
  if (scope === "month") {
    const name = MONTHS[Number(anchor.slice(5, 7)) - 1] ?? "";
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${anchor.slice(0, 4)}`;
  }
  if (scope === "year") return anchor.slice(0, 4);
  if (scope === "custom") return `Du ${shortDate(custom.from)} au ${shortDate(custom.to)}`;
  return "Toute la période";
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}

/** Barres : par jour sur un mois, par mois au-delà (par année sur plus de trois ans). */
function bucketOf(date: string, scope: Scope, spanMonths: number) {
  if (scope === "month") return date.slice(0, 10);
  if (scope !== "year" && spanMonths > 36) return date.slice(0, 4);
  return date.slice(0, 7);
}

function bucketLabel(key: string) {
  if (key.length === 4) return key;
  if (key.length === 7) return formatMonth(key);
  return String(Number(key.slice(8, 10)));
}

function totals(list: BudgetEntry[]) {
  let income = 0;
  let expense = 0;
  for (const entry of list) {
    if (isIncome(entry)) income += Math.abs(entry.amount);
    else expense += Math.abs(entry.amount);
  }
  return { income, expense };
}

/** Graduations rondes (1, 2, 2,5 ou 5 × 10ⁿ) couvrant la valeur maximale. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 10];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((value) => value >= raw)!;
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) ticks.push(Math.round(value * 100) / 100);
  return ticks;
}

/** Repères d'un mois : 1, 5, 10, 15, 20, 25 et le dernier jour. */
function dayTicks(days: number): string[] {
  return ["1", "5", "10", "15", "20", "25", String(days)].filter(
    (value, index, list) => Number(value) <= days && list.indexOf(value) === index,
  );
}

const compactEuro = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function DashboardPage() {
  const { data: entries = [], isLoading } = useEntries();
  const latest = entries[0]?.entry_date ?? today();
  const [scope, setScope] = useState<Scope>("month");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [custom, setCustom] = useState(() => ({
    from: `${today().slice(0, 4)}-01-01`,
    to: today(),
  }));
  const [account, setAccount] = useState("__all");
  const [filters, setFilters] = useState<Filters>({});
  // Par défaut : le mois de la dernière opération connue, pas un mois vide.
  const current = anchor ?? latest;
  const range = rangeOf(scope, current, custom);

  const accounts = useMemo(
    () => [...new Set(entries.map((entry) => entry.account).filter(Boolean))].sort(),
    [entries],
  );
  const uncategorized = useMemo(() => entries.filter((entry) => !entry.category).length, [entries]);

  const inAccount = useMemo(
    () => (account === "__all" ? entries : entries.filter((entry) => entry.account === account)),
    [entries, account],
  );
  const scoped = useMemo(
    () => inAccount.filter((e) => e.entry_date >= range.from && e.entry_date <= range.to),
    [inAccount, range.from, range.to],
  );
  const spanMonths = useMemo(() => {
    if (scoped.length === 0) return 0;
    const dates = scoped.map((e) => e.entry_date).sort();
    const [a, b] = [dates[0]!, dates[dates.length - 1]!];
    return (
      (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 +
      Number(b.slice(5, 7)) -
      Number(a.slice(5, 7))
    );
  }, [scoped]);

  const byFilters = (list: BudgetEntry[], ignore?: keyof Filters) =>
    list.filter(
      (entry) =>
        (ignore === "category" ||
          !filters.category ||
          (entry.category || "Sans catégorie") === filters.category) &&
        (ignore === "bucket" ||
          !filters.bucket ||
          bucketOf(entry.entry_date, scope, spanMonths) === filters.bucket),
    );

  const filtered = byFilters(scoped);
  const sum = totals(filtered);

  // Comparaison à durée égale : un mois en cours (données jusqu'au 15) se compare
  // au 1–15 du mois précédent, jamais à un mois entier.
  const previous = useMemo(() => {
    if (scope === "all" || filters.bucket) return null;
    const lastKnown = inAccount[0]?.entry_date ?? "";
    const partial = lastKnown >= range.from && lastKnown < range.to;
    let prev: { from: string; to: string };
    let label: string;
    if (scope === "month") {
      const month = shiftMonth(current.slice(0, 7), -1);
      const end = lastDay(month);
      const day = partial ? Math.min(Number(lastKnown.slice(8, 10)), Number(end.slice(8, 10))) : 0;
      prev = {
        from: `${month}-01`,
        to: partial ? `${month}-${String(day).padStart(2, "0")}` : end,
      };
      const name = MONTHS[Number(month.slice(5, 7)) - 1] ?? "";
      label = partial ? `du 1er au ${day} ${name}` : `en ${name}`;
    } else if (scope === "year") {
      const year = Number(current.slice(0, 4)) - 1;
      prev = {
        from: `${year}-01-01`,
        to: partial ? `${year}${lastKnown.slice(4)}` : `${year}-12-31`,
      };
      label = partial ? `à la même date en ${year}` : `en ${year}`;
    } else {
      prev = previousRange(range.from, range.to);
      label = "sur la période précédente";
    }
    const sum = totals(
      inAccount.filter(
        (e) =>
          e.entry_date >= prev.from &&
          e.entry_date <= prev.to &&
          (!filters.category || (e.category || "Sans catégorie") === filters.category),
      ),
    );
    return { ...sum, label };
  }, [scope, current, range.from, range.to, inAccount, filters.category, filters.bucket]);

  const bars = useMemo(() => {
    const map = new Map<string, { key: string; entrees: number; sorties: number }>();
    if (scope === "month") {
      const days = Number(range.to.slice(8, 10));
      for (let day = 1; day <= days; day += 1) {
        const key = `${range.from.slice(0, 8)}${String(day).padStart(2, "0")}`;
        map.set(key, { key, entrees: 0, sorties: 0 });
      }
    }
    for (const entry of byFilters(scoped, "bucket")) {
      const key = bucketOf(entry.entry_date, scope, spanMonths);
      const slot = map.get(key) ?? { key, entrees: 0, sorties: 0 };
      if (isIncome(entry)) slot.entrees += Math.abs(entry.amount);
      else slot.sorties += Math.abs(entry.amount);
      map.set(key, slot);
    }
    return [...map.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => ({ ...row, label: bucketLabel(row.key) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, scope, spanMonths, range.from, range.to, filters.category]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of byFilters(scoped, "category")) {
      if (isIncome(entry)) continue;
      const key = entry.category || "Sans catégorie";
      map.set(key, (map.get(key) ?? 0) + Math.abs(entry.amount));
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((acc, [, value]) => acc + value, 0) || 1;
    const max = rows[0]?.[1] || 1;
    return rows.map(([name, value]) => ({ name, value, share: value / total, width: value / max }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, filters.bucket, scope, spanMonths]);

  const recent = filtered.slice(0, 8);
  const yTicks = niceTicks(
    Math.max(0, ...bars.map((row) => Math.max(row.sorties, scope === "month" ? 0 : row.entrees))),
  );
  // Sur un mois, un salaire écraserait les dépenses du jour : seules les sorties.
  const series = scope === "month" ? (["sorties"] as const) : (["sorties", "entrees"] as const);

  function shift(delta: number) {
    if (scope === "month") setAnchor(`${shiftMonth(current.slice(0, 7), delta)}-01`);
    if (scope === "year") setAnchor(`${Number(current.slice(0, 4)) + delta}-01-01`);
    setFilters({});
  }

  const toggle = (key: keyof Filters, value: string) =>
    setFilters((now) => ({ ...now, [key]: now[key] === value ? undefined : value }));

  const activeFilters = (
    Object.entries(filters) as Array<[keyof Filters, string | undefined]>
  ).filter(([, value]) => value) as Array<[keyof Filters, string]>;

  if (!isLoading && entries.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title="Vue d'ensemble" />
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={<FileUp />}
            title="Aucune opération pour l'instant"
            action={
              <Button asChild>
                <Link to="/import">
                  <FileUp /> Importer un relevé PDF
                </Link>
              </Button>
            }
          >
            Déposez un relevé bancaire PDF : l'IA en extrait les opérations et propose une catégorie
            pour chacune. Vous relisez avant d'enregistrer.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={titleOf(scope, current, custom)}
        actions={
          <>
            {(scope === "month" || scope === "year") && (
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => shift(-1)}
                  aria-label="Période précédente"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => shift(1)}
                  aria-label="Période suivante"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
            <ToggleGroup
              type="single"
              value={scope}
              onValueChange={(value) => {
                if (!value) return;
                setScope(value as Scope);
                setFilters({});
              }}
              className="rounded-lg bg-muted p-0.5"
              aria-label="Période affichée"
            >
              <ToggleGroupItem value="month" className="h-8 px-3">
                Mois
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="h-8 px-3">
                Année
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="h-8 px-3">
                Tout
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" className="h-8 px-3">
                Dates
              </ToggleGroupItem>
            </ToggleGroup>
            {accounts.length > 1 && (
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
            )}
            <Button asChild className="max-sm:hidden">
              <Link to="/import">
                <FileUp /> Importer un relevé
              </Link>
            </Button>
          </>
        }
      />

      {scope === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            Du
            <Input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((now) => ({ ...now, from: e.target.value }))}
              className="w-40"
            />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            au
            <Input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((now) => ({ ...now, to: e.target.value }))}
              className="w-40"
            />
          </label>
        </div>
      )}

      {uncategorized > 0 && (
        <Link
          to="/a-ranger"
          className="group flex items-center gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm transition-colors hover:bg-warning-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Inbox className="size-4 shrink-0 text-warning" />
          <span>
            <span className="num font-semibold">{uncategorized}</span> opération
            {uncategorized > 1 ? "s" : ""} sans catégorie
          </span>
          <span className="ml-auto flex items-center gap-1 font-medium text-warning">
            Ranger{" "}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key, value)}
              className="flex h-7 items-center gap-1.5 rounded-full bg-primary-soft pl-3 pr-2 text-xs font-medium text-primary-text hover:bg-primary-soft/70"
              aria-label={`Retirer le filtre ${value}`}
            >
              {key === "bucket" ? bucketLabel(value) : value}
              <X className="size-3.5" />
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            Tout effacer
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="rounded-xl border bg-card p-5 sm:p-6" aria-label="Entrées et sorties">
          <div className="flex flex-wrap gap-x-12 gap-y-5">
            <Figure
              label="Sorties"
              value={sum.expense}
              before={previous?.expense}
              period={previous?.label}
              lead
            />
            <Figure
              label="Entrées"
              value={sum.income}
              before={previous?.income}
              period={previous?.label}
              income
            />
          </div>
          <div className="mt-6 h-60 sm:h-64">
            {bars.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucune opération sur cette période.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} barGap={2} margin={{ left: -8, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    {...(scope === "month"
                      ? { ticks: dayTicks(bars.length), interval: 0 }
                      : { interval: "preserveStartEnd" as const, minTickGap: 8 })}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    ticks={yTicks}
                    domain={[0, yTicks[yTicks.length - 1]!]}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(value: number) => `${compactEuro.format(value)} €`}
                  />
                  <Tooltip cursor={{ fill: "var(--accent)", radius: 6 }} content={<ChartTip />} />
                  {series.map((key) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={key === "sorties" ? "Sorties" : "Entrées"}
                      fill={key === "sorties" ? "var(--chart-1)" : "var(--chart-2)"}
                      radius={[4, 4, 1, 1]}
                      maxBarSize={28}
                      isAnimationActive={false}
                      className="cursor-pointer"
                      onClick={(payload: { key?: string }) =>
                        payload.key && toggle("bucket", payload.key)
                      }
                    >
                      {bars.map((row) => (
                        <Cell
                          key={row.key}
                          opacity={!filters.bucket || filters.bucket === row.key ? 1 : 0.28}
                        />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            {scope === "month" ? (
              <span>Sorties par jour</span>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-1" /> Sorties
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-2" /> Entrées
                </span>
              </>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="by-category">
          <h2 id="by-category" className="text-[15px] font-semibold">
            Sorties par catégorie
          </h2>
          {categories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucune sortie sur la période.
            </p>
          ) : (
            <ul className="mt-4 space-y-1">
              {categories.slice(0, 9).map((row) => {
                const active = filters.category === row.name;
                const dimmed = filters.category && !active;
                return (
                  <li key={row.name}>
                    <button
                      type="button"
                      onClick={() => toggle("category", row.name)}
                      aria-pressed={active}
                      className={cn(
                        "w-full rounded-lg px-2 py-2 text-left transition-[background-color,opacity] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active && "bg-accent",
                        dimmed && "opacity-45",
                      )}
                    >
                      <span className="flex items-baseline gap-2 text-sm">
                        <CategoryDot category={row.name === "Sans catégorie" ? "" : row.name} />
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                        <span className="num font-medium">{formatMoney(row.value)}</span>
                        <span className="num w-9 text-right text-xs text-muted-foreground">
                          {Math.round(row.share * 100)} %
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(2, row.width * 100)}%`,
                            backgroundColor:
                              row.name === "Sans catégorie"
                                ? "var(--muted-foreground)"
                                : categoryColor(row.name),
                          }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
              {categories.length > 9 && (
                <li className="px-2 pt-1 text-xs text-muted-foreground">
                  + {categories.length - 9} autres catégories
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card" aria-labelledby="recent">
        <div className="flex items-center justify-between px-5 pb-2 pt-5 sm:px-6">
          <h2 id="recent" className="text-[15px] font-semibold">
            Dernières opérations
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/data">
              Tout voir <ArrowRight />
            </Link>
          </Button>
        </div>
        {recent.length === 0 ? (
          <p className="px-6 pb-8 pt-4 text-sm text-muted-foreground">
            Aucune opération sur la sélection.
          </p>
        ) : (
          <ul className="divide-y px-2 pb-2 sm:px-3">
            {recent.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                <CategoryDot category={entry.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.payee || "Sans tiers"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {shortDate(entry.entry_date)} · {entry.category || "Sans catégorie"}
                  </p>
                </div>
                <Money
                  value={entry.amount}
                  income={isIncome(entry)}
                  className="text-sm font-medium"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  before,
  period,
  income = false,
  lead = false,
}: {
  label: string;
  value: number;
  before: number | undefined;
  period: string | undefined;
  income?: boolean;
  lead?: boolean;
}) {
  const pct = before === undefined ? null : change(value, before);
  const Icon = pct !== null && pct >= 0 ? ArrowUpRight : ArrowDownRight;
  // « 733,31 € » : les centimes et la devise en retrait, comme sur un relevé soigné.
  const text = formatMoney(value);
  const comma = text.lastIndexOf(",");
  const whole = comma > 0 ? text.slice(0, comma) : text;
  const rest = comma > 0 ? text.slice(comma) : "";
  return (
    <div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("size-2 rounded-full", income ? "bg-chart-2" : "bg-chart-1")} />
        {label}
      </p>
      <p
        className={cn(
          "num mt-1 font-semibold tracking-[-0.025em]",
          lead ? "text-[2.25rem] leading-none sm:text-[2.5rem]" : "text-[1.75rem] leading-none",
        )}
        aria-label={text}
      >
        {whole}
        <span className="text-[0.6em] font-medium text-muted-foreground">{rest}</span>
      </p>
      {before !== undefined && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          {pct === null ? (
            `Rien ${period ?? "sur la période précédente"}`
          ) : (
            <>
              <span className="flex items-center font-medium text-foreground">
                <Icon className="size-3.5" />
                {Math.abs(pct).toFixed(0)} %
              </span>
              vs {formatMoney(before)} {period}
            </>
          )}
        </p>
      )}
    </div>
  );
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)]">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}
          <span className="num ml-auto pl-4 font-medium text-foreground">
            {formatMoney(item.value ?? 0)}
          </span>
        </p>
      ))}
    </div>
  );
}
