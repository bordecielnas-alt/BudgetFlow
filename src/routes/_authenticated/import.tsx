import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUp,
  Info,
  ListChecks,
  Loader2,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { CategoryPicker, CategorySourceBadge } from "@/components/CategoryPicker";
import { Money, PageHeader } from "@/components/page";
import { RuleNudge } from "@/components/RuleNudge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEntries } from "@/hooks/useEntries";
import { useSettings } from "@/hooks/useSettings";
import { formatUsd } from "@/lib/ai/pricing";
import { checkBalance } from "@/lib/balance";
import {
  AI_PROVIDERS,
  type AiUsage,
  type ImportCandidate,
  type ImportPreview,
} from "@/lib/budget-types";
import { matchRule, normalizeText, payeeSignature, type CategoryRule } from "@/lib/categories";
import { analyzeStatement, commitImport, listImports } from "@/lib/import.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Importer un relevé — BudgetFlow" },
      {
        name: "description",
        content: "Importez vos relevés bancaires PDF : l'IA extrait et catégorise les opérations.",
      },
    ],
  }),
  component: ImportPage,
});

const MAX_BYTES = 20 * 1024 * 1024;
const PDF = "application/pdf";

type Row = ImportCandidate & { include: boolean };
type Job = {
  id: string;
  file: File;
  status: "pending" | "analyzing" | "ready" | "error";
  error?: string | undefined;
  preview?: ImportPreview;
  rows: Row[];
};

function isPdf(file: File): boolean {
  return file.type === PDF || file.name.toLowerCase().endsWith(".pdf");
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Ligne à regarder de près avant d'enregistrer. */
function needsReview(row: Row): boolean {
  return (
    row.include && (!row.category || row.ai_unsure || row.duplicate_of?.confidence === "probable")
  );
}

function usageLabel(usage: AiUsage): string {
  const tokens = new Intl.NumberFormat("fr-FR").format(usage.input_tokens + usage.output_tokens);
  return usage.cost_usd === null
    ? `${tokens} tokens`
    : `${tokens} tokens · ≈ ${formatUsd(usage.cost_usd)}`;
}

function shortDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}

