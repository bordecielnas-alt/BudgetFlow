import type { ReactNode } from "react";

import { formatMoney } from "@/lib/budget-types";
import { cn } from "@/lib/utils";

/** En-tête de page : titre, phrase d'appui facultative, actions à droite. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Montant formaté ; les entrées d'argent en vert, le reste dans la couleur du texte. */
export function Money({
  value,
  income,
  signed = false,
  className,
}: {
  value: number;
  /** Force la couleur « entrée » (sinon déduite du signe). */
  income?: boolean;
  /** Affiche « + » devant les montants positifs. */
  signed?: boolean;
  className?: string;
}) {
  const positive = income ?? value > 0;
  return (
    <span className={cn("num whitespace-nowrap", positive && "text-income", className)}>
      {signed && value > 0 ? "+" : ""}
      {formatMoney(value)}
    </span>
  );
}

/** Bloc vide qui explique quoi faire, plutôt qu'un simple « rien ici ». */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
