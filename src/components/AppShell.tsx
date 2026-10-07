import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  FileUp,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  Table2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useUncategorizedCount } from "@/hooks/useEntries";
import { logout } from "@/lib/auth.functions";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; short: string; icon: LucideIcon; badge?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Vue d'ensemble", short: "Accueil", icon: LayoutDashboard },
  { to: "/a-ranger", label: "À ranger", short: "À ranger", icon: Inbox, badge: true },
  { to: "/import", label: "Importer", short: "Importer", icon: FileUp },
  { to: "/data", label: "Opérations", short: "Opérations", icon: Table2 },
  { to: "/insights", label: "Analyse", short: "Analyse", icon: TrendingUp },
  { to: "/settings", label: "Réglages", short: "Réglages", icon: Settings },
];

function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-7">
      <rect width="24" height="24" rx="7" className="fill-primary" />
      <path
        d="M6 15.5c2.2 0 2.8-5 5-5s2.8 3 5 3 2-4 2-4"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "num min-w-5 rounded-full bg-warning-soft px-1.5 text-center text-[11px] font-semibold leading-5 text-warning",
        className,
      )}
      aria-label={`${count} opération${count > 1 ? "s" : ""} à ranger`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const runLogout = useServerFn(logout);
  const toSort = useUncategorizedCount();

  async function signOut() {
    await runLogout();
    toast.success("Déconnecté");
    await router.navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar px-3 py-4 lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-6 text-[15px] font-semibold tracking-[-0.01em]">
          <Mark />
          BudgetFlow
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Navigation principale">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              activeProps={{
                className:
                  "!bg-card !text-foreground font-medium shadow-[0_1px_2px_rgb(0_0_0/0.1)]",
              }}
            >
              <item.icon className="size-[18px] shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && <CountBadge count={toSort} />}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={signOut}
          className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="size-[18px]" />
          Se déconnecter
        </button>
      </aside>

      {/* En-tête compact (téléphone, tablette) */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <Mark />
        <span className="text-[15px] font-semibold">BudgetFlow</span>
        <Link
          to="/settings"
          className="ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Réglages"
        >
          <Settings className="size-5" />
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Se déconnecter"
        >
          <LogOut className="size-5" />
        </button>
      </header>

      <div className="lg:pl-60">
        <main className="mx-auto max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-9">
          {children}
        </main>
      </div>

      {/* Barre d'onglets (téléphone, tablette) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label="Navigation principale"
      >
        {NAV.filter((item) => item.to !== "/settings").map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
            activeProps={{ className: "!text-primary-text font-medium" }}
          >
            <span className="relative">
              <item.icon className="size-[22px]" />
              {item.badge && (
                <CountBadge count={toSort} className="absolute -right-3.5 -top-1.5 leading-4" />
              )}
            </span>
            {item.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
