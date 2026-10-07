# BudgetFlow

Suivi de budget auto-hébergé. Vous déposez vos relevés bancaires (PDF, scan ou photo) dans
l'application : une IA extrait les opérations et les catégorise, vous relisez, vous validez.
Plus besoin de N8N ni de Telegram.

Successeur de *budgetbuddyhub* : même stack, même déploiement Docker, même dashboard.

## Fonctionnalités

- **Import** : glisser-déposer de un ou plusieurs relevés (PDF, JPEG, PNG, WebP, 20 Mo max).
  L'IA renvoie les opérations ; un écran de relecture permet de corriger date, émetteur,
  description, montant et catégorie, puis d'enregistrer.
- **Contrôle de solde** : solde initial + opérations extraites = solde final (ou totaux
  débit / crédit). En cas d'écart, un bandeau signale qu'une ligne manque ou qu'un montant est faux.
  Le contrôle se recalcule à chaque correction.
- **Anti-doublons** : une opération déjà en base (même date, même montant) est signalée
  « Déjà présente » et décochée. On peut réimporter un relevé, ou deux relevés qui se
  chevauchent, sans créer de doublons.
- **Catégories fixes** (Réglages → Catégories) : l'IA doit choisir dans la liste.
  **Règles automatiques** : « libellé contient Engie → Energie », prioritaires sur l'IA.
  Liste et règles reprises du workflow N8N *BudgetConverter*.
- **Fournisseur d'IA au choix** (Réglages → IA) : Google Gemini (par défaut,
  `gemini-2.5-flash`), Anthropic Claude (`claude-opus-5-5`) ou OpenAI. Modèle modifiable,
  bouton de test (gratuit : il vérifie seulement la clé et le modèle).
- **Dashboard** avec filtrage croisé, **table Data** éditable, import / export CSV,
  sauvegardes CSV périodiques, 11 thèmes.

## Confidentialité

Les relevés envoyés à l'analyse transitent par le fournisseur d'IA choisi. Ils ne sont pas
conservés par BudgetFlow : seules les opérations validées sont enregistrées.
Les clés API sont stockées côté serveur (`data/budget.db`) et ne sont jamais renvoyées au
navigateur. Elles peuvent aussi être fournies par variables d'environnement.

**Ne versionnez jamais `data/` ni `.env`** (déjà exclus par `.gitignore`) : la base contient
le secret de session, le hash du mot de passe admin et les clés API.

## Déploiement Docker

```bash
mkdir -p ./data
sudo chown -R 1000:1000 ./data   # l'app tourne avec l'utilisateur non root `node`
docker compose up -d --build
```

L'app écoute sur le port 3000. Tout l'état est dans `./data` (SQLite `budget.db`, exports,
sauvegardes) et survit aux rebuilds. Sauvegarde : `tar czf backup-$(date +%F).tar.gz ./data`.

Compte initial : `admin@budget.local` / `@Tracking@`, ou la valeur de `ADMIN_PASSWORD` au
premier démarrage. Changez-le dans Réglages → Compte.

Variables optionnelles (voir `.env.example` et `docker-compose.yml`) : `PORT`, `DATA_DIR`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`.

### Image publiée (GitHub Actions)

Chaque push sur `main` construit et publie `ghcr.io/<propriétaire>/budgetflow:latest`
(et `:main`, `:commit-<sha>`) ; les pull requests construisent sans publier.

```bash
docker run -d -p 3000:3000 -v "$PWD/data:/data" ghcr.io/<propriétaire>/budgetflow:latest
```

Si le paquet ghcr.io est privé, faites d'abord `docker login ghcr.io` sur le serveur.

## Reprendre les données de budgetbuddyhub

1. Dans l'ancienne app : Data → Exporter (CSV avec la colonne `id`).
2. Dans BudgetFlow : Data → CSV → choisir le fichier.

Les lignes déjà importées sont mises à jour par `id`, jamais dupliquées. Les relevés PDF
importés ensuite sont comparés à ces lignes pour signaler les doublons.

## Comment fonctionne l'import

1. Le navigateur envoie le fichier au serveur de l'app (jamais directement à l'IA).
2. Le serveur appelle le fournisseur choisi avec un schéma JSON strict
   (`src/lib/ai/extraction.ts`) : période, soldes, totaux, puis pour chaque opération la date,
   l'émetteur, la description, le montant signé (débit négatif, crédit positif) et la catégorie.
3. `src/lib/import.server.ts` normalise les lignes, applique les règles et calcule une clé
   stable (compte + date + montant + rang), puis signale les doublons.
4. Après relecture, seules les lignes cochées sont enregistrées (`source = ia`).

## Développement

```bash
bun install
bun run dev            # données locales dans ./data
bun run typecheck
bun run check:import   # vérification hors ligne du pipeline d'import
```

Stack : TanStack Start (React 19, SSR), TanStack Router / Query, Tailwind 4 + shadcn/ui,
Recharts, SDK `@anthropic-ai/sdk` pour Claude, appels REST pour Gemini et OpenAI.
