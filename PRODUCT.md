# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Une seule personne, propriétaire de l'instance auto-hébergée (compte admin unique). Elle suit ses propres finances : importe ses relevés bancaires plusieurs fois par mois, range les opérations dans ses catégories, puis consulte où part l'argent. Usage sur ordinateur et aussi sur téléphone.

## Product Purpose

BudgetFlow transforme des relevés bancaires PDF en écritures catégorisées, sans saisie manuelle ni service tiers d'automatisation (remplace l'ancien flux N8N + Gemini). Réussite : un relevé déposé devient en quelques minutes des lignes justes et rangées, et le Dashboard dit clairement combien entre, combien sort et dans quelles catégories.

## Positioning

Lecture du relevé par l'IA choisie par l'utilisateur (Gemini, Claude, OpenAI) avec sa propre clé, sur une instance qu'il héberge lui-même ; la catégorisation apprend de ses choix (règles, habitudes par tiers) au lieu de lui imposer un plan de comptes générique.

## Operating Context

- Relevés PDF de banque française (texte ou scannés) ; pas de photos ni de tickets.
- Un compte par défaut nommé « Compte 1 », renommable dans Réglages ; d'autres comptes restent possibles.
- Boucle type : déposer un PDF → relire (doublons, catégories) → enregistrer ; les lignes sans catégorie peuvent être enregistrées et rangées plus tard dans un écran dédié, signalé par un rappel discret sur le Dashboard.
- Corrections à la main dans la table Data (édition en ligne, ajout, suppression, actions groupées).
- Déploiement Docker auto-hébergé, données dans un volume `./data`, sauvegardes JSON/CSV.

## Capabilities and Constraints

- Catégories : liste fixe gérée dans Réglages ; l'IA doit choisir dedans ou laisser vide.
- Règles automatiques « texte contenu → catégorie » ; une catégorisation manuelle peut proposer une règle sans interrompre.
- Pas de notion de solde ni de budget/plafond dans l'interface (retirés à la demande de l'utilisateur, octobre 2026).
- Interface entièrement en français ; montants en euros au format fr-FR.
- Stack existante : TanStack Start + React 19, Tailwind 4, composants Radix ; stockage SQLite/JSON local.

## Brand Commitments

Nom : BudgetFlow. Aucun logo, charte ou couleur imposés.

Préférence de style (choisie le 2026-10-07) : le standard de la catégorie « appli fintech », exécuté sans détour ni originalité gratuite. Barre de finition : Finary (suivi de patrimoine français).

## Evidence on Hand

Aucune donnée réelle dans le dépôt (la base de prévisualisation contient des données fictives). Ne jamais inventer de chiffres présentés comme réels.

## Product Principles

1. Le relevé est la source de vérité : ce qui est affiché doit pouvoir se recouper avec le PDF.
2. Ne jamais bloquer l'enregistrement pour une catégorie manquante : ranger plus tard doit rester simple.
3. Suggérer sans interrompre : règles, catégories et doublons se proposent, l'utilisateur dispose.
4. Une correction manuelle est rapide, réversible et immédiatement visible.

## Accessibility & Inclusion

Pas d'exigence spécifique établie ; viser WCAG AA (contraste, clavier, focus visible).
