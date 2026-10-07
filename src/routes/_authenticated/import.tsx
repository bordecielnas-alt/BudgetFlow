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
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { CategoryPicker, CategorySourceBadge } from "@/components/CategoryPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEntries } from "@/hooks/useEntries";
import { useSettings } from "@/hooks/useSettings";
import { formatUsd } from "@/lib/ai/pricing";
import { checkBalance } from "@/lib/balance";
import {
  AI_PROVIDERS,
  formatMoney,
  type AiUsage,
  type ImportCandidate,
  type ImportPreview,
} from "@/lib/budget-types";
import {
  matchRule,
  normalizeText,
  payeeSignature,
  suggestRulePattern,
  type CategoryRule,
} from "@/lib/categories";
import { analyzeStatement, commitImport, listImports } from "@/lib/import.functions";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import de relevés — BudgetFlow" },
      {
        name: "description",
        content:
          "Importez vos relevés bancaires PDF ou photos : l'IA extrait et catégorise les opérations.",
      },
    ],
  }),
  component: ImportPage,
});

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type Row = ImportCandidate & { include: boolean };
type Job = {
  id: string;
  file: File;
  mimeType: string;
  status: "pending" | "analyzing" | "ready" | "error";
  error?: string | undefined;
  preview?: ImportPreview;
  rows: Row[];
};

