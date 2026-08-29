# HAMTECH Paie — Logiciel de Gestion de la Paie (Algérie)

Application desktop de gestion de la paie conforme à la réglementation algérienne (CNAS, IRG, Loi 90-11). Construite avec **Tauri 2.x** (Rust + React/TypeScript), elle importe les données depuis PCPAIE et offre une interface moderne pour le calcul des bulletins de salaire, la simulation en temps réel et le paramétrage complet des règles de calcul.

## Fonctionnalités

### Gestion des employés
- Liste paginée avec recherche et filtres avancés (actif, poste, sexe, contrat, classe, échelon, dates d'embauche/sortie)
- Fiche employé détaillée (informations personnelles, professionnelles, paie)
- Synchronisation avec les postes/profils de paie
- Import depuis PCPAIE (DBF/SQLite)

### Profils de paie (Postes)
- 78 profils de paie configurables
- Rubriques associées par poste (taux, valeurs par défaut)
- Masse salariale par poste

### Rubriques de paie
- **Page dédiée** avec 2 onglets : **Rubriques** et **Paramètres Salaires**
- **Table complète** des 999 rubriques avec filtres par classe, recherche
- **Édition inline** : libellé, formule, classe, flags (brut, imposable, cotisable, total)
- **Test de formule** en temps réel (bouton fiole)
- **Création/suppression** de rubriques
- **Modal de sélection** avec recherche rapide sur les 999 rubriques (plus de select limité à 500)

### Paramètres Salaires (onglet dédié)
Configuration globale appliquée à tous les calculs de paie :

**Rubriques système** (codes de totalisation configurables) :
- Rubrique total cotisable (défaut: R500)
- Rubrique total imposable (défaut: R652)
- Rubrique total brut (défaut: R763)
- Rubrique total gains (défaut: R765)
- Rubrique total retenues (défaut: R767)
- Rubrique net à payer (défaut: R770)

**Taux réglementaires** :
- Taux CNAS salarié (défaut: 9%)
- Taux CNAS employeur (défaut: 26%)
- Abattement IRG (défaut: 40%, min 1000, max 1500)
- Seuil exonération IRG (défaut: 30 000 DA)
- SNMG (défaut: 24 000 DA)
- Heures mensuelles (défaut: 173.33)
- Jours mensuels (défaut: 30)
- Réduction familiale (défaut: 1 500 DA/pers)

**Visualisation des flags** :
- Liste des rubriques cotisables (`is_secu_s`)
- Liste des rubriques imposables (`is_impos`)
- Liste des rubriques de totalisation (`is_total`) avec ordre de calcul

### Simulateur de paie en temps réel
- **3 colonnes redimensionnables** (glisser-déposer) :
  1. **Catalogue** : 999 rubriques avec recherche par code/libellé et filtres par classe
  2. **Table de simulation** : rubriques sélectionnées avec édition inline (montant, nombre)
  3. **Résultat** : calcul automatique avec net à payer, totaux, gains/retenues détaillés
- **Chargement automatique** du profil de l'employé lors de la sélection
- **Calcul en temps réel** (500ms debounce après chaque modification)
- **Aperçu bulletin** PDF depuis le simulateur
- **Ajout/suppression** de rubriques à la volée

### Calcul de la paie
- Moteur de formules PCPAIE complet : `R[NNN]`, `T[NN]`, `IRG(base, prorata)`, `TOTAL(...)`, `IF(...)`
- 21 variables T[] (heures, jours, prorata, flags cotisation...)
- Calcul par ordre `ord_clc` avec accumulation des totaux
- Prise en charge du prorata (absences, congés, reprises)
- 3 types d'absence mutuellement exclusifs :
  - **Absence** (R033) : déduit du prorata, non payé
  - **Maladie** (R089) : non déduit du prorata, non payé
  - **Congé** (R099) : compte comme travaillé, payé (R100)
- Heures supplémentaires (50%, 75%, 100%)
- Barème IRG Loi de Finances 2022 : exonération ≤ 30 000 DA, zone de transition 30 000-35 000 DA
- Nouveau calcul IRG 2025 (R971-R974) avec réduction pour charges de famille
- Chargement des valeurs persistantes depuis TOT-PAIE (template employé)

### Bulletin de paie (PDF)
- Aperçu imprimable avec en-tête entreprise
- Colonnes **Code | Libellé | Base | Taux | Montant**
- Séparation Gains / Retenues
- Barre de totaux : Brut, Cotisable, Imposable, Retenues
- Net à payer mis en évidence
- Affichage des cotisations patronales (CNAS employeur)

### Primes & Bonus
- Primes individuelles ou globales (par poste, catégorie, tous)
- Primes en montant fixe ou pourcentage
- Application automatique sur les bulletins
- Possibilité d'ignorer une prime pour un mois donné

### Pointeuse & Présence
- Pointage par PIN (borne physique)
- Import des données de présence
- Calcul automatique des heures travaillées
- Gestion des congés et absences

### Tableau de bord
- Statistiques : effectif total, actifs, masse salariale
- Répartition par section, structure, poste
- Évolution mensuelle

## Architecture technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Rust + Tauri 2.x + rusqlite |
| Base de données | SQLite (WAL mode, indexes optimisés) |
| Import | PCPAIE (DBF/SQLite) → SQLite |
| PDF | Impression navigateur (window.print) |

### Structure du projet

```
src/
├── components/
│   ├── DashboardPage.tsx      # Tableau de bord
│   ├── EmployeesPage.tsx      # Gestion employés + filtres
│   ├── PostesPage.tsx         # Profils de paie
│   ├── RubriquesPage.tsx      # Rubriques + Paramètres Salaires + Modal picker
│   ├── SimulatorPage.tsx      # Simulateur temps réel (3 colonnes)
│   ├── SalaryPage.tsx         # Calcul de paie
│   ├── PayslipPDF.tsx         # Bulletin de paie
│   ├── BonusesPage.tsx        # Primes
│   ├── AttendancePage.tsx     # Présence
│   ├── LeavesPage.tsx         # Congés
│   ├── ShiftsPage.tsx         # Horaires
│   ├── PointeusePage.tsx      # Pointeuse
│   └── SettingsPage.tsx       # Paramètres
├── lib/
│   ├── api.ts                 # Interface Tauri (invoke)
│   └── utils.ts               # Formatage (devise, dates)
src-tauri/
└── src/
    ├── lib.rs                 # Commandes Tauri (CRUD, calcul, salary_settings)
    ├── calculator.rs          # Moteur de calcul + SalarySettings struct
    ├── db.rs                  # Schéma SQLite + salary_settings table
    ├── import.rs              # Import PCPAIE
    └── native_import.rs       # Import natif DBF
```

## Documentation technique

Le fichier **[PAIE-SYSTEM.md](PAIE-SYSTEM.md)** documente en détail toute la logique de calcul :

- Architecture du moteur de calcul séquentiel
- Les 3 types de variables (R[], T[], M/N)
- Les 7 classes de rubriques et 6 flags système
- Table de référence complète des 21 variables T[]
- Chaîne de calcul étape par étape (10 phases, ord 100→99900)
- Logique des 3 types d'absence (absence/maladie/congé)
- Logique du prorata (R200 vs R655)
- Cotisations CNAS détaillées (salarié 9% + employeur 26%)
- Barème IRG Loi de Finances 2022 avec exemple chiffré
- Nouvelles rubriques 2025 (R960-R984)
- Masse salariale et charges employeur
- Paramètres globaux configurables
- Catalogue complet des 75 rubriques actives avec formules

## Installation

### Prérequis
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri CLI 2.x](https://tauri.app/v2/guides/getting-started/setup/)

### Démarrage

```bash
npm install
npm run tauri dev
```

### Build production

```bash
npm run tauri build
```

## Données réglementaires (Algérie 2025)

| Élément | Valeur |
|---------|--------|
| SNMG | 24 000 DA brut/mois |
| CNAS salarié | 9% (1.5% + 6.75% + 0.5% + 0.25%) |
| CNAS employeur | 26% (12.5% + 1.25% + 11% + 1% + 0.25%) |
| Barème IRG | 0% → 35% (6 tranches, LF 2022) |
| Exonération IRG | Base ≤ 30 000 DA |
| Abattement IRG | 40% (min 1 000, max 1 500 DA) |
| Réduction famille | 1 500 DA/mois/personne à charge |
| HS jour ouvrable | +50% |
| HS nuit (21h-5h) | +75% |
| HS jour repos/férié | +100% |
| Durée légale | 40h/semaine (173.33h/mois, 30 jours) |

## Sources réglementaires
- Loi n° 90-11 du 21 avril 1990 (relations de travail)
- Décret exécutif n° 15-236 du 3 septembre 2015 (taux CNAS)
- Décret exécutif n° 97-473 (durée légale du travail)
- Loi de Finances 2022 (barème IRG)
- CIDTA (Code des Impôts Directs)

## Licence

Usage interne — HAMTECH
