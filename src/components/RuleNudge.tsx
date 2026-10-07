import { useState, useSyncExternalStore } from "react";
import { Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { useSettings } from "@/hooks/useSettings";
import {
  matchRule,
  normalizeText,
  payeeSignature,
  suggestRulePattern,
  type CategoryRule,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

// Propositions écartées pendant la session : elles ne reviennent pas à chaque clic.
const dismissed = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
let version = 0;
function dismiss(key: string) {
  dismissed.add(key);
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Création de règles « texte → catégorie » ; une règle au même motif est remplacée. */
export function useRuleActions() {
  const { settings, update } = useSettings();

  /** Motif à proposer pour ce tiers, ou null si une règle le classe déjà ainsi. */
  function suggestion(payee: string, description: string, category: string): string | null {
    if (!category) return null;
    const pattern = suggestRulePattern(payee);
    if (!pattern) return null;
    if (matchRule(settings.rules, payee, description)?.category === category) return null;
    return pattern;
  }

  function createRules(items: Array<{ pattern: string; category: string }>): CategoryRule[] {
    const valid = items.filter((item) => item.pattern && item.category);
    if (valid.length === 0) return [];
    const patterns = new Set(valid.map((item) => normalizeText(item.pattern)));
    const created = valid.map((item) => ({
      id: crypto.randomUUID(),
      pattern: item.pattern,
      category: item.category,
    }));
    update.mutate({
      rules: [...created, ...settings.rules.filter((r) => !patterns.has(normalizeText(r.pattern)))],
    });
    toast.success(
      created.length === 1
        ? `Règle créée : « ${created[0]!.pattern} » → ${created[0]!.category}`
        : `${created.length} règles créées`,
    );
    return created;
  }

  return { suggestion, createRules };
}

/**
 * Après une catégorisation manuelle : propose, sans interrompre, d'en faire une
 * règle pour les prochains imports. Se masque d'un clic ou une fois la règle créée.
 */
export function RuleNudge({
  payee,
  description = "",
  category,
  onCreated,
  className,
}: {
  payee: string;
  description?: string;
  category: string;
  onCreated?: (rules: CategoryRule[]) => void;
  className?: string;
}) {
  const { suggestion, createRules } = useRuleActions();
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  const [done, setDone] = useState(false);
  const pattern = suggestion(payee, description, category);
  const key = `${payeeSignature(payee)}→${category}`;
  if (!pattern || done || dismissed.has(key)) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 text-xs text-muted-foreground animate-in fade-in-0 slide-in-from-top-1 duration-200",
        className,
      )}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-primary-soft hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          onCreated?.(createRules([{ pattern, category }]));
          setDone(true);
        }}
        title="Les prochains imports classeront automatiquement ce tiers"
      >
        <Wand2 className="size-3.5 shrink-0" />
        <span className="truncate">
          Toujours classer <span className="font-medium text-foreground">« {pattern} »</span> en{" "}
          {category} ?
        </span>
      </button>
      <button
        type="button"
        onClick={() => dismiss(key)}
        className="rounded p-0.5 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Ignorer la proposition de règle"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
