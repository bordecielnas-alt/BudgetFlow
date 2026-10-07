import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CategorySource } from "@/lib/budget-types";
import { categoryColor, normalizeText } from "@/lib/categories";
import { cn } from "@/lib/utils";

export function CategoryDot({ category }: { category: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: categoryColor(category) }}
    />
  );
}

/**
 * Choix d'une catégorie au clavier : on tape quelques lettres, Entrée valide.
 * Si rien ne correspond, propose de créer la catégorie.
 */
export function CategoryPicker({
  value,
  categories,
  onChange,
  onCreate,
  suggestions = [],
  placeholder = "Choisir…",
  className,
  highlightEmpty = true,
}: {
  value: string;
  categories: string[];
  onChange: (category: string) => void;
  onCreate?: (category: string) => void;
  /** Catégories mises en avant en tête de liste (indice de l'IA, habitude…). */
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  highlightEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const exists = categories.some((category) => normalizeText(category) === normalizeText(trimmed));
  const shown = suggestions.filter((item) => item && item !== value && categories.includes(item));

  function pick(category: string) {
    onChange(category);
    setOpen(false);
    setSearch("");
  }

  function create() {
    if (!trimmed || !onCreate) return;
    onCreate(trimmed);
    pick(trimmed);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 w-full justify-between gap-2 px-2 font-normal",
            !value && highlightEmpty && "border-amber-500/60 text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {value && <CategoryDot category={value} />}
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput
            placeholder={onCreate ? "Rechercher ou créer…" : "Rechercher…"}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!(onCreate && trimmed) && <CommandEmpty>Aucune catégorie.</CommandEmpty>}
            {shown.length > 0 && !trimmed && (
              <>
                <CommandGroup heading="Suggestions">
                  {shown.map((category) => (
                    <CommandItem
                      key={`hint-${category}`}
                      value={`suggestion ${category}`}
                      onSelect={() => pick(category)}
                    >
                      <CategoryDot category={category} />
                      {category}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Catégories">
              {categories.map((category) => (
                <CommandItem key={category} value={category} onSelect={() => pick(category)}>
                  <CategoryDot category={category} />
                  <span className="flex-1">{category}</span>
                  {category === value && <Check className="size-4" />}
                </CommandItem>
              ))}
              <CommandItem value="aucune sans categorie" onSelect={() => pick("")}>
                <span className="text-muted-foreground">— Aucune —</span>
              </CommandItem>
            </CommandGroup>
            {onCreate && trimmed && !exists && (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`__create ${trimmed}`} onSelect={create}>
                  <Plus className="size-4" /> Créer « {trimmed} »
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const SOURCE_LABELS: Record<CategorySource, { label: string; title: string; className: string }> = {
  rule: {
    label: "règle",
    title: "Imposée par une règle automatique",
    className: "border-sky-500/50 text-sky-700 dark:text-sky-300",
  },
  history: {
    label: "habitude",
    title: "Reprise de vos catégorisations précédentes pour ce tiers",
    className: "border-violet-500/50 text-violet-700 dark:text-violet-300",
  },
  ai: { label: "IA", title: "Proposée par l'IA", className: "" },
  manual: {
    label: "vous",
    title: "Choisie à la main",
    className: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  },
  none: { label: "", title: "", className: "" },
};

export function CategorySourceBadge({
  source,
  unsure = false,
}: {
  source: CategorySource;
  unsure?: boolean;
}) {
  if (unsure) {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-amber-500/60 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
        title="L'IA hésite : vérifiez la catégorie"
      >
        à vérifier
      </Badge>
    );
  }
  const meta = SOURCE_LABELS[source];
  if (!meta.label) return null;
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 px-1.5 text-[10px]", meta.className)}
      title={meta.title}
    >
      {meta.label}
    </Badge>
  );
}
