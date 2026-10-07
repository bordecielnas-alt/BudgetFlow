import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { getSettings, saveSettings } from "@/lib/data.functions";
import type { UserSettings } from "@/lib/budget-types";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/lib/categories";
import { applyTheme, DEFAULT_THEME } from "@/lib/themes";

const FALLBACK: UserSettings = {
  theme: DEFAULT_THEME,
  density: "comfortable",
  currency: "EUR",
  date_format: "dd/MM/yyyy",
  ai_provider: "gemini",
  ai_model: "gemini-2.5-flash",
  default_account: "",
  categories: DEFAULT_CATEGORIES,
  rules: DEFAULT_RULES,
  backup_enabled: true,
  backup_interval_hours: 24,
  backup_keep: 30,
  backup_last: null,
  budgets: {},
  ai_price_in: null,
  ai_price_out: null,
};

export function useSettings() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getSettings);
  const persistSettings = useServerFn(saveSettings);

  const query = useQuery({
    queryKey: ["user-settings"],
    queryFn: async (): Promise<UserSettings> => {
      const data = await fetchSettings();
      return { ...FALLBACK, ...data };
    },
  });

  const settings = query.data ?? FALLBACK;

  useEffect(() => {
    applyTheme(settings.theme, settings.density);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "bt-appearance",
        JSON.stringify({ theme: settings.theme, density: settings.density }),
      );
    }
  }, [settings.theme, settings.density]);

  const update = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      await persistSettings({ data: patch });
    },
    onMutate: async (patch) => {
      queryClient.setQueryData<UserSettings>(["user-settings"], (current) => ({
        ...(current ?? FALLBACK),
        ...patch,
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  return { settings, isLoading: query.isLoading, update };
}
