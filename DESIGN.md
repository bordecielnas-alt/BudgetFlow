---
name: BudgetFlow
description: Relevés PDF en écritures catégorisées ; entrées, sorties et catégories d'un coup d'œil.
colors:
  background: "oklch(0.982 0.003 265)"
  foreground: "oklch(0.21 0.018 265)"
  card: "oklch(1 0 0)"
  popover: "oklch(1 0 0)"
  sidebar: "oklch(0.962 0.005 265)"
  primary: "oklch(0.52 0.19 274)"
  primary-foreground: "oklch(0.99 0 0)"
  primary-text: "oklch(0.5 0.19 274)"
  primary-soft: "oklch(0.52 0.19 274 / 10%)"
  secondary: "oklch(0.955 0.005 265)"
  muted: "oklch(0.955 0.005 265)"
  muted-foreground: "oklch(0.49 0.02 265)"
  accent: "oklch(0.945 0.007 265)"
  destructive: "oklch(0.55 0.2 27)"
  danger-soft: "oklch(0.55 0.2 27 / 10%)"
  income: "oklch(0.5 0.13 158)"
  income-soft: "oklch(0.5 0.13 158 / 11%)"
  warning: "oklch(0.55 0.13 66)"
  warning-soft: "oklch(0.75 0.15 80 / 18%)"
  border: "oklch(0.91 0.007 265)"
  input: "oklch(0.87 0.01 265)"
  ring: "oklch(0.6 0.17 274)"
  chart-1: "oklch(0.58 0.16 274)"
  chart-2: "oklch(0.62 0.14 158)"
  chart-grid: "oklch(0.21 0.018 265 / 7%)"
  background-dark: "oklch(0.165 0.012 265)"
  foreground-dark: "oklch(0.955 0.005 265)"
  card-dark: "oklch(0.2 0.013 265)"
  popover-dark: "oklch(0.225 0.014 265)"
  sidebar-dark: "oklch(0.145 0.011 265)"
  primary-dark: "oklch(0.56 0.19 274)"
  primary-text-dark: "oklch(0.78 0.12 274)"
  primary-soft-dark: "oklch(0.7 0.15 274 / 16%)"
  secondary-dark: "oklch(0.25 0.013 265)"
  muted-dark: "oklch(0.245 0.013 265)"
  muted-foreground-dark: "oklch(0.71 0.016 265)"
  accent-dark: "oklch(0.26 0.014 265)"
  destructive-dark: "oklch(0.66 0.19 25)"
  danger-soft-dark: "oklch(0.66 0.19 25 / 16%)"
  income-dark: "oklch(0.78 0.14 158)"
  income-soft-dark: "oklch(0.78 0.14 158 / 14%)"
  warning-dark: "oklch(0.84 0.13 82)"
  warning-soft-dark: "oklch(0.84 0.13 82 / 13%)"
  border-dark: "oklch(1 0 0 / 8%)"
  input-dark: "oklch(1 0 0 / 13%)"
  ring-dark: "oklch(0.7 0.15 274)"
  chart-1-dark: "oklch(0.68 0.15 274)"
  chart-2-dark: "oklch(0.76 0.14 158)"
  chart-grid-dark: "oklch(1 0 0 / 6%)"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "\"tnum\" 1"
  display-secondary:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  nav-tab:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  full: "9999px"
spacing:
  row-compact: "0.3rem"
  row-default: "0.55rem"
  row-comfortable: "0.6rem"
  card: "20px"
  card-wide: "24px"
  grid-gap: "20px"
  page-x-mobile: "16px"
  page-x-tablet: "24px"
  page-x-desktop: "40px"
  sidebar-width: "15rem"
  content-max: "1200px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-ghost:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: "36px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
  badge-income:
    backgroundColor: "{colors.income-soft}"
    textColor: "{colors.income}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  badge-accent:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  segmented-list:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "4px"
    height: "36px"
  segmented-item-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  sidebar-item:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  sidebar-item-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
  tabbar-item:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.nav-tab}"
    height: "64px"
  tabbar-item-active:
    textColor: "{colors.primary-text}"
  sort-banner:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  filter-chip:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 8px 0 12px"
    height: "28px"
---

# Design System: BudgetFlow

## Overview

**Creative North Star: "Le relevé soigné"**

