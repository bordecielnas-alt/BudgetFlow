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
  variant = "outline",
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
  /** « ghost » : sans bordure au repos, pour une cellule de tableau. */
  variant?: "outline" | "ghost";
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
            "h-8 w-full justify-between gap-2 px-2 font-normal text-foreground",
            variant === "ghost" &&
              "border-transparent bg-transparent hover:border-input hover:bg-transparent data-[state=open]:border-ring",
            !value && "text-muted-foreground",
            !value && highlightEmpty && "border-warning/50 bg-warning-soft hover:bg-warning-soft",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {value && <CategoryDot category={value} />}
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronsUpDown
            className={cn(
              "size-3.5 shrink-0 opacity-50",
              variant === "ghost" && "opacity-0 group-hover/row:opacity-50",
            )}
          />
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
    className: "border-transparent bg-primary-soft text-primary-text",
  },
  history: {
    label: "habitude",
    title: "Reprise de vos catégorisations précédentes pour ce tiers",
    className: "border-transparent bg-secondary text-muted-foreground",
  },
  ai: {
    label: "IA",
    title: "Proposée par l'IA",
    className: "border-transparent bg-secondary text-muted-foreground",
  },
  manual: {
    label: "vous",
    title: "Choisie à la main",
    className: "border-transparent bg-income-soft text-income",
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
        className="shrink-0 border-transparent bg-warning-soft px-1.5 text-[10px] text-warning"
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
