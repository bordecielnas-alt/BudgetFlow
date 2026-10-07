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
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useEntries } from "@/hooks/useEntries";
import { useSettings } from "@/hooks/useSettings";
import { checkBalance } from "@/lib/balance";
import {
  AI_PROVIDERS,
  formatMoney,
  type ImportCandidate,
  type ImportPreview,
} from "@/lib/budget-types";
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

function ImportPage() {
  const { settings } = useSettings();
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
          include: !row.duplicate_of && Boolean(row.entry_date),
        }));
        patchJob(job.id, { status: "ready", preview, rows });
      } catch (error) {
        patchJob(job.id, { status: "error", error: (error as Error).message });
      }
    }
    setRunning(false);
  }

  const ready = jobs.filter((job) => job.status === "ready" && job.preview);
  const selectedRows = ready.flatMap((job) => job.rows.filter((row) => row.include));
  const invalidRows = selectedRows.filter((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date));

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
            rows: rows.map(
              ({ include: _include, category_source: _source, duplicate_of: _dup, ...row }) => ({
                ...row,
                account: account.trim(),
              }),
            ),
          },
        });
        added += result.added;
      }
      toast.success(`${added} opération(s) enregistrée(s)`);
      setJobs((current) => current.filter((job) => job.status !== "ready"));
      void queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
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
          onAll={(include) =>
            patchJob(job.id, { rows: job.rows.map((row) => ({ ...row, include })) })
          }
          onDiscard={() => setJobs((current) => current.filter((item) => item.id !== job.id))}
        />
      ))}

      {ready.length > 0 && (
        <Card className="sticky bottom-4 z-20 border-primary/40 shadow-lg">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm">
              <strong>{selectedRows.length}</strong> opération(s) sélectionnée(s) · solde{" "}
              <strong>{formatMoney(selectedRows.reduce((sum, row) => sum + row.amount, 0))}</strong>
            </span>
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

function ReviewCard({
  job,
  categories,
  onRow,
  onAll,
  onDiscard,
}: {
  job: Job;
  categories: string[];
  onRow: (key: string, patch: Partial<Row>) => void;
  onAll: (include: boolean) => void;
  onDiscard: () => void;
}) {
  const preview = job.preview!;
  // Recalculé à chaque correction : toutes les lignes du relevé comptent, même décochées.
  const check = checkBalance(preview.statement, job.rows);
  const { statement } = preview;
  const duplicates = job.rows.filter((row) => row.duplicate_of).length;
  const allIncluded = job.rows.length > 0 && job.rows.every((row) => row.include);

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
          {duplicates > 0 && (
            <Badge variant="secondary">{duplicates} déjà présente(s), décochée(s)</Badge>
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
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
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
              <TableHead className="w-52">Catégorie</TableHead>
              <TableHead className="w-28">État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {job.rows.map((row) => (
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
                      onRow(row.key, { amount, entry_type: amount < 0 ? "Dépenses" : "Recettes" })
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Select
                      value={row.category || "__none"}
                      onValueChange={(value) =>
                        onRow(row.key, {
                          category: value === "__none" ? "" : value,
                          category_source: "none",
                        })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— Aucune —</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.category_source === "rule" && (
                      <Badge variant="outline" title="Catégorie imposée par une règle">
                        règle
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {row.duplicate_of ? (
                    <Badge
                      variant="secondary"
                      title={`Déjà en base : ${row.duplicate_of.entry_date} · ${row.duplicate_of.payee || "sans émetteur"} · ${formatMoney(row.duplicate_of.amount)}`}
                    >
                      Déjà présente
                    </Badge>
                  ) : (
                    <Badge variant="outline">Nouvelle</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {job.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Aucune opération trouvée dans ce document.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
