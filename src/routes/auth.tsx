import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthState, login } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion — BudgetFlow" },
      {
        name: "description",
        content: "Connectez-vous à BudgetFlow pour suivre vos dépenses et recettes.",
      },
      { property: "og:title", content: "Connexion — BudgetFlow" },
      {
        property: "og:description",
        content: "Accès sécurisé à votre suivi de budget auto-hébergé.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const checkAuth = useServerFn(getAuthState);
  const signIn = useServerFn(login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void checkAuth()
      .then((state) => {
        if (state.authenticated) void router.navigate({ to: "/dashboard" });
      })
      .catch(() => undefined);
  }, [checkAuth, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await signIn({ data: { password, login: email || undefined } });
      await router.navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error((error as Error).message || "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Wallet className="size-5" />
          </span>
          <CardTitle className="mt-3 text-2xl">BudgetFlow</CardTitle>
          <CardDescription>Suivi de budget auto-hébergé, relevés analysés par IA</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">Identifiant</Label>
              <Input
                id="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Se connecter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
