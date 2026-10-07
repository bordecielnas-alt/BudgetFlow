import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";

import { ImportButton } from "@/components/ImportButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntries } from "@/hooks/useEntries";
import { formatMoney, formatMonth, isIncome, type BudgetEntry } from "@/lib/budget-types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard budget — BudgetFlow" },
      {
        name: "description",
        content:
          "Vue d'ensemble de vos recettes, dépenses et soldes avec granularité année, mois ou jour et filtrage croisé.",
      },
      { property: "og:title", content: "Dashboard budget — BudgetFlow" },
      {
        property: "og:description",
        content: "Graphiques interactifs et filtrage croisé de votre budget.",
      },
    ],
  }),
  component: DashboardPage,
});

type FilterKey = "period" | "category" | "account" | "type";
type Filters = Partial<Record<FilterKey, string>>;
type Granularity = "year" | "month" | "day";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function currentYearRange() {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function bucketOf(date: string, granularity: Granularity) {
  if (granularity === "year") return date.slice(0, 4);
  if (granularity === "month") return date.slice(0, 7);
  return date.slice(0, 10);
}

function formatPeriod(key: string) {
  if (key.length === 4) return key;
  if (key.length === 7) return formatMonth(key);
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

function matches(
  entry: BudgetEntry,
  filters: Filters,
  granularity: Granularity,
  ignore?: FilterKey,
) {
  const checks: Array<[FilterKey, string]> = [
    ["period", bucketOf(entry.entry_date, granularity)],
    ["category", entry.category || "Sans catégorie"],
    ["account", entry.account || "Sans compte"],
    ["type", entry.entry_type],
  ];
  return checks.every(([key, value]) => {
    if (key === ignore) return true;
    const active = filters[key];
    return !active || active === value;
  });
}

function DashboardPage() {
  const { data: entries = [], isLoading } = useEntries();
  const [filters, setFilters] = useState<Filters>({});
  const initialRange = useMemo(currentYearRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [granularity, setGranularity] = useState<Granularity>("month");

  const scoped = useMemo(
    () => entries.filter((e) => e.entry_date >= from && e.entry_date <= to),
    [entries, from, to],
  );

  const toggle = (key: FilterKey, value: string) => {
    setFilters((current) => ({ ...current, [key]: current[key] === value ? undefined : value }));
  };

  const filtered = useMemo(
    () => scoped.filter((e) => matches(e, filters, granularity)),
    [scoped, filters, granularity],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const entry of filtered) {
      if (isIncome(entry)) income += Math.abs(entry.amount);
      else expense += Math.abs(entry.amount);
    }
    return { income, expense, count: filtered.length };
  }, [filtered]);

  const periods = useMemo(() => {
    const map = new Map<string, { period: string; recettes: number; depenses: number }>();
    for (const entry of scoped.filter((e) => matches(e, filters, granularity, "period"))) {
      const key = bucketOf(entry.entry_date, granularity);
      const slot = map.get(key) ?? { period: key, recettes: 0, depenses: 0 };
      if (isIncome(entry)) slot.recettes += Math.abs(entry.amount);
      else slot.depenses += Math.abs(entry.amount);
      map.set(key, slot);
    }
    return [...map.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((row) => ({
        ...row,
        label: formatPeriod(row.period),
      }));
  }, [scoped, filters, granularity]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of scoped.filter((e) => matches(e, filters, granularity, "category"))) {
      if (isIncome(entry)) continue;
      const key = entry.category || "Sans catégorie";
      map.set(key, (map.get(key) ?? 0) + Math.abs(entry.amount));
    }
    const rows = [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
    return rows.map((row) => ({ ...row, share: (row.value / total) * 100 }));
  }, [scoped, filters, granularity]);

  const tableRows = useMemo(
    () => [...filtered].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)).slice(0, 50),
    [filtered],
  );

  const activeFilters = Object.entries(filters).filter(([, value]) => value) as Array<
    [FilterKey, string]
  >;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              Date de début
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              Date de fin
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Abscisses</Label>
            <Select
              value={granularity}
              onValueChange={(value) => setGranularity(value as Granularity)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Année</SelectItem>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="day">Jour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ImportButton />
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map(([key, value]) => (
              <Badge key={key} variant="secondary" className="gap-1">
                {key === "period" ? formatPeriod(value) : value}
                <button
                  type="button"
                  onClick={() => toggle(key, value)}
                  aria-label="Retirer le filtre"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              Tout effacer
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Recettes", value: totals.income },
          { label: "Dépenses", value: totals.expense },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{formatMoney(kpi.value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Écritures</CardDescription>
            <CardTitle className="text-2xl">{totals.count}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recettes / dépenses</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periods}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Bar
                  dataKey="recettes"
                  name="Recettes"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                  onClick={(payload: { period?: string }) =>
                    payload.period && toggle("period", payload.period)
                  }
                >
                  {periods.map((row) => (
                    <Cell
                      key={row.period}
                      opacity={!filters.period || filters.period === row.period ? 1 : 0.3}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="depenses"
                  name="Dépenses"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  onClick={(payload: { period?: string }) =>
                    payload.period && toggle("period", payload.period)
                  }
                >
                  {periods.map((row) => (
                    <Cell
                      key={row.period}
                      opacity={!filters.period || filters.period === row.period ? 1 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dépenses par catégorie</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={78}
                  labelLine={false}
                  label={({ name, share }: { name?: string; share?: number }) =>
                    (share ?? 0) < 4 ? "" : `${name} ${(share ?? 0).toFixed(0)}%`
                  }
                  onClick={(payload: { name?: string }) =>
                    payload.name && toggle("category", payload.name)
                  }
                >
                  {byCategory.map((row, index) => (
                    <Cell
                      key={row.name}
                      fill={PALETTE[index % PALETTE.length]}
                      opacity={!filters.category || filters.category === row.name ? 1 : 0.3}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, item) =>
                    `${formatMoney(value)} — ${(
                      (item?.payload as { share?: number })?.share ?? 0
                    ).toFixed(1)} %`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Écritures filtrées</CardTitle>
          </CardHeader>
          <CardContent className="h-96 overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead>Émetteur</TableHead>
                  <TableHead className="w-32">Catégorie</TableHead>
                  <TableHead className="w-28 text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">{formatPeriod(entry.entry_date)}</TableCell>
                    <TableCell className="max-w-52 truncate text-xs" title={entry.payee}>
                      {entry.payee || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{entry.category || "Sans catégorie"}</TableCell>
                    <TableCell
                      className={`text-right text-xs ${isIncome(entry) ? "text-emerald-500" : ""}`}
                    >
                      {formatMoney(entry.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {tableRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Aucune écriture sur la sélection.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement des données…</p>}
      {!isLoading && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune donnée : lancez une MAJ, ou importez un CSV depuis l'onglet Data.
        </p>
      )}
    </div>
  );
}
