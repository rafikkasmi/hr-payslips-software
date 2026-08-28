use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub step: String,
    pub current: usize,
    pub total: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub employees: usize,
    pub rubriques: usize,
    pub paies: usize,
    pub lookups: usize,
    pub errors: Vec<String>,
}

pub fn import_pcpaie(
    app_conn: &Connection,
    pcpaie_path: &str,
    progress_cb: impl Fn(ImportProgress),
) -> Result<ImportResult, String> {
    if !Path::new(pcpaie_path).exists() {
        return Err(format!("File not found: {}", pcpaie_path));
    }

    let src = Connection::open(pcpaie_path).map_err(|e| format!("Cannot open PCPAIE db: {}", e))?;
    let mut errors = Vec::new();

    // 1. Import rubriques
    progress_cb(ImportProgress {
        step: "rubriques".into(),
        current: 0,
        total: 0,
        message: "Importing rubriques...".into(),
    });
    let rubriques_count = import_rubriques(app_conn, &src)?;

    // 2. Import employees (PERS0 + PERS2)
    progress_cb(ImportProgress {
        step: "employees".into(),
        current: 0,
        total: 0,
        message: "Importing employees...".into(),
    });
    let employees_count = import_employees(app_conn, &src)?;

    // 3. Import employee rubrique assignments (PERS1)
    progress_cb(ImportProgress {
        step: "pers1".into(),
        current: 0,
        total: 0,
        message: "Importing employee rubriques...".into(),
    });
    import_employee_rubriques(app_conn, &src)?;

    // 4. Import payroll history (PAIES)
    progress_cb(ImportProgress {
        step: "paies".into(),
        current: 0,
        total: 0,
        message: "Importing payroll history...".into(),
    });
    let paies_count = import_paies(app_conn, &src)?;

    // 5. Import lookup values (VALEURS)
    progress_cb(ImportProgress {
        step: "lookups".into(),
        current: 0,
        total: 0,
        message: "Importing lookup values...".into(),
    });
    let lookups_count = import_lookups(app_conn, &src)?;

    // 6. Import company info (DOSSIER)
    progress_cb(ImportProgress {
        step: "company".into(),
        current: 0,
        total: 0,
        message: "Importing company info...".into(),
    });
    import_company_info(app_conn, &src).unwrap_or_else(|e| errors.push(format!("DOSSIER: {}", e)));

    // 7. Seed postes from employee data
    progress_cb(ImportProgress {
        step: "postes".into(),
        current: 0,
        total: 0,
        message: "Seeding postes from employee data...".into(),
    });
    seed_postes(app_conn).unwrap_or_else(|e| errors.push(format!("Postes seeding: {}", e)));

    // 8. Mark as initialized
    app_conn
        .execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('initialized', 'true')",
            [],
        )
        .map_err(|e| e.to_string())?;
    app_conn
        .execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pcpaie_path', ?1)",
            [pcpaie_path],
        )
        .map_err(|e| e.to_string())?;

    Ok(ImportResult {
        employees: employees_count,
        rubriques: rubriques_count,
        paies: paies_count,
        lookups: lookups_count,
        errors,
    })
}

