import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { CategoryDot, CategoryPicker } from "@/components/CategoryPicker";
import { EmptyState, Money, PageHeader } from "@/components/page";
import { RuleNudge } from "@/components/RuleNudge";
import { Button } from "@/components/ui/button";
import { useEntries, useEntryMutations } from "@/hooks/useEntries";
import { useSettings } from "@/hooks/useSettings";
import { isIncome, type BudgetEntry } from "@/lib/budget-types";
import {
  buildCategoryMemory,
  normalizeText,
  payeeSignature,
  recallCategory,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/a-ranger")({
  head: () => ({
    meta: [
      { title: "À ranger — BudgetFlow" },
      { name: "description", content: "Opérations sans catégorie, regroupées par tiers." },
    ],
  }),
  component: SortPage,
});

type Group = {
  signature: string;
  label: string;
  rows: BudgetEntry[];
  total: number;
  from: string;
  to: string;
  accounts: string[];
  suggestion: string;
};

type Done = {
  signature: string;
  label: string;
  category: string;
  ids: string[];
  sample: BudgetEntry;
};

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}

function SortPage() {
  const { data: entries = [], isLoading } = useEntries();
  const { settings, update: updateSettings } = useSettings();
  const { update } = useEntryMutations();
  const [done, setDone] = useState<Done[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  // Ordre figé à l'arrivée sur la page : rien ne saute sous le curseur.
  const order = useRef<Map<string, number> | null>(null);

  const memory = useMemo(
    () =>
      buildCategoryMemory(
        entries.filter((entry) => entry.category),
        settings.categories,
      ),
    [entries, settings.categories],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const entry of entries) {
      if (entry.category) continue;
      const signature = payeeSignature(entry.payee) || `id:${entry.id}`;
      const slot =
        map.get(signature) ??
        ({
          signature,
          label: entry.payee || "Sans tiers",
          rows: [],
          total: 0,
          from: entry.entry_date,
          to: entry.entry_date,
          accounts: [],
          suggestion: recallCategory(memory, entry.payee)?.category ?? "",
        } satisfies Group);
      slot.rows.push(entry);
      slot.total += entry.amount;
      if (entry.entry_date < slot.from) slot.from = entry.entry_date;
      if (entry.entry_date > slot.to) slot.to = entry.entry_date;
      if (entry.account && !slot.accounts.includes(entry.account))
        slot.accounts.push(entry.account);
      map.set(signature, slot);
    }
    const list = [...map.values()].sort(
      (a, b) => b.rows.length - a.rows.length || Math.abs(b.total) - Math.abs(a.total),
    );
    if (!order.current && list.length > 0) {
      order.current = new Map(list.map((group, index) => [group.signature, index]));
    }
    const rank = (signature: string) => order.current?.get(signature) ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => rank(a.signature) - rank(b.signature));
  }, [entries, memory]);

  const remaining = groups.reduce((count, group) => count + group.rows.length, 0);

  function addCategory(name: string) {
    const value = name.trim();
    if (!value || settings.categories.some((c) => normalizeText(c) === normalizeText(value)))
      return;
    updateSettings.mutate({ categories: [...settings.categories, value] });
    toast.success(`Catégorie « ${value} » ajoutée`);
  }

  function assign(group: Group, rows: BudgetEntry[], category: string) {
    if (!category) return;
    const ids = rows.map((row) => row.id);
    update.mutate({ ids, patch: { category } });
    setDone((now) => [
      {
        signature: `${group.signature}:${ids.join(",")}`,
        label: group.label,
        category,
        ids,
        sample: rows[0]!,
      },
      ...now,
    ]);
  }

  function undo(item: Done) {
    update.mutate({ ids: item.ids, patch: { category: "" } });
    setDone((now) => now.filter((other) => other !== item));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="À ranger"
        description={
          remaining > 0
            ? `${remaining} opération${remaining > 1 ? "s" : ""} sans catégorie, regroupée${remaining > 1 ? "s" : ""} par tiers. Une catégorie choisie s'applique à tout le groupe.`
            : undefined
        }
      />

      {done.length > 0 && (
        <section aria-label="Rangées à l'instant" className="space-y-1.5">
          {done.slice(0, 6).map((item) => (
            <div
              key={item.signature}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-income-soft px-4 py-2.5 text-sm animate-in fade-in-0 duration-200"
            >
              <Check className="size-4 shrink-0 text-income" />
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CategoryDot category={item.category} />
                {item.category}
                {item.ids.length > 1 && <span className="num">· {item.ids.length} opérations</span>}
              </span>
              <RuleNudge
                payee={item.sample.payee}
                description={item.sample.description}
                category={item.category}
                className="text-income sm:ml-auto"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 max-sm:ml-auto"
                onClick={() => undo(item)}
              >
                <Undo2 /> Annuler
              </Button>
            </div>
          ))}
        </section>
      )}

      {isLoading ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-[68px] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={<CircleCheck />}
            title="Tout est rangé"
            action={
              <Button variant="outline" asChild>
                <Link to="/dashboard">Retour à la vue d'ensemble</Link>
              </Button>
            }
          >
            Chaque opération a sa catégorie. Les prochaines lignes importées sans catégorie
            apparaîtront ici.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {groups.map((group) => {
            const expanded = open === group.signature;
            const income = group.rows.every((row) => isIncome(row));
            return (
              <li key={group.signature}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : group.signature)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                    aria-expanded={expanded}
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        expanded && "rotate-180",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{group.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="num">{group.rows.length}</span> opération
                        {group.rows.length > 1 ? "s" : ""} ·{" "}
                        {group.from === group.to
                          ? shortDate(group.from)
                          : `${shortDate(group.from)} → ${shortDate(group.to)}`}
                        {group.accounts.length > 0 && ` · ${group.accounts.join(", ")}`}
                      </span>
                    </span>
                  </button>
                  <Money value={group.total} income={income} className="text-sm font-medium" />
                  <CategoryPicker
                    value=""
                    categories={settings.categories}
                    suggestions={group.suggestion ? [group.suggestion] : []}
                    placeholder={
                      group.suggestion ? `${group.suggestion} ?` : "Choisir une catégorie"
                    }
                    onChange={(category) => assign(group, group.rows, category)}
                    onCreate={addCategory}
                    className="w-full sm:w-56"
                  />
                </div>
                {expanded && (
                  <ul className="border-t bg-background/40 px-4 py-1 sm:px-5 animate-in fade-in-0 duration-150">
                    {group.rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 pl-7"
                      >
                        <span className="num w-16 text-xs text-muted-foreground">
                          {shortDate(row.entry_date)}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                          title={row.description}
                        >
                          {row.description || row.payee}
                        </span>
                        <Money value={row.amount} income={isIncome(row)} className="text-sm" />
                        <CategoryPicker
                          value=""
                          categories={settings.categories}
                          placeholder="Juste celle-ci…"
                          highlightEmpty={false}
                          onChange={(category) => assign(group, [row], category)}
                          onCreate={addCategory}
                          className="h-7 w-full text-xs sm:w-44"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
