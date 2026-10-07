import { Link, useRouter } from "@tanstack/react-router";
import {
  FileUp,
  LayoutDashboard,
  LogOut,
  Settings,
  Table2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";

import { logout } from "@/lib/auth.functions";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/insights", label: "Analyse", icon: TrendingUp },
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/data", label: "Data", icon: Table2 },
  { to: "/settings", label: "Réglages", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const runLogout = useServerFn(logout);

  async function signOut() {
    await runLogout();
    toast.success("Déconnecté");
    await router.navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Wallet className="size-4" />
            </span>
            BudgetFlow
          </div>

          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
              >
                <item.icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Se déconnecter">
              <LogOut className="size-4" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
