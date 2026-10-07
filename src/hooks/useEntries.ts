import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { BudgetEntry } from "@/lib/budget-types";
import {
  createEntry,
  deleteEntries,
  listEntries,
  restoreEntries,
  updateEntries,
  updateEntry,
} from "@/lib/data.functions";

const KEY = ["budget-entries"];

export function useEntries() {
  const fetchEntries = useServerFn(listEntries);
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<BudgetEntry[]> => {
      const rows = await fetchEntries();
      return rows.map((row) => ({ ...row, amount: Number(row.amount) })) as BudgetEntry[];
    },
  });
}

/** Écritures sans catégorie, à ranger. */
export function useUncategorizedCount(): number {
  const { data = [] } = useEntries();
  return data.reduce((count, entry) => count + (entry.category ? 0 : 1), 0);
}

export type EntryPatch = Partial<
  Pick<
    BudgetEntry,
    "entry_type" | "entry_date" | "payee" | "amount" | "account" | "description" | "category"
  >
>;

/**
 * Mutations des écritures. Les modifications s'affichent tout de suite (mise à
 * jour optimiste) et reviennent en arrière si le serveur refuse.
 */
export function useEntryMutations() {
  const queryClient = useQueryClient();
  const runCreate = useServerFn(createEntry);
  const runUpdate = useServerFn(updateEntry);
  const runUpdateMany = useServerFn(updateEntries);
  const runDelete = useServerFn(deleteEntries);
  const runRestore = useServerFn(restoreEntries);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
  };

  function applyLocally(ids: string[], patch: EntryPatch) {
    const wanted = new Set(ids);
    const previous = queryClient.getQueryData<BudgetEntry[]>(KEY);
    queryClient.setQueryData<BudgetEntry[]>(KEY, (rows = []) =>
      rows.map((row) => (wanted.has(row.id) ? { ...row, ...patch, locally_modified: true } : row)),
    );
    return previous;
  }

  const update = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: EntryPatch }) => {
      if (ids.length === 1) await runUpdate({ data: { id: ids[0]!, patch } });
      else await runUpdateMany({ data: { ids, patch } });
    },
    onMutate: async ({ ids, patch }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      return { previous: applyLocally(ids, patch) };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
      toast.error((error as Error).message || "Modification refusée");
    },
    onSettled: invalidate,
  });

  const create = useMutation({
    mutationFn: async (data: EntryPatch) => runCreate({ data }),
    onSettled: invalidate,
  });

  /** Supprime, puis propose d'annuler pendant quelques secondes. */
  const remove = useMutation({
    mutationFn: async (entries: BudgetEntry[]) => {
      await runDelete({ data: { ids: entries.map((entry) => entry.id) } });
      return entries;
    },
    onMutate: async (entries) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<BudgetEntry[]>(KEY);
      const ids = new Set(entries.map((entry) => entry.id));
      queryClient.setQueryData<BudgetEntry[]>(KEY, (rows = []) =>
        rows.filter((row) => !ids.has(row.id)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
      toast.error((error as Error).message || "Suppression impossible");
    },
    onSuccess: (entries) => {
      const label =
        entries.length === 1 ? "Opération supprimée" : `${entries.length} opérations supprimées`;
      toast(label, {
        duration: 8000,
        action: {
          label: "Annuler",
          onClick: () => {
            void runRestore({
              data: {
                entries: entries.map((entry) => ({
                  ...entry,
                  category_manual: entry.category_manual ?? false,
                })),
              },
            })
              .then(() => toast.success("Suppression annulée"))
              .catch((error: Error) => toast.error(error.message))
              .finally(invalidate);
          },
        },
      });
    },
    onSettled: invalidate,
  });

  return { update, create, remove, invalidate };
}