BudgetFlow applique le standard des applications fintech, au niveau de finition de Finary : les montants mènent, le chrome s'efface. Les fonds sont des neutres légèrement froids (teinte 265) : blanc et gris perle en clair, encre bleu-noir en sombre où chaque surface relevée gagne un cran de clarté. Les séparations sont des filets d'un pixel, les coins généreux (12 à 16 px), et un seul accent indigo porte les actions et la sélection.

La couleur a un sens avant d'avoir une fonction décorative : vert pour les entrées, ambre pour ce qui reste « à ranger », rouge pour les erreurs et les suppressions, indigo pour ce que l'on peut faire ou ce qui est choisi. Tout le reste est neutre, y compris les variations d'une période à l'autre. Les chiffres sont tabulaires partout ; un montant se lit comme sur un relevé bien composé, centimes et devise en retrait.

L'interface est une interface d'usage, pas une vitrine : densité réglable des tableaux, pas d'animation d'entrée sur les graphiques, mouvements brefs (150 à 250 ms) réservés aux changements d'état et aux couches qui s'ouvrent. Thème Système, Clair ou Sombre au choix, appliqué avant l'hydratation pour éviter tout flash.

**Key Characteristics:**
- Neutres froids (teinte 265), un seul accent indigo (teinte 274).
- Quatre couleurs sémantiques à sens unique : indigo, vert, ambre, rouge.
- Filets d'un pixel, rayons 12 px (contrôles) et 16 px (panneaux).
- Plat au repos ; l'ombre n'appartient qu'aux couches flottantes.
- Chiffres tabulaires sur tout le corps de texte ; montants en fr-FR.
- Deux thèmes à parité, chacun avec ses propres valeurs (pas d'inversion mécanique).

## Colors

Neutres froids à très faible chroma, un accent indigo saturé, et trois couleurs d'état qui ne servent qu'à leur sens. Chaque jeton existe en clair (`:root`) et en sombre (`.dark`, suffixe `-dark` ci-dessus) ; les valeurs sombres sont réglées à part, pas dérivées.

### Primary
- **Indigo d'action** (`primary`, `primary-dark`) : fond des boutons principaux (« Importer un relevé », « Enregistrer »), case cochée, pastille du logo. Uniquement ce que l'on peut faire ou ce qui est sélectionné.
- **Indigo de texte** (`primary-text`, `primary-text-dark`) : liens, onglet actif de la barre du bas, texte des puces de filtre. Plus clair en sombre (0.78) pour le contraste sur encre.
- **Voile indigo** (`primary-soft`, `primary-soft-dark`) : ligne sélectionnée d'un tableau, puce de filtre active, survol de la proposition de règle.
- **Anneau de focus** (`ring`, `ring-dark`) : contour 2 px de tout élément focalisé au clavier ; en champ, bordure `ring` plus halo 3 px à 25 %.

### Secondary
- **Vert des entrées** (`income`, `income-dark`, `income-soft`) : montants positifs (composant Money), chiffre « Entrées », badge `income`, catégorie nommée Revenus / Salaire / Income.
- **Ambre « à ranger »** (`warning`, `warning-dark`, `warning-soft`) : compteur de la navigation, bandeau « N opérations sans catégorie → Ranger », sélecteur de catégorie vide surligné, badge `warning`.

### Tertiary
- **Rouge d'erreur** (`destructive`, `destructive-dark`, `danger-soft`) : erreurs, champ invalide (`aria-invalid`), boutons et confirmations de suppression. Jamais pour une sortie d'argent ni une hausse de dépenses.

### Neutral
- **Fond** (`background`) : toile de l'application. **Carte** (`card`) : panneaux, champs, boutons outline ; blanc pur en clair, un cran au-dessus du fond en sombre. **Couche** (`popover`) : menus, info-bulles, barres d'action flottantes ; encore un cran plus haut en sombre.
- **Barre latérale** (`sidebar`) : un cran sous le fond (plus sombre en sombre comme en clair), pour que le contenu paraisse posé dessus.
- **Texte** (`foreground`) et **texte atténué** (`muted-foreground`) : libellés, dates, en-têtes de colonnes, variations, icônes de navigation au repos.
- **Gris de remplissage** (`muted`, `secondary`, `accent`) : fond des contrôles segmentés, squelettes de chargement, survol des éléments fantômes et des lignes.
- **Filets** (`border`, `input`) : `border` pour les séparations et contours de cartes ; `input`, plus marqué, pour les contours de champs et boutons outline. En sombre, blanc à 8 % et 13 %.
- **Graphiques** : `chart-1` (indigo) pour les sorties, `chart-2` (vert) pour les entrées, `chart-grid` pour les seules lignes horizontales de la grille.

### Palette des catégories
Couleur stable par catégorie, calculée dans l'ordre des Réglages : sept teintes oklch (190, 325, 122, 235, 350, 212, 302) ordonnées pour que deux voisines s'opposent, sur trois paliers (L 0.72 / C 0.13, L 0.56 / C 0.13, L 0.84 / C 0.08), soit 21 couleurs. Une opération sans catégorie prend `muted-foreground`. Les catégories de revenus prennent `income`. Les couleurs de catégorie n'apparaissent qu'en pastille de 8 px, en barre de répartition ou en point de légende, jamais en fond de texte.

### Named Rules
**The Sens Unique Rule.** Chaque couleur sémantique a un seul sens : indigo = action ou sélection, vert = entrée d'argent, ambre = à ranger, rouge = erreur ou suppression. Une couleur qui sert à autre chose que son sens est un défaut.

**The Teintes Réservées Rule.** La palette des catégories exclut les teintes qui ont un sens : rouge (~25), ambre (60–100), vert (~158), indigo (260–290). Toute nouvelle teinte de catégorie reste hors de ces plages.

**The Variation Neutre Rule.** Une variation entre périodes (« ↗ 54 % vs 1 602,73 € ») s'affiche en `foreground` avec une flèche, jamais en vert ou en rouge : plus de sorties n'est pas une erreur, et plus d'entrées n'est pas une entrée.

## Typography

**Display Font:** pile système (ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial)
**Body Font:** même pile
**Label/Mono Font:** pile mono du navigateur, seulement pour les noms de fichiers de sauvegarde

**Character:** une seule famille sans empattement, portée par la graisse (400, 500, 600) et l'approche négative sur les grands chiffres. Aucune ressource chargée depuis un CDN ; une police éventuelle doit être servie par l'instance elle-même.

### Hierarchy
- **Display** (600, 2.5rem, 2.25rem sous 640 px, interlignage 1, -0.025em) : le chiffre principal du panneau, « Sorties ». Les centimes et le symbole € passent à 0.6em, graisse 500, en `muted-foreground`.
- **Display secondaire** (600, 1.75rem, interlignage 1, -0.025em) : le chiffre voisin, « Entrées ».
- **Headline** (600, 1.625rem, 1.25, -0.02em) : titre de page (« Octobre 2026 », « Opérations »), une phrase d'appui facultative en `body` atténué dessous.
- **Title** (600, 15 px, 1.25) : titre de carte et nom de l'application dans la barre latérale.
- **Body** (400, 14 px, 20 px) : texte courant, cellules de tableau, navigation. Les champs passent à 16 px sous 768 px pour éviter le zoom iOS.
- **Label** (500, 12 px) : en-têtes de colonnes, badges, lignes de variation, propositions de règle. En casse normale.
- **Onglet** (11 px) : libellés de la barre d'onglets du téléphone.

### Named Rules
**The Chiffres Tabulaires Rule.** `font-feature-settings: "tnum" 1` est posé sur le corps ; tout montant porte en plus l'utilitaire `num` (chiffres tabulaires, -0.01em). Les montants passent par `Intl` en fr-FR : espace fine des milliers, virgule décimale, signe moins typographique.

**The Casse Normale Rule.** Libellés, en-têtes et étiquettes restent en casse normale ; les capitales sont réservées aux sigles (CSV, JSON) et aux motifs de règle saisis tels quels.

## Layout

- **Ordinateur (≥ 1024 px, `lg`)** : barre latérale fixe de 15rem (240 px) à gauche, fond `sidebar`, filet à droite ; logo et nom en tête, six entrées (Vue d'ensemble, À ranger avec compteur ambre, Importer, Opérations, Analyse, Réglages), « Se déconnecter » en pied.
- **Téléphone et tablette (< 1024 px)** : en-tête collant de 56 px (logo, Réglages, déconnexion) et barre d'onglets fixe en bas, cinq colonnes de 64 px de haut, fond à 95 % avec flou d'arrière-plan et marge de sécurité iOS. Le contenu garde 112 px de marge basse pour ne pas passer sous la barre.
- **Contenu** : centré, 1200 px au plus ; marges latérales 16 / 24 / 40 px (mobile / ≥ 640 / ≥ 1024), marge haute 24 px puis 36 px.
- **Rythme** : sections de page espacées de 24 px ; grilles de cartes à 20 px de gouttière ; cartes à 20 px de marge intérieure (24 px à partir de 640 px pour le panneau principal).
- **Vue d'ensemble** : en tête, titre de période à gauche ; flèches, contrôle segmenté Mois / Année / Tout / Dates et action primaire à droite. Bandeau ambre si besoin. Puis une grille 1.65fr / 1fr : panneau Entrées / Sorties avec histogramme, répartition des sorties par catégorie en barres horizontales.
- **Densité** (Réglages → Apparence) : marge verticale des cellules de tableau à 0.3rem en compact, 0.6rem en confortable (0.55rem par défaut).
- **Barres d'action flottantes** (sélection groupée, import à enregistrer) : collantes en bas du contenu, 80 px au-dessus du bord sur téléphone (au-dessus de la barre d'onglets), 16 px sur ordinateur.

## Elevation & Depth

Le système est plat au repos. La profondeur vient de la clarté des surfaces (barre latérale < fond < carte < couche en sombre ; gris perle < blanc en clair) et des filets d'un pixel. L'ombre n'apparaît que sur ce qui flotte au-dessus du contenu, et d'un trait très fin sur l'élément actif d'un contrôle segmenté.

### Shadow Vocabulary
- **Couche** (`box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.35)`) : popovers, sélecteur de catégorie, menus.
- **Barre flottante** (`box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.4)`) : barres d'action collantes de la table et de l'import.
- **Info-bulle et toast** (`box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.35)`) : info-bulles des graphiques, notifications.
- **Segment actif** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.12)`, 0.1 pour la navigation) : onglet actif d'un contrôle segmenté, entrée active de la barre latérale. Un trait, pas une élévation.

### Named Rules
**The Plat au Repos Rule.** Cartes, tableaux, champs et boutons n'ont aucune ombre. Une ombre signale une couche qui recouvre le contenu et peut se refermer.

## Shapes

Coins généreux et réguliers, dérivés d'un seul rayon de base (`--radius` 12 px) : 10 px pour les badges et segments intérieurs, 12 px pour les boutons, champs, contrôles segmentés et entrées de navigation, 16 px pour les cartes, couches et bandeaux. Les pastilles de catégorie, compteurs et puces de filtre sont entièrement arrondis. Le logo est un carré indigo à coins de 7/24. Tous les contours sont des filets d'un pixel ; aucune bordure épaisse ni accent latéral coloré.

## Components

### Buttons
Nets et discrets ; un seul bouton plein par zone.
- **Shape:** coins de 12 px, hauteur 36 px (32 px en `sm`, 44 px en `lg`), icône 16 px avec 8 px d'écart.
- **Primary:** fond indigo, texte presque blanc, 14 px graisse 500. Survol à 88 % d'opacité, appui à 80 %.
- **Hover / Focus:** transitions de couleur 150 ms ; focus clavier par anneau `ring` 2 px décalé de 2 px.
- **Outline:** fond `card`, filet `input`, survol `accent`. **Ghost:** texte atténué, survol `accent` et texte plein. **Destructive:** fond rouge, réservé à la suppression confirmée. **Link:** `primary-text`, souligné au survol.
- **Disabled:** 50 % d'opacité, sans pointeur.

### Chips
- **Badges** : coins 10 px, 12 px graisse 500, fond voilé et texte de la même teinte (`primary-soft`/`primary-text`, `income-soft`/`income`, `warning-soft`/`warning`, `danger-soft`/`destructive`), ou neutre (`secondary`) et outline.
- **Puces de filtre** : 28 px, entièrement arrondies, voile indigo, croix de retrait 14 px ; « Tout effacer » en bouton fantôme à côté.
- **Compteur « à ranger »** : pilule ambre voilée, 11 px graisse 600, plafonnée à « 99+ ».

### Cards / Containers
- **Corner Style:** 16 px.
- **Background:** `card`.
- **Shadow Strategy:** aucune (voir Elevation & Depth).
- **Border:** filet `border` d'un pixel.
- **Internal Padding:** 20 px ; titre 15 px graisse 600 ; description en `muted-foreground`.

### Inputs / Fields
- **Style:** fond `card`, filet `input`, coins 12 px, hauteur 36 px, 12 px de marge latérale ; survol : bordure `muted-foreground` à 40 %.
- **Focus:** bordure `ring` et halo 3 px `ring` à 25 %, transition 150 ms.
- **Error / Disabled:** `aria-invalid` passe la bordure en `destructive` avec halo rouge à 20 % ; désactivé à 50 %.

### Navigation
- **Barre latérale** : entrées de 36 px, coins 12 px, icône 18 px, texte 14 px atténué ; survol `accent` ; entrée active sur fond `card`, texte plein graisse 500 et trait d'ombre de segment.
- **Barre d'onglets** : icône 22 px au-dessus d'un libellé court 11 px ; actif en `primary-text` graisse 500 ; compteur ambre accroché à l'icône d'« À ranger ».
- **Contrôle segmenté** (Mois / Année / Tout / Dates, bascules) : piste `muted` 36 px à 4 px de marge, segment actif `card` avec trait d'ombre.

### Tables
- En-têtes 36 px, 12 px graisse 500 atténués ; cellules à 12 px de marge latérale, marge verticale pilotée par la densité.
- Filet sous chaque ligne, survol `accent` à 50 %, ligne sélectionnée en `primary-soft`.
- Édition en place : la cellule devient champ sans changer de hauteur ; l'icône calendrier des dates n'apparaît qu'au survol ou au focus (opacité 0.6).
- Montants alignés à droite, `num`, vert si entrée, couleur du texte sinon.

### Bandeau « à ranger »
Lien pleine largeur, coins 16 px, fond `warning-soft`, icône boîte ambre, « **N** opérations sans catégorie » à gauche, « Ranger → » ambre graisse 500 à droite ; la flèche avance de 2 px au survol. Il n'apparaît que s'il reste des opérations sans catégorie.

### Proposition de règle
Après une catégorisation manuelle, une ligne 12 px atténuée apparaît sous la cellule (fondu et glissé de 4 px, 200 ms) : icône baguette, « Toujours classer « MOTIF » en Catégorie ? », croix pour l'écarter. Survol en voile indigo. Elle ne bloque rien et ne revient pas une fois écartée.

### Graphiques
Barres pleines (`chart-1` sorties, `chart-2` entrées), grille horizontale seule en `chart-grid`, axes en texte atténué 11 px, info-bulle en couche. Aucune animation au chargement. Répartition par catégorie : nom, montant `num`, part en %, et barre de 4 px dans la couleur de la catégorie.

### Toasts
Fond `popover`, filet `border`, coins 16 px, ombre d'info-bulle ; bouton d'action indigo. Messages courts en français (« Règle créée : « PICARD » → Alimentation »).

### Motion
Transitions d'état 150 ms (couleur, bordure, halo) ; couches et propositions qui apparaissent en 150 à 200 ms (fondu, léger zoom 95 % ou glissé de 4 à 8 px). Squelettes de chargement en pulsation sur `muted`. Sous `prefers-reduced-motion`, toutes les durées tombent à 0.01 ms.

## Do's and Don'ts

### Do:
- **Do** réserver l'indigo (`primary`, `primary-text`, `primary-soft`) aux actions et à la sélection.
- **Do** afficher toute entrée d'argent en `income` et tout montant en `num`, formaté en fr-FR.
- **Do** signaler ce qui reste à ranger en ambre (`warning`, `warning-soft`), avec un chemin direct vers « À ranger ».
- **Do** garder les variations entre périodes en couleur de texte, avec une flèche et le montant de comparaison.
- **Do** donner à chaque nouveau jeton une valeur claire et une valeur sombre réglées séparément, en oklch.
- **Do** employer le vocabulaire Entrées / Sorties, « à ranger », « opérations », et une interface entièrement en français.
- **Do** limiter les mouvements à 150–250 ms et désactiver l'animation de chargement des graphiques (`isAnimationActive={false}`).
- **Do** placer le contenu dans 1200 px au plus, barre latérale de 15rem à partir de 1024 px, barre d'onglets en dessous.

### Don't:
- **Don't** utiliser le rouge pour une sortie d'argent, une hausse de dépenses ou une variation : le rouge signifie erreur ou suppression.
- **Don't** donner à une catégorie une teinte rouge, ambre, verte ou indigo.
- **Don't** poser d'ombre sur une carte, un tableau, un champ ou un bouton au repos.
- **Don't** introduire de notion de solde, de budget ou de plafond dans l'interface.
- **Don't** aligner des cartes KPI identiques ni proposer de thèmes de couleur nommés : Système, Clair, Sombre suffisent.
- **Don't** charger de police ou de ressource depuis un CDN.
