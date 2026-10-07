import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { CategoryPicker } from "@/components/CategoryPicker";
import { EditableAmount, EditableText, isValidDate } from "@/components/EditableCell";
import { EmptyState, PageHeader } from "@/components/page";
import { useRuleActions } from "@/components/RuleNudge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEntries, useEntryMutations, type EntryPatch } from "@/hooks/useEntries";
import { useSettings } from "@/hooks/useSettings";
import { formatMonth, isIncome, type BudgetEntry } from "@/lib/budget-types";
import { normalizeText } from "@/lib/categories";
import { toCsv } from "@/lib/csv";
import { importRows } from "@/lib/data.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/data")({
  head: () => ({
    meta: [
      { title: "Opérations — BudgetFlow" },
      {
        name: "description",
        content: "Toutes vos opérations : recherche, édition en place, import et export CSV.",
      },
    ],
  }),
  component: DataPage,
});

type SortKey = "entry_date" | "payee" | "amount" | "category";
type Flow = "all" | "out" | "in" | "none";
const PAGE = 100;
const ALL = "__all";
const NONE = "__none";

function DataPage() {
  const { data: entries = [], isLoading } = useEntries();
  const { update, create, remove, invalidate } = useEntryMutations();
  const { settings, update: updateSettings } = useSettings();
  const { suggestion, createRules } = useRuleActions();
  const runImport = useServerFn(importRows);
  const fileInput = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [flow, setFlow] = useState<Flow>("all");
  const [category, setCategory] = useState(ALL);
  const [account, setAccount] = useState(ALL);
  const [month, setMonth] = useState(ALL);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "entry_date",
    desc: true,
  });
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const lastIndex = useRef<number | null>(null);
  const extend = useRef(false);

  const accounts = useMemo(
    () =>
      [...new Set([settings.default_account, ...entries.map((e) => e.account)])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "fr")),
    [entries, settings.default_account],
  );
  const multiAccount = accounts.length > 1;
  const months = useMemo(
    () =>
      [...new Set(entries.map((e) => e.entry_date.slice(0, 7)))].filter(Boolean).sort().reverse(),
    [entries],
  );
  const categories = useMemo(
    () =>
      [...new Set([...settings.categories, ...entries.map((e) => e.category)])]
        .filter((c) => c && c.trim())
        .sort((a, b) => a.localeCompare(b, "fr")),
    [entries, settings.categories],
  );

  const rows = useMemo(() => {
    const term = normalizeText(search);
    const list = entries.filter((entry) => {
      if (flow === "in" && !isIncome(entry)) return false;
      if (flow === "out" && isIncome(entry)) return false;
      if (category === NONE ? entry.category : category !== ALL && entry.category !== category)
        return false;
      if (account !== ALL && entry.account !== account) return false;
      if (month !== ALL && !entry.entry_date.startsWith(month)) return false;
      if (term) {
        const haystack = normalizeText(
          [
            entry.payee,
            entry.description,
            entry.category,
            entry.account,
            entry.amount.toFixed(2),
          ].join(" "),
        );
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    const factor = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      const diff =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "fr");
      return diff * factor || (a.entry_date < b.entry_date ? 1 : -1);
    });
  }, [entries, search, flow, category, account, month, sort]);

  const shown = rows.slice(0, limit);
  const filtering =
    search || flow !== "all" || category !== ALL || account !== ALL || month !== ALL;
  const selectedEntries = entries.filter((entry) => selected.has(entry.id));
  const allShownSelected = shown.length > 0 && shown.every((row) => selected.has(row.id));

  function resetFilters() {
    setSearch("");
    setFlow("all");
    setCategory(ALL);
    setAccount(ALL);
    setMonth(ALL);
  }

  function sortBy(key: SortKey) {
    setSort((now) => ({
      key,
      desc: now.key === key ? !now.desc : key === "entry_date" || key === "amount",
    }));
  }

  function toggleRow(index: number, id: string, checked: boolean, extend: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      const ids =
        extend && lastIndex.current !== null
          ? shown
              .slice(Math.min(lastIndex.current, index), Math.max(lastIndex.current, index) + 1)
              .map((row) => row.id)
          : [id];
      for (const value of ids) {
        if (checked) next.add(value);
        else next.delete(value);
      }
      return next;
    });
    lastIndex.current = index;
  }

  function patch(entry: BudgetEntry, change: EntryPatch) {
    update.mutate({ ids: [entry.id], patch: change });
  }

  /** Catégorie corrigée à la main : propose une règle, sans bloquer. */
  function setEntryCategory(entry: BudgetEntry, value: string) {
    patch(entry, { category: value });
    const pattern = suggestion(entry.payee, entry.description, value);
    if (pattern) {
      toast(`Catégorie « ${value} » enregistrée`, {
        description: `Classer automatiquement « ${pattern} » à l'avenir ?`,
        action: {
          label: "Créer la règle",
          onClick: () => createRules([{ pattern, category: value }]),
        },
      });
    }
  }

  function addCategory(name: string) {
    const value = name.trim();
    if (!value || settings.categories.some((c) => normalizeText(c) === normalizeText(value)))
      return;
    updateSettings.mutate({ categories: [...settings.categories, value] });
  }

  function bulk(change: EntryPatch, label: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    update.mutate(
      { ids, patch: change },
      { onSuccess: () => toast.success(`${label} : ${ids.length} opération(s)`) },
    );
  }

  function removeSelected() {
    if (selectedEntries.length === 0) return;
    remove.mutate(selectedEntries);
    setSelected(new Set());
  }

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `budget-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const report = await runImport({ data: { text, contentType: file.type || "text/csv" } });
      toast.success(
        `${report.added} ajoutée(s), ${report.updated} mise(s) à jour, ${report.protected} protégée(s), ${report.skipped} ignorée(s)`,
      );
      invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Opérations"
        description={
          isLoading
            ? "Chargement…"
            : filtering
              ? `${rows.length} sur ${entries.length} opérations`
              : `${entries.length} opérations`
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload /> Importer un CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={onFile}
            />
            <Button variant="ghost" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download /> Exporter
            </Button>
            <Button onClick={() => setComposing(true)} disabled={composing}>
              <Plus /> Nouvelle opération
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tiers, libellé, montant…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(PAGE);
            }}
            className="pl-8"
            aria-label="Rechercher"
          />
        </label>
        <Select value={flow} onValueChange={(value) => setFlow(value as Flow)}>
          <SelectTrigger className="w-auto min-w-32" aria-label="Sens">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Entrées et sorties</SelectItem>
            <SelectItem value="out">Sorties</SelectItem>
            <SelectItem value="in">Entrées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-auto min-w-40" aria-label="Catégorie">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes catégories</SelectItem>
            <SelectItem value={NONE}>Sans catégorie</SelectItem>
            {categories.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {accounts.length > 1 && (
          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger className="w-auto min-w-36" aria-label="Compte">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les comptes</SelectItem>
              {accounts.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-auto min-w-32" aria-label="Mois">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les mois</SelectItem>
            {months.map((value) => (
              <SelectItem key={value} value={value}>
                {formatMonth(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X /> Effacer
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-10 py-2.5 pl-4 font-medium">
                  <Checkbox
                    checked={allShownSelected}
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked === true ? new Set(shown.map((row) => row.id)) : new Set(),
                      )
                    }
                    aria-label="Tout sélectionner"
                  />
                </th>
                <SortHead
                  label="Date"
                  active={sort}
                  column="entry_date"
                  onSort={sortBy}
                  className="w-[8.5rem]"
                />
                <SortHead
                  label="Tiers"
                  active={sort}
                  column="payee"
                  onSort={sortBy}
                  className="w-[20%]"
                />
                <th className="px-2 font-medium">Description</th>
                <SortHead
                  label="Catégorie"
                  active={sort}
                  column="category"
                  onSort={sortBy}
                  className="w-60"
                />
                {multiAccount && <th className="w-28 px-2 font-medium">Compte</th>}
                <SortHead
                  label="Montant"
                  active={sort}
                  column="amount"
                  onSort={sortBy}
                  className="w-32 text-right"
                  align="right"
                />
                <th className="w-12 pr-3" />
              </tr>
            </thead>
            <tbody>
              {composing && (
                <Composer
                  showAccount={multiAccount}
                  categories={settings.categories}
                  accounts={accounts}
                  defaultAccount={settings.default_account}
                  onCreateCategory={addCategory}
                  onCancel={() => setComposing(false)}
                  onSubmit={(data) =>
                    create.mutate(data, {
                      onSuccess: () => {
                        toast.success("Opération ajoutée");
                        setComposing(false);
                      },
                      onError: (error) => toast.error((error as Error).message),
                    })
                  }
                  busy={create.isPending}
                />
              )}
              {shown.map((entry, index) => {
                const checked = selected.has(entry.id);
                return (
                  <tr
                    key={entry.id}
                    className={cn(
                      "group/row border-b transition-colors last:border-0 hover:bg-accent/40 focus-within:bg-accent/60",
                      checked && "bg-primary-soft hover:bg-primary-soft",
                    )}
                  >
                    <td
                      className="py-1 pl-4"
                      onClickCapture={(event) => {
                        extend.current = event.shiftKey;
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          toggleRow(index, entry.id, value === true, extend.current)
                        }
                        aria-label={`Sélectionner ${entry.payee || "l'opération"}`}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <EditableText
                        type="date"
                        value={entry.entry_date}
                        validate={isValidDate}
                        onCommit={(value) => patch(entry, { entry_date: value })}
                        label="Date"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <EditableText
                        value={entry.payee}
                        placeholder="Tiers"
                        onCommit={(value) => patch(entry, { payee: value })}
                        label="Tiers"
                        className="font-medium"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <EditableText
                        value={entry.description}
                        placeholder="—"
                        onCommit={(value) => patch(entry, { description: value })}
                        label="Description"
                        className="text-muted-foreground focus:text-foreground"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <CategoryPicker
                        variant="ghost"
                        value={entry.category}
                        categories={settings.categories}
                        placeholder="À ranger"
                        onChange={(value) => setEntryCategory(entry, value)}
                        onCreate={addCategory}
                      />
                    </td>
                    {multiAccount && (
                      <td className="px-1 py-1">
                        <EditableText
                          value={entry.account}
                          onCommit={(value) =>
                            patch(entry, { account: value || settings.default_account })
                          }
                          label="Compte"
                          className="text-muted-foreground focus:text-foreground"
                        />
                      </td>
                    )}
                    <td className="px-1 py-1">
                      <EditableAmount
                        value={entry.amount}
                        income={isIncome(entry)}
                        onCommit={(amount) => {
                          const sign =
                            entry.entry_type === "Dépenses" || entry.entry_type === "Recettes";
                          patch(entry, {
                            amount,
                            ...(sign ? { entry_type: amount > 0 ? "Recettes" : "Dépenses" } : {}),
                          });
                        }}
                        className="font-medium"
                      />
                    </td>
                    <td className="py-1 pr-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:text-destructive"
                        onClick={() => remove.mutate([entry])}
                        aria-label={`Supprimer ${entry.payee || "l'opération"}`}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isLoading && (
          <div className="space-y-2 p-4" aria-busy>
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-8 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <EmptyState
            icon={filtering ? <Search /> : <Plus />}
            title={filtering ? "Aucune opération ne correspond" : "Aucune opération"}
            action={
              filtering ? (
                <Button variant="outline" onClick={resetFilters}>
                  Effacer les filtres
                </Button>
              ) : undefined
            }
          >
            {filtering
              ? "Modifiez la recherche ou les filtres."
              : "Importez un relevé PDF, un fichier CSV, ou ajoutez une opération à la main."}
          </EmptyState>
        )}
        {rows.length > limit && (
          <div className="flex items-center justify-center gap-3 border-t p-3 text-sm text-muted-foreground">
            <span className="num">
              {limit} sur {rows.length}
            </span>
            <Button variant="outline" size="sm" onClick={() => setLimit((now) => now + PAGE * 2)}>
              Afficher plus
            </Button>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2.5 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.4)] lg:bottom-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
          <span className="px-1 text-sm">
            <strong className="num">{selected.size}</strong> sélectionnée(s)
          </span>
          <CategoryPicker
            value=""
            categories={settings.categories}
            placeholder="Changer la catégorie…"
            highlightEmpty={false}
            onChange={(value) => bulk({ category: value }, `Catégorie « ${value || "aucune"} »`)}
            onCreate={addCategory}
            className="h-8 w-52"
          />
          {accounts.length > 1 && (
            <Select
              value=""
              onValueChange={(value) => bulk({ account: value }, `Compte « ${value} »`)}
            >
              <SelectTrigger className="h-8 w-44" aria-label="Changer le compte">
                <SelectValue placeholder="Changer le compte…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="hover:text-destructive"
            onClick={removeSelected}
          >
            <Trash2 /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            <X /> Désélectionner
          </Button>
        </div>
      )}
    </div>
  );
}

function SortHead({
  label,
  column,
  active,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  column: SortKey;
  active: { key: SortKey; desc: boolean };
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const on = active.key === column;
  const Icon = active.desc ? ArrowDown : ArrowUp;
  return (
    <th
      className={cn("px-2 font-medium", className)}
      aria-sort={on ? (active.desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          on && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !on && "opacity-0")} />
      </button>
    </th>
  );
}

/** Saisie d'une nouvelle opération directement en tête du tableau. */
function Composer({
  showAccount,
  categories,
  accounts,
  defaultAccount,
  onCreateCategory,
  onSubmit,
  onCancel,
  busy,
}: {
  showAccount: boolean;
  categories: string[];
  accounts: string[];
  defaultAccount: string;
  onCreateCategory: (name: string) => void;
  onSubmit: (data: EntryPatch) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    payee: "",
    description: "",
    category: "",
    account: defaultAccount,
    amount: "",
    sign: "-" as "-" | "+",
  });
  const value = Number(draft.amount.replace(/\s/g, "").replace(",", "."));
  const valid =
    draft.amount.trim() !== "" && Number.isFinite(value) && !isValidDate(draft.entry_date);

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!valid) return;
    const amount = (Math.round(Math.abs(value) * 100) / 100) * (draft.sign === "-" ? -1 : 1);
    onSubmit({
      entry_date: draft.entry_date,
      payee: draft.payee.trim(),
      description: draft.description.trim(),
      category: draft.category,
      account: draft.account.trim() || defaultAccount,
      amount,
      entry_type: amount > 0 ? "Recettes" : "Dépenses",
    });
  }

  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") submit();
    if (event.key === "Escape") onCancel();
  };

  return (
    <tr className="border-b bg-primary-soft/60">
      <td className="pl-4" />
      <td className="px-1 py-2">
        <Input
          type="date"
          value={draft.entry_date}
          onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })}
          onKeyDown={keys}
          className="num h-8 px-2"
          aria-label="Date"
        />
      </td>
      <td className="px-1 py-2">
        <Input
          autoFocus
          placeholder="Tiers"
          value={draft.payee}
          onChange={(e) => setDraft({ ...draft, payee: e.target.value })}
          onKeyDown={keys}
          className="h-8 px-2"
          aria-label="Tiers"
        />
      </td>
      <td className="px-1 py-2">
        <Input
          placeholder="Description"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onKeyDown={keys}
          className="h-8 px-2"
          aria-label="Description"
        />
      </td>
      <td className="px-1 py-2">
        <CategoryPicker
          value={draft.category}
          categories={categories}
          highlightEmpty={false}
          onChange={(category) => setDraft({ ...draft, category })}
          onCreate={onCreateCategory}
        />
      </td>
      {showAccount && (
        <td className="px-1 py-2">
          <Input
            value={draft.account}
            list="composer-accounts"
            onChange={(e) => setDraft({ ...draft, account: e.target.value })}
            onKeyDown={keys}
            className="h-8 px-2"
            aria-label="Compte"
          />
          <datalist id="composer-accounts">
            {accounts.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </td>
      )}
      <td className="px-1 py-2">
        <div
          className="mb-1 flex rounded-lg bg-muted p-0.5 text-xs"
          role="radiogroup"
          aria-label="Sens"
        >
          {(["-", "+"] as const).map((sign) => (
            <button
              key={sign}
              type="button"
              role="radio"
              aria-checked={draft.sign === sign}
              onClick={() => setDraft({ ...draft, sign })}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-muted-foreground",
                draft.sign === sign &&
                  "bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12)]",
              )}
            >
              {sign === "-" ? "Sortie" : "Entrée"}
            </button>
          ))}
        </div>
        <Input
          inputMode="decimal"
          placeholder="0,00"
          value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          onKeyDown={keys}
          className="num h-8 px-2 text-right"
          aria-label="Montant"
        />
      </td>
      <td className="py-2 pr-3">
        <div className="flex justify-end gap-1">
          <Button
            size="icon-sm"
            onClick={() => submit()}
            disabled={!valid || busy}
            aria-label="Ajouter l'opération"
          >
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Annuler la saisie">
            <X />
          </Button>
        </div>
      </td>
    </tr>
  );
}