fn import_rubriques(app: &Connection, src: &Connection) -> Result<usize, String> {
    let mut stmt = src
        .prepare(
            r#"SELECT rowid as code, LIBELLE, ALIBELLE, FORMULE, CLASSE, V_MIN, V_MAX,
               IS_INIT, IS_REGULAR, IS_BRUT, IS_IMPOS, IS_SECU_S, IS_TOTAL, IS_IMP,
               ORD_BUL, ORD_CLC, ORD_REC, ORD_JRN, IS_LOCKED, CALCUL, MANUELLE,
               INIT_VAL, PRECISION, IMAGE, PAR_1, PAR_2, RC_NB_BASE, POINTER,
               TYPE_PCC, CD_NB_BASE, CD_TAUX, BR_COMP, BR_TIERS, BR_COMP_D, BR_TIERS_D,
               BR_COMP_C, BR_TIERS_C, TRANS_COD, N_ARRONDIR, RECALC_OK, IS_IMP_B, USER_CODE
               FROM RUBRIQUE"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,          // code
                row.get::<_, Option<String>>(1)?, // libelle
                row.get::<_, Option<String>>(2)?, // alibelle
                row.get::<_, Option<String>>(3)?, // formule
                row.get::<_, Option<f64>>(4)?,    // classe
                row.get::<_, Option<f64>>(5)?,    // v_min
                row.get::<_, Option<f64>>(6)?,    // v_max
                row.get::<_, Option<i64>>(7)?,    // is_init
                row.get::<_, Option<i64>>(8)?,    // is_regular
                row.get::<_, Option<i64>>(9)?,    // is_brut
                row.get::<_, Option<i64>>(10)?,   // is_impos
                row.get::<_, Option<i64>>(11)?,   // is_secu_s
                row.get::<_, Option<i64>>(12)?,   // is_total
                row.get::<_, Option<i64>>(13)?,   // is_imp
                row.get::<_, Option<f64>>(14)?,   // ord_bul
                row.get::<_, Option<f64>>(15)?,   // ord_clc
                row.get::<_, Option<f64>>(16)?,   // ord_rec
                row.get::<_, Option<f64>>(17)?,   // ord_jrn
                row.get::<_, Option<i64>>(18)?,   // is_locked
                row.get::<_, Option<i64>>(19)?,   // calcul
                row.get::<_, Option<i64>>(20)?,   // manuelle
                row.get::<_, Option<f64>>(21)?,   // init_val
                row.get::<_, Option<String>>(22)?, // precision
                row.get::<_, Option<String>>(23)?, // image
                row.get::<_, Option<f64>>(24)?,   // par_1
                row.get::<_, Option<f64>>(25)?,   // par_2
                row.get::<_, Option<String>>(26)?, // rc_nb_base
                row.get::<_, Option<String>>(27)?, // pointer
                row.get::<_, Option<f64>>(28)?,   // type_pcc
                row.get::<_, Option<String>>(29)?, // cd_nb_base
                row.get::<_, Option<String>>(30)?, // cd_taux
                row.get::<_, Option<String>>(31)?, // br_comp
                row.get::<_, Option<String>>(32)?, // br_tiers
                row.get::<_, Option<String>>(33)?, // br_comp_d
                row.get::<_, Option<String>>(34)?, // br_tiers_d
                row.get::<_, Option<String>>(35)?, // br_comp_c
                row.get::<_, Option<String>>(36)?, // br_tiers_c
                row.get::<_, Option<f64>>(37)?,   // trans_cod
                row.get::<_, Option<i64>>(38)?,   // n_arrondir
                row.get::<_, Option<i64>>(39)?,   // recalc_ok
                row.get::<_, Option<f64>>(40)?,   // is_imp_b
                row.get::<_, Option<String>>(41)?, // user_code
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut inserted = 0;
    for row_result in rows {
        let r = row_result.map_err(|e| e.to_string())?;
        let code = format!("{:03}", r.0);
        app.execute(
            r#"INSERT OR REPLACE INTO rubriques
               (code, libelle, alibelle, formule, classe, v_min, v_max,
                is_init, is_regular, is_brut, is_impos, is_secu_s, is_total, is_imp,
                ord_bul, ord_clc, ord_rec, ord_jrn, is_locked, calcul, manuelle,
                init_val, precision, image, par_1, par_2, rc_nb_base, pointer,
                type_pcc, cd_nb_base, cd_taux, br_comp, br_tiers,
                br_comp_d, br_tiers_d, br_comp_c, br_tiers_c,
                trans_cod, n_arrondir, recalc_ok, is_imp_b, user_code)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            rusqlite::params![
                code, r.1, r.2, r.3, r.4, r.5, r.6,
                r.7.unwrap_or(0), r.8.unwrap_or(0), r.9.unwrap_or(0), r.10.unwrap_or(0),
                r.11.unwrap_or(0), r.12.unwrap_or(0), r.13.unwrap_or(0),
                r.14, r.15, r.16, r.17, r.18.unwrap_or(0), r.19.unwrap_or(0), r.20.unwrap_or(0),
                r.21, r.22, r.23, r.24, r.25, r.26, r.27,
                r.28, r.29, r.30, r.31, r.32, r.33, r.34, r.35, r.36,
                r.37, r.38.unwrap_or(0), r.39.unwrap_or(0), r.40, r.41
            ],
        )
        .map_err(|e| e.to_string())?;
        inserted += 1;
    }

    Ok(inserted)
}

fn import_employees(app: &Connection, src: &Connection) -> Result<usize, String> {
    let mut stmt = src
        .prepare(
            r#"SELECT MATRICULE, NOM, PRENOM, SIT_FAM, NBRE_ENF, NAISS_DATE,
               DTE_ENTREE, DTE_SORTIE, ACTIF, SEXE, NO_GRILLE, CATEGORIE,
               SECTION, ECHELON, CLASSE, STRUCTURE, UNITE, AFFECTATIO,
               CONTRAT, SECT1, CODE_CAISS, ORG_PAYEUR, ORG_PEMPLY,
               CODE_IRG, CODE_CNAS, NO_CNAS, N_SECU_SLE, NO_COMPTE, COD_REGL
               FROM PERS0"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<i64>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, Option<String>>(13)?,
                row.get::<_, Option<String>>(14)?,
                row.get::<_, Option<String>>(15)?,
                row.get::<_, Option<String>>(16)?,
                row.get::<_, Option<String>>(17)?,
                row.get::<_, Option<String>>(18)?,
                row.get::<_, Option<String>>(19)?,
                row.get::<_, Option<String>>(20)?,
                row.get::<_, Option<String>>(21)?,
                row.get::<_, Option<String>>(22)?,
                row.get::<_, Option<f64>>(23)?,
                row.get::<_, Option<f64>>(24)?,
                row.get::<_, Option<i64>>(25)?,
                row.get::<_, Option<String>>(26)?,
                row.get::<_, Option<String>>(27)?,
                row.get::<_, Option<f64>>(28)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut inserted = 0;
    for row_result in rows {
        let r = row_result.map_err(|e| e.to_string())?;
        let matricule = r.0.clone().unwrap_or_default().trim().to_string();
        if matricule.is_empty() {
            continue;
        }
        app.execute(
            r#"INSERT OR REPLACE INTO employees
               (matricule, nom, prenom, sit_fam, nbre_enf, naiss_date,
                dte_entree, dte_sortie, actif, sexe, no_grille, categorie,
                section, echelon, classe, structure, unite, affectatio,
                contrat, sect1, code_caisss, org_payeur, org_pemploy,
                code_irg, code_cnas, no_cnas, n_secu_sle, no_compte, cod_regl)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            rusqlite::params![
                matricule, r.1, r.2, r.3, r.4.unwrap_or(0.0), r.5,
                r.6, r.7, r.8.unwrap_or(1), r.9, r.10, r.11,
                r.12, r.13, r.14, r.15, r.16, r.17,
                r.18, r.19, r.20, r.21, r.22,
                r.23, r.24, r.25, r.26, r.27, r.28
            ],
        )
        .map_err(|e| e.to_string())?;
        inserted += 1;
    }

    // Also import PERS2 data (address, phone, etc.)
    if let Ok(mut stmt2) = src.prepare(
        r#"SELECT MATRICULE, ADRESSE, TELEPHONE, E_MAIL, N_ID_NAT FROM PERS2"#,
    ) {
        let rows2 = stmt2.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        });
        if let Ok(rows2) = rows2 {
            for row_result in rows2 {
                if let Ok(r) = row_result {
                    let mat = r.0.clone().unwrap_or_default().trim().to_string();
                    if mat.is_empty() {
                        continue;
                    }
                    app.execute(
                        r#"UPDATE employees SET adresse=?, telephone=?, e_mail=?, n_id_nat=?
                           WHERE matricule=?"#,
                        rusqlite::params![r.1, r.2, r.3, r.4, mat],
                    )
                    .ok();
                }
            }
        }
    }

    Ok(inserted)
}

