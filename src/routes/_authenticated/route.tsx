import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { getAuthState } from "@/lib/auth.functions";
import { useSettings } from "@/hooks/useSettings";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const state = await getAuthState();
    if (!state.authenticated) throw redirect({ to: "/auth" });
    return { email: state.email };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useSettings();
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
