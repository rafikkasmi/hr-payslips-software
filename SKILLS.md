# HAMTECH Paie — Documentation Technique Complète

> Application de gestion de paie algérienne (HAMTECH Paie) construite avec **Tauri 2 + React 19 + Rust**.
> Importe nativement les fichiers PCPAIE (dBase III/IV `.DTA`/`.DBT`) et calcule les bulletins de paie.

---

## 1. Stack Technique

| Couche         | Technologie                                      |
|----------------|--------------------------------------------------|
| Frontend       | React 19, TypeScript, Vite 8, Tailwind CSS 4     |
| Icônes         | lucide-react                                     |
| Backend        | Rust (edition 2021, MSRV 1.77.2)                 |
| Framework      | Tauri 2.11.3 (avec devtools)                     |
| Base de données| SQLite via rusqlite 0.32 (feature `bundled`)     |
| Parallélisme   | rayon 1 + `std::thread::scope`                   |
| Plugins Tauri  | tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-log |
| Autres crates  | serde, serde_json, chrono, uuid                  |

### Commandes de build

```bash
# Développement (lance Vite + Cargo en parallèle)
npx tauri dev

# Build production
npx tauri build

# Type-check frontend seul
npx tsc --noEmit

# Build frontend seul
npm run build    # tsc -b && vite build

# Lint
npm run lint     # oxlint
```

### Structure des dossiers

```
hr-payslips-software-main/
├── src/                          # Frontend React
│   ├── components/
│   │   ├── SetupWizard.tsx       # Wizard d'import + jauge de progression temps réel
│   │   ├── EmployeesPage.tsx     # Page employés (info, famille, congés, prêts, événements, salary, primes)
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts                # Wrapper Tauri invoke() — toutes les commandes
│   │   └── utils.ts              # formatCurrency() et utilitaires
│   └── App.tsx                   # Router principal
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Config Tauri (identifier: com.hamtech.paie)
│   └── src/
│       ├── lib.rs                # Point d'entrée — toutes les commandes Tauri (~3000 lignes)
│       ├── db.rs                 # Schéma SQLite (32 tables) + init_db()
│       ├── dbf.rs                # Parser dBase III/IV (.DTA + .DBT memo)
│       ├── native_import.rs      # Import PCPAIE natif — pipeline parallèle 5 phases
│       ├── import.rs             # Import SQLite + seed_postes() + calculs
│       └── calculator.rs         # Moteur de calcul de paie (formules rubriques)
└── package.json
```

---

## 2. Format PCPAIE — Fichiers dBase

PCPAIE est un logiciel de paie algérien qui stocke ses données dans des fichiers dBase III/IV:
- **`.DTA`** — fichiers de données dBase (structure fixe, records de taille constante)
- **`.DBT`** — fichiers memo associés (champs texte longs, type M/W)
- **`.TRI`** — fichiers d'index (non utilisés par notre app)

### Format dBase III/IV — Détails techniques

- **Header**: 32 bytes — magic byte `0x03` (dBase III) ou `0x83` (dBase III + memo), nombre de records (u32 LE), offset des données (u16 LE), taille de record (u16 LE).
- **Field descriptors**: 32 bytes chacun — nom (11 bytes, null-terminated), type (1 byte: C/N/L/D/M), longueur, decimals.
- **Records**: précédés d'un flag de suppression (`0x2A` = supprimé, `0x20` = actif). Taille fixe = somme des longueurs de champs + 1.
- **Memo (.DBT)**: blocs de 512 bytes, indexés par numéro dans le champ M. Le fichier .DBT est ouvert automatiquement si le .DTA contient des champs de type M.

### Fichiers PCPAIE connus

| Fichier           | Description                          | Records (approx.) | Importé ? |
|-------------------|--------------------------------------|-------------------|-----------|
| `RUBRIQUEX.DTA`   | Rubriques de paie + formules         | ~120              | ✅ Phase 1 |
| `VALEURS.DTA`     | Valeurs de lookup (codes → libellés) | ~500              | ✅ Phase 1 |
| `DOSSIER.DTA`     | Informations société (1 record)      | 1                 | ✅ Phase 1 |
| `GRILLE.DTA`      | Grille salariale (montants/indices)  | ~82               | ✅ Phase 1 |
| `PAIE_REF.DTA`    | Périodes de paie (mois/signe)        | ~809              | ✅ Phase 1 |
| `PERS0.DTA`       | Employés — 80 champs (base)          | ~200              | ✅ Phase 2 |
| `PERS1.DTA`       | Affectations rubriques (COD_RUB01-120 + VAL_RUB01-120) | ~200 | ✅ Phase 3 |
| `PERS2.DTA`       | Données civiles/familiales — 61 champs | ~200            | ✅ Phase 3 |
| `ENFANTS.DTA`     | Enfants des employés                 | ~377              | ✅ Phase 3 |
| `EVENTS.DTA`      | Événements de carrière               | ~55               | ✅ Phase 3 |
| `PAIES.DTA`       | Historique de paie (bulletins)       | ~1.5M             | ✅ Phase 4 |
| `CONGES.DTA`      | Historique des congés                | ~1.59M            | ✅ Phase 4 |
| `PRETS.DTA`       | Prêts des employés                   | ~1611             | ✅ Phase 5 |
| `PARAMETR.DTA`    | Paramètres système                   | —                 | ❌ Non importé |
| `USERSN.DTA`      | Utilisateurs PCPAIE                  | —                 | ❌ Non importé |

### Pièges connus du format PCPAIE