fn import_employee_rubriques(app: &Connection, src: &Connection) -> Result<usize, String> {
    // PERS1 has COD_RUB01..COD_RUB120 per employee
    let mut stmt = src
        .prepare("SELECT MATRICULE, COD_RUB01, COD_RUB02, COD_RUB03, COD_RUB04, COD_RUB05, COD_RUB06, COD_RUB07, COD_RUB08, COD_RUB09, COD_RUB10, COD_RUB11, COD_RUB12, COD_RUB13, COD_RUB14, COD_RUB15, COD_RUB16, COD_RUB17, COD_RUB18, COD_RUB19, COD_RUB20 FROM PERS1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let mut codes = Vec::new();
            let matricule: Option<String> = row.get(0)?;
            for i in 1..=20 {
                let code: Option<String> = row.get(i)?;
                if let Some(c) = code {
                    let c = c.trim().to_string();
                    if !c.is_empty() {
                        codes.push(c);
                    }
                }
            }
            Ok((matricule, codes))
        })
        .map_err(|e| e.to_string())?;

    let mut inserted = 0;
    for row_result in rows {
        let (matricule, codes) = row_result.map_err(|e| e.to_string())?;
        let matricule = matricule.unwrap_or_default().trim().to_string();
        if matricule.is_empty() {
            continue;
        }
        let emp_id: Option<i64> = app
            .query_row(
                "SELECT id FROM employees WHERE matricule=?",
                [&matricule],
                |r| r.get(0),
            )
            .ok();
        if let Some(emp_id) = emp_id {
            for (idx, code) in codes.iter().enumerate() {
                app.execute(
                    "INSERT INTO employee_rubriques (employee_id, rubrique_code, sort_order) VALUES (?,?,?)",
                    rusqlite::params![emp_id, code, idx as i64],
                )
                .ok();
                inserted += 1;
            }
        }
    }

    Ok(inserted)
}

