import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AiProvider, ImportPreview } from "@/lib/budget-types";

const provider = z.enum(["gemini", "anthropic", "openai"]);

export const getAiConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { aiKeySource, getState } = await import("@/lib/store.server");
  await requireAdmin();
  const state = await getState();
  const providers: AiProvider[] = ["gemini", "anthropic", "openai"];
  return {
    provider: state.settings.ai_provider,
    model: state.settings.ai_model,
    keys: Object.fromEntries(providers.map((id) => [id, aiKeySource(state, id)])) as Record<
      AiProvider,
      "settings" | "env" | null
    >,
  };
});

export const saveAiConfig = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        provider,
        model: z.string().trim().min(1).max(120),
        apiKey: z.string().trim().max(500).optional(),
        clearKey: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    await mutate((state) => {
      state.settings.ai_provider = data.provider;
      state.settings.ai_model = data.model;
      if (data.clearKey) delete state.secrets.ai_keys[data.provider];
      else if (data.apiKey) state.secrets.ai_keys[data.provider] = data.apiKey;
    });
    return { ok: true as const };
  });

export const testAiConfig = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { aiKeyFor, getState } = await import("@/lib/store.server");
  const { checkProvider } = await import("@/lib/ai/providers.server");
  await requireAdmin();
  const state = await getState();
  const { ai_provider, ai_model } = state.settings;
  const name = await checkProvider(ai_provider, ai_model, aiKeyFor(state, ai_provider));
  return { model: name };
});

export const analyzeStatement = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        fileName: z.string().min(1).max(300),
        mimeType: z.literal("application/pdf", {
          errorMap: () => ({ message: "Seuls les relevés PDF sont acceptés." }),
        }),
        // ~20 Mo de fichier une fois décodé
        base64: z.string().min(1).max(28_000_000),
        account: z.string().trim().max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ImportPreview> => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { aiKeyFor, getState } = await import("@/lib/store.server");
    const { extractStatement } = await import("@/lib/ai/providers.server");
    const { buildSystemPrompt, buildUserPrompt } = await import("@/lib/ai/extraction");
    const { buildCandidates } = await import("@/lib/import.server");
    const { checkBalance } = await import("@/lib/balance");
    const { buildCategoryMemory, memoryExamples } = await import("@/lib/categories");
    const { resolvePrice, withCost } = await import("@/lib/ai/pricing");
    await requireAdmin();

    const state = await getState();
    const { ai_provider, ai_model, categories, rules } = state.settings;
    // Habitudes apprises sur les écritures déjà enregistrées : montrées à l'IA en
    // exemples, puis appliquées en priorité sur sa proposition.
    const memory = buildCategoryMemory(state.entries, categories);
    const { raw, tokens } = await extractStatement({
      provider: ai_provider,
      model: ai_model,
      apiKey: aiKeyFor(state, ai_provider),
      fileName: data.fileName,
      mimeType: data.mimeType,
      base64: data.base64,
      system: buildSystemPrompt(categories, memoryExamples(memory)),
      user: buildUserPrompt(data.fileName),
    });

    const candidates = buildCandidates(raw, {
      account: data.account || state.settings.default_account,
      categories,
      rules,
      existing: state.entries,
      memory,
    });

    return {
      file_name: data.fileName,
      provider: ai_provider,
      model: ai_model,
      statement: raw.statement,
      check: checkBalance(raw.statement, candidates),
      candidates,
      usage: tokens ? withCost(tokens, resolvePrice(ai_model, state.settings)) : null,
    };
  });

const importedRow = z.object({
  key: z.string().min(1).max(100),
  entry_type: z.string().max(60),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ attendu)"),
  payee: z.string().max(300),
  description: z.string().max(1000),
  amount: z.number().finite(),
  account: z.string().max(120),
  category: z.string().max(120),
  category_manual: z.boolean().optional(),
});

const usage = z
  .object({
    input_tokens: z.number().min(0),
    output_tokens: z.number().min(0),
    cost_usd: z.number().min(0).nullable(),
  })
  .nullable()
  .optional();

export const commitImport = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        file_name: z.string().max(300),
        provider,
        model: z.string().max(120),
        account: z.string().max(120),
        period_start: z.string().max(30).nullable(),
        period_end: z.string().max(30).nullable(),
        closing_balance: z.number().finite().nullable().optional(),
        usage,
        rows: z.array(importedRow).min(1).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate, newId } = await import("@/lib/store.server");
    await requireAdmin();

    return mutate((state) => {
      const keys = new Set(state.entries.map((entry) => entry.source_key).filter(Boolean));
      const now = new Date().toISOString();
      for (const row of data.rows) {
        // Ligne gardée malgré un doublon signalé : on lui donne une clé distincte.
        const source_key = keys.has(row.key) ? `${row.key}-${newId().slice(0, 8)}` : row.key;
        keys.add(source_key);
        state.entries.unshift({
          id: newId(),
          entry_type: row.entry_type,
          entry_date: row.entry_date,
          payee: row.payee,
          amount: row.amount,
          account: row.account,
          description: row.description,
          category: row.category,
          source: "ia",
          source_key,
          locally_modified: false,
          category_manual: row.category_manual === true,
          created_at: now,
          updated_at: now,
        });
      }
      state.imports.unshift({
        id: newId(),
        ran_at: now,
        file_name: data.file_name,
        provider: data.provider,
        model: data.model,
        account: data.account,
        period_start: data.period_start,
        period_end: data.period_end,
        closing_balance: data.closing_balance ?? null,
        rows_added: data.rows.length,
        usage: data.usage ?? null,
      });
      state.imports = state.imports.slice(0, 100);
      return { added: data.rows.length };
    });
  });

export const listImports = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  await requireAdmin();
  const state = await getState();
  return state.imports.slice(0, 20);
});