function ImportPage() {
  const { settings, update, isLoading: settingsLoading } = useSettings();
  const { data: entries = [] } = useEntries();
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeStatement);
  const commit = useServerFn(commitImport);
  const loadImports = useServerFn(listImports);
  const history = useQuery({ queryKey: ["imports"], queryFn: () => loadImports({}) });

  const fileInput = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [account, setAccount] = useState("");
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Attendre les vrais réglages : la valeur de repli ne doit pas figer le champ.
    if (!settingsLoading) setAccount((current) => current || settings.default_account);
  }, [settingsLoading, settings.default_account]);

  const accounts = useMemo(
    () =>
      [...new Set([settings.default_account, ...entries.map((entry) => entry.account)])]
        .filter(Boolean)
        .sort(),
    [entries, settings.default_account],
  );
  const providerLabel = AI_PROVIDERS.find((item) => item.id === settings.ai_provider)?.label;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Job[] = [];
    for (const file of Array.from(list)) {
      if (!isPdf(file)) {
        toast.error(`${file.name} : seuls les relevés PDF sont acceptés`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} : fichier trop volumineux (20 Mo maximum)`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, status: "pending", rows: [] });
    }
    setJobs((current) => [...current, ...next]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function patchJob(id: string, patch: Partial<Job>) {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }

  function patchRow(jobId: string, key: string, patch: Partial<Row>) {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? { ...job, rows: job.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) }
          : job,
      ),
    );
  }

  // --- Catégorisation ---------------------------------------------------------

  function addCategory(name: string) {
    const value = name.trim();
    if (!value || settings.categories.some((c) => normalizeText(c) === normalizeText(value))) {
      return;
    }
    update.mutate({ categories: [...settings.categories, value] });
    toast.success(`Catégorie « ${value} » ajoutée`);
  }

  /**
   * Catégorie choisie à la main : elle s'applique aussi aux autres opérations du
   * même tiers (tous fichiers), sauf celles déjà fixées à la main ou par une règle.
   */
  function assignCategory(jobId: string, keys: string[], category: string) {
    const wanted = new Set(keys);
    const job = jobs.find((item) => item.id === jobId);
    const chosen = job?.rows.filter((row) => wanted.has(row.key)) ?? [];
    const signatures = new Set(chosen.map((row) => payeeSignature(row.payee)).filter(Boolean));
    const manual = { category, category_source: "manual" as const, ai_unsure: false };

    let propagated = 0;
    const next = jobs.map((item) => {
      if (item.status !== "ready") return item;
      return {
        ...item,
        rows: item.rows.map((row) => {
          if (item.id === jobId && wanted.has(row.key)) return { ...row, ...manual };
          const sameTier = category && signatures.has(payeeSignature(row.payee));
          const free = row.category_source !== "manual" && row.category_source !== "rule";
          if (sameTier && free && row.category !== category) {
            propagated += 1;
            return { ...row, ...manual };
          }
          return row;
        }),
      };
    });
    setJobs(next);

    if (propagated > 0 && chosen[0]) {
      toast(
        `« ${category} » appliquée à ${propagated} autre${propagated > 1 ? "s" : ""} opération${propagated > 1 ? "s" : ""} ${chosen[0].payee}`,
      );
    }
  }

  /** Une règle créée depuis la relecture s'applique aussitôt aux lignes en cours. */
  function applyRules(created: CategoryRule[]) {
    if (created.length === 0) return;
    setJobs((current) =>
      current.map((job) => ({
        ...job,
        rows: job.rows.map((row) => {
          const rule = matchRule(created, row.payee, row.description);
          return rule
            ? { ...row, category: rule.category, category_source: "rule", ai_unsure: false }
            : row;
        }),
      })),
    );
  }

  async function runAnalysis() {
    setRunning(true);
    for (const job of jobs.filter((item) => item.status === "pending" || item.status === "error")) {
      patchJob(job.id, { status: "analyzing", error: undefined });
      try {
        const base64 = await readBase64(job.file);
        const preview = await analyze({
          data: { fileName: job.file.name, mimeType: PDF, base64, account: account.trim() },
        });
        const rows = preview.candidates.map((row) => ({
          ...row,
          // Doublon seulement probable : gardé coché, mais signalé.
          include: row.duplicate_of?.confidence !== "certain" && Boolean(row.entry_date),
        }));
        patchJob(job.id, { status: "ready", preview, rows });
      } catch (error) {
        patchJob(job.id, { status: "error", error: (error as Error).message });
      }
    }
    setRunning(false);
  }

  const ready = jobs.filter((job) => job.status === "ready" && job.preview);
  const allRows = ready.flatMap((job) => job.rows);
  const selectedRows = allRows.filter((row) => row.include);
  const invalidRows = selectedRows.filter((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date));
  const uncategorized = selectedRows.filter((row) => !row.category).length;

  async function save() {
    if (selectedRows.length === 0 || invalidRows.length > 0) return;
    setSaving(true);
    const target = account.trim() || settings.default_account;
    let added = 0;
    try {
      for (const job of ready) {
        const rows = job.rows.filter((row) => row.include);
        if (rows.length === 0) continue;
        const preview = job.preview!;
        const result = await commit({
          data: {
            file_name: preview.file_name,
            provider: preview.provider,
            model: preview.model,
            account: target,
            period_start: preview.statement.period_start,
            period_end: preview.statement.period_end,
            closing_balance: preview.statement.closing_balance,
            usage: preview.usage,
            rows: rows.map((row) => ({
              key: row.key,
              entry_type: row.entry_type,
              entry_date: row.entry_date,
              payee: row.payee,
              description: row.description,
              amount: row.amount,
              account: target,
              category: row.category,
              category_manual: row.category_source === "manual",
            })),
          },
        });
        added += result.added;
      }
      toast.success(
        uncategorized > 0
          ? `${added} opération(s) enregistrée(s) · ${uncategorized} à ranger plus tard`
          : `${added} opération(s) enregistrée(s)`,
        uncategorized > 0
          ? { action: { label: "Ranger", onClick: () => void navigateToSort() } }
          : undefined,
      );
      setJobs((current) => current.filter((job) => job.status !== "ready"));
      void queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      void history.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const navigate = Route.useNavigate();
  const navigateToSort = () => navigate({ to: "/a-ranger" });
  const pending = jobs.some((job) => job.status === "pending" || job.status === "error");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importer un relevé"
        description={
          <>
            Lecture par {providerLabel} · {settings.ai_model} ·{" "}
            <Link to="/settings" className="text-primary-text underline-offset-4 hover:underline">
              changer
            </Link>
          </>
        }
      />

      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragging
              ? "border-primary bg-primary-soft"
              : "border-input bg-background/50 hover:border-muted-foreground/50 hover:bg-accent/50",
          )}
        >
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary-text">
            <FileUp className="size-5" />
          </span>
          <span className="font-medium">Déposez vos relevés PDF ici, ou cliquez pour choisir</span>
          <span className="text-sm text-muted-foreground">
            Relevés texte ou scannés · 20 Mo maximum par fichier
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />

        {jobs.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <FileText className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{job.file.name}</span>
                <span className="num text-xs text-muted-foreground">
                  {(job.file.size / 1024).toFixed(0)} Ko
                </span>
                {job.status === "pending" && <Badge variant="secondary">En attente</Badge>}
                {job.status === "analyzing" && (
                  <Badge variant="default">
                    <Loader2 className="size-3 animate-spin" /> Lecture…
                  </Badge>
                )}
                {job.status === "ready" && (
                  <Badge variant="income">
                    <span className="num">{job.rows.length}</span> opération(s)
                  </Badge>
                )}
                {job.status === "error" && <Badge variant="destructive">Erreur</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={job.status === "analyzing"}
                  onClick={() => setJobs((current) => current.filter((item) => item.id !== job.id))}
                  aria-label={`Retirer ${job.file.name}`}
                >
                  <X />
                </Button>
                {job.status === "error" && (
                  <p className="w-full pl-7 text-xs text-destructive">{job.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="import-account" className="text-xs text-muted-foreground">
              Compte
            </Label>
            <Input
              id="import-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              list="known-accounts"
              className="w-56"
            />
            <datalist id="known-accounts">
              {accounts.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
          <Button onClick={runAnalysis} disabled={running || !pending} className="ml-auto">
            {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {running ? "Lecture en cours…" : "Analyser"}
          </Button>
        </div>
      </section>

      {ready.map((job) => (
        <ReviewCard
          key={job.id}
          job={job}
          categories={settings.categories}
          onRow={(key, patch) => patchRow(job.id, key, patch)}
          onCategory={(keys, category) => assignCategory(job.id, keys, category)}
          onCreateCategory={addCategory}
          onRules={applyRules}
          onAll={(include) =>
            patchJob(job.id, { rows: job.rows.map((row) => ({ ...row, include })) })
          }
          onDiscard={() => setJobs((current) => current.filter((item) => item.id !== job.id))}
        />
      ))}

      {ready.length > 0 && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-popover px-4 py-3 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.4)] lg:bottom-4">
          <span className="text-sm">
            <strong className="num">{selectedRows.length}</strong> opération(s) · total{" "}
            <Money
              value={selectedRows.reduce((sum, row) => sum + row.amount, 0)}
              className="font-semibold"
            />
          </span>
          {uncategorized > 0 && (
            <span className="text-sm text-muted-foreground" title="Elles iront dans « À ranger »">
              <span className="num font-medium text-warning">{uncategorized}</span> sans catégorie,
              à ranger plus tard
            </span>
          )}
          {invalidRows.length > 0 && (
            <span className="text-sm text-destructive">
              {invalidRows.length} ligne(s) sans date valide
            </span>
          )}
          <Button
            className="ml-auto"
            onClick={save}
            disabled={saving || selectedRows.length === 0 || invalidRows.length > 0}
          >
            {saving && <Loader2 className="animate-spin" />} Enregistrer
          </Button>
        </div>
      )}

      <section className="rounded-xl border bg-card" aria-labelledby="history">
        <h2 id="history" className="px-5 pb-2 pt-5 text-[15px] font-semibold">
          Derniers imports
        </h2>
        {history.data?.length ? (
          <ul className="divide-y px-2 pb-2">
            {history.data.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{run.file_name}</span>
                <span className="num text-muted-foreground">{run.rows_added} ligne(s)</span>
                {run.account && <span className="text-muted-foreground">{run.account}</span>}
                {run.period_start && run.period_end && (
                  <span className="num text-muted-foreground">
                    {shortDate(run.period_start)} → {shortDate(run.period_end)}
                  </span>
                )}
                <span className="num w-full text-xs text-muted-foreground sm:w-auto">
                  {new Date(run.ran_at).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                  {run.usage && ` · ${usageLabel(run.usage)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-6 pt-2 text-sm text-muted-foreground">
            Aucun import pour le moment.
          </p>
        )}
      </section>
    </div>
  );
}

