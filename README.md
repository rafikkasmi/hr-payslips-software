# HAMTECH Paie — Logiciel de Gestion de la Paie (Algérie)

Application desktop de gestion de la paie conforme à la réglementation algérienne (CNAS, IRG, Loi 90-11). Construite avec **Tauri 2.x** (Rust + React/TypeScript), elle importe les données depuis PCPAIE et offre une interface moderne pour le calcul des bulletins de salaire.

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
- **Page dédiée** avec table complète, filtres par classe, recherche
- **Édition inline** : libellé, formule, classe, flags (brut, imposable, cotisable, total)
- **Test de formule** en temps réel (bouton fiole)
- **Création/suppression** de rubriques
- 999 rubriques PCPAIE + 25 rubriques modernes (R960-R984)

### Rubriques modernes (conformes 2025)
| Catégorie | Rubriques | Détail |
|-----------|-----------|--------|
| CNAS salarié 9% | R960-R964 | Maladie 1.5%, Retraite 6.75%, Chômage 0.5%, Retr. antic. 0.25% |
| CNAS employeur 26% | R965-R970 | Maladie 12.5%, AT 1.25%, Retraite 11%, Chômage 1%, Retr. antic. 0.25% |
| IRG 2025 | R971-R974 | Base imposable, réduction famille (1500 DA/pers.), barème progressif |
| Prime d'ancienneté | R975-R977 | Années × taux × base / 100 |
| Transport & Panier | R978-R981 | Forfait transport, panier modernisé (120 DA/jour) |
| 13ème mois | R982 | 1/12 du salaire de base |
| Prime de bilan | R983 | Manuel |
| Indemnité licenciement | R984 | ½ mois × années d'ancienneté (art. 73 loi 90-11) |

### Calcul de la paie
- Moteur de formules PCPAIE complet : `R[NNN]`, `T[NN]`, `IRG(base, prorata)`, `TOTAL(classe,...)`, `IF(...)`
- 21 paramètres T[] (heures, jours, prorata, flags cotisation...)
- Calcul par ordre `ord_clc` avec accumulation des totaux
- Prise en charge du prorata (absences, congés, reprises)
- Heures supplémentaires (50%, 75%, 100%)
- Barème IRG 2025 : 0% (0-20K), 23% (20-40K), 27% (40-80K), 30% (80-160K), 33% (160-320K), 35% (>320K)
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
- Calcul automatique des heures travaquées
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
│   ├── RubriquesPage.tsx      # Rubriques (édition/test)
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
    ├── lib.rs                 # Commandes Tauri (CRUD, calcul)
    ├── calculator.rs          # Moteur de calcul de paie
    ├── db.rs                  # Schéma SQLite + indexes
    ├── import.rs              # Import PCPAIE
    └── native_import.rs       # Import natif DBF
```

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
| Barème IRG | 0% → 35% (6 tranches) |
| Réduction famille | 1 500 DA/mois/personne à charge |
| HS jour ouvrable | +50% |
| HS nuit (21h-5h) | +75% |
| HS jour repos/férié | +100% |
| Durée légale | 40h/semaine (173.33h/mois) |

## Sources réglementaires
- Loi n° 90-11 du 21 avril 1990 (relations de travail)
- Décret exécutif n° 15-236 du 3 septembre 2015 (taux CNAS)
- Décret exécutif n° 97-473 (durée légale du travail)
- Loi de Finances 2022 (barème IRG)
- CIDTA (Code des Impôts Directs)

## Licence

Usage interne — HAMTECH
