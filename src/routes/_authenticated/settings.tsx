import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Database,
  KeyRound,
  Loader2,
  Palette,
  Plus,
  Tags,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changeLogin, changePassword, getAuthState } from "@/lib/auth.functions";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { backupNow, getBackups } from "@/lib/data.functions";
import { AI_PROVIDERS, type AiProvider } from "@/lib/budget-types";
import { getAiConfig, saveAiConfig, testAiConfig } from "@/lib/import.functions";
import { THEMES } from "@/lib/themes";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Réglages — BudgetFlow" },
      {
        name: "description",
        content:
          "Gérez votre compte, l'apparence, le fournisseur d'IA, les catégories et les sauvegardes.",
      },
      { property: "og:title", content: "Réglages — BudgetFlow" },
      {
        property: "og:description",
        content: "Compte, thèmes, IA, catégories et sauvegardes de BudgetFlow.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="account">
            <User className="mr-2 size-4" /> Compte
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-2 size-4" /> Apparence
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Bot className="mr-2 size-4" /> IA
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tags className="mr-2 size-4" /> Catégories
          </TabsTrigger>
          <TabsTrigger value="backup">
            <Database className="mr-2 size-4" /> Sauvegardes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="pt-4">
          <AccountSection />
        </TabsContent>
        <TabsContent value="appearance" className="pt-4">
          <AppearanceSection />
        </TabsContent>
        <TabsContent value="ai" className="pt-4">
          <AiSection />
        </TabsContent>
        <TabsContent value="categories" className="pt-4">
          <CategoriesSection />
        </TabsContent>
        <TabsContent value="backup" className="pt-4">
          <BackupSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountSection() {
  const loadAuth = useServerFn(getAuthState);
  const runChange = useServerFn(changePassword);
  const runChangeLogin = useServerFn(changeLogin);
  const [loginDraft, setLoginDraft] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void loadAuth()
      .then((state) => {
        setLoginDraft(state.email);
      })
      .catch(() => undefined);
  }, [loadAuth]);

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await runChangeLogin({
        data: { login: loginDraft, current: loginPassword },
      });
      setLoginDraft(result.login);
      setLoginPassword("");
      toast.success("Identifiant mis à jour");
    } catch (error) {
      toast.error((error as Error).message || "Modification impossible");
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    try {
      await runChange({ data: { current, next: password } });
      setCurrent("");
      setPassword("");
      toast.success("Mot de passe mis à jour");
    } catch (error) {
      toast.error((error as Error).message || "Modification impossible");
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Compte</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-3" onSubmit={submitLogin}>
          <div className="space-y-2">
            <Label htmlFor="login">Identifiant</Label>
            <Input
              id="login"
              value={loginDraft}
              onChange={(e) => setLoginDraft(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Mot de passe (confirmation)</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="outline">
            <User className="mr-2 size-4" /> Changer l'identifiant
          </Button>
        </form>
        <Separator />
        <form className="space-y-3" onSubmit={submitPassword}>
          <div className="space-y-2">
            <Label htmlFor="current-password">Mot de passe actuel</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit">
            <KeyRound className="mr-2 size-4" /> Changer le mot de passe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AppearanceSection() {
  const { settings, update } = useSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Apparence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => update.mutate({ theme: theme.id })}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                settings.theme === theme.id ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              <span className="flex gap-1">
                {theme.swatch.map((color: string) => (
                  <span
                    key={color}
                    className="size-4 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="flex-1 text-sm font-medium">{theme.label}</span>
              {settings.theme === theme.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Densité</Label>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as const).map((density) => (
              <Button
                key={density}
                variant={settings.density === density ? "default" : "outline"}
                size="sm"
                onClick={() => update.mutate({ density })}
              >
                {density === "comfortable" ? "Confortable" : "Compacte"}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const KEY_HELP: Record<AiProvider, { url: string; env: string }> = {
  gemini: { url: "https://aistudio.google.com/apikey", env: "GEMINI_API_KEY" },
  anthropic: { url: "https://console.anthropic.com/settings/keys", env: "ANTHROPIC_API_KEY" },
  openai: { url: "https://platform.openai.com/api-keys", env: "OPENAI_API_KEY" },
};

function AiSection() {
  const loadConfig = useServerFn(getAiConfig);
  const save = useServerFn(saveAiConfig);
  const test = useServerFn(testAiConfig);
  const config = useQuery({ queryKey: ["ai-config"], queryFn: () => loadConfig({}) });

  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "clear">(null);

  useEffect(() => {
    if (!config.data) return;
    setProvider(config.data.provider);
    setModel(config.data.model);
  }, [config.data]);

  function changeProvider(next: AiProvider) {
    const previousDefault = AI_PROVIDERS.find((item) => item.id === provider)?.defaultModel;
    if (!model || model === previousDefault) {
      setModel(AI_PROVIDERS.find((item) => item.id === next)?.defaultModel ?? "");
    }
    setProvider(next);
    setApiKey("");
  }

  async function run(action: "save" | "test" | "clear") {
    setBusy(action);
    try {
      if (action === "test") {
        const result = await test({});
        toast.success(`Connexion OK — modèle ${result.model} disponible`);
      } else {
        await save({
          data: {
            provider,
            model,
            apiKey: apiKey || undefined,
            clearKey: action === "clear" || undefined,
          },
        });
        setApiKey("");
        toast.success(action === "clear" ? "Clé supprimée" : "Configuration IA enregistrée");
        await config.refetch();
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const keySource = config.data?.keys[provider] ?? null;
  const help = KEY_HELP[provider];
  const dirty = config.data && (config.data.provider !== provider || config.data.model !== model);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Fournisseur d'IA pour la lecture des relevés</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Fournisseur</Label>
            <Select value={provider} onValueChange={(value) => changeProvider(value as AiProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model">Modèle</Label>
            <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-key">Clé API</Label>
          <Input
            id="ai-key"
            type="password"
            autoComplete="off"
            placeholder={
              keySource === "settings"
                ? "•••••• (enregistrée)"
                : keySource === "env"
                  ? `Fournie par la variable ${help.env}`
                  : "Aucune clé"
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Stockée côté serveur uniquement (dans <code>data/budget.db</code>), jamais renvoyée au
            navigateur. Obtenir une clé :{" "}
            <a className="underline" href={help.url} target="_blank" rel="noreferrer">
              {new URL(help.url).hostname}
            </a>
            . Les relevés envoyés pour analyse transitent par ce fournisseur.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => run("save")} disabled={busy !== null || !model.trim()}>
            {busy === "save" && <Loader2 className="mr-2 size-4 animate-spin" />} Enregistrer
          </Button>
          <Button
            variant="outline"
            onClick={() => run("test")}
            disabled={busy !== null || Boolean(dirty)}
          >
            {busy === "test" && <Loader2 className="mr-2 size-4 animate-spin" />} Tester la
            connexion
          </Button>
          {keySource === "settings" && (
            <Button variant="ghost" onClick={() => run("clear")} disabled={busy !== null}>
              Effacer la clé
            </Button>
          )}
          {dirty && <Badge variant="secondary">Modifications non enregistrées</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoriesSection() {
  const { settings, update } = useSettings();
  const [newCategory, setNewCategory] = useState("");
  const [pattern, setPattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [account, setAccount] = useState(settings.default_account);

  useEffect(() => setAccount(settings.default_account), [settings.default_account]);

  function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const value = newCategory.trim();
    if (!value) return;
    if (settings.categories.some((category) => category.toLowerCase() === value.toLowerCase())) {
      toast.error("Cette catégorie existe déjà");
      return;
    }
    update.mutate({ categories: [...settings.categories, value] });
    setNewCategory("");
  }

  function removeCategory(category: string) {
    update.mutate({ categories: settings.categories.filter((item) => item !== category) });
  }

  function addRule(event: React.FormEvent) {
    event.preventDefault();
    if (!pattern.trim() || !ruleCategory) return;
    update.mutate({
      rules: [
        ...settings.rules,
        { id: crypto.randomUUID(), pattern: pattern.trim(), category: ruleCategory },
      ],
    });
    setPattern("");
  }

  return (
    <div className="space-y-4">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Catégories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            L'IA choisit obligatoirement parmi cette liste (ou laisse vide si rien ne convient).
          </p>
          <div className="flex flex-wrap gap-2">
            {settings.categories.map((category) => (
              <Badge key={category} variant="secondary" className="gap-1 py-1 pl-3 pr-1 text-sm">
                {category}
                <button
                  type="button"
                  onClick={() => removeCategory(category)}
                  className="rounded p-0.5 hover:bg-background"
                  aria-label={`Supprimer ${category}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={addCategory}>
            <Input
              placeholder="Nouvelle catégorie…"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" variant="outline">
              <Plus className="mr-2 size-4" /> Ajouter
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Règles automatiques</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si l'émetteur ou le libellé contient le texte, la catégorie est imposée, quelle que soit
            la proposition de l'IA. La première règle qui correspond l'emporte.
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {settings.rules.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 font-mono">« {rule.pattern} »</span>
                <span className="text-muted-foreground">→</span>
                <span className="w-44 font-medium">{rule.category}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    update.mutate({ rules: settings.rules.filter((item) => item.id !== rule.id) })
                  }
                  aria-label="Supprimer la règle"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
            {settings.rules.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">Aucune règle.</li>
            )}
          </ul>
          <form className="flex flex-wrap gap-2" onSubmit={addRule}>
            <Input
              placeholder="Texte, ex. LIDL"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="w-48"
            />
            <Select value={ruleCategory} onValueChange={setRuleCategory}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                {settings.categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" disabled={!pattern.trim() || !ruleCategory}>
              <Plus className="mr-2 size-4" /> Ajouter la règle
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Compte par défaut</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="default-account">Proposé à chaque import</Label>
            <Input
              id="default-account"
              placeholder="ex. SG Joint"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-64"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              update.mutate({ default_account: account.trim() });
              toast.success("Compte par défaut enregistré");
            }}
          >
            Enregistrer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function BackupSection() {
  const { settings, update } = useSettings();
  const runBackup = useServerFn(backupNow);
  const loadBackups = useServerFn(getBackups);
  const backups = useQuery({ queryKey: ["backups"], queryFn: () => loadBackups({}) });
  const [busy, setBusy] = useState(false);

  async function now() {
    setBusy(true);
    try {
      const result = await runBackup({});
      toast.success(`Sauvegarde créée : ${result.file} (${result.rows} ligne(s))`);
      await backups.refetch();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Sauvegarde automatique</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="backup-enabled">Sauvegarde périodique</Label>
          </div>
          <Switch
            id="backup-enabled"
            checked={settings.backup_enabled}
            onCheckedChange={(checked) => update.mutate({ backup_enabled: checked })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="backup-interval">Intervalle (heures)</Label>
            <Input
              id="backup-interval"
              type="number"
              min={1}
              max={720}
              value={settings.backup_interval_hours}
              onChange={(e) =>
                update.mutate({ backup_interval_hours: Number(e.target.value) || 24 })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="backup-keep">Sauvegardes conservées</Label>
            <Input
              id="backup-keep"
              type="number"
              min={1}
              max={500}
              value={settings.backup_keep}
              onChange={(e) => update.mutate({ backup_keep: Number(e.target.value) || 30 })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={now} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Database className="mr-2 size-4" />
            )}
            Sauvegarder maintenant
          </Button>
          {backups.data?.last && (
            <Badge variant="secondary">
              Dernière : {new Date(backups.data.last).toLocaleString("fr-FR")}
            </Badge>
          )}
        </div>
        {backups.data?.files?.length ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {backups.data.files.slice(0, 5).map((file) => (
              <li key={file.name}>
                {file.name} — {(file.size / 1024).toFixed(1)} Ko
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune sauvegarde pour le moment.</p>
        )}
      </CardContent>
    </Card>
  );
}