function mimeOf(file: File): string {
  if (Object.values(ACCEPTED).includes(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED[extension] ?? "";
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

type RuleSuggestion = { signature: string; pattern: string; category: string; count: number };

function ImportPage() {
  const { settings, update } = useSettings();
  const { data: entries = [] } = useEntries();
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeStatement);
  const commit = useServerFn(commitImport);
  const loadImports = useServerFn(listImports);
  const history = useQuery({ queryKey: ["imports"], queryFn: () => loadImports({}) });

  const fileInput = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccount((current) => current || settings.default_account);
  }, [settings.default_account]);

  const accounts = useMemo(
    () => [...new Set(entries.map((entry) => entry.account).filter(Boolean))].sort(),
    [entries],
  );
  const providerLabel = AI_PROVIDERS.find((item) => item.id === settings.ai_provider)?.label;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Job[] = [];
    for (const file of Array.from(list)) {
      const mimeType = mimeOf(file);
      if (!mimeType) {
        toast.error(`${file.name} : format non pris en charge (PDF, JPEG, PNG, WebP)`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} : fichier trop volumineux (20 Mo maximum)`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, mimeType, status: "pending", rows: [] });
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
   * Catégorie choisie à la main pour des lignes : elle s'applique aussi aux autres
   * opérations du même tiers (tous fichiers), sauf celles déjà fixées à la main ou par règle.
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
      const payee = chosen[0].payee;
      toast.success(
        `« ${category} » appliquée à ${propagated} autre${propagated > 1 ? "s" : ""} opération${propagated > 1 ? "s" : ""} ${payee}`,
        {
          action: {
            label: "Créer une règle",
            onClick: () => createRules([{ pattern: suggestRulePattern(payee), category }]),
          },
        },
      );
    }
  }

  function createRules(items: Array<{ pattern: string; category: string }>) {
    const valid = items.filter((item) => item.pattern && item.category);
    if (valid.length === 0) return;
    const patterns = new Set(valid.map((item) => normalizeText(item.pattern)));
    const created: CategoryRule[] = valid.map((item) => ({
      id: crypto.randomUUID(),
      pattern: item.pattern,
      category: item.category,
    }));
    // Une règle sur le même motif est remplacée ; les nouvelles passent en tête.
    update.mutate({
      rules: [...created, ...settings.rules.filter((r) => !patterns.has(normalizeText(r.pattern)))],
    });
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
    toast.success(
      valid.length === 1
        ? `Règle créée : « ${valid[0]!.pattern} » → ${valid[0]!.category}`
        : `${valid.length} règles créées`,
    );
  }

  async function runAnalysis() {
    setRunning(true);
    for (const job of jobs.filter((item) => item.status === "pending" || item.status === "error")) {
      patchJob(job.id, { status: "analyzing", error: undefined });
      try {
        const base64 = await readBase64(job.file);
        const preview = await analyze({
          data: {
            fileName: job.file.name,
            mimeType: job.mimeType,
            base64,
            account: account.trim(),
            note,
          },
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

  // Tiers catégorisés à la main sans règle correspondante : candidats à une règle.
  const ruleSuggestions = useMemo(() => {
    const groups = new Map<string, RuleSuggestion & { votes: Map<string, number> }>();
    for (const row of allRows) {
      if (row.category_source !== "manual" || !row.category) continue;
      const signature = payeeSignature(row.payee);
      if (!signature) continue;
      if (matchRule(settings.rules, row.payee, row.description)?.category === row.category)
        continue;
      const slot = groups.get(signature) ?? {
        signature,
        pattern: suggestRulePattern(row.payee),
        category: row.category,
        count: 0,
        votes: new Map<string, number>(),
      };
      slot.count += 1;
      slot.votes.set(row.category, (slot.votes.get(row.category) ?? 0) + 1);
      groups.set(signature, slot);
    }
    return [...groups.values()]
      .filter((group) => group.pattern)
      .map(({ votes, ...group }) => ({
        ...group,
        category: [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [allRows, settings.rules]);

  async function save() {
    if (selectedRows.length === 0 || invalidRows.length > 0) return;
    setSaving(true);
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
            account: account.trim(),
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
              account: account.trim(),
              category: row.category,
              category_manual: row.category_source === "manual",
            })),
          },
        });
        added += result.added;
      }
      toast.success(`${added} opération(s) enregistrée(s)`);
      setJobs((current) => current.filter((job) => job.status !== "ready"));
      void queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["account-anchors"] });
      void history.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const pending = jobs.some((job) => job.status === "pending" || job.status === "error");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import de relevés</h1>
          <p className="text-sm text-muted-foreground">
            Analyse par {providerLabel} ({settings.ai_model}) ·{" "}
            <Link to="/settings" className="underline">
              changer
            </Link>
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
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
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
            }`}
          >
            <FileUp className="size-8 text-muted-foreground" />
            <span className="font-medium">Déposez vos relevés ici ou cliquez pour choisir</span>
            <span className="text-sm text-muted-foreground">
              PDF de relevé, scan ou photo (JPEG, PNG, WebP) — 20 Mo maximum par fichier
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => addFiles(event.target.files)}
          />

          <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="import-account">Compte</Label>
              <Input
                id="import-account"
                placeholder="ex. SG Joint"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                list="known-accounts"
              />
              <datalist id="known-accounts">
                {accounts.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-note">Précision pour l'IA (facultatif)</Label>
              <Textarea
                id="import-note"
                rows={2}
                placeholder="ex. Photo d'un ticket de pharmacie payé par carte le 12/03"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {jobs.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{job.file.name}</span>
                  <span className="text-muted-foreground">
                    {(job.file.size / 1024).toFixed(0)} Ko
                  </span>
                  {job.status === "pending" && <Badge variant="secondary">En attente</Badge>}
                  {job.status === "analyzing" && (
                    <Badge variant="secondary" className="gap-1">
                      <Loader2 className="size-3 animate-spin" /> Analyse…
                    </Badge>
                  )}
                  {job.status === "ready" && <Badge>{job.rows.length} opération(s)</Badge>}
                  {job.status === "error" && (
                    <Badge variant="destructive" title={job.error}>
                      Erreur
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={job.status === "analyzing"}
                    onClick={() =>
                      setJobs((current) => current.filter((item) => item.id !== job.id))
                    }
                    aria-label="Retirer le fichier"
                  >
                    <X className="size-4" />
                  </Button>
                  {job.status === "error" && <p className="w-full text-destructive">{job.error}</p>}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runAnalysis} disabled={running || !pending}>
              {running ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Analyser
            </Button>
            {!account.trim() && (
              <span className="text-sm text-muted-foreground">
                Astuce : renseignez le compte pour distinguer vos relevés.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {ready.map((job) => (
        <ReviewCard
          key={job.id}
          job={job}
          categories={settings.categories}
          onRow={(key, patch) => patchRow(job.id, key, patch)}
          onCategory={(keys, category) => assignCategory(job.id, keys, category)}
          onCreateCategory={addCategory}
          onAll={(include) =>
            patchJob(job.id, { rows: job.rows.map((row) => ({ ...row, include })) })
          }
          onDiscard={() => setJobs((current) => current.filter((item) => item.id !== job.id))}
        />
      ))}

      {ruleSuggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4" /> Règles suggérées
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Vous avez catégorisé ces tiers à la main. Une règle les classera automatiquement aux
              prochains imports (vos choix sont de toute façon mémorisés comme habitudes).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-border rounded-md border border-border">
              {ruleSuggestions.map((item) => (
                <li key={item.signature} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="font-mono text-sm">« {item.pattern} »</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-sm font-medium">{item.category}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.count} opération{item.count > 1 ? "s" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => createRules([item])}
                  >
                    Créer la règle
                  </Button>
                </li>
              ))}
            </ul>
            {ruleSuggestions.length > 1 && (
              <Button variant="secondary" size="sm" onClick={() => createRules(ruleSuggestions)}>
                Créer les {ruleSuggestions.length} règles
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {ready.length > 0 && (
        <Card className="sticky bottom-4 z-20 border-primary/40 shadow-lg">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm">
              <strong>{selectedRows.length}</strong> opération(s) sélectionnée(s) · solde{" "}
              <strong>{formatMoney(selectedRows.reduce((sum, row) => sum + row.amount, 0))}</strong>
            </span>
            {uncategorized > 0 && (
              <span className="text-sm text-amber-600">{uncategorized} sans catégorie</span>
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
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Enregistrer dans le
              budget
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Derniers imports</CardTitle>
        </CardHeader>
        <CardContent>
          {history.data?.length ? (
            <ul className="space-y-1 text-sm">
              {history.data.map((run) => (
                <li key={run.id} className="flex flex-wrap gap-x-3 text-muted-foreground">
                  <span className="text-foreground">
                    {new Date(run.ran_at).toLocaleString("fr-FR")}
                  </span>
                  <span>{run.file_name}</span>
                  <span>{run.rows_added} ligne(s)</span>
                  {run.account && <span>compte {run.account}</span>}
                  {run.period_start && run.period_end && (
                    <span>
                      période {run.period_start} → {run.period_end}
                    </span>
                  )}
                  <span>{run.model}</span>
                  {run.usage && <span>{usageLabel(run.usage)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun import pour le moment.</p>
          )}
        </CardContent>
      </Card>
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
  onAll,
  onDiscard,
}: {
  job: Job;
  categories: string[];
  onRow: (key: string, patch: Partial<Row>) => void;
  onCategory: (keys: string[], category: string) => void;
  onCreateCategory: (category: string) => void;
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
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{preview.file_name}</CardTitle>
          {statement.bank && <Badge variant="outline">{statement.bank}</Badge>}
          {statement.period_start && statement.period_end && (
            <Badge variant="outline">
              {statement.period_start} → {statement.period_end}
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
          {probable > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/60 text-amber-700 dark:text-amber-300"
            >
              {probable} doublon(s) possible(s)
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onDiscard}>
            <Trash2 className="mr-2 size-4" /> Ignorer ce fichier
          </Button>
        </div>
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            check.status === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10"
              : check.status === "mismatch"
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-border bg-muted/40"
          }`}
        >
          {check.status === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          ) : check.status === "mismatch" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span>{check.message}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={view}
            onValueChange={(value) => value && setView(value as View)}
          >
            <ToggleGroupItem value="rows" aria-label="Vue par opération">
              <ListChecks className="mr-1.5 size-4" /> Opérations
            </ToggleGroupItem>
            <ToggleGroupItem value="payees" aria-label="Vue par émetteur">
              <Users className="mr-1.5 size-4" /> Par émetteur
            </ToggleGroupItem>
          </ToggleGroup>
          {view === "rows" && (
            <Button
              size="sm"
              variant={onlyReview ? "default" : "outline"}
              onClick={() => setOnlyReview((value) => !value)}
              disabled={toReview === 0 && !onlyReview}
            >
              <AlertTriangle className="mr-1.5 size-4" /> À vérifier ({toReview})
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Choisir une catégorie l'applique aussi aux autres opérations du même tiers.
          </span>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {view === "payees" ? (
          <PayeeTable
            rows={job.rows}
            categories={categories}
            onCategory={onCategory}
            onCreateCategory={onCreateCategory}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allIncluded}
                    onCheckedChange={(checked) => onAll(checked === true)}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
                <TableHead className="w-36">Date</TableHead>
                <TableHead className="min-w-40">Émetteur</TableHead>
                <TableHead className="min-w-56">Description</TableHead>
                <TableHead className="w-28 text-right">Montant</TableHead>
                <TableHead className="w-60">Catégorie</TableHead>
                <TableHead className="w-32">État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key} className={row.include ? undefined : "opacity-55"}>
                  <TableCell>
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
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={row.payee}
                      onChange={(e) => onRow(row.key, { payee: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={row.description}
                      onChange={(e) => onRow(row.key, { description: e.target.value })}
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
                    <div className="flex items-center gap-1">
                      <CategoryPicker
                        value={row.category}
                        categories={categories}
                        suggestions={row.category_hint ? [row.category_hint] : []}
                        onChange={(category) => onCategory([row.key], category)}
                        onCreate={onCreateCategory}
                      />
                      <CategorySourceBadge
                        source={row.category_source}
                        unsure={row.ai_unsure && row.category_source !== "manual"}
                      />
                    </div>
                    {row.category_hint && row.category_source !== "manual" && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => onCategory([row.key], row.category_hint)}
                        title="Proposition de l'IA, écartée au profit de vos habitudes"
                      >
                        IA : {row.category_hint}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.duplicate_of ? (
                      <Badge
                        variant={
                          row.duplicate_of.confidence === "certain" ? "secondary" : "outline"
                        }
                        className={
                          row.duplicate_of.confidence === "probable"
                            ? "border-amber-500/60 text-amber-700 dark:text-amber-300"
                            : undefined
                        }
                        title={`Déjà en base : ${row.duplicate_of.entry_date} · ${row.duplicate_of.payee || "sans émetteur"} · ${formatMoney(row.duplicate_of.amount)}`}
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
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {onlyReview
                      ? "Rien à vérifier : toutes les lignes ont une catégorie sûre."
                      : "Aucune opération trouvée dans ce document."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Une ligne par tiers : catégoriser 80 opérations revient à en régler une trentaine. */
function PayeeTable({
  rows,
  categories,
  onCategory,
  onCreateCategory,
}: {
  rows: Row[];
  categories: string[];
  onCategory: (keys: string[], category: string) => void;
  onCreateCategory: (category: string) => void;
}) {
  // Ordre figé à l'ouverture de la vue : une ligne ne doit pas bouger sous le curseur
  // juste après avoir reçu sa catégorie.
  const order = useRef<Map<string, number> | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: Row[] }>();
    for (const row of rows) {
      const signature = payeeSignature(row.payee) || row.key;
      const slot = map.get(signature) ?? { label: row.payee || "Sans émetteur", rows: [] };
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
        <TableRow>
          <TableHead className="min-w-48">Émetteur</TableHead>
          <TableHead className="w-24 text-right">Opérations</TableHead>
          <TableHead className="w-32 text-right">Total</TableHead>
          <TableHead className="w-72">Catégorie</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.signature}>
            <TableCell className="font-medium">{group.label}</TableCell>
            <TableCell className="text-right">{group.rows.length}</TableCell>
            <TableCell className={`text-right ${group.total > 0 ? "text-emerald-600" : ""}`}>
              {formatMoney(group.total)}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <CategoryPicker
                  value={group.category}
                  categories={categories}
                  placeholder={group.mixed ? "Plusieurs catégories" : "Choisir…"}
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
      className={`h-8 text-right ${value < 0 ? "" : "text-emerald-600"}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = Number(draft.replace(/\s/g, "").replace(",", "."));
        if (Number.isFinite(next)) onChange(Math.round(next * 100) / 100);
        else setDraft(value.toFixed(2));
      }}
    />
  );
}