1. **Noms de champs dBase limités à 10 caractères** — les noms sont tronqués (ex: `AFFECTATIO` au lieu de `AFFECTATION`, `ORG_PEMPLY` au lieu de `ORG_PEMPLOYEUR`).
2. **PERS1.DTA — nommage des champs COD_RUB** — Les champs peuvent être nommés `COD_RUB01` (2 digits) ou `COD_RUB001` (3 digits) selon la version. Notre parser utilise `eq_ignore_ascii_case` qui gère les deux cas.
3. **Codes vs libellés** — De nombreux champs dans PERS0 (UNITE, AFFECTATIO, CONTRAT, SECTION, STRUCTURE, CATEGORIE, DIPLOME) contiennent des codes bruts. Les libellés traduits sont dans `VALEURS.DTA` (table de lookup). La jointure se fait via `lookup_values` avec `table_name` (UNT, AFF, CON, SEC, CAT, etc.).
4. **Dates au format texte** — Les dates sont stockées en chaînes de caractères (format `DDMMYY` ou similaire), pas en timestamps Unix.
5. **Booléens** — Stockés comme caractères (`T`/`F` ou `Y`/`N`), la fonction `get_bool()` gère la conversion.
6. **Records supprimés** — Le flag `0x2A` indique un record supprimé ; `read_record()` les skip automatiquement.

---

## 3. Schéma Base de Données (32 tables SQLite)

### Tables principales

#### `employees` (PERS0 + PERS2 — ~90 colonnes)
Champs de base: `matricule`, `nom`, `prenom`, `sit_fam`, `nbre_enf`, `naiss_date`, `dte_entree`, `dte_sortie`, `actif`, `sexe`, `no_grille`, `categorie`, `section`, `echelon`, `classe`, `structure`, `unite`, `affectatio`, `contrat`, `sect1`, `code_caisss`, `code_irg`, `code_cnas`, `no_cnas`, `n_secu_sle`, `no_compte`, `cod_regl`, `pointeuse_pin`, `shift_id`.

Champs PERS0 supplémentaires: `motif_sort`, `dte_cont_d`, `dte_cont_f`, `dte_repris`, `nbr_enfp10`, `nbr_enfm10`, `no_mutuel`, `mutu_dted`, `mutu_dtef`, `conj_trav`, `ok_intemp`, `ok_nat_etr`, `attrib1-3`, `categ_sp`, `diplome`, `code_grill`, `gestion`, `lock_val`, `conge`, `sorti`.

Champs PERS2 (civiles/familiales): `adresse`, `adresse2`, `telephone`, `e_mail`, `n_id_nat`, `naiss_lieu`, `n_act_nais`, `comun_nais`, `code_post`, `fil_p_pere`, `fil_n_mere`, `fil_p_mere`, `filiation`, `cnationalt`, `conj_nom`, `conj_datem`, `nom_p_conj`, `cin_no`, `cin_d_le`, `cin_d_a`, `pc_no`, `pc_d_le`, `pc_d_a`, `pass_no`, `pass_d_le`, `pass_d_a`, `remarque`, `groupage`, `date_fnc`, `date_sec`, `date_das`, `date_unt`, `date_aff`, `date_dip`, `date_cat`, `date_emp`.

#### `rubriques` (RUBRIQUEX)
Clé primaire: `code` (TEXT, format 3 digits `001`, `002`, ...). ~40 colonnes: `libelle`, `alibelle`, `formule`, `classe`, `v_min`, `v_max`, flags booléens (`is_init`, `is_regular`, `is_brut`, `is_impos`, `is_secu_s`, `is_total`, `is_imp`, `is_locked`, `calcul`, `manuelle`), ordres (`ord_bul`, `ord_clc`, `ord_rec`, `ord_jrn`), paramètres de calcul (`par_1`, `par_2`, `rc_nb_base`, `pointer`, `type_pcc`, `cd_nb_base`, `cd_taux`, `br_comp`, `br_tiers`, etc.).

#### `paies` (PAIES — ~1.5M records)
`employee_id` (FK), `mois`, `matricule`, `montants` (TEXT — chaîne sérialisée de tous les montants de rubriques), `sit_fam`, `nbre_enf`, `no_grille`, `code_irg`, `code_cnas`, `nbr_enf_af`, `nbr_prs_ch`, `nbr_jr_ouv`, `nbr_hr_ouv`, `sect1`, `structure`, `classe`, `unite`, `affectatio`, `c_date`, `c_time`.

### Tables de lookup

#### `lookup_values` (VALEURS)
`table_name` (UNT, AFF, CON, SEC, CAT, DIP, etc.), `code`, `libelle`, `aux_nom`, `compte`, `compte_ccp`, `no_agence`, `selection`. Jointure: `lookup_values.table_name='UNT' AND lookup_values.code = employees.unite`.

#### `company_info` (DOSSIER — 1 record)
`doss_nom`, `doss_rue`, `doss_vil`, `doss_nsecu`, `doss_skey1-4`, `doss_nger`, `doss_pger`, `clot_mois`, `clot_annee`.

### Tables de paie calculée

| Table                       | Description                                    |
|-----------------------------|------------------------------------------------|
| `salary_calculations`       | Résultats de calcul de paie (brut, net, IRG)   |
| `salary_lines`              | Lignes détaillées d'un bulletin calculé        |
| `employee_salary_history`   | Historique des salaires par employé            |
| `employee_rubriques`        | Affectations rubriques → employés (PERS1)      |
| `employee_rubrique_values`  | Valeurs rubriques (VAL_RUB01-120 de PERS1)     |
| `employee_rubrique_overrides`| Surcharges manuelles de rubriques              |
| `postes`                    | Postes (groupes de rubriques)                  |
| `poste_rubriques`           | Rubriques par poste                            |

### Tables de gestion RH

