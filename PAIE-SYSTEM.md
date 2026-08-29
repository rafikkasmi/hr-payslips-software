# SYSTÈME DE CALCUL DE PAIE — Documentation Complète

> **Application** : HAMTECH Paie  
> **Moteur** : `calculator.rs` (Rust/Tauri)  
> **Source** : PCPAIE (logiciel de paie algérien)  
> **Date** : Août 2025

---

## TABLE DES MATIÈRES

1. [Architecture du moteur de calcul](#1-architecture-du-moteur-de-calcul)
2. [Les 3 types de variables](#2-les-3-types-de-variables)
3. [Les 7 classes de rubriques](#3-les-7-classes-de-rubriques)
4. [Les 6 flags système](#4-les-6-flags-système)
5. [Variables T[] — Table de référence complète](#5-variables-t--table-de-référence-complète)
6. [Chaîne de calcul étape par étape](#6-chaîne-de-calcul-étape-par-étape)
7. [Logique des 3 types d'absence](#7-logique-des-3-types-dabsence)
8. [Logique du prorata (R200, R655)](#8-logique-du-prorata-r200-r655)
9. [Cotisations sociales (CNAS)](#9-cotisations-sociales-cnas)
10. [Barème IRG — Loi de Finances 2022](#10-barème-irg--loi-de-finances-2022)
11. [Nouvelles rubriques 2025 (R960-R982)](#11-nouvelles-rubriques-2025-r960-r982)
12. [Masse salariale et cotisations employeur](#12-masse-salariale-et-cotisations-employeur)
13. [Paramètres globaux configurables](#13-paramètres-globaux-configurables)
14. [Catalogue complet des rubriques actives](#14-catalogue-complet-des-rubriques-actives)

---

## 1. Architecture du moteur de calcul

### Principe

Le moteur de calcul reproduit fidèlement la logique de **PCPAIE**, le logiciel de paie algérien. Il fonctionne comme un **interpréteur séquentiel** : les 999 rubriques sont évaluées l'une après l'autre, dans l'ordre défini par le champ `ord_clc` (ordre de calcul).

### Flux de calcul

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Chargement des rubriques (999) depuis la base               │
│  2. Chargement des paramètres globaux (salary_settings)         │
│  3. Initialisation des variables T[]                            │
│  4. Chargement du template employé (TOT-PAIE)                   │
│  5. Chargement des valeurs d'entrée (input_values)              │
│  6. Calcul des jours d'absence/maladie/congé                    │
│  7. BOUCLE : pour chaque rubrique par ordre croissant           │
│     ├─ Si manuelle → utiliser la valeur saisie                  │
│     ├─ Si formule  → évaluer la formule                         │
│     ├─ Stocker le résultat dans R[code]                         │
│     ├─ Accumuler dans T[] selon les flags                       │
│     └─ Cas spéciaux (R050, R500, R652, R655...)                 │
│  8. Extraction des totaux (brut, gains, retenues, net)          │
│  9. Retour du résultat (CalcResult)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Fichier source

- **Moteur** : `src-tauri/src/calculator.rs`
- **Commandes Tauri** : `src-tauri/src/lib.rs`
- **Base de données** : `src-tauri/src/db.rs`
- **API frontend** : `src/lib/api.ts`

---

## 2. Les 3 types de variables

### R[NNN] — Valeur de rubrique

Le résultat calculé ou saisi d'une rubrique. Chaque rubrique a un code à 3 chiffres (001 à 999).

```
R[001] = Salaire de base mensuel (saisi)
R[030] = Salaire de base calculé = T[15]*(R[001]+R[003]) + ...
R[510] = Retenue CNAS = R[500] * R[505] / 100
```

Une fois qu'une rubrique est calculée, sa valeur `R[code]` est disponible pour toutes les rubriques suivantes (ordre `ord_clc`).

### T[NN] — Variable d'accumulation système

Les variables T[] sont des **totaux/ratios** accumulés automatiquement pendant le calcul. Elles servent de base pour les cotisations et l'IRG.

```
T[01] = Base cotisable (somme des gains cotisables - retenues cotisables)
T[03] = Total des gains
T[04] = Total des retenues
T[52] = Salaire brut
```

### M / N — Valeurs manuelles

Quand une rubrique est saisie manuellement (pas de formule), l'utilisateur fournit :
- **M** = Montant (valeur monétaire)
- **N** = Nombre (quantité : jours, heures, nombre de paniers...)

---

## 3. Les 7 classes de rubriques

| Classe | Rôle | Affichage bulletin | Exemples |
|--------|------|---------------------|----------|
| **0** | Information / Calcul interne | Non affichée | R050 (rejet), R620, R800 (cotis. congés payés) |
| **1** | Gains (ajoutés au brut) | Section "Gains" | R030 (salaire base), R291 (responsabilité), R100 (congé) |
| **2** | Retenues (déduites du net) | Section "Retenues" | R034 (absence), R510 (CNAS), R660 (IRG) |
| **3** | Nombre / Compteur d'absence | Non affichée | R033 (jours absence), R089 (jours maladie) |
| **4** | Compteur de congé | Non affichée | R099 (jours de congé) |
| **5** | Taux / Coefficient | Non affichée | R200 (prorata), R505 (taux CNAS 9%), R655 (prorata IRG) |
| **7** | Paramètre de référence | Non affichée | R001 (salaire base), R010 (taux journalier), R500 (cotisable) |

### Règles par classe

- **Classe 1 (Gains)** : montant positif → ajouté à T[03] (total gains) et T[52] (brut) si `is_brut=1`
- **Classe 2 (Retenues)** : montant soustrait → ajouté à T[04] (total retenues), soustrait de T[52] si `is_brut=1`
- **Classe 7 (Paramètres)** : valeurs de référence, n'alimentent **pas** les T[] directement
- **Classe 5 (Taux)** : coefficients utilisés par d'autres rubriques, n'alimentent pas les T[]

---

## 4. Les 6 flags système

Chaque rubrique possède 6 flags booléens qui contrôlent son comportement dans le calcul :

### is_brut (Participe au brut)

Ajoute/soustrait le montant à **T[52]** (salaire brut).

```
Gains (classe 1) avec is_brut=1 :  T[52] += montant
Retenues (classe 2) avec is_brut=1 : T[52] -= |montant|
```

Rubriques concernées : R030, R034, R061, R066, R090, R100, R112, R122, R129, R261, R271, R281, R291, R301, R311, R318, R522, R532, R977, R982

### is_secu_s (Cotisable sécurité sociale)

Ajoute/soustrait le montant à :
- **T[01]** = base cotisable mensuelle
- **T[58]** = base cotisable pour IRG
- **cotisable_gains** (suivi séparé des gains cotisables)

```
Gains (classe 1) avec is_secu_s=1 :  T[01] += montant, T[58] += montant
Retenues (classe 2) avec is_secu_s=1 : T[01] -= |montant|, T[58] -= |montant|
```

**Exceptions** : Les rubriques `is_regular` (régularisation) accumulent dans T[41]/T[57] au lieu de T[43]/T[58].

Rubriques concernées : R030, R034, R061, R066, R090, R100, R112, R122, R129, R261, R271, R281, R291, R301, R311, R318, R977, R982

### is_impos (Imposable IRG)

Ajoute/soustrait le montant à :
- **T[43]** = base imposable mensuelle (si non régul)
- **T[41]** = base imposable régul (si is_regular)

```
Gains (classe 1) avec is_impos=1 :  T[43] += montant
Retenues (classe 2) avec is_impos=1 : T[43] -= |montant|
```

Rubriques concernées : R030, R034, R061, R066, R090, R100, R112, R122, R129, R261, R271, R281, R291, R301, R311, R318, R522, R532, R960-R964, R973, R974

### is_total (Participe aux accumulations T[])

**Flag maître** : si `is_total=0`, la rubrique n'alimente **aucune** variable T[]. Seules les rubriques "réelles" ont ce flag à 1.

```rust
fn accumulate_t(...) {
    if !rub.is_total { return; }  // ← gatekeeper
    // ... accumulations is_brut, is_secu_s, is_impos
}
```

### is_regular (Régularisation)

Indique que la rubrique est une régularisation (rétroactive). Les accumulations vont dans des T[] séparés :
- T[41] au lieu de T[43] (imposable)
- T[57] au lieu de T[58] (cotisable)

Rubriques concernées : R031, R032, R035, R036 (paires R+/R- pour régularisations)

### is_locked (Verrouillée)

La rubrique est un paramètre système qui n'est calculé que si explicitement défini via `global_params`. Si `is_locked=1` et aucune valeur d'entrée, la rubrique est ignorée.

Exemple : R501 (flag CACOBATH) = 0 par défaut, 1 si activé via global_params.

---

## 5. Variables T[] — Table de référence complète

| T[] | Nom | Valeur initiale | Source | Alimentation |
|-----|-----|-----------------|--------|--------------|
| **T[01]** | Base cotisable mensuelle | 0 | Calcul | + gains `is_secu_s`, - retenues `is_secu_s` |
| **T[03]** | Total gains | 0 | Calcul | + toutes rubriques classe 1 avec `is_total` |
| **T[04]** | Total retenues | 0 | Calcul | + toutes rubriques classe 2 avec `is_total` |
| **T[07]** | Salaire de base | R001 | Fixé au début | = R[001] |
| **T[09]** | Jours ouvrés par mois | 30 (configurable) | global_params / paies | Peut être surchargé par période |
| **T[10]** | Heures par mois | 173.33 (configurable) | global_params / paies | Peut être surchargé par période |
| **T[15]** | Ratio travail normal | 1.0 | Calcul | Modifié par R026, reset après R206 |
| **T[16]** | Ratio heures supplémentaires | 0 | global_params | T[16] = coefficient HS (ex: 1.5 pour 50%) |
| **T[17]** | Ratio nuit/weekend | 0 | global_params | T[17] = coefficient (ex: 1.0 pour jour normal) |
| **T[40]** | Flag exonération IRG | 0 | global_params | 1 = pas de prorata IRG (travailleurs étrangers) |
| **T[41]** | Imposable régul | 0 | Calcul | + gains régul `is_impos` |
| **T[43]** | Imposable mensuel | 0 | Calcul | + gains `is_impos`, - retenues `is_impos` |
| **T[47]** | Mutuelle multiplier | 0 | global_params | 0 = pas de mutuelle, 1 = mutuelle active |
| **T[51]** | Imposable 10% | 0 | Calcul | + gains `is_impo15` (désactivé) |
| **T[52]** | Salaire brut | 0 | Calcul | + gains `is_brut`, - retenues `is_brut` |
| **T[53]** | Cotisable 10% | 0 | Calcul | + gains `is_impo15` cotisables (désactivé) |
| **T[57]** | Cotisable régul | 0 | Calcul | + gains régul `is_secu_s` |
| **T[58]** | Cotisable pour IRG | 0 | Calcul | + cotisable, - retenues cotisables |
| **T[76]** | Prorata cotisable | 1.0 | Calcul | = (T[01] - R050) / T[01], calculé avant R500 |
| **T[77]** | CACOBATH coefficient | 0 | global_params | 0 = pas de CACOBATH |
| **T[78]** | Heures par jour | T[10]/T[09] | Calcul | = 173.33/30 = 5.78, recalculé si T[09] change |

### Priorité de chargement T[09] et T[10]

```
1. Valeur par défaut (salary_settings) : T[09]=30, T[10]=173.33
2. Override global_params (clé "9" et "10" dans la table)
3. Override paies (nbr_jr_ouv, nbr_hr_ouv pour l'employé et la période)
4. Fallback : dernière paie mensuelle de l'employé
```

---

## 6. Chaîne de calcul étape par étape

### Phase 1 — Paramètres de base (ord 100-2600)

#### R001 — Salaire de base mensuel (ord 100)
```
R001 = T[07]
```
Valeur saisie manuellement. C'est le salaire de base contractuel de l'employé. Stocké dans T[07] pour référence.

#### R005 — Taux horaire (ord 500)
```
R005 = (R[001] + R[330] + R[291] + R[281] + R[297]) / T[10]
```
Taux horaire = (salaire base + primes fixes) / heures mensuelles. Utilisé pour calculer les heures supplémentaires.

#### R010 — Taux journalier (ord 1000)
```
R010 = (R[001] + R[003] + R[330] + R[291] + R[281] + R[297]) / T[09]
```
Taux journalier = (salaire base + primes fixes) / jours mensuels. Utilisé pour calculer les absences, congés, maladie.

#### R015 — Nombre d'heures travaillées (ord 1500)
```
R015 = 173.33 (valeur par défaut, saisie)
```
Compteur d'heures pour le calcul des heures supplémentaires.

#### R020 — Nombre de jours travaillés (ord 2000)
```
R020 = 24 (valeur par défaut, saisie)
```
Compteur de jours pour le calcul nuit/weekend.

#### R024 — Taux horaire/journalier HS (ord 2400)
```
R024 = T[16]*R[005] + T[17]*R[010]
```
Taux combiné pour heures supp (T[16]) et nuit/weekend (T[17]).

#### R026 — Nombre heures/jours travaillés (ord 2600)
```
R026 = T[15]*T[09] + T[16]*R[015] + T[17]*R[020]
```
Total des jours équivalents travaillés, incluant heures supp et nuit/weekend. **Après R026, T[15] est reset à 1.0.**

---

### Phase 2 — Salaire de base et absences (ord 3000-10000)

#### R030 — Salaire de base (ord 3000) ⭐
```
R030 = T[15]*(R[001]+R[003]) + T[16]*R[005]*R[015] + T[17]*R[010]*R[020]
```
**C'est le salaire de base proratisé.** Décompose en 3 composantes :
- `T[15]*(R[001]+R[003])` : salaire base × ratio travail normal
- `T[16]*R[005]*R[015]` : heures supp × taux horaire × nombre d'heures
- `T[17]*R[010]*R[020]` : nuit/weekend × taux journalier × nombre de jours

**Flags** : `is_brut=1, is_impos=1, is_secu_s=1, is_total=1` → alimente T[01], T[43], T[52], T[03]

#### R033 — Nombre de jours d'absence (ord 3300)
```
R033 = (saisi ou calculé depuis pointeuse)
```
Les absences sont les jours non travaillés non expliqués par congé ou maladie.

#### R034 — Retenue jours d'absence (ord 3400)
```
R034 = R[033] * R[010]
```
Retenue = nombre de jours d'absence × taux journalier.

**Flags** : `is_brut=1, is_impos=1, is_secu_s=1, is_total=1` → déduit de T[01], T[43], T[52]

#### R060 / R061 — Récupération / reprise de congé (ord 6000-6100)
```
R061 = R[060] * R[010]   (retenue pour jours de reprise)
```

#### R065 / R066 — Heures d'absence (ord 6500-6600)
```
R066 = R[065] * R[005]   (retenue pour heures d'absence)
```

#### R089 — Nombre de jours de maladie (ord 8900)
```
R089 = (saisi ou calculé depuis pointeuse)
```

#### R090 — Congé maladie (ord 9000)
```
R090 = R[089] * R[010]
```
Retenue pour jours de maladie = jours × taux journalier.

#### R099 — Nombre de jours de congé (ord 9900)
```
R099 = (saisi ou calculé depuis congés)
```

#### R100 — Congé payé / STC (ord 10000)
```
R100 = R[099] * R[010]
```
**Gain** (pas retenue) : le congé est payé. Compte comme temps travaillé dans le prorata.

---

### Phase 3 — Heures supplémentaires (ord 11000-12900)

#### R110 / R111 / R112 — Heures supp à 50% (ord 11000-11200)
```
R111 = R[005] * IF(R[110]>0, 1.500, 0)    → taux HS à 50%
R112 = R[110] * R[111]                     → montant = nb heures × taux
```

#### R120 / R121 / R122 — Heures supp à 75% (ord 12000-12200)
```
R121 = R[005] * IF(R[120]>0, 1.750, 0)    → taux HS à 75%
R122 = R[120] * R[121]
```

#### R127 / R128 / R129 — Heures supp à 100% (ord 12700-12900)
```
R128 = IF(R[127]>0.01, R[005]*2.00, 0)    → taux HS à 100%
R129 = R[127] * R[128]
```

Toutes les heures supp sont `is_brut=1, is_impos=1, is_secu_s=1, is_total=1` → cotisent à la CNAS.

---

### Phase 4 — Coefficient de prorata (ord 20000-20600)

#### R200 — Coefficient de prorata (ord 20000) ⭐
```
R200 = T[15]*(T[10] - R[033]*T[78] - R[060]*T[78] - R[065]) / T[10]
       + T[16]*R[015]/T[10]
       + T[17]*R[020]/T[09]
```

**C'est le coefficient de prorata principal.** Il représente le ratio de temps travaillé :
- `T[15]*(T[10] - absences)/T[10]` : ratio travail normal (1.0 si pas d'absence)
- `T[16]*R[015]/T[10]` : ratio heures supp
- `T[17]*R[020]/T[09]` : ratio nuit/weekend

**R200 = 1.0** si plein mois travaillé. **R200 < 1.0** si absences.

Utilisé pour proratiser : R291 (responsabilité), R318 (ICR), R532 (transport).

#### R205 — Temps de travail en jours (ord 20500)
```
R205 = T[15]*(T[09] - R[033] - R[060] - R[065]/T[78])
       + T[16]*R[015]/T[78]
       + T[17]*R[020]
       + R[099]
```
Nombre de jours travaillés (incluant congés payés R099).

#### R206 — Temps de travail en heures (ord 20600)
```
R206 = T[15]*(T[10] - R[033]*T[78] - R[060]*T[78] - R[065])
       + T[16]*R[015]
       + T[17]*R[020]*T[78]
       + R[099]*T[78]
```
**Après R206 : T[15] est reset à 1.0** pour les rubriques suivantes.

---

### Phase 5 — Indemnités et primes (ord 25000-31800)

#### R250 — Salaire base indemnités (ord 25000)
```
R250 = R[030] - T[15]*(R[034] + R[061] + R[066])
```
Base pour calculer les indemnités = salaire de base - retenues d'absence. C'est le salaire "réellement travaillé".

#### R260 / R261 — IEP (Indemnité d'Expérience Professionnelle) (ord 26000-26100)
```
R261 = R[260] * R[250] / 100    → IEP = taux × base indemnités
```

#### R270 / R271 — IFSP (Indemnité de Fonction et Sujétions Professionnelles) (ord 27000-27100)
```
R271 = R[270] * R[250] / 100
```

#### R280 / R281 — Nuisance (ord 28000-28100)
```
R281 = R[280] * R[250] / 100
```

#### R290 / R291 — Responsabilité (ord 29000-29100) ⭐
```
R291 = R[290] * R[200]    → Responsabilité = base × coefficient de prorata
```
**Proratisée par R200** : si l'employé est absent, sa prime de responsabilité diminue proportionnellement.

#### R300 / R301 — PRI (Prime de Rendement Individuel) (ord 30000-30100)
```
R301 = R[300] * R[250] / 100
```

#### R310 / R311 — PRC (Prime de Rendement Collectif) (ord 31000-31100)
```
R311 = R[310] * R[250] / 100
```

#### R317 / R318 — ICR (Indemnité de Catégorie de Risque) (ord 31700-31800)
```
R318 = R[317] * R[200]    → ICR proratisé par R200
```

---

### Phase 6 — Base cotisable et CNAS (ord 50000-51500)

#### R500 — Salaire de poste / Base cotisable (ord 50000) ⭐⭐
```
R500 = T[76] * T[01]
```
**C'est la base cotisable.** 

- **T[01]** = somme de tous les gains cotisables (R030 + R291 + R100 + R112 + ...) moins les retenues cotisables (R034 + R090 + ...)
- **T[76]** = ratio de prorata cotisable = (T[01] - R050) / T[01]

R050 = rejet non cotisable (jours non couverts par cotisation). Si R050 = 0, alors T[76] = 1.0 et R500 = T[01].

**Calcul de T[76] (juste avant R500)** :
```
T[76] = (T[01] - R[050]) / T[01]
```

#### R501 — Flag CACOBATH (ord 50100)
```
R501 = 1 (si activé) ou 0 (par défaut, is_locked)
```

#### R502 / R503 / R504 — CACOBATH / Intempéries (ord 50200-50400)
```
R502 = T[01] * R[501] * T[77]              → base CACOBATH
R503 = 0.375 * R[501] * T[77]              → taux CACOBATH 0.375%
R504 = R[502] * R[503] / 100               → cotisation intempéries
```

#### R505 — Taux sécurité sociale (ord 50500)
```
R505 = 9    → taux CNAS salarié = 9%
```
**Note** : Ce taux est codé en dur dans la formule. Le paramètre `cnas_employee_rate` des salary_settings pourrait le remplacer à l'avenir.

#### R510 — Retenue CNAS salarié (ord 51000) ⭐⭐
```
R510 = R[500] * R[505] / 100    → CNAS = base cotisable × 9%
```
**C'est la cotisation sécurité sociale du salarié.**

#### R514 / R515 — Mutuelle (ord 51400-51500)
```
R514 = 1.5                              → taux mutuelle 1.5%
R515 = R[500] * R[514] / 100 * T[47]    → cotisation mutuelle (si T[47]>0)
```
T[47] = 0 par défaut (pas de mutuelle). Si T[47] = 1, la mutuelle est active.

---

### Phase 7 — Panier et transport (ord 52000-53200)

#### R520 / R521 / R522 — Panier (ord 52000-52200)
```
R521 = 50                    → taux panier = 50 DA/jour
R522 = R[520] * R[521]       → montant = nb jours × taux
```
**Non cotisable** (is_secu_s=0) mais imposable (is_impos=1).

#### R531 / R532 — Transport (ord 53100-53200)
```
R532 = R[531] * R[200]    → transport proratisé par R200
```
**Non cotisable** (is_secu_s=0) mais imposable (is_impos=1).

---

### Phase 8 — Base imposable et IRG (ord 64100-66000)

#### R641 — Taux imposition 10% (ord 64100)
```
R641 = 10    → taux pour retenue 10% (certains revenus non soumis à IRG)
```

#### R642 — Base imposable 10% (ord 64200)
```
R642 = T[51] - T[76]*T[53]*R[505]/100
```
Base pour la retenue à 10% (T[51] et T[53] sont désactivés — colonne is_impo15 supprimée).

#### R646 — Retenue impôt 10% (ord 64600)
```
R646 = R[642] * R[641] / 100
```

#### R650 — Base imposable IRG/mois (ord 65000) ⭐
```
R650 = T[43] - T[76]*T[58]*R[505]/100
```
**Base imposable IRG mensuelle** = imposable - CNAS (déduction de 9% sur la partie cotisable).

Logique :
- T[43] = total imposable (gains imposables - retenues imposables)
- T[58] = cotisable pour IRG
- T[76]*T[58]*R[505]/100 = CNAS déductible de la base IRG

#### R651 — Base imposable IRG/régul (ord 65100)
```
R651 = T[41] - T[76]*T[57]*R[505]/100
```
Base imposable pour les régularisations (rétroactives).

#### R652 — Total imposable IRG (ord 65200) ⭐⭐
```
R652 = R[650] + R[651]    → base imposable IRG totale
```
**C'est la base sur laquelle l'IRG est calculé.**

#### R655 — Coefficient de prorata IRG (ord 65500) ⭐⭐
```
R655 = (1-T[40]) * (T[15]*(T[10] - R[033]*T[78] - R[060]*T[78] - R[065])/T[10]
                     + T[16]*R[015]/T[10]
                     + T[17]*R[020]/T[09])
       + R[099]/30
```

**C'est le prorata pour l'IRG.** Similaire à R200 mais avec des différences :
- `(1-T[40])` : si T[40]=1 (étranger exonéré), prorata = 0 → IRG = 0
- `R[099]/30` : les congés sont ajoutés au prorata IRG (ils comptent comme travaillé)

**Cas spécial R655** : 
- Avant R655, T[09] est temporairement remplacé par R[026] si différent
- R[099] est temporairement mis à 0 si pas de récupération (R060=0) et période ≥ sept 2023
- Après R655, R[099] et T[09] sont restaurés, T[15] est reset à 1.0
- Correction R[065] : PCPAIE n'applique pas T[15] à R[065] dans R655 → correction ajoutée

#### R660 — Retenue IRG (ord 66000) ⭐⭐⭐
```
R660 = IRG(R[652], R[655])
```
**C'est la retenue IRG calculée selon le barème de la Loi de Finances 2022.**

La fonction `IRG(base, prorata)` :
1. Base pleine = R652 / R655 (reconstitution du mois complet)
2. Arrondi au multiple de 10 DA inférieur
3. Application du barème progressif
4. Abattement de 40% (plancher 1000, plafond 1500)
5. Exonération si base ≤ 30 000 DA
6. Zone de transition 30 000-35 000 DA
7. IRG final = résultat × prorata

#### R665 — Total retenue IRG (ord 66500)
```
R665 = R[660] + R[662] - R[661]
```
Total IRG incluant régularisations (R661 = IRG régul -, R662 = IRG régul +).

---

### Phase 9 — Allocations familiales (ord 69700-70000)

#### R697 / R699 — Allocation familiale 300 DA (ord 69700-69900)
```
R697 = 300                    → taux par enfant (ancien barème)
R699 = R[695] * R[697]       → montant = nb enfants × 300
```

#### R698 / R700 — Allocation familiale 600 DA (ord 69800-70000)
```
R698 = 600                    → taux par enfant (nouveau barème)
R700 = R[696] * R[698]       → montant = nb enfants × 600
```

**Non imposables, non cotisables** mais `is_total=1` → ajoutées au net.

---

### Phase 10 — Totaux et net à payer (ord 76300-77000)

#### R763 — Salaire brut (ord 76300)
```
R763 = T[52]    → brut total
```

#### R765 — Total des gains (ord 76500)
```
R765 = T[03]    → somme de tous les gains
```

#### R767 — Total des retenues (ord 76700)
```
R767 = T[04]    → somme de toutes les retenues
```

#### R770 — Net à payer (ord 77000) ⭐⭐⭐
```
R770 = R[765] - R[767]    → NET À PAYER = total gains - total retenues
```

---

## 7. Logique des 3 types d'absence

Les 3 types d'absence sont **mutuellement exclusifs**. Chaque jour non travaillé doit aller dans exactement une catégorie :

| Type | Compteur | Montant | Effet sur R200 (prorata) | Effet sur R655 (prorata IRG) | Payé ? | Cotisable ? |
|------|----------|---------|--------------------------|-------------------------------|--------|-------------|
| **Absence** | R033 (saisi) | R034 = R033×R010 | Réduit R200 | Réduit R655 | Non (retenue) | Déduit de T[01] |
| **Maladie** | R089 (saisi) | R090 = R089×R010 | Ne réduit PAS R200 | Ne réduit PAS R655 | Non (retenue) | Déduit de T[01] |
| **Congé** | R099 (saisi) | R100 = R099×R010 | Compte comme travaillé | Ajouté au prorata (R099/30) | Oui (gain) | Ajouté à T[01] |

### Calcul automatique des jours

Si l'employé n'a pas saisi manuellement les jours, le système les calcule :

```rust
let (conge_days, sick_days) = compute_leave_days(conn, employee_id, period);
let r099 = if r099_input != 0.0 { r099_input } else { conge_days };
let r089 = if r089_input != 0.0 { r089_input } else { sick_days };
let r033 = if r033_input != 0.0 {
    r033_input
} else {
    compute_absent_days(conn, employee_id, period, calendar_working_days, r099 + r089)
    // absences = jours non travaillés - congé - maladie
};
```

### Pourquoi R033 réduit R200 mais pas R089

Dans la formule de R200 :
```
R200 = T[15]*(T[10] - R[033]*T[78] - R[060]*T[78] - R[065]) / T[10] + ...
```

R033 (absence) est soustrait du temps de travail → réduit R200.
R089 (maladie) n'apparaît pas dans la formule de R200 → ne réduit pas R200.

Cependant, R090 (retenue maladie) est `is_secu_s=1` donc déduit de T[01] (cotisable) et T[52] (brut).

---

## 8. Logique du prorata (R200, R655)

### R200 — Coefficient de prorata des indemnités

R200 proratise les indemnités basées sur le temps de travail :
- R291 (responsabilité) = R290 × R200
- R318 (ICR) = R317 × R200
- R532 (transport) = R531 × R200

**Formule** :
```
R200 = T[15]*(T[10] - R[033]*T[78] - R[060]*T[78] - R[065]) / T[10]
       + T[16]*R[015]/T[10]
       + T[17]*R[020]/T[09]
```

| Cas | R200 |
|-----|------|
| Plein mois, pas d'absence | 1.0 |
| 3 jours d'absence (R033=3) | (173.33 - 3×5.78) / 173.33 = 0.90 |
| 3 jours de maladie (R089=3) | 1.0 (la maladie ne réduit pas R200) |
| 5 jours de congé (R099=5) | 1.0 (le congé compte comme travaillé) |

### R655 — Coefficient de prorata IRG

R655 proratise l'IRG pour les mois incomplets. Similaire à R200 mais avec des différences clés :

1. **Multiplication par (1-T[40])** : si T[40]=1 (travailleur étranger exonéré), R655=0 → IRG=0
2. **Ajout de R[099]/30** : les congés sont ajoutés au prorata IRG
3. **Gestion spéciale R026** : si R026 ≠ T[09], T[09] est temporairement remplacé par R026

### Cas spécial R099 dans R655

Avant septembre 2023, R099 (congé) était toujours inclus dans R655.
Depuis septembre 2023, R099 n'est inclus que si :
- R060 > 0 (récupération), OU
- La paie a un suffixe "O" (congé), OU
- La période est avant septembre 2023

```rust
let r099_included = r060_val != 0.0 || is_conge_payslip || is_pre_sep_2023;
if !r099_included {
    r_values.insert("099".to_string(), 0.0);  // temporairement
}
```

---

## 9. Cotisations sociales (CNAS)

### CNAS Salarié (retenue sur le bulletin)

#### R510 — CNAS salarié 9% (ancien système)
```
R510 = R[500] * R[505] / 100 = base cotisable × 9%
```

#### R960-R964 — CNAS salarié détaillé 2025 (nouveau système)

| Rubrique | Libellé | Formule | Taux |
|----------|---------|---------|------|
| R960 | CNAS Maladie Salarié | R[500]×1.5/100 | 1.5% |
| R961 | CNAS Retraite Salarié | R[500]×6.75/100 | 6.75% |
| R962 | CNAC Chômage Salarié | R[500]×0.5/100 | 0.5% |
| R963 | CNAS Retr. Antic. Salarié | R[500]×0.25/100 | 0.25% |
| **R964** | **TOTAL CNAS Salarié** | R[960]+R[961]+R[962]+R[963] | **9%** |

### CNAS Employeur (hors bulletin, pour masse salariale)

#### R965-R970 — CNAS employeur détaillé 2025

| Rubrique | Libellé | Formule | Taux |
|----------|---------|---------|------|
| R965 | CNAS Maladie Employeur | R[500]×12.5/100 | 12.5% |
| R966 | CNAS AT/Maladie Pro Employeur | R[500]×1.25/100 | 1.25% |
| R967 | CNAS Retraite Employeur | R[500]×11/100 | 11% |
| R968 | CNAC Chômage Employeur | R[500]×1/100 | 1% |
| R969 | CNAS Retr. Antic. Employeur | R[500]×0.25/100 | 0.25% |
| **R970** | **TOTAL CNAS Employeur** | R[965]+R[966]+R[967]+R[968]+R[969] | **26%** |

### Ancien système CNAS employeur (R800-R819)

| Rubrique | Libellé | Formule |
|----------|---------|---------|
| R800 | Cotisation congés payés | R[500]×R[501]×12.21/100 |
| R805 | Base cotisable 16% | R[500]×R[508] |
| R807 | Base cotisable 26% | R[500]×(1-R[508]) |
| R816 | CNAS 16% | R[805]×16/100 |
| R817 | CNAS 26% | R[807]×26/100 |
| R819 | Total CNAS | R[816]+R[817] |

R508 = ratio de répartition entre la partie à 16% (AT/maladie) et 26% (retraite/chômage).

---

## 10. Barème IRG — Loi de Finances 2022

### Barème progressif mensuel (LF 2022)

| Tranche de base (DA) | Taux | Formule |
|----------------------|------|---------|
| 0 - 20 000 | 0% | 0 |
| 20 001 - 40 000 | 23% | (base - 20 000) × 0.23 |
| 40 001 - 80 000 | 27% | 4 600 + (base - 40 000) × 0.27 |
| 80 001 - 160 000 | 30% | 15 400 + (base - 80 000) × 0.30 |
| 160 001 - 320 000 | 33% | 39 400 + (base - 160 000) × 0.33 |
| 320 001+ | 35% | 92 200 + (base - 320 000) × 0.35 |

### Étapes de calcul

```rust
pub fn bareme_irg_period(base: f64, prorata: f64, period: &str) -> f64 {
    // 1. Base pleine avant prorata
    let full_base = base / prorata;
    
    // 2. Arrondi au multiple de 10 DA inférieur
    let rounded_base = (full_base / 10.0).floor() * 10.0;
    
    // 3. Application du barème
    let raw = bareme_brut_lf2022(rounded_base);
    
    // 4. Abattement de 40% (plancher 1000, plafond 1500)
    let abat = (raw * 0.40).clamp(1000.0, 1500.0);
    let mut irg = raw - abat;
    
    // 5. Exonération si base ≤ 30 000 DA
    if rounded_base <= 30000.0 {
        irg = 0.0;
    }
    // 6. Zone de transition 30 000 - 35 000 DA
    else if rounded_base < 35000.0 {
        irg = irg * (137.0 / 51.0) - (27925.0 / 8.0);
    }
    
    // 7. IRG final × prorata
    irg * prorata
}
```

### Exemple chiffré

**Employé avec base imposable R652 = 45 000 DA, prorata R655 = 1.0 (plein mois)**

1. Base pleine = 45 000 / 1.0 = 45 000 DA
2. Arrondi = 45 000 DA (déjà multiple de 10)
3. Barème : 4 600 + (45 000 - 40 000) × 0.27 = 4 600 + 1 350 = 5 950 DA
4. Abattement : 5 950 × 0.40 = 2 380 → clamp(1000, 1500) = 1 500 DA
5. IRG avant exonération : 5 950 - 1 500 = 4 450 DA
6. Base > 35 000 → pas d'exonération, pas de zone de transition
7. IRG final = 4 450 × 1.0 = **4 450 DA**

### Barème pré-LF 2022 (avant janvier 2022)

| Tranche | Taux |
|---------|------|
| 0 - 10 000 | 0% |
| 10 001 - 30 000 | 20% |
| 30 001 - 120 000 | 30% |
| 120 001+ | 35% |

### Nouveau calcul IRG 2025 (R971-R974)

Le système 2025 introduit un nouveau calcul avec réduction pour charges de famille :

```
R971 = R[763] - R[964]              → base = brut - CNAS détaillé
R972 = (saisi)                       → réduction charges de famille
R973 = IRG(R[971], R[655])          → IRG brut selon barème
R974 = R[973] - R[972]              → IRG net après réduction
```

**Différence avec l'ancien système** :
- Ancien (R650/R652/R660) : base = T[43] - CNAS (via T[58])
- Nouveau (R971/R973) : base = R[763] (brut) - R[964] (CNAS détaillé)
- Le nouveau système ajoute une **réduction pour charges de famille** (R972)

---

## 11. Nouvelles rubriques 2025 (R960-R982)

### CNAS détaillé salarié (R960-R964)

Décomposition du 9% CNAS salarié en 4 sous-cotisations :

| Code | Libellé | Taux |
|------|---------|------|
| R960 | CNAS Maladie Salarié | 1.5% |
| R961 | CNAS Retraite Salarié | 6.75% |
| R962 | CNAC Chômage Salarié | 0.5% |
| R963 | CNAS Retr. Antic. Salarié | 0.25% |
| R964 | **TOTAL** | **9%** |

### CNAS détaillé employeur (R965-R970)

Décomposition du 26% CNAS employeur en 5 sous-cotisations :

| Code | Libellé | Taux |
|------|---------|------|
| R965 | CNAS Maladie Employeur | 12.5% |
| R966 | CNAS AT/Maladie Pro | 1.25% |
| R967 | CNAS Retraite Employeur | 11% |
| R968 | CNAC Chômage Employeur | 1% |
| R969 | CNAS Retr. Antic. Employeur | 0.25% |
| R970 | **TOTAL** | **26%** |

### IRG 2025 avec réduction familiale (R971-R974)

| Code | Libellé | Formule |
|------|---------|---------|
| R971 | Base imposable IRG 2025 | R[763] - R[964] |
| R972 | Réduction charges famille | (saisi) |
| R973 | IRG 2025 (barème) | IRG(R[971], R[655]) |
| R974 | IRG 2025 net | R[973] - R[972] |

### Prime d'ancienneté (R975-R977)

```
R977 = R[975] * R[976] * R[250] / 100
     = années d'ancienneté × taux × base indemnités / 100
```

Exemple : 10 ans × 2% × 30 000 = 6 000 DA

### Nouvelles indemnités 2025 (R978-R983)

| Code | Libellé | Formule | Cotisable | Imposable |
|------|---------|---------|-----------|-----------|
| R978 | Transport forfait 2025 | (saisi) | Non | Oui |
| R979 | Panier jours 2025 | (saisi) | — | — |
| R980 | Panier taux 2025 | 120 DA | — | — |
| R981 | Indemnité panier 2025 | R[979]×R[980] | Non | Oui |
| R982 | Gratification 13e mois | R[030]/12 | Oui | Oui |
| R983 | Prime de bilan / fin d'année | (saisi) | Oui | Oui |

---

## 12. Masse salariale et cotisations employeur

### R824 — Masse salariale totale (ord 82400)
```
R824 = R[763] + R[800] + R[801] + R[819]
     = brut + cotis. congés payés + chômage intempéries + total CNAS employeur
```

### Détail des charges employeur

| Rubrique | Libellé | Base | Taux |
|----------|---------|------|------|
| R800 | Cotisation congés payés | R[500]×R[501] | 12.21% |
| R816 | CNAS 16% (AT/maladie) | R[805]=R[500]×R[508] | 16% |
| R817 | CNAS 26% (retraite/chômage) | R[807]=R[500]×(1-R[508]) | 26% |
| R965-R970 | CNAS détaillé employeur 2025 | R[500] | 26% total |

R508 = ratio de répartition entre 16% et 26% (dépend du secteur d'activité).

---

## 13. Paramètres globaux configurables

### Table `salary_settings`

Ces paramètres sont configurables via l'onglet **Rubriques → Paramètres Salaires** :

| Clé | Description | Défaut |
|-----|-------------|--------|
| `cotisable_total_code` | Code rubrique total cotisable | 500 |
| `imposable_total_code` | Code rubrique total imposable | 652 |
| `brut_total_code` | Code rubrique brut total | 763 |
| `gains_total_code` | Code rubrique total gains | 765 |
| `retenues_total_code` | Code rubrique total retenues | 767 |
| `net_payer_code` | Code rubrique net à payer | 770 |
| `cnas_employee_rate` | Taux CNAS salarié (%) | 9 |
| `cnas_employer_rate` | Taux CNAS employeur (%) | 26 |
| `irg_abattement_rate` | Taux abattement IRG | 0.40 |
| `irg_abattement_min` | Abattement IRG min (DA) | 1000 |
| `irg_abattement_max` | Abattement IRG max (DA) | 1500 |
| `irg_exoneration_threshold` | Seuil exonération IRG (DA) | 30000 |
| `snmg` | Salaire national minimum garanti | 24000 |
| `monthly_hours` | Heures mensuelles | 173.33 |
| `monthly_days` | Jours mensuels | 30 |
| `family_reduction` | Réduction familiale (DA/pers) | 1500 |

### Table `global_params` (variables T[])

Ces paramètres surchargent les variables T[] au démarrage du calcul :

| Clé | Variable T[] | Description |
|-----|--------------|-------------|
| `9` | T[09] | Jours ouvrés par mois |
| `10` | T[10] | Heures par mois |
| `16` | T[16] | Coefficient heures supplémentaires |
| `17` | T[17] | Coefficient nuit/weekend |
| `40` | T[40] | Flag exonération IRG (1=étranger) |
| `47` | T[47] | Mutuelle active (1=oui) |
| `77` | T[77] | CACOBATH coefficient |

### Priorité des paramètres

```
1. salary_settings (valeurs par défaut configurables)
2. global_params (override T[] au démarrage)
3. paies (override par employé/période pour T[09], T[10])
4. input_values (override par simulation/saisie mensuelle)
```

---

## 14. Catalogue complet des rubriques actives

### Rubriques avec formule (75 rubriques actives sur 999)

#### Paramètres de base (ord 100-2600)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R001 | Salaire de base mensuel | `T[07]` | cl7 |
| R005 | Taux horaire | `(R[001]+R[330]+R[291]+R[281]+R[297])/T[10]` | cl7 |
| R010 | Taux journalier | `(R[001]+R[003]+R[330]+R[291]+R[281]+R[297])/T[09]` | cl7 |
| R024 | Taux HS/Journalier | `T[16]*R[005]+T[17]*R[010]` | cl7 |
| R026 | Nb heures/jours travaillés | `T[15]*T[09]+T[16]*R[015]+T[17]*R[020]` | cl7 |

#### Salaire de base et absences (ord 3000-10000)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R030 | Salaire de base | `T[15]*(R[001]+R[003])+T[16]*R[005]*R[015]+T[17]*R[010]*R[020]` | BRUT/IMPOS/SECU/TOTAL |
| R034 | Retenue absence | `R[033]*R[010]` | BRUT/IMPOS/SECU/TOTAL |
| R061 | Retenue reprise congé | `R[060]*R[010]` | BRUT/IMPOS/SECU/TOTAL |
| R066 | Retenue heures absence | `R[065]*R[005]` | BRUT/IMPOS/SECU/TOTAL |
| R090 | Congé maladie | `R[089]*R[010]` | BRUT/IMPOS/SECU/TOTAL |
| R100 | Congé/STC | `R[099]*R[010]` | BRUT/IMPOS/SECU/TOTAL |

#### Heures supplémentaires (ord 11000-12900)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R111 | HS 50% (taux) | `R[005]*IF(R[110]>0, 1.500, 0)` | cl5 |
| R112 | HS 50% (montant) | `R[110]*R[111]` | BRUT/IMPOS/SECU/TOTAL |
| R121 | HS 75% (taux) | `R[005]*IF(R[120]>0, 1.750, 0)` | cl5 |
| R122 | HS 75% (montant) | `R[120]*R[121]` | BRUT/IMPOS/SECU/TOTAL |
| R128 | HS 100% (taux) | `IF(R[127]>0.01, R[005]*2.00, 0)` | cl5 |
| R129 | HS 100% (montant) | `R[127]*R[128]` | BRUT/IMPOS/SECU/TOTAL |

#### Prorata (ord 20000-20600)

| Code | Libellé | Formule |
|------|---------|---------|
| R200 | Coefficient prorata | `T[15]*(T[10]-R[033]*T[78]-R[060]*T[78]-R[065])/T[10]+T[16]*R[015]/T[10]+T[17]*R[020]/T[09]` |
| R205 | Temps travail (jours) | `T[15]*(T[09]-R[033]-R[060]-R[065]/T[78])+T[16]*R[015]/T[78]+T[17]*R[020]+R[099]` |
| R206 | Temps travail (heures) | `T[15]*(T[10]-R[033]*T[78]-R[060]*T[78]-R[065])+T[16]*R[015]+T[17]*R[020]*T[78]+R[099]*T[78]` |

#### Indemnités et primes (ord 25000-31800)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R250 | Base indemnités | `R[030]-T[15]*(R[034]+R[061]+R[066])` | cl7 |
| R261 | IEP | `R[260]*R[250]/100` | BRUT/IMPOS/SECU/TOTAL |
| R271 | IFSP | `R[270]*R[250]/100` | BRUT/IMPOS/SECU/TOTAL |
| R281 | Nuisance | `R[280]*R[250]/100` | BRUT/IMPOS/SECU/TOTAL |
| R291 | Responsabilité | `R[290]*R[200]` | BRUT/IMPOS/SECU/TOTAL |
| R301 | PRI | `R[300]*R[250]/100` | BRUT/IMPOS/SECU/TOTAL |
| R311 | PRC | `R[310]*R[250]/100` | BRUT/IMPOS/SECU/TOTAL |
| R318 | ICR | `R[317]*R[200]` | BRUT/IMPOS/SECU/TOTAL |

#### Cotisations (ord 50000-51500)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R500 | Salaire de poste (cotisable) | `T[76]*T[01]` | TOTAL |
| R501 | CACOBATH flag | `1` (locked) | cl7 |
| R502 | Base CACOBATH | `T[01]*R[501]*T[77]` | cl7 |
| R503 | Taux CACOBATH | `0.375*R[501]*T[77]` | cl5 |
| R504 | Cotisation intempéries | `R[502]*R[503]/100` | IMPOS/TOTAL |
| R505 | Taux CNAS | `9` | cl5 |
| R510 | CNAS salarié | `R[500]*R[505]/100` | TOTAL |
| R514 | Taux mutuelle | `1.5` | cl5 |
| R515 | Retenue mutuelle | `R[500]*R[514]/100*T[47]` | IMPOS/TOTAL |

#### Panier et transport (ord 52000-53200)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R521 | Panier (taux) | `50` | cl5 |
| R522 | Panier | `R[520]*R[521]` | BRUT/IMPOS/TOTAL |
| R532 | Transport | `R[531]*R[200]` | BRUT/IMPOS/TOTAL |

#### IRG (ord 64100-66500)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R641 | Taux 10% | `10` | cl5 |
| R642 | Base 10% | `T[51]-T[76]*T[53]*R[505]/100` | cl7 |
| R646 | Retenue 10% | `R[642]*R[641]/100` | TOTAL |
| R650 | Base IRG/mois | `T[43]-T[76]*T[58]*R[505]/100` | TOTAL |
| R651 | Base IRG/régul | `T[41]-T[76]*T[57]*R[505]/100` | TOTAL |
| R652 | Total imposable IRG | `R[650]+R[651]` | TOTAL |
| R655 | Prorata IRG | `(1-T[40])*(...) + R[099]/30` | cl5 |
| R660 | **Retenue IRG** | `IRG(R[652],R[655])` | TOTAL |
| R665 | Total retenue IRG | `R[660]+R[662]-R[661]` | cl7 |

#### Allocations familiales (ord 69700-70000)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R697 | Taux alloc. fam. 300 | `300` | cl5 |
| R699 | Alloc. fam. 300 | `R[695]*R[697]` | TOTAL |
| R698 | Taux alloc. fam. 600 | `600` | cl5 |
| R700 | Alloc. fam. 600 | `R[696]*R[698]` | TOTAL |

#### Totaux (ord 76300-77000)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R763 | Salaire brut | `T[52]` | cl7 |
| R765 | Total gains | `T[03]` | cl7 |
| R767 | Total retenues | `T[04]` | cl7 |
| R770 | **Net à payer** | `R[765]-R[767]` | TOTAL |

#### Congés payés (ord 79000-79100)

| Code | Libellé | Formule |
|------|---------|---------|
| R790 | Congé du (nb jours) | `2.5` |
| R791 | Congé du (brut) | `R[500]/12` |

#### Masse salariale (ord 80000-82400)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R800 | Cotis. congés payés | `R[500]*R[501]*12.21/100` | SECU/TOTAL |
| R805 | Base cotisable 16% | `R[500]*R[508]` | cl0 |
| R807 | Base cotisable 26% | `R[500]*(1-R[508])` | cl0 |
| R816 | CNAS 16% | `R[805]*16/100` | SECU/TOTAL |
| R817 | CNAS 26% | `R[807]*26/100` | SECU/TOTAL |
| R819 | Total CNAS | `R[816]+R[817]` | TOTAL |
| R824 | **Masse salariale** | `R[763]+R[800]+R[801]+R[819]` | TOTAL |

#### CNAS détaillé 2025 (ord 95000-96000)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R960 | CNAS Maladie Sal. 1.5% | `R[500]*1.5/100` | IMPOS/TOTAL |
| R961 | CNAS Retraite Sal. 6.75% | `R[500]*6.75/100` | IMPOS/TOTAL |
| R962 | CNAC Chômage Sal. 0.5% | `R[500]*0.5/100` | IMPOS/TOTAL |
| R963 | CNAS Retr. Antic. Sal. 0.25% | `R[500]*0.25/100` | IMPOS/TOTAL |
| R964 | **Total CNAS Salarié 9%** | `R[960]+R[961]+R[962]+R[963]` | IMPOS/TOTAL |
| R965 | CNAS Maladie Emp. 12.5% | `R[500]*12.5/100` | SECU/TOTAL |
| R966 | CNAS AT/Maladie Pro 1.25% | `R[500]*1.25/100` | SECU/TOTAL |
| R967 | CNAS Retraite Emp. 11% | `R[500]*11/100` | SECU/TOTAL |
| R968 | CNAC Chômage Emp. 1% | `R[500]*1/100` | SECU/TOTAL |
| R969 | CNAS Retr. Antic. Emp. 0.25% | `R[500]*0.25/100` | SECU/TOTAL |
| R970 | **Total CNAS Employeur 26%** | `R[965]+R[966]+R[967]+R[968]+R[969]` | SECU/TOTAL |

#### IRG 2025 (ord 96100-96300)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R971 | Base IRG 2025 | `R[763]-R[964]` | TOTAL |
| R972 | Réduction charges famille | (saisi) | TOTAL |
| R973 | IRG 2025 (barème) | `IRG(R[971],R[655])` | IMPOS/TOTAL |
| R974 | **IRG 2025 net** | `R[973]-R[972]` | IMPOS/TOTAL |

#### Primes et indemnités 2025 (ord 96700-98000)

| Code | Libellé | Formule | Flags |
|------|---------|---------|-------|
| R977 | Prime d'ancienneté | `R[975]*R[976]*R[250]/100` | BRUT/IMPOS/SECU/TOTAL |
| R980 | Panier taux 2025 | `120` | cl5 |
| R981 | Indemnité panier 2025 | `R[979]*R[980]` | BRUT/IMPOS/TOTAL |
| R982 | Gratification 13e mois | `R[030]/12` | BRUT/IMPOS/SECU/TOTAL |

---

## Annexe : Syntaxe des formules PCPAIE

### Opérateurs supportés

| Opérateur | Description | Exemple |
|-----------|-------------|---------|
| `+` `-` | Addition / soustraction | `R[001]+R[003]` |
| `*` `/` | Multiplication / division | `R[500]*R[505]/100` |
| `(` `)` | Parenthèses | `(R[001]+R[003])/T[10]` |
| `R[NNN]` | Référence rubrique | `R[030]` |
| `T[NN]` | Variable système | `T[01]` |
| `M` | Valeur manuelle courante | `M` |
| `N` | Nombre manuel courant | `N` |
| `IF(cond, a, b)` | Conditionnelle | `IF(R[110]>0, 1.5, 0)` |
| `IRG(base, prorata)` | Calcul IRG | `IRG(R[652], R[655])` |

### Ordre d'évaluation

Les rubriques sont évaluées par **ordre croissant de `ord_clc`**. Une rubrique ne peut référencer que des rubriques déjà calculées (ordre inférieur).

**Exception** : Les valeurs de TOT-PAIE (template employé) sont pré-chargées pour toutes les rubriques avant le calcul, ce qui permet à R005 (ord 500) de référencer R291 (ord 29100) — la valeur précédente est utilisée jusqu'à ce que R291 soit recalculée.

---

*Document généré pour HAMTECH Paie — Août 2025*
