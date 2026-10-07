import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Database,
  Download,
  KeyRound,
  Landmark,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Sun,
  Tags,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { CategoryDot } from "@/components/CategoryPicker";
import { PageHeader } from "@/components/page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useEntries } from "@/hooks/useEntries";
import { useSettings } from "@/hooks/useSettings";
import { knownPrice } from "@/lib/ai/pricing";
import {
  backupNow,
  downloadBackup,
  getBackups,
  renameAccount,
  renameCategory,
  restoreBackupFn,
} from "@/lib/data.functions";
import { AI_PROVIDERS, type AiProvider } from "@/lib/budget-types";
import { LEGACY_CATEGORY_NAMES } from "@/lib/categories";
import { getAiConfig, saveAiConfig, testAiConfig } from "@/lib/import.functions";
import { normalizeTheme, THEMES } from "@/lib/themes";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Réglages — BudgetFlow" },
      {
        name: "description",
        content:
          "Comptes bancaires, apparence, fournisseur d'IA, catégories, sauvegardes et connexion.",
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
    <div className="space-y-6">
      <PageHeader title="Réglages" />

      <Tabs defaultValue="accounts">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="accounts">
            <Landmark className="mr-2 size-4" /> Comptes
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
          <TabsTrigger value="login">
            <User className="mr-2 size-4" /> Connexion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="pt-4">
          <BankAccountsSection />
        </TabsContent>
        <TabsContent value="login" className="pt-4">
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
        <CardTitle>Connexion</CardTitle>
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
  const theme = normalizeTheme(settings.theme);
  const icons = { system: Monitor, light: Sun, dark: Moon } as const;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Apparence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Thème</Label>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((item) => {
              const Icon = icons[item.id];
              const active = theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update.mutate({ theme: item.id })}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "border-primary bg-primary-soft font-medium text-primary-text"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            « Système » suit le réglage clair / sombre de l'appareil.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Densité des tableaux</Label>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as const).map((density) => (
              <Button
                key={density}
                variant={settings.density === density ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={settings.density === density}
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

/** Comptes bancaires : renommage partout et compte proposé par défaut. */
function BankAccountsSection() {
  const { settings, update } = useSettings();
  const { data: entries = [] } = useEntries();
  const queryClient = useQueryClient();
  const runRename = useServerFn(renameAccount);
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.account, (counts.get(entry.account) ?? 0) + 1);
  const names = [...new Set([settings.default_account, ...counts.keys()])]
    .filter(Boolean)
    .sort((a, b) =>
      a === settings.default_account
        ? -1
        : b === settings.default_account
          ? 1
          : a.localeCompare(b, "fr"),
    );

  async function doRename(from: string, to: string) {
    try {
      const result = await runRename({ data: { from, to } });
      toast.success(`« ${from} » renommé en « ${to} » (${result.renamed} opération(s))`);
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function rename(from: string, to: string) {
    const target = to.trim();
    if (!target || target === from) return;
    if (names.includes(target)) {
      toast(`Le compte « ${target} » existe déjà`, {
        description: "Renommer fusionnera les opérations des deux comptes.",
        action: { label: "Fusionner", onClick: () => void doRename(from, target) },
      });
      return;
    }
    void doRename(from, target);
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Comptes bancaires</CardTitle>
        <CardDescription>
          Les imports vont sur le compte par défaut. Renommer un compte met à jour toutes ses
          opérations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {names.map((name) => {
            const count = counts.get(name) ?? 0;
            return (
              <li key={name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Landmark className="size-4 shrink-0 text-muted-foreground" />
                <InlineName
                  name={name}
                  label={`Nom du compte ${name}`}
                  onRename={(to) => rename(name, to)}
                />
                <span className="num text-xs text-muted-foreground">
                  {count} opération{count > 1 ? "s" : ""}
                </span>
                {name === settings.default_account ? (
                  <Badge variant="default">Par défaut</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      update.mutate({ default_account: name });
                      toast.success(`« ${name} » devient le compte par défaut`);
                    }}
                  >
                    Mettre par défaut
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Un autre compte apparaît ici dès qu'un import ou une opération l'utilise.
        </p>
      </CardContent>
    </Card>
  );
}

/** Nom modifiable en place : crayon visible, champ au survol ou au focus. */
function InlineName({
  name,
  label,
  onRename,
}: {
  name: string;
  label: string;
  onRename: (to: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(name), [name]);
  return (
    <div className="group/name relative flex min-w-0 flex-1 items-center">
      <Input
        ref={input}
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft.trim() !== name) onRename(draft);
          else setDraft(name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(name);
        }}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent pl-2 pr-8 font-medium hover:border-input"
      />
      <button
        type="button"
        onClick={() => input.current?.select()}
        className="absolute right-1.5 rounded p-1 text-muted-foreground opacity-60 hover:bg-accent hover:text-foreground group-hover/name:opacity-100 group-focus-within/name:opacity-0"
        aria-label={`Renommer ${name}`}
        tabIndex={-1}
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
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
        <CardTitle>Fournisseur d'IA pour la lecture des relevés</CardTitle>
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
        <PriceFields model={model} />
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

/** Tarif servant à estimer le coût de chaque import ; vide = tarif indicatif du modèle. */
function PriceFields({ model }: { model: string }) {
  const { settings, update } = useSettings();
  const known = knownPrice(model);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  useEffect(() => {
    setInput(settings.ai_price_in === null ? "" : String(settings.ai_price_in));
    setOutput(settings.ai_price_out === null ? "" : String(settings.ai_price_out));
  }, [settings.ai_price_in, settings.ai_price_out]);

  function commit() {
    const parse = (raw: string) => {
      const value = Number(raw.replace(",", "."));
      return raw.trim() && Number.isFinite(value) && value >= 0 ? value : null;
    };
    const ai_price_in = parse(input);
    const ai_price_out = parse(output);
    // Les deux ou aucun : un tarif à moitié rempli fausserait l'estimation.
    const both = ai_price_in !== null && ai_price_out !== null;
    update.mutate({
      ai_price_in: both ? ai_price_in : null,
      ai_price_out: both ? ai_price_out : null,
    });
  }

  return (
    <div className="space-y-2">
      <Label>Tarif pour l'estimation du coût (USD par million de tokens)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Tarif entrée"
          inputMode="decimal"
          className="w-36"
          placeholder={known ? `entrée : ${known.input}` : "entrée"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commit}
        />
        <Input
          aria-label="Tarif sortie"
          inputMode="decimal"
          className="w-36"
          placeholder={known ? `sortie : ${known.output}` : "sortie"}
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          onBlur={commit}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {known
          ? "Laissez vide pour utiliser le tarif public indiqué en grisé (indicatif)."
          : "Tarif inconnu pour ce modèle : renseignez-le pour afficher le coût des imports."}
      </p>
    </div>
  );
}

function CategoriesSection() {
  const { settings, update } = useSettings();
  const runRename = useServerFn(renameCategory);
  const queryClient = useQueryClient();

  async function renameOne(from: string, to: string) {
    const target = to.trim();
    if (!target || target === from) return;
    try {
      const result = await runRename({ data: { from, to: target } });
      toast.success(
        settings.categories.includes(target)
          ? `« ${from} » fusionnée dans « ${target} » (${result.renamed} opération(s))`
          : `« ${from} » renommée en « ${target} » (${result.renamed} opération(s))`,
      );
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  // Noms anglais ou sans accent repris de l'ancienne application : proposés une fois.
  const legacy = Object.entries(LEGACY_CATEGORY_NAMES).filter(([from]) =>
    settings.categories.includes(from),
  );
  const [legacyBusy, setLegacyBusy] = useState(false);

  async function renameLegacy() {
    setLegacyBusy(true);
    for (const [from, to] of legacy) await renameOne(from, to);
    setLegacyBusy(false);
  }

  const [newCategory, setNewCategory] = useState("");
  const [pattern, setPattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

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
          <CardTitle>Catégories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            L'IA choisit obligatoirement parmi cette liste, ou laisse vide si rien ne convient : la
            ligne passe alors dans « À ranger ».
          </p>
          {legacy.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-primary-soft px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                Passer en français :{" "}
                {legacy.map(([from, to], index) => (
                  <span key={from}>
                    {index > 0 && ", "}
                    <span className="text-muted-foreground">{from}</span> → <strong>{to}</strong>
                  </span>
                ))}
                . Les opérations et les règles suivent.
              </span>
              <Button size="sm" onClick={() => void renameLegacy()} disabled={legacyBusy}>
                {legacyBusy && <Loader2 className="animate-spin" />} Renommer
              </Button>
            </div>
          )}
          <ul className="divide-y divide-border rounded-md border border-border">
            {settings.categories.map((category) => (
              <li key={category} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <CategoryDot category={category} />
                <InlineName
                  name={category}
                  label={`Nom de la catégorie ${category}`}
                  onRename={(to) => void renameOne(category, to)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => removeCategory(category)}
                  aria-label={`Supprimer ${category}`}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
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
          <CardTitle>Règles automatiques</CardTitle>
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
    </div>
  );
}

function BackupSection() {
  const { settings, update } = useSettings();
  const runBackup = useServerFn(backupNow);
  const loadBackups = useServerFn(getBackups);
  const backups = useQuery({ queryKey: ["backups"], queryFn: () => loadBackups({}) });
  const fetchBackup = useServerFn(downloadBackup);
  const runRestore = useServerFn(restoreBackupFn);
  const queryClient = useQueryClient();
  const uploadInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Restauration en attente de confirmation : sauvegarde du serveur ou fichier choisi.
  const [pendingRestore, setPendingRestore] = useState<
    { name: string } | { text: string; label: string } | null
  >(null);

  async function download(name: string) {
    try {
      const { text } = await fetchBackup({ data: { name } });
      const type = name.endsWith(".json") ? "application/json" : "text/csv";
      const url = URL.createObjectURL(new Blob([text], { type }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function pickFile(file: File | undefined) {
    if (uploadInput.current) uploadInput.current.value = "";
    if (!file) return;
    setPendingRestore({ text: await file.text(), label: file.name });
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setBusy(true);
    try {
      const data =
        "name" in pendingRestore ? { name: pendingRestore.name } : { text: pendingRestore.text };
      const result = await runRestore({ data });
      toast.success(
        `Restauration terminée : ${result.rows} écriture(s). L'état précédent est conservé dans ${result.safety}.`,
      );
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      setPendingRestore(null);
    }
  }

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
        <CardTitle>Sauvegarde automatique</CardTitle>
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
        <p className="text-xs text-muted-foreground">
          Chaque sauvegarde produit un CSV des écritures (pour un tableur) et un fichier JSON
          complet : écritures, catégories, règles et réglages. Les clés API et le mot de passe n'y
          figurent jamais.
        </p>
        {backups.data?.files?.length ? (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {backups.data.files.slice(0, 10).map((file) => (
              <li key={file.name} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <Badge variant="outline" className="w-12 justify-center uppercase">
                  {file.kind}
                </Badge>
                <span className="flex-1 truncate font-mono text-xs">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} Ko
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => download(file.name)}
                  aria-label={`Télécharger ${file.name}`}
                >
                  <Download className="size-4" />
                </Button>
                {file.kind === "json" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setPendingRestore({ name: file.name })}
                  >
                    <RotateCcw className="mr-1.5 size-4" /> Restaurer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune sauvegarde pour le moment.</p>
        )}
        <div>
          <Button variant="outline" onClick={() => uploadInput.current?.click()} disabled={busy}>
            <Upload className="mr-2 size-4" /> Restaurer depuis un fichier…
          </Button>
          <input
            ref={uploadInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void pickFile(event.target.files?.[0])}
          />
        </div>
      </CardContent>

      <AlertDialog
        open={pendingRestore !== null}
        onOpenChange={(open) => !open && setPendingRestore(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer cette sauvegarde ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les écritures, catégories, règles et réglages actuels seront remplacés par ceux de{" "}
              <strong>
                {pendingRestore &&
                  ("name" in pendingRestore ? pendingRestore.name : pendingRestore.label)}
              </strong>
              . Une sauvegarde de l'état actuel est faite juste avant ; le compte et les clés API ne
              changent pas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRestore()}>Restaurer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
