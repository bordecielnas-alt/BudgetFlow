import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Repeat, Scale } from "lucide-react";

import { CategoryDot } from "@/components/CategoryPicker";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useEntries } from "@/hooks/useEntries";
import { formatMoney, formatMonth, type BudgetEntry } from "@/lib/budget-types";
import {
  change,
  defaultMonth,
  detectRecurring,
  monthsWithData,
  monthTotals,
  shiftMonth,
} from "@/lib/insights";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Analyse — BudgetFlow" },
      {
        name: "description",
        content: "Comparaison mensuelle par catégorie et abonnements récurrents.",
      },
    ],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const { data: entries = [], isLoading } = useEntries();
  const months = useMemo(() => monthsWithData(entries), [entries]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? defaultMonth(entries);
  const options = months.includes(month) ? months : [month, ...months];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analyse"
        description="Évolution par catégorie et abonnements récurrents."
        actions={
          <Select value={month} onValueChange={setPicked}>
            <SelectTrigger className="w-40" aria-label="Mois analysé">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((value) => (
                <SelectItem key={value} value={value}>
                  {formatMonth(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement des données…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune donnée : importez un relevé pour commencer.
        </p>
      ) : (
        <>
          <Comparison entries={entries} month={month} />
          <Subscriptions entries={entries} />
        </>
      )}
    </div>
  );
}

function DeltaCell({
  current,
  before,
  expense,
}: {
  current: number;
  before: number;
  expense: boolean;
}) {
  const pct = change(current, before);
  if (pct === null) return <TableCell className="text-right text-muted-foreground">—</TableCell>;
  // Pour une dépense, une hausse est défavorable.
  const bad = expense ? pct > 5 : pct < -5;
  const good = expense ? pct < -5 : pct > 5;
  return (
    <TableCell
      className={`text-right text-xs ${bad ? "text-destructive" : good ? "text-income" : "text-muted-foreground"}`}
      title={`${formatMoney(current - before)}`}
    >
      {pct > 0 ? "+" : ""}
      {pct.toFixed(0)} %
    </TableCell>
  );
}

function Comparison({ entries, month }: { entries: BudgetEntry[]; month: string }) {
  const lastMonth = shiftMonth(month, -1);
  const lastYear = shiftMonth(month, -12);
  const data = useMemo(() => {
    const now = monthTotals(entries, month);
    const prev = monthTotals(entries, lastMonth);
    const year = monthTotals(entries, lastYear);
    const categories = [
      ...new Set([...now.byCategory.keys(), ...prev.byCategory.keys(), ...year.byCategory.keys()]),
    ].sort((a, b) => (now.byCategory.get(b) ?? 0) - (now.byCategory.get(a) ?? 0));
    return { now, prev, year, categories };
  }, [entries, month, lastMonth, lastYear]);

  const line = (
    label: string,
    pick: (t: typeof data.now) => number,
    expense: boolean,
    strong = false,
  ) => (
    <TableRow key={label} className={strong ? "font-medium" : undefined}>
      <TableCell>
        <span className="flex items-center gap-2">
          {!strong && <CategoryDot category={label === "Sans catégorie" ? "" : label} />}
          {label}
        </span>
      </TableCell>
      <TableCell className="text-right">{formatMoney(pick(data.now))}</TableCell>
      <TableCell className="text-right text-muted-foreground">
        {formatMoney(pick(data.prev))}
      </TableCell>
      <DeltaCell current={pick(data.now)} before={pick(data.prev)} expense={expense} />
      <TableCell className="text-right text-muted-foreground">
        {formatMoney(pick(data.year))}
      </TableCell>
      <DeltaCell current={pick(data.now)} before={pick(data.year)} expense={expense} />
    </TableRow>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4" /> Comparaison mensuelle
        </CardTitle>
        <CardDescription>
          {formatMonth(month)} face au mois précédent et au même mois de l'année dernière.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-44">Catégorie</TableHead>
              <TableHead className="text-right">{formatMonth(month)}</TableHead>
              <TableHead className="text-right">{formatMonth(lastMonth)}</TableHead>
              <TableHead className="w-20 text-right">Écart</TableHead>
              <TableHead className="text-right">{formatMonth(lastYear)}</TableHead>
              <TableHead className="w-20 text-right">Écart</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {line("Recettes", (t) => t.income, false, true)}
            {line("Dépenses", (t) => t.expense, true, true)}
            {data.categories.map((category) =>
              line(category, (t) => t.byCategory.get(category) ?? 0, true),
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Subscriptions({ entries }: { entries: BudgetEntry[] }) {
  const items = useMemo(() => detectRecurring(entries), [entries]);
  const active = items.filter((item) => item.active);
  const monthly = active.reduce((sum, item) => sum + item.monthlyCost, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4" /> Abonnements et prélèvements récurrents
        </CardTitle>
        <CardDescription>
          {active.length > 0
            ? `${active.length} actif(s), soit environ ${formatMoney(monthly)} par mois (${formatMoney(monthly * 12)} par an).`
            : "Aucune dépense récurrente détectée pour l'instant."}{" "}
          Détection automatique : même tiers, montant stable, tous les mois ou tous les ans.
        </CardDescription>
      </CardHeader>
      {items.length > 0 && (
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-44">Tiers</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Fréquence</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Dernier</TableHead>
                <TableHead>Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.signature} className={item.active ? undefined : "opacity-55"}>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-sm">
                      <CategoryDot category={item.category} />
                      {item.category || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.cadence} · {item.count}×
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={
                      item.variable ? `Montant habituel ≈ ${formatMoney(item.amount)}` : undefined
                    }
                  >
                    {item.variable ? "≈ " : ""}
                    {formatMoney(item.variable ? item.amount : item.lastAmount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.lastDate}</TableCell>
                  <TableCell className="space-x-1">
                    {item.isNew && <Badge variant="default">Nouveau</Badge>}
                    {item.priceChange !== null && (
                      <Badge
                        variant="outline"
                        className={
                          item.priceChange > 0
                            ? "border-transparent bg-danger-soft text-destructive"
                            : "border-transparent bg-income-soft text-income"
                        }
                      >
                        {item.priceChange > 0 ? "Hausse" : "Baisse"}{" "}
                        {item.priceChange > 0 ? "+" : ""}
                        {formatMoney(item.priceChange)}
                      </Badge>
                    )}
                    {item.variable && <Badge variant="outline">Montant variable</Badge>}
                    {!item.active && <Badge variant="secondary">Arrêté ?</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