type View = "rows" | "payees";

function ReviewCard({
  job,
  categories,
  onRow,
  onCategory,
  onCreateCategory,
  onRules,
  onAll,
  onDiscard,
}: {
  job: Job;
  categories: string[];
  onRow: (key: string, patch: Partial<Row>) => void;
  onCategory: (keys: string[], category: string) => void;
  onCreateCategory: (category: string) => void;
  onRules: (rules: CategoryRule[]) => void;
  onAll: (include: boolean) => void;
  onDiscard: () => void;
}) {
  const preview = job.preview!;
  const [view, setView] = useState<View>("rows");
  const [onlyReview, setOnlyReview] = useState(false);
  // Recalculé à chaque correction : toutes les lignes du relevé comptent, même décochées.
  const check = checkBalance(preview.statement, job.rows);
  const { statement } = preview;
  const certain = job.rows.filter((row) => row.duplicate_of?.confidence === "certain").length;
  const probable = job.rows.filter((row) => row.duplicate_of?.confidence === "probable").length;
  const toReview = job.rows.filter(needsReview).length;
  const allIncluded = job.rows.length > 0 && job.rows.every((row) => row.include);
  const rows = onlyReview ? job.rows.filter(needsReview) : job.rows;

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={preview.file_name}>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 min-w-0 truncate text-[15px] font-semibold">{preview.file_name}</h2>
          {statement.bank && <Badge variant="outline">{statement.bank}</Badge>}
          {statement.period_start && statement.period_end && (
            <Badge variant="outline" className="num">
              {shortDate(statement.period_start)} → {shortDate(statement.period_end)}
            </Badge>
          )}
          {preview.usage && (
            <Badge variant="outline" title={`Modèle ${preview.model}`}>
              {usageLabel(preview.usage)}
            </Badge>
          )}
          {certain > 0 && (
            <Badge variant="secondary">{certain} déjà présente(s), décochée(s)</Badge>
          )}
          {probable > 0 && <Badge variant="warning">{probable} doublon(s) possible(s)</Badge>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onDiscard}>
            <Trash2 /> Ignorer ce fichier
          </Button>
        </div>
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            check.status === "ok"
              ? "bg-income-soft"
              : check.status === "mismatch"
                ? "bg-warning-soft"
                : "bg-muted",
          )}
        >
          {check.status === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-income" />
          ) : check.status === "mismatch" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span>{check.message}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => value && setView(value as View)}
            className="gap-0.5 rounded-lg bg-muted p-0.5"
          >
            <ToggleGroupItem value="rows" className="h-8 px-3">
              <ListChecks /> Opérations
            </ToggleGroupItem>
            <ToggleGroupItem value="payees" className="h-8 px-3">
              <Users /> Par tiers
            </ToggleGroupItem>
          </ToggleGroup>
          {view === "rows" && (
            <Button
              size="sm"
              variant={onlyReview ? "secondary" : "ghost"}
              onClick={() => setOnlyReview((value) => !value)}
              disabled={toReview === 0 && !onlyReview}
              aria-pressed={onlyReview}
            >
              <AlertTriangle /> À vérifier <span className="num">({toReview})</span>
            </Button>
          )}
          <span className="text-xs text-muted-foreground max-md:w-full">
            Une catégorie choisie s'applique aux autres opérations du même tiers.
          </span>
        </div>
      </div>
      <div className="overflow-x-auto border-t">
        {view === "payees" ? (
          <PayeeTable
            rows={job.rows}
            categories={categories}
            onCategory={onCategory}
            onCreateCategory={onCreateCategory}
            onRules={onRules}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allIncluded}
                    onCheckedChange={(checked) => onAll(checked === true)}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
                <TableHead className="w-36">Date</TableHead>
                <TableHead className="min-w-40">Tiers</TableHead>
                <TableHead className="min-w-56">Description</TableHead>
                <TableHead className="w-28 text-right">Montant</TableHead>
                <TableHead className="w-64">Catégorie</TableHead>
                <TableHead className="w-32 pr-4">État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key} className={cn("align-top", !row.include && "opacity-50")}>
                  <TableCell className="pl-4 pt-3.5">
                    <Checkbox
                      checked={row.include}
                      onCheckedChange={(checked) => onRow(row.key, { include: checked === true })}
                      aria-label="Inclure la ligne"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8"
                      value={row.entry_date}
                      onChange={(e) => onRow(row.key, { entry_date: e.target.value })}
                      aria-label="Date"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={row.payee}
                      onChange={(e) => onRow(row.key, { payee: e.target.value })}
                      aria-label="Tiers"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={row.description}
                      onChange={(e) => onRow(row.key, { description: e.target.value })}
                      aria-label="Description"
                    />
                  </TableCell>
                  <TableCell>
                    <AmountInput
                      value={row.amount}
                      onChange={(amount) =>
                        onRow(row.key, {
                          amount,
                          entry_type: amount < 0 ? "Dépenses" : "Recettes",
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <CategoryPicker
                        value={row.category}
                        categories={categories}
                        suggestions={row.category_hint ? [row.category_hint] : []}
                        placeholder="À ranger plus tard"
                        onChange={(category) => onCategory([row.key], category)}
                        onCreate={onCreateCategory}
                      />
                      <CategorySourceBadge
                        source={row.category_source}
                        unsure={row.ai_unsure && row.category_source !== "manual"}
                      />
                    </div>
                    {row.category_source === "manual" && row.category ? (
                      <RuleNudge
                        payee={row.payee}
                        description={row.description}
                        category={row.category}
                        onCreated={onRules}
                        className="mt-1"
                      />
                    ) : (
                      row.category_hint && (
                        <button
                          type="button"
                          className="mt-1 rounded px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          onClick={() => onCategory([row.key], row.category_hint)}
                          title="Proposition de l'IA, écartée au profit de vos habitudes"
                        >
                          IA : {row.category_hint}
                        </button>
                      )
                    )}
                  </TableCell>
                  <TableCell className="pr-4 pt-3.5">
                    {row.duplicate_of ? (
                      <Badge
                        variant={
                          row.duplicate_of.confidence === "certain" ? "secondary" : "warning"
                        }
                        title={`Déjà en base : ${row.duplicate_of.entry_date} · ${row.duplicate_of.payee || "sans tiers"} · ${row.duplicate_of.amount.toFixed(2)} €`}
                      >
                        {row.duplicate_of.confidence === "certain"
                          ? "Déjà présente"
                          : "Doublon possible"}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Nouvelle</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {onlyReview
                      ? "Rien à vérifier : toutes les lignes ont une catégorie sûre."
                      : "Aucune opération trouvée dans ce document."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

/** Une ligne par tiers : catégoriser 80 opérations revient à en régler une trentaine. */
function PayeeTable({
  rows,
  categories,
  onCategory,
  onCreateCategory,
  onRules,
}: {
  rows: Row[];
  categories: string[];
  onCategory: (keys: string[], category: string) => void;
  onCreateCategory: (category: string) => void;
  onRules: (rules: CategoryRule[]) => void;
}) {
  // Ordre figé à l'ouverture de la vue : une ligne ne doit pas bouger sous le curseur
  // juste après avoir reçu sa catégorie.
  const order = useRef<Map<string, number> | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: Row[] }>();
    for (const row of rows) {
      const signature = payeeSignature(row.payee) || row.key;
      const slot = map.get(signature) ?? { label: row.payee || "Sans tiers", rows: [] };
      slot.rows.push(row);
      map.set(signature, slot);
    }
    const list = [...map.entries()]
      .map(([signature, group]) => {
        const values = new Set(group.rows.map((row) => row.category));
        return {
          signature,
          ...group,
          total: group.rows.reduce((sum, row) => sum + row.amount, 0),
          category: values.size === 1 ? [...values][0]! : "",
          mixed: values.size > 1,
          unsure: group.rows.some((row) => row.ai_unsure && row.category_source !== "manual"),
          source: group.rows[0]!.category_source,
          hint: group.rows.find((row) => row.category_hint)?.category_hint ?? "",
        };
      })
      .sort((a, b) => {
        // À traiter d'abord : sans catégorie ou incertain, puis par nombre d'opérations.
        const weight = (g: { category: string; unsure: boolean }) =>
          !g.category || g.unsure ? 0 : 1;
        return weight(a) - weight(b) || b.rows.length - a.rows.length;
      });
    if (!order.current) {
      order.current = new Map(list.map((group, index) => [group.signature, index]));
    }
    const rank = (signature: string) => order.current?.get(signature) ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => rank(a.signature) - rank(b.signature));
  }, [rows]);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="min-w-48 pl-5">Tiers</TableHead>
          <TableHead className="w-24 text-right">Opérations</TableHead>
          <TableHead className="w-32 text-right">Total</TableHead>
          <TableHead className="w-80 pr-5">Catégorie</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.signature} className="align-top">
            <TableCell className="pl-5 pt-3.5 font-medium">{group.label}</TableCell>
            <TableCell className="num pt-3.5 text-right">{group.rows.length}</TableCell>
            <TableCell className="pt-3.5 text-right">
              <Money value={group.total} />
            </TableCell>
            <TableCell className="pr-5">
              <div className="flex items-center gap-1.5">
                <CategoryPicker
                  value={group.category}
                  categories={categories}
                  placeholder={group.mixed ? "Plusieurs catégories" : "À ranger plus tard"}
                  suggestions={group.hint ? [group.hint] : []}
                  onChange={(category) =>
                    onCategory(
                      group.rows.map((row) => row.key),
                      category,
                    )
                  }
                  onCreate={onCreateCategory}
                />
                {!group.mixed && (
                  <CategorySourceBadge source={group.source} unsure={group.unsure} />
                )}
              </div>
              {!group.mixed && group.source === "manual" && group.category && (
                <RuleNudge
                  payee={group.rows[0]!.payee}
                  description={group.rows[0]!.description}
                  category={group.category}
                  onCreated={onRules}
                  className="mt-1"
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Saisie libre (virgule acceptée), convertie en nombre à la sortie du champ. */
function AmountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(2));
  useEffect(() => setDraft(value.toFixed(2)), [value]);
  return (
    <Input
      className={cn("num h-8 text-right", value > 0 && "text-income")}
      value={draft}
      inputMode="decimal"
      aria-label="Montant"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = Number(draft.replace(/\s/g, "").replace(",", "."));
        if (Number.isFinite(next)) onChange(Math.round(next * 100) / 100);
        else setDraft(value.toFixed(2));
      }}
    />
  );
}