fn import_paies(app: &Connection, src: &Connection) -> Result<usize, String> {
    let mut stmt = src
        .prepare(
            r#"SELECT MATRICULE, MOIS, MONTANTS, SIT_FAM, NBRE_ENF, NO_GRILLE,
               CODE_IRG, CODE_CNAS, NBR_ENF_AF, NBR_PRS_CH, NBR_JR_OUV,
               NBR_HR_OUV, SECT1, STRUCTURE, CLASSE, UNITE, AFFECTATIO,
               C_DATE, C_TIME
               FROM PAIES"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<f64>>(6)?,
                row.get::<_, Option<f64>>(7)?,
                row.get::<_, Option<f64>>(8)?,
                row.get::<_, Option<f64>>(9)?,
                row.get::<_, Option<f64>>(10)?,
                row.get::<_, Option<f64>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, Option<String>>(13)?,
                row.get::<_, Option<String>>(14)?,
                row.get::<_, Option<String>>(15)?,
                row.get::<_, Option<String>>(16)?,
                row.get::<_, Option<String>>(17)?,
                row.get::<_, Option<String>>(18)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut inserted = 0;
    for row_result in rows {
        let r = row_result.map_err(|e| e.to_string())?;
        let matricule = r.0.clone().unwrap_or_default().trim().to_string();
        if matricule.is_empty() {
            continue;
        }
        let emp_id: Option<i64> = app
            .query_row(
                "SELECT id FROM employees WHERE matricule=?",
                [&matricule],
                |r| r.get(0),
            )
            .ok();
        if let Some(emp_id) = emp_id {
            app.execute(
                r#"INSERT INTO paies
                   (employee_id, mois, matricule, montants, sit_fam, nbre_enf,
                    no_grille, code_irg, code_cnas, nbr_enf_af, nbr_prs_ch,
                    nbr_jr_ouv, nbr_hr_ouv, sect1, structure, classe, unite,
                    affectatio, c_date, c_time)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
                rusqlite::params![
                    emp_id, r.1, r.0, r.2, r.3, r.4,
                    r.5, r.6, r.7, r.8, r.9,
                    r.10, r.11, r.12, r.13, r.14, r.15,
                    r.16, r.17, r.18
                ],
            )
            .map_err(|e| e.to_string())?;
            inserted += 1;
        }
    }

    Ok(inserted)
}

fn import_lookups(app: &Connection, src: &Connection) -> Result<usize, String> {
    let mut stmt = src
        .prepare(
            r#"SELECT "TABLE", CODE, LIBELLE, AUX_NOM, COMPTE, COMPTE_CCP,
               NO_AGENCE, SELECTION FROM VALEURS"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<i64>>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut inserted = 0;
    for row_result in rows {
        let r = row_result.map_err(|e| e.to_string())?;
        let table = r.0.clone().unwrap_or_default();
        let code = r.1.clone().unwrap_or_default();
        if table.is_empty() || code.is_empty() {
            continue;
        }
        app.execute(
            r#"INSERT OR REPLACE INTO lookup_values
               (table_name, code, libelle, aux_nom, compte, compte_ccp, no_agence, selection)
               VALUES (?,?,?,?,?,?,?,?)"#,
            rusqlite::params![table, code, r.2, r.3, r.4, r.5, r.6, r.7.unwrap_or(0)],
        )
        .map_err(|e| e.to_string())?;
        inserted += 1;
    }

    Ok(inserted)
}

fn import_company_info(app: &Connection, src: &Connection) -> Result<(), String> {
    let mut stmt = src
        .prepare(
            r#"SELECT DOSS_NOM, DOSS_RUE, DOSS_VIL, DOSS_NSECU, DOSS_SKEY1,
               DOSS_SKEY2, DOSS_SKEY3, DOSS_SKEY4, DOSS_NGER, DOSS_PGER,
               CLOT_MOIS, CLOT_ANNEE FROM DOSSIER LIMIT 1"#,
        )
        .map_err(|e| e.to_string())?;

    if let Ok(row_result) = stmt.query_row([], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, Option<f64>>(10)?,
            row.get::<_, Option<f64>>(11)?,
        ))
    }) {
        let r = row_result;
        app.execute(
            r#"INSERT OR REPLACE INTO company_info
               (id, doss_nom, doss_rue, doss_vil, doss_nsecu, doss_skey1,
                doss_skey2, doss_skey3, doss_skey4, doss_nger, doss_pger,
                clot_mois, clot_annee)
               VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            rusqlite::params![r.0, r.1, r.2, r.3, r.4, r.5, r.6, r.7, r.8, r.9, r.10, r.11],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Parse a PAIES montants string into a map of rubrique_code -> amount.
fn parse_montants_for_seeding(montants: &str) -> std::collections::HashMap<String, f64> {
    let mut map = std::collections::HashMap::new();
    for line in montants.lines() {
        let line = line.trim();
        if !line.starts_with('R') || line.len() < 5 {
            continue;
        }
        let code_str: String = line.chars().skip(1).take(3).collect();
        let val_str: String = line.chars().skip(4).collect();
        if let Ok(val) = val_str.trim().parse::<f64>() {
            if let Ok(n) = code_str.parse::<i64>() {
                map.insert(format!("{:03}", n), val);
            }
        }
    }
    map
}

/// Seed postes by clustering employees with identical rubrique code sets.
/// For each cluster, create a poste and extract fixed rubrique values from the
/// latest payslip of the most representative employee (most payslip records).
pub fn seed_postes(app: &Connection) -> Result<(), String> {
    use std::collections::{HashMap, BTreeSet};

    // Get all employee rubrique codes grouped by employee
    let mut emp_rubriques: HashMap<i64, BTreeSet<String>> = HashMap::new();
    {
        let mut stmt = app
            .prepare("SELECT employee_id, rubrique_code FROM employee_rubriques")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (emp_id, code) = row.map_err(|e| e.to_string())?;
            emp_rubriques.entry(emp_id).or_default().insert(code);
        }
    }

    // Pre-compute paies count per employee in ONE query (instead of per-cluster)
    let mut paies_count: HashMap<i64, i64> = HashMap::new();
    {
        let mut stmt = app
            .prepare("SELECT employee_id, COUNT(*) as cnt FROM paies WHERE mois != 'TOT-PAIE' GROUP BY employee_id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (emp_id, cnt) = row.map_err(|e| e.to_string())?;
            paies_count.insert(emp_id, cnt);
        }
    }

    // Cluster employees by their rubrique set
    let mut clusters: HashMap<BTreeSet<String>, Vec<i64>> = HashMap::new();
    for (emp_id, rub_set) in &emp_rubriques {
        clusters.entry(rub_set.clone()).or_default().push(*emp_id);
    }

    // Sort clusters by size (largest first) for stable naming
    let mut sorted_clusters: Vec<(BTreeSet<String>, Vec<i64>)> = clusters.into_iter().collect();
    sorted_clusters.sort_by(|a, b| b.1.len().cmp(&a.1.len()));

    // Begin transaction for batch inserts
    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    // For each cluster, create a poste
    for (idx, (rub_set, emp_ids)) in sorted_clusters.iter().enumerate() {
        let poste_name = format!("Poste {}", idx + 1);
        app.execute(
            "INSERT INTO postes (name, description) VALUES (?, ?)",
            rusqlite::params![poste_name, format!("Auto-derived poste with {} employees", emp_ids.len())],
        )
        .map_err(|e| e.to_string())?;
        let poste_id = app.last_insert_rowid();

        // Find the employee with the most payslip records in this cluster (from pre-computed map)
        let representative_emp = emp_ids
            .iter()
            .max_by_key(|id| paies_count.get(id).copied().unwrap_or(0))
            .copied()
            .unwrap_or(emp_ids[0]);

        // Get the latest payslip for the representative employee
        let latest_montants: Option<String> = app
            .query_row(
                "SELECT montants FROM paies WHERE employee_id=? AND mois != 'TOT-PAIE' ORDER BY mois DESC, c_date DESC LIMIT 1",
                [representative_emp],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten();

        // Parse montants to get rubrique values
        let montant_values = if let Some(ref m) = latest_montants {
            parse_montants_for_seeding(m)
        } else {
            HashMap::new()
        };

        // Insert poste_rubriques for all rubriques in the set
        for (sort_idx, rub_code) in rub_set.iter().enumerate() {
            let numeric_code: String = rub_code.chars().skip(1).collect();
            let default_value = montant_values.get(&numeric_code).copied().unwrap_or(0.0);
            app.execute(
                "INSERT OR IGNORE INTO poste_rubriques (poste_id, rubrique_code, default_value, is_fixed, sort_order) VALUES (?, ?, ?, 1, ?)",
                rusqlite::params![poste_id, rub_code, default_value, sort_idx as i64],
            )
            .map_err(|e| e.to_string())?;
        }

        // Batch-assign all employees in this cluster to the poste
        for emp_id in emp_ids {
            app.execute(
                "UPDATE employees SET poste_id=? WHERE id=?",
                rusqlite::params![poste_id, emp_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(())
}
