import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, getAuthState } from "@/lib/auth.functions";

// Premier accès avec le mot de passe par défaut : on exige son remplacement.
export const Route = createFileRoute("/password")({
  ssr: false,
  beforeLoad: async () => {
    const state = await getAuthState();
    if (!state.authenticated) throw redirect({ to: "/auth" });
    if (!state.mustChangePassword) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Nouveau mot de passe — BudgetFlow" }] }),
  component: PasswordPage,
});

function PasswordPage() {
  const router = useRouter();
  const runChange = useServerFn(changePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      toast.error("Les deux saisies du nouveau mot de passe diffèrent");
      return;
    }
    setBusy(true);
    try {
      await runChange({ data: { current, next } });
      toast.success("Mot de passe enregistré");
      await router.navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error((error as Error).message || "Modification impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
            <ShieldAlert className="size-5" />
          </span>
          <CardTitle className="mt-3 text-xl">Choisissez votre mot de passe</CardTitle>
          <CardDescription>
            Le mot de passe par défaut est public (il figure dans la documentation). Remplacez-le
            avant d'utiliser BudgetFlow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="current">Mot de passe actuel</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next">Nouveau mot de passe (8 caractères minimum)</Label>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmation</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              <KeyRound className="mr-2 size-4" /> Enregistrer et continuer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
