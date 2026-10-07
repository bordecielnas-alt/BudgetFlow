---
version: 1
slug: "src-routes-authenticated-dashboard-tsx"
primary_target: "src/routes/_authenticated/dashboard.tsx"
related_targets: ["src/components/AppShell.tsx","src/routes/_authenticated/import.tsx","src/routes/_authenticated/data.tsx","src/routes/_authenticated/settings.tsx","src/routes/_authenticated/insights.tsx"]
---

# Surface brief — application BudgetFlow (toutes les pages authentifiées)

Mode : Operate. Utilisateur unique, ordinateur et téléphone, plusieurs fois par mois.
Tâches : importer un relevé PDF, relire, ranger les opérations non catégorisées, corriger dans la table, consulter entrées/sorties par période et catégorie.
Contraintes : français, euros fr-FR, auto-hébergé (aucune police ni ressource chargée depuis un CDN), clair et sombre.
Moment mémorable : le rappel « N opérations à ranger » qui mène à un écran où l'on range un tiers entier en un geste, avec la proposition de règle qui apparaît sans interrompre.

## Direction contract

THESIS: Le standard fintech, exécuté au niveau de finition de Finary : les montants mènent, le chrome s'efface. Refuse la grille shadcn par défaut, les 27 thèmes et les cartes KPI identiques alignées.
OWN-WORLD: Fonds neutres légèrement froids (sombre : encre bleu-noir, surfaces relevées d'un cran ; clair : blanc et gris perle), filets d'un pixel, rayon 12–16 px, aucune ombre en sombre. Un seul accent indigo pour les actions et la sélection ; vert pour les entrées, ambre pour « à ranger », rouge réservé aux erreurs et suppressions. Police système, chiffres tabulaires partout.
STORY: L'utilisateur voit d'un coup d'œil combien est entré et sorti sur la période et où l'argent part ; il sait s'il reste des opérations à ranger et y va en un clic ; il corrige une ligne sans quitter la table.
FIRST VIEWPORT: Barre latérale à gauche (bas de l'écran sur téléphone) avec badge « À ranger ». En tête : titre de période et sélecteur Mois / Année / Tout / Dates + flèches (« Dates » reprend la plage de dates libre qui existait déjà sur l’ancien Dashboard). Un panneau principal : « Sorties » en grand chiffre, « Entrées » à côté, variation vs période précédente, histogramme mensuel dessous. À droite, répartition des sorties par catégorie en barres horizontales. Bandeau ambre discret « N opérations à ranger → Ranger » au-dessus si besoin. Action primaire « Importer un relevé » en haut à droite.
FORM: Standard de la catégorie (canon), choisi par l'utilisateur ; position hors liste ; seed 9ea2a341.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
