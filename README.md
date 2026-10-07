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
- **Anti-doublons** : une opération déjà en base, même date et même montant, avec le même
  tiers (ou la même clé de relevé), est signalée « Déjà présente » et décochée. Si seul le
  tiers diffère, elle est signalée « Doublon possible » mais reste cochée : deux achats
  différents au même prix le même jour ne sont jamais perdus. On peut réimporter un relevé,
  ou deux relevés qui se chevauchent, sans créer de doublons.
- **Catégorisation intelligente**, par ordre de priorité :
  1. **règles** (« libellé contient Engie → Energie ») ;
  2. **habitudes** : la catégorie que vous donnez d'ordinaire à ce tiers, apprise sur vos
     écritures (un choix fait à la main compte triple). « CARTE X6035 PICARD SA 296 » et
     « Picard » sont reconnus comme le même tiers ;
  3. **IA**, qui reçoit vos habitudes en exemples et signale quand elle hésite (« à vérifier »).
     Quand une habitude écarte la proposition de l'IA, celle-ci reste affichée en indice.
- **Catégorisation manuelle rapide** à l'import :
  - sélecteur avec recherche au clavier et création d'une catégorie à la volée ;
  - une catégorie choisie pour une ligne s'applique aux autres opérations du même tiers ;
  - vue **Par émetteur** : une ligne par tiers ;
  - filtre **À vérifier** : lignes sans catégorie, incertaines ou doublons possibles ;
  - **règles suggérées** à partir de vos corrections, à créer en un clic.
- **Catégories et budgets** (Réglages → Catégories) : l'IA choisit dans la liste. Un
  **budget mensuel** par catégorie est facultatif ; le dashboard montre la consommation,
  les dépassements et la projection en fin de mois.
- **Analyse** :
  - comparaison mensuelle par catégorie (mois précédent, même mois l'an dernier) ;
  - détection des **abonnements** et prélèvements récurrents (nouveaux, hausses de prix,
    arrêtés) ;
  - **solde par compte**, reconstitué depuis le dernier relevé importé.
- **Fournisseur d'IA au choix** (Réglages → IA) : Google Gemini (par défaut,
  `gemini-2.5-flash`), Anthropic Claude (`claude-opus-5-5`) ou OpenAI. Modèle modifiable,
  bouton de test (gratuit : il vérifie seulement la clé et le modèle). Chaque import affiche
  les tokens consommés et une **estimation du coût**, selon un tarif public indicatif ou le
  vôtre.
- **Dashboard** avec filtrage croisé et comparaison à la période précédente, **table Data**
  éditable, import / export CSV, 11 thèmes.
- **Sauvegardes** périodiques : un CSV des écritures et un JSON complet (écritures,
  catégories, règles, budgets, réglages ; jamais les clés API ni le mot de passe), à
  télécharger ou **restaurer** depuis Réglages → Sauvegardes.

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
premier démarrage. Tant que le mot de passe par défaut est actif, l'application exige son
remplacement avant tout accès. Après 5 échecs de connexion, l'attente entre deux essais
double à chaque nouvel échec (30 s, 1 min, 2 min… jusqu'à 15 min).

### Sauvegarde et restauration

Réglages → Sauvegardes : sauvegarde manuelle ou périodique dans `./data/exports`,
téléchargement et restauration. Une restauration sauvegarde d'abord l'état actuel
(`…-avant-restauration.json`).

Si la base devient illisible, BudgetFlow **ne l'écrase pas** : il en met une copie de côté
(`data/budget.corrupt-….json`) et affiche un message d'erreur. Pour repartir d'une sauvegarde
sans l'interface, copiez un fichier `exports/budget-….json` en `data/restore.json`, puis
rechargez la page : il est appliqué puis renommé en `restore.done-….json`.

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
   Les habitudes apprises (`src/lib/categories.ts`) sont jointes au prompt en exemples.
3. `src/lib/import.server.ts` normalise les lignes, applique règles puis habitudes, calcule une
   clé stable (compte + date + montant + rang) et signale les doublons (certains ou possibles).
4. Après relecture, seules les lignes cochées sont enregistrées (`source = ia`) ; les
   catégories choisies à la main sont marquées et pèsent davantage dans les habitudes.

## Développement

```bash
bun install
bun run dev            # données locales dans ./data
bun run typecheck
bun run check:import   # vérification hors ligne du pipeline d'import
bun run check:store    # base corrompue jamais écrasée, restauration par restore.json
```

La CI (GitHub Actions) lance typecheck, `check:import` et `check:store` avant de construire
l'image Docker.

Stack : TanStack Start (React 19, SSR), TanStack Router / Query, Tailwind 4 + shadcn/ui,
Recharts, SDK `@anthropic-ai/sdk` pour Claude, appels REST pour Gemini et OpenAI.