| Table                       | Description                                    |
|-----------------------------|------------------------------------------------|
| `shifts`                    | Horaires de travail (config JSON)              |
| `attendance`                | Présence journalière (pointeuse)               |
| `leaves`                    | Congés manuels                                 |
| `leave_history`             | Historique congés (CONGES.DTA — 1.59M records) |
| `bonuses`                   | Primes et retenues                             |
| `bonus_assignments`         | Affectations primes → employés                 |
| `bonus_applications`        | Application des primes sur un bulletin         |
| `bonus_targets`             | Cibles des primes (employés/groupes)           |
| `bonus_skips`               | Primes ignorées par employé                    |
| `overtime_entries`          | Heures supplémentaires (journalier)            |
| `overtime_monthly`          | Heures supplémentaires (mensuel)               |

### Tables nouvelles (Phase 3-5)

| Table                       | Source          | Description                          |
|-----------------------------|-----------------|--------------------------------------|
| `employee_children`         | ENFANTS.DTA     | Enfants des employés                 |
| `employee_loans`            | PRETS.DTA       | Prêts et avances                     |
| `salary_grid`               | GRILLE.DTA      | Grille salariale (montant/indice)    |
| `career_events`             | EVENTS.DTA      | Événements de carrière               |
| `pay_periods`               | PAIE_REF.DTA    | Périodes de paie                     |
| `pointeuse_users`           | user.dat        | Utilisateurs pointeuse biométrique   |

### Tables système

| Table           | Description                                    |
|-----------------|------------------------------------------------|
| `app_settings`  | Clé/valeur (initialized, pcpaie_path, etc.)   |
| `global_params` | Paramètres globaux de calcul                   |

---

## 4. Pipeline d'Import Natif (native_import.rs)

L'import utilise un pipeline **5 phases** avec parallélisme maximal via `std::thread::scope` + `rayon`.

### Architecture du pipeline

```
Phase 1 (5 threads parallèles) — 10% du progress
├── RUBRIQUEX.DTA → rubriques
├── VALEURS.DTA   → lookup_values
├── DOSSIER.DTA   → company_info
├── GRILLE.DTA    → salary_grid
└── PAIE_REF.DTA  → pay_periods

Phase 2 (séquentiel) — 10% → 25%
└── PERS0.DTA → employees (INSERT OR REPLACE, tous les 80 champs)

Phase 3 (4 threads parallèles) — 25% → 35%
├── PERS1.DTA → employee_rubriques + employee_rubrique_values
├── PERS2.DTA → employees (UPDATE, tous les 61 champs)
├── ENFANTS.DTA → employee_children
└── EVENTS.DTA → career_events

Phase 4 (2 threads parallèles, chunks rayon) — 35% → 85%
├── PAIES.DTA  → paies (chunks de 5000, rayon par_iter pour parsing)
└── CONGES.DTA → leave_history (chunks de 5000, rayon par_iter)

Phase 5 (séquentiel) — 85% → 100%
├── PRETS.DTA → employee_loans
├── seed_postes() — génère les postes à partir des paies
└── Finalisation (app_settings)
```

### Progression temps réel

Chaque phase émet des événements Tauri `import-progress` via le callback:
```rust
progress_cb(phase: &str, step: &str, current: usize, total: usize, message: &str, overall_percent: f64)
```

Le frontend (`SetupWizard.tsx`) écoute l'événement `import-progress` avec `@tauri-apps/api/event` et affiche:
- Pourcentage global (0% → 100%)
- Compteur de records (current/total)
- Message de progression
- Timeline visuelle des étapes

### Connexions SQLite parallèles

Chaque thread de Phase 1, 3 et 4 ouvre sa **propre connexion SQLite** via `open_import_conn(&db_path)` pour éviter le verrouillage. Le chemin de la DB est obtenu via `PRAGMA database_list` sur la connexion principale.

La fonction `open_import_conn()` configure les PRAGMA critiques:
```rust
fn open_import_conn(db_path: &str) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("conn open: {}", e))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000; PRAGMA foreign_keys=OFF;")
        .map_err(|e| format!("PRAGMA: {}", e))?;
    Ok(conn)
}
```

- **WAL mode** — permet des lectures concurrentes pendant les écritures
- **busy_timeout=30000** — attend 30s au lieu d'échouer immédiatement si la DB est verrouillée
- **foreign_keys=OFF** — désactive les FK pendant l'import (les données PCPAIE peuvent contenir des matricules orphelins dans CONGES/PRETS qui n'existent pas dans PERS0)

La connexion principale (`app_conn`) désactive aussi les FK en début d'import (`PRAGMA foreign_keys=OFF`) et les réactive à la fin (`PRAGMA foreign_keys=ON`).

### Import des gros fichiers (PAIES, CONGES)

Pour les fichiers de 1.5M+ records:
1. Lecture par chunks de 5000 records
2. Parsing en parallèle avec `rayon::par_iter()` (utilise tous les cœurs CPU)
3. Insertion SQLite en transaction (`BEGIN`/`COMMIT`) par chunk
4. Progression émise après chaque chunk

### Map employés pour PAIES

Avant l'import de PAIES.DTA, une `HashMap<String, i64>` (matricule → employee_id) est construite pour éviter une requête SQL par record (1.5M lookups → 1 requête + lookup mémoire).

### Pièges de l'import parallèle (leçons apprises)

