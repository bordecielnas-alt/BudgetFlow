import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { BudgetEntry } from "@/lib/budget-types";
import { createEntry, deleteEntry, listEntries, updateEntry } from "@/lib/data.functions";

export function useEntries() {
  const fetchEntries = useServerFn(listEntries);
  return useQuery({
    queryKey: ["budget-entries"],
    queryFn: async (): Promise<BudgetEntry[]> => {
      const rows = await fetchEntries();
      return rows.map((row) => ({ ...row, amount: Number(row.amount) })) as BudgetEntry[];
    },
  });
}

export function useEntryMutations() {
  const queryClient = useQueryClient();
  const runCreate = useServerFn(createEntry);
  const runUpdate = useServerFn(updateEntry);
  const runDelete = useServerFn(deleteEntry);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
  };

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BudgetEntry> }) => {
      await runUpdate({ data: { id, patch } });
    },
    onSuccess: invalidate,
  });

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      await runCreate();
    },
    onSuccess: invalidate,
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      await runDelete({ data: { id } });
    },
    onSuccess: invalidate,
  });

  return {
    updateEntry: updateEntryMutation,
    createEntry: createEntryMutation,
    deleteEntry: deleteEntryMutation,
    invalidate,
  };
}
