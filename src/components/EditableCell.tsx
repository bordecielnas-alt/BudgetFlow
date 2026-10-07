import { useEffect, useRef, useState } from "react";

import { formatMoney } from "@/lib/budget-types";
import { cn } from "@/lib/utils";

const cellInput =
  "h-8 w-full min-w-0 text-ellipsis rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:border-input focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/20 aria-invalid:border-destructive";

/**
 * Cellule éditable en place : ressemble à du texte, devient un champ au survol.
 * Entrée ou sortie du champ enregistre, Échap annule.
 */
export function EditableText({
  value,
  onCommit,
  validate,
  placeholder,
  type = "text",
  label,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  /** Message d'erreur, ou null si la valeur est acceptable. */
  validate?: (value: string) => string | null;
  placeholder?: string;
  type?: "text" | "date";
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);

  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = type === "text" ? draft.trim() : draft;
    if (next === value) return;
    const problem = validate?.(next) ?? null;
    setError(problem);
    if (problem) return;
    onCommit(next);
  }

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      title={error ?? (type === "text" && draft.length > 28 ? draft : undefined)}
      onChange={(event) => {
        setDraft(event.target.value);
        if (error) setError(null);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          setError(null);
          event.currentTarget.blur();
        }
      }}
      className={cn(cellInput, type === "date" && "num", className)}
    />
  );
}

/** Montant : affiché « −12,50 € » au repos, saisi librement (virgule acceptée). */
export function EditableAmount({
  value,
  onCommit,
  income,
  label = "Montant",
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  income?: boolean;
  label?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value).replace(".", ","));
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setDraft(String(value).replace(".", ","));
  }, [value, focused]);

  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={focused ? draft : formatMoney(value)}
      onFocus={(event) => {
        setFocused(true);
        requestAnimationFrame(() => event.target.select());
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        const next = Number(draft.replace(/\s/g, "").replace("€", "").replace(",", "."));
        if (!Number.isFinite(next)) return;
        const rounded = Math.round(next * 100) / 100;
        if (rounded !== value) onCommit(rounded);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className={cn(cellInput, "num text-right", (income ?? value > 0) && "text-income", className)}
    />
  );
}

export function isValidDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return "Date invalide";
  }
  return null;
}