1. **Compter les colonnes vs les `?`** — Une erreur `N values for M columns` se produit quand le nombre de `?` dans VALUES ne correspond pas au nombre de colonnes listées. Toujours compter manuellement pour les gros INSERT.
2. **`database is locked`** — Sans `PRAGMA busy_timeout`, les connexions parallèles échouent immédiatement si la DB est verrouillée par une autre connexion. Toujours définir `busy_timeout=30000` minimum.
3. **`FOREIGN KEY constraint failed`** — Les données PCPAIE réelles contiennent des enregistrements orphelins (CONGES/PRETS avec des matricules qui n'existent pas dans PERS0). Désactiver les FK pendant l'import avec `PRAGMA foreign_keys=OFF`.
4. **`cannot start a transaction within a transaction`** — Si la connexion principale (`app_conn`) est déjà dans une transaction, un `BEGIN` supplémentaire échoue. Utiliser une connexion séparée (`open_import_conn`) pour chaque phase qui fait ses propres transactions.

---

## 5. Parser dBase (dbf.rs)

### API publique

```rust
// Ouvre un .DTA (et .DBT associé automatiquement si champs memo)
let mut reader = DbfReader::open("PERS0.DTA")?;

// Nombre total de records (incluant supprimés)
let count = reader.record_count(); // u32

// Lit le record suivant (skip les supprimés automatiquement)
// Retourne Vec<(String field_name, DbfValue)>
while let Some(record) = reader.read_record()? {
    let nom = get_str(&record, "NOM");        // String (trim)
    let salaire = get_num(&record, "SALAIRE"); // f64
    let actif = get_bool(&record, "ACTIF");    // bool
}
```

### Types DbfValue

Le parser supporte les types dBase:
- **C** (Character) → `DbfValue::String`
- **N** (Numeric) → `DbfValue::Number(f64)`
- **L** (Logical) → `DbfValue::Boolean(bool)`
- **D** (Date) → `DbfValue::String` (format texte brut)
- **M/W** (Memo) → `DbfValue::String` (lu depuis le fichier .DBT associé)

### Gestion des fichiers .DBT (memo)

Si le header dBase indique des champs de type M ou W, le parser ouvre automatiquement le fichier `.DBT` correspondant (même nom de stem, extension `.DBT`). Les champs memo sont lus par blocs de 512 bytes indexés par le numéro stocké dans le champ du record.

---

## 6. Moteur de Calcul de Paie (calculator.rs)

### Principe

Le calcul de paie pour un employé sur un mois donné:
1. **Charger les rubriques** assignées à l'employé (PERS1) ou à son poste
2. **Appliquer les surcharges** manuelles (`employee_rubrique_overrides`)
3. **Évaluer les formules** de chaque rubrique (le champ `formule` dans `rubriques`)
4. **Calculer les primes** actives pour la période (`bonuses` + `bonus_assignments`)
5. **Intégrer les heures supplémentaires** (`overtime_entries` / `overtime_monthly`)
6. **Produire le résultat**: total_brut, base_cotisable, IRG, net_payer + lignes détaillées

### Commandes Tauri de calcul

- `calculate_employee_salary(employee_id, period, input_values)` — Calcule pour un employé
- `calculate_all_salaries(period)` — Calcule pour tous les employés
- `save_salary_calculation(result)` — Sauvegarde le résultat
- `get_salary_history(employee_id)` — Historique des bulletins
- `get_pre_calc_summary(employee_id, period)` — Résumé pré-calcul (présence, primes, rubriques)
- `delete_month_calculations(period)` — Supprime les calculs d'un mois

---

## 7. API Tauri — Commandes (60+)

### Setup & Import
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `get_app_status`          | État de l'app (initialized, employee_count, etc.)|
| `scan_pcpaie_dir`         | Scanne un dossier PCPAIE (détecte .DTA ou .db)   |
| `import_pcpaie_folder`    | Import complet (native ou SQLite) avec progress  |
| `import_pcpaie_db`        | Import depuis un fichier SQLite PCPAIE           |
| `import_pointeuse_data`   | Import données pointeuse (user.dat + attlog)     |
| `scan_attlog_dir`         | Scanne un dossier de logs pointeuse              |

### Employés
| Commande                       | Description                                |
|--------------------------------|--------------------------------------------|
| `get_employees`                | Liste tous les employés (summary)          |
| `get_employee_detail`          | Détail complet (90 champs + lookups)       |
| `get_employee_children`        | Enfants d'un employé                       |
| `get_employee_leave_history`   | Historique des congés (CONGES.DTA)         |
| `get_employee_loans`           | Prêts d'un employé                         |
| `get_employee_events`          | Événements de carrière                     |
| `get_employee_current_rubriques`| Rubriques actuelles (assignées + overrides)|
| `update_employee_rubrique`     | Surcharger une rubrique                    |
| `get_employee_rubrique_history`| Historique des changements de rubrique     |

### Paie & Calcul
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `calculate_employee_salary` | Calculer le bulletin d'un employé              |
| `calculate_all_salaries`    | Calculer tous les bulletins d'un mois         |
| `save_salary_calculation`   | Sauvegarder un bulletin calculé               |
| `get_salary_history`        | Historique des bulletins d'un employé         |
| `get_all_salary_history`    | Historique global                              |
| `get_historical_payslip`    | Bulletin de paie historique (PAIES.DTA)       |
| `get_available_periods`     | Périodes disponibles                          |
| `get_pay_periods`           | Périodes de paie (PAIE_REF.DTA)               |
| `delete_month_calculations` | Supprimer les calculs d'un mois               |
| `get_pre_calc_summary`      | Résumé pré-calcul                             |

### Rubriques & Postes
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `get_rubriques`           | Liste toutes les rubriques                       |
| `create_rubrique`         | Créer une rubrique                               |
| `get_lookup_values`       | Valeurs de lookup                                |
| `get_postes`              | Liste des postes                                 |
| `get_poste_detail`        | Détail d'un poste                                |
| `create_poste`            | Créer un poste                                   |
| `update_poste`            | Modifier un poste                                |
| `delete_poste`            | Supprimer un poste                               |
| `update_poste_rubrique`   | Modifier une rubrique de poste                   |
| `assign_employee_to_poste`| Assigner un employé à un poste                   |

### Présence & Congés
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `get_attendance_calendar` | Calendrier de présence (mois)                    |
| `get_attendance`          | Données de présence                              |
| `get_leaves`              | Liste des congés manuels                         |
| `create_leave`            | Créer un congé                                   |
| `delete_leave`            | Supprimer un congé                               |
| `save_overtime_entry`     | Saisir des heures supp. (journalier)             |
| `save_overtime_monthly`   | Saisir des heures supp. (mensuel)                |
| `get_overtime`            | Lire les heures supplémentaires                  |

### Primes & Retenues
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `get_bonuses`             | Liste des primes                                 |
| `create_bonus`            | Créer une prime                                  |
| `create_enhanced_bonus`   | Créer une prime avancée (cibles, conditions)     |
| `update_bonus`            | Modifier une prime                               |
| `delete_bonus`            | Supprimer une prime                              |
| `get_active_bonuses_for_period` | Primes actives pour une période            |
| `get_skipped_bonuses`     | Primes ignorées                                  |

### Pointeuse
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `get_fuzzy_matches`       | Correspondances floues user→employé              |
| `link_user_to_employee`   | Lier un user pointeuse à un employé              |
| `auto_match_all`          | Auto-correspondance de tous les users            |
| `bulk_link_users`         | Liaison en masse                                 |

### Shifts
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `get_shifts`              | Liste des horaires                               |
| `create_shift`            | Créer un horaire                                 |
| `assign_shift`            | Assigner un horaire à un employé                 |

### Paramètres
| Commande                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `get_import_settings`     | Paramètres d'import                              |
| `save_import_settings`    | Sauvegarder les paramètres                       |

---

## 8. Frontend — Pages & Composants

### SetupWizard.tsx
- Wizard de configuration initial
- Sélection du dossier PCPAIE (dialog Tauri)
- Détection automatique: fichiers natifs `.DTA` vs base SQLite
- **Jauge de progression temps réel** — écoute l'événement `import-progress`
  - Affiche: pourcentage global, current/total, message, timeline des étapes
  - Phases visuelles: Tables indépendantes → Employés → PERS1/PERS2/ENFANTS/EVENTS → PAIES/CONGES → Prêts/Finalisation

### EmployeesPage.tsx
- Liste des employés avec recherche (nom, prénom, matricule)
- Modal de détail avec **8 onglets**:
  1. **Info** — 9 sections organisées (Identité, Filiation, Conjoint, Documents, Contact, Professionnel, Sécurité sociale, Dates de carrière, Divers)
  2. **Famille** — Table des enfants (ENFANTS.DTA)
  3. **Attendance** — Calendrier de présence (mois navigable)
  4. **Salary** — Calcul de paie + historique + pré-calcul
  5. **Primes** — Rubriques éditables + historique des changements
  6. **Congés** — Historique des congés (CONGES.DTA, scrollable)
  7. **Prêts** — Table des prêts (PRETS.DTA)
  8. **Événements** — Événements de carrière (EVENTS.DTA)

### api.ts
- Wrapper `invoke()` pour toutes les commandes Tauri
- Types TypeScript pour `EmployeeSummary`, `Shift`, `CalcResult`, `EmployeeRubrique`, etc.

---

## 9. Pointeuse Biométrique

L'app supporte l'import de données de pointeuse biométrique:
- **`user.dat`** — Utilisateurs de la pointeuse (PIN, nom, privilège)
- **`attlog*.dat`** — Logs de pointage (PIN, timestamp, type)
- Correspondance floue entre users pointeuse et employés PCPAIE (par nom)
- Liaison manuelle ou automatique (`auto_match_all`)
- Calcul de présence à partir des pointages + configuration de shift

---

## 10. Conventions de Code

### Rust
- Pas de `unwrap()` dans le code de production — utiliser `map_err(|e| e.to_string())?`
- Transactions SQLite: `conn.execute_batch("BEGIN")` ... `conn.execute_batch("COMMIT")`
- Pour les gros imports: chunks + `rayon::par_iter` pour le parsing, insertion séquentielle en transaction
- Helper dBase: `get_str()`, `get_num()`, `get_bool()` — retournent des valeurs par défaut si champ absent
- Pour les objets JSON larges (>50 champs): utiliser `serde_json::Map` au lieu de `serde_json::json!` (limite de récursion du macro)
- **Connexions SQLite parallèles**: toujours utiliser `open_import_conn()` qui configure WAL + busy_timeout + FK off
- **Compter colonnes vs `?`**: pour les gros INSERT, vérifier manuellement que le nombre de `?` dans VALUES correspond au nombre de colonnes
- **Ne jamais réutiliser `app_conn` pour une sous-transaction**: si la connexion principale peut être dans une transaction, utiliser une connexion séparée

### TypeScript/React
- `invoke<T>()` typé pour chaque commande Tauri
- États de loading avec `Loader2` (spinner lucide-react)
- Tailwind CSS pour le styling (pas de CSS custom)
- `formatCurrency()` depuis `lib/utils.ts`

### Git
- Messages de commit en anglais, focus sur le "why"
- Co-authored-by Devin

---

## 11. Dépannage

### Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `recursion limit reached` avec `serde_json::json!` | Trop de champs dans un seul macro json (>50) | Utiliser `serde_json::Map::new()` + `m.insert()` |
| `Borrowed value does not live long enough` dans `read_record` | Memo lu pendant l'emprunt du buffer | Cloner les valeurs ou restructurer le borrow |
| `no such column: fixed_value` | Schéma DB non à jour | Vérifier `db.rs` — le schéma doit correspondre aux INSERT |
| `RUBRIQUEX.DTA not found` | Dossier PCPAIE incorrect ou noms en minuscules | `find_file()` fait une recherche case-insensitive |
| Import très lent pour PAIES | Pas de chunking | Utiliser chunks de 5000 + rayon + transactions |
| `unwrap_or_else returning usize instead of ()` | Type mismatch dans closure | Vérifier le type de retour de la closure |
| `N values for M columns` | Nombre de `?` ≠ nombre de colonnes dans INSERT | Compter avec `python -c "s='...'; print(len(s.split(',')))"` — ne JAMAIS compter à l'œil |
| `database is locked` | Connexions parallèles sans busy_timeout | `PRAGMA busy_timeout=30000` sur toutes les connexions |
| `FOREIGN KEY constraint failed` | Données PCPAIE orphelines (CONGES/PRETS) | `PRAGMA foreign_keys=OFF` pendant l'import |
| `cannot start a transaction within a transaction` | `app_conn` déjà en transaction | Utiliser `open_import_conn()` (connexion séparée) |

### Reset de la base de données

```powershell
# Supprimer la DB (Windows) + fichiers WAL/SHM
Remove-Item "$env:APPDATA\com.hamtech.paie\hamtech_paie.db" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\com.hamtech.paie\hamtech_paie.db-wal" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\com.hamtech.paie\hamtech_paie.db-shm" -Force -ErrorAction SilentlyContinue
```

L'app recréera la DB au prochain lancement (schéma via `init_db()`).

### Vérifier le contenu de la DB

```bash
# Scripts Python de diagnostic (à la racine du projet)
python check_db.py        # Vérifie les tables et counts
python check_lookups.py   # Vérifie les lookup_values
python check_pers1.py     # Vérifie PERS1 (COD_RUB / VAL_RUB)
python audit_pcpaie.py    # Audit complet de tous les .DTA
```

---

## 12. À Faire / Améliorations Possibles

- [ ] Importer `PARAMETR.DTA` (paramètres système)
- [ ] Importer `USERSN.DTA` (utilisateurs PCPAIE)
- [ ] Parser les champs `montants` de la table `paies` (chaîne sérialisée → valeurs individuelles par rubrique)
- [ ] Export de bulletins de paie en PDF
- [ ] Multi-société (plusieurs dossiers PCPAIE)
- [ ] Interface de gestion de la grille salariale (GRILLE.DTA)
- [ ] Rapports et statistiques (effectifs, salaires, congés)
- [ ] Support des notes de PERS2 (NOTE_FNC, NOTE_SEC, etc. — actuellement importées mais non affichées)

---

## 13. Sélecteur de Période & Historique de Salaire

### PeriodSelector (composant React)

Composant compact de sélection année/mois avec indicateurs visuels pour les mois ayant un historique de salaire.

- **Props**: `year`, `month`, `onChange(year, month)`, `availablePeriods: string[]` (format `YYYY-MM`)
- **Affichage**: sélecteur d'année (spinner) + grille de 12 mois (boutons cliquables)
- **Indicateurs**: les mois avec historique ont un point bleu sous le label
- **Compact**: hauteur réduite, mois en 3 colonnes × 4 lignes

### Backend — Périodes

- `get_available_periods()` — Toutes les périodes disponibles (globales, depuis `paies` + `salary_calculations`)
- `get_employee_salary_periods(employee_id)` — Périodes spécifiques à un employé
- `normalize_period(period)` — Convertit divers formats (`MM-AAAA`, `MM/AAAA`, `YYYY-MM`, `MMYYYY`) vers `YYYY-MM`

### Backend — Historique

- `get_salary_history(employee_id)` — Historique des salaires (fallback sur `paies` importé si pas de calculs)
- `get_historical_payslip(employee_id, period)` — Bulletin de paie historique
  - Convertit `YYYY-MM` vers les formats bruts de `paies.mois` (ex: `01/2023`, `1/2023`, `012023`, etc.)
  - Retourne les montants désérialisés + totaux + table des rubriques

### Filtre par période dans le détail employé

L'onglet **Salary** de `EmployeesPage` affiche:
1. Le `PeriodSelector` en haut
2. Un bulletin de paie détaillé pour la période sélectionnée (rubriques, totaux)

---

## 14. Filtres Employés Avancés

### Vue d'ensemble

La page Employés dispose d'un panneau de filtres avancés avec:
- Recherche textuelle (nom, prénom, matricule) — `useDeferredValue` pour debounce
- Filtres serveur (SQL) avec pagination
- Indicateur bleu montrant le nombre d'employés trouvés + filtres actifs
- Bouton "Effacer les filtres"
- Badge sur le bouton "Filtres" indiquant le nombre de filtres actifs

### Filtres disponibles

| Filtre              | Type          | Champ DB         | Masqué si vide ? |
|---------------------|---------------|------------------|------------------|
| Recherche           | Texte         | nom/prenom/matricule | Non           |
| Actifs seulement    | Checkbox      | `actif = 1`      | Non              |
| Fonction / Poste    | Select (id)   | `poste_id`       | Non              |
| Section             | Select        | `section`        | Oui              |
| Structure           | Select        | `structure`      | Oui              |
| Unité               | Select        | `unite`          | Oui              |
| Catégorie           | Select        | `categorie`      | Oui              |
| Sexe                | Select (M/F)  | `sexe`           | Non              |
| Contrat             | Select        | `contrat`        | Oui              |
| Échelon             | Select        | `echelon`        | Oui              |
| Classe              | Select        | `classe`         | Oui              |
| Date d'embauche     | Date range    | `dte_entree`     | Non              |
| Date de sortie      | Date range    | `dte_sortie`     | Non              |

### Architecture du filtrage

**Frontend (`EmployeesPage.tsx`)**:
- États: `fPoste`, `fSection`, `fStructure`, `fUnite`, `fCategorie`, `fSexe`, `fContrat`, `fEchelon`, `fClasse`, `fActifOnly`, `fHireFrom`, `fHireTo`, `fExitFrom`, `fExitTo`
- `useEffect` avec dépendances sur tous les filtres → recharge automatique
- `useEffect` séparé pour reset `currentPage` quand les filtres changent
- `clearFilters()` réinitialise tous les filtres

**Frontend (`api.ts`)**:
- `EmployeeFilters` — interface avec tous les champs (optionnels)
- `EmployeeFilterOptions` — options disponibles (listes distinctes depuis la DB)
- `getEmployees(filters)` — invoke avec clés **camelCase**

**Backend Rust (`lib.rs`)**:
- `get_employees(...)` — 18 paramètres `Option<T>` pour tous les filtres
- Construction dynamique des clauses WHERE + params SQL
- `COUNT(*) OVER ()` pour le `total_count` dans chaque row (pagination)
- `get_employee_filter_options()` — retourne les valeurs distinctes pour les selects

### ⚠️ Convention de nommage Tauri 2.x (PIÈGE CRITIQUE)

**Tauri 2.x convertit automatiquement `camelCase` (JS) → `snake_case` (Rust).**

| Côté JS (api.ts)  | Côté Rust (lib.rs) | Conversion Tauri |
|--------------------|--------------------|------------------|
| `actifOnly`        | `actif_only`       | ✅ Correct        |
| `posteId`          | `poste_id`         | ✅ Correct        |
| `postId`           | `post_id`          | ❌ Ne match PAS `poste_id` |
| `pageSize`         | `page_size`        | ✅ Correct        |
| `hireDateFrom`     | `hire_date_from`   | ✅ Correct        |
| `exitDateTo`       | `exit_date_to`     | ✅ Correct        |

**Règle**: Si le paramètre Rust contient un mot avec une orthographe spécifique (ex: `poste` avec un 'e'), le JS doit utiliser exactement `posteId` (pas `postId`).

**Bug historique résolu**: Les filtres `actif_only` et `poste_id` ne fonctionnaient pas car le JS envoyait `snake_case` (`actif_only`, `poste_id`) au lieu de `camelCase` (`actifOnly`, `posteId`). Tauri ne faisait pas la conversion inverse (`snake_case` → `snake_case`), donc les paramètres arrivaient à `None` côté Rust.

### Pagination

- `page` (1-based) + `page_size` (défaut 50, max 500)
- `LIMIT ? OFFSET ?` en SQL
- `total_count` via `COUNT(*) OVER ()` (window function) — présent dans chaque row
- Frontend: `currentPage` (0-based) → `page: currentPage + 1`
- Reset de `currentPage` à 0 quand les filtres changent

### Données réelles du dataset PCPAIE (audit)

| Champ       | Valeurs distinctes | Employés concernés |
|-------------|-------------------|-------------------|
| `actif`     | 0 (297), 1 (48)   | 345 total         |
| `poste_id`  | ~78 postes        | Tous assignés     |
| `section`   | Vide              | 0                 |
| `structure` | Vide              | 0                 |
| `unite`     | Vide              | 0                 |
| `categorie` | Vide              | 0                 |
| `contrat`   | '001'             | 3                 |
| `echelon`   | Vide              | 0                 |
| `classe`    | Vide              | 0                 |
| `dte_entree`| Format YYYY-MM-DD | 344               |
| `dte_sortie`| Format YYYY-MM-DD | 292               |

**Note**: Section, Structure, Unité, Catégorie, Échelon et Classe sont vides dans ce dataset. Les filtres correspondants sont automatiquement masqués dans l'UI (condition `filterOptions?.xxx.length > 0`).

### Labels des filtres

| Label UI           | Valeur DB     |
|--------------------|---------------|
| Homme              | `M`           |
| Femme              | `F`           |
| Fonction / Poste   | `poste_id` (FK vers `postes`) |

### Colonne "Poste/Fonction" dans la table

La table des employés affiche la colonne **Poste/Fonction** (au lieu de "Section" qui est vide).
- Affiche `postes.name` (libellé du poste)
- Si pas de poste assigné: affiche le code FNC (`fnc_code`)

---

## 14bis. Rubriques Modernes (2025) — Paramétrage Algérien

### Contexte réglementaire 2025

| Élément | Valeur 2025 | Source |
|---------|-------------|--------|
| SNMG | 24 000 DA brut/mois | Décret présidentiel |
| CNAS salarié | 9% (1.5% maladie + 6.75% retraite + 0.5% chômage + 0.25% retraite anticipée) | Décret 15-236 |
| CNAS employeur | 26% (12.5% maladie + 1.25% AT + 11% retraite + 1% chômage + 0.25% retraite anticipée) | Décret 15-236 |
| Barème IRG | 0% (0-20K), 23% (20-40K), 27% (40-80K), 30% (80-160K), 33% (160-320K), 35% (>320K) | Loi de Finances 2022+ |
| Réduction famille | 1 500 DA/mois par personne à charge (conjoint + 5 enfants max) | CIDTA |
| HS jour ouvrable | +50% | Loi 90-11 art. 32 |
| HS nuit (21h-5h) | +75% | Décret 97-473 |
| HS jour repos/férié | +100% | Loi 90-11 art. 44 |

### Nouvelles rubriques (R960-R984)

Créées sans modifier les rubriques PCPAIE existantes. Codes 960-984.

#### CNAS 2025 — Cotisations salariales détaillées (classe 2 = Retenues)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R960 | CNAS Maladie Salarié 1.5% | `R[500]*1.5/100` | IMPOS, TOTAL |
| R961 | CNAS Retraite Salarié 6.75% | `R[500]*6.75/100` | IMPOS, TOTAL |
| R962 | CNAC Chômage Salarié 0.5% | `R[500]*0.5/100` | IMPOS, TOTAL |
| R963 | CNAS Retr. Antic. Salarié 0.25% | `R[500]*0.25/100` | IMPOS, TOTAL |
| R964 | **Total CNAS Salarié 9%** | `R[960]+R[961]+R[962]+R[963]` | IMPOS, TOTAL |

#### CNAS 2025 — Cotisations patronales détaillées (classe 0 = Info)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R965 | CNAS Maladie Employeur 12.5% | `R[500]*12.5/100` | SECU, TOTAL |
| R966 | CNAS AT/Maladie Pro Employeur 1.25% | `R[500]*1.25/100` | SECU, TOTAL |
| R967 | CNAS Retraite Employeur 11% | `R[500]*11/100` | SECU, TOTAL |
| R968 | CNAC Chômage Employeur 1% | `R[500]*1/100` | SECU, TOTAL |
| R969 | CNAS Retr. Antic. Employeur 0.25% | `R[500]*0.25/100` | SECU, TOTAL |
| R970 | **Total CNAS Employeur 26%** | `R[965]+R[966]+R[967]+R[968]+R[969]` | SECU, TOTAL |

#### IRG 2025 — Calcul modernisé (classe 2 = Retenues)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R971 | Base imposable IRG 2025 | `R[763]-R[964]` (Brut - CNAS salarié) | TOTAL |
| R972 | Réduction charges famille 2025 | *(manuel: (1 + nb_enf) × 1500)* | TOTAL |
| R973 | IRG 2025 (barème) | `IRG(R[971],R[655])` | IMPOS, TOTAL |
| R974 | **IRG 2025 Net (après réduction)** | `R[973]-R[972]` | IMPOS, TOTAL |

#### Prime d'ancienneté (classe 1 = Gain)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R975 | Années d'ancienneté | *(manuel ou calculé depuis dte_entree)* | — |
| R976 | Taux ancienneté % | *(manuel: 0.5% par an, max 25%)* | — |
| R977 | **Prime d'ancienneté** | `R[975]*R[976]*R[250]/100` | BRUT, IMPOS, SECU, TOTAL |

#### Transport + Panier modernisés (classe 1 = Gain)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R978 | Indemnité transport forfait 2025 | *(manuel, non cotisable)* | IMPOS, TOTAL, MANUELLE |
| R979 | Panier jours 2025 | *(manuel: nombre de jours)* | — |
| R980 | Panier taux 2025 | `120` (was 50 DA) | — |
| R981 | **Indemnité panier 2025** | `R[979]*R[980]` | BRUT, IMPOS, TOTAL, MANUELLE |

#### 13ème mois + Prime de bilan (classe 1 = Gain)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R982 | **Gratification 13ème mois** | `R[030]/12` (1/12 du salaire de base) | BRUT, IMPOS, SECU, TOTAL, MANUELLE |
| R983 | Prime de bilan / fin d'année | *(manuel)* | BRUT, IMPOS, SECU, TOTAL, MANUELLE |

#### Indemnité de licenciement (classe 1 = Gain)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R984 | Indemnité licenciement (1/2 mois/an) | *(calcul séparé: ½ mois × années d'ancienneté)* | TOTAL, MANUELLE |

### Correspondance PCPAIE → Moderne

| Fonction | PCPAIE (ancien) | Moderne (2025) | Différence |
|----------|-----------------|----------------|------------|
| CNAS salarié | R510 (9% global) | R960-R964 (détaillé) | Décomposition par branche |
| CNAS employeur | R816 (16%) + R817 (26%) | R965-R970 (détaillé 26%) | Taux actualisé |
| IRG | R660 | R973-R974 | Avec réduction famille explicite |
| Panier | R522 (taux=50) | R981 (taux=120) | Taux doublé |
| Ancienneté | R261 (IEP) | R977 | Formule basée sur R[250] |
| 13ème mois | — | R982 | Nouveau |

### Script d'insertion

```bash
python insert_modern_rubriques.py  # Insère/met à jour R960-R984
```

---

## 15. Dépannage — Filtres Employés

### Les filtres ne s'appliquent pas

1. **Vérifier les logs Rust** — `eprintln!("get_employees filters: ...")` dans `lib.rs` affiche les valeurs reçues
2. **Si tout est `None`** — Problème de nommage Tauri:
   - Vérifier que `api.ts` utilise `camelCase` (`actifOnly`, `posteId`, `pageSize`)
   - Vérifier que `lib.rs` utilise `snake_case` (`actif_only`, `poste_id`, `page_size`)
3. **Si les valeurs passent mais pas de résultat** — Vérifier les données:
   ```python
   python audit_filter.py  # Test les filtres SQL directement
   ```
4. **HMR ne recharge pas** — Fermer et relancer `npx tauri dev`

### Le total_count ne correspond pas

- Utiliser `COUNT(*) OVER () as total_count` dans le SELECT (window function)
- Le `total_count` est présent dans chaque row retournée
- Frontend: `if (emps.length > 0) setTotalCount(emps[0].total_count); else setTotalCount(0);`

### Scripts de diagnostic

```bash
python audit_filter.py        # Test les filtres SQL (actif, poste, combiné)
python audit_new_filters.py   # Audit des nouveaux filtres (contrat, echelon, classe, dates)
python test_poste_options.py  # Vérifie les postes et leurs counts
```

---

*Document généré le 2026-08-28, mis à jour le 2026-08-28 — HAMTECH Paie v0.1.0*
