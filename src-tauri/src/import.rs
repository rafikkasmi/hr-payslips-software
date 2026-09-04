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

    // 1b. Enrich rubrique libelles from MCC files (WDOC/MULTI_COLONNES/*.MCC)
    // MCC files contain user-defined labels that are often empty in RUBRIQUEX.DTA
    // Derive the PCPAIE folder from the db path's parent directory
    if let Some(parent) = Path::new(pcpaie_path).parent() {
        let _ = crate::native_import::import_mcc_libelles(app_conn, &parent.to_string_lossy());
    }

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

/// Seed postes from PCPAIE FNC lookup values and assign employees by sect1.
/// For each FNC poste, rubrique defaults are seeded from the most representative employee.
pub fn seed_postes(app: &Connection) -> Result<(), String> {
    use std::collections::{HashMap, BTreeSet};

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    // 1. Insert/update postes from FNC lookup values — ONLY for codes with employees
    let mut fnc_codes: Vec<(String, String)> = Vec::new();
    {
        let mut stmt = app
            .prepare(r#"SELECT l.code, l.libelle FROM lookup_values l
                        WHERE l.table_name='FNC'
                        AND EXISTS (SELECT 1 FROM employees e WHERE e.sect1 = l.code)
                        ORDER BY l.code"#)
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            fnc_codes.push(row.map_err(|e| e.to_string())?);
        }
    }

    for (code, libelle) in &fnc_codes {
        let name = if libelle.trim().is_empty() { code.clone() } else { libelle.trim().to_string() };
        app.execute(
            "INSERT OR REPLACE INTO postes (id, name, description, fnc_code, is_manual, updated_at) VALUES (
                COALESCE((SELECT id FROM postes WHERE fnc_code=?), NULL),
                ?, ?, ?, 0, datetime('now')
            )",
            rusqlite::params![code, name, code, code],
        )
        .map_err(|e| e.to_string())?;
    }

    // 2. Ensure fallback postes for unmapped employees
    let fallback_unmapped = "FNC NON RENSEIGNE";
    app.execute(
        "INSERT OR IGNORE INTO postes (name, description, fnc_code, is_manual) VALUES (?, '', '', 0)",
        [fallback_unmapped],
    ).map_err(|e| e.to_string())?;
    let unmapped_id: i64 = app.query_row(
        "SELECT id FROM postes WHERE fnc_code='' AND is_manual=0",
        [],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    // 3. Assign employees to postes via sect1
    app.execute(
        "UPDATE employees SET poste_id = (SELECT id FROM postes WHERE fnc_code = employees.sect1 LIMIT 1)",
        [],
    ).map_err(|e| e.to_string())?;
    app.execute(
        "UPDATE employees SET poste_id = ? WHERE poste_id IS NULL",
        [unmapped_id],
    ).map_err(|e| e.to_string())?;

    // 4. Seed poste_rubriques per poste from representative employee
    // Get all employee rubriques per employee
    let mut emp_rubriques: HashMap<i64, BTreeSet<String>> = HashMap::new();
    {
        let mut stmt = app
            .prepare("SELECT employee_id, rubrique_code FROM employee_rubriques")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (emp_id, code) = row.map_err(|e| e.to_string())?;
            emp_rubriques.entry(emp_id).or_default().insert(code);
        }
    }

    // Pre-compute paies count per employee
    let mut paies_count: HashMap<i64, i64> = HashMap::new();
    {
        let mut stmt = app
            .prepare("SELECT employee_id, COUNT(*) as cnt FROM paies WHERE mois GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]' GROUP BY employee_id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (emp_id, cnt) = row.map_err(|e| e.to_string())?;
            paies_count.insert(emp_id, cnt);
        }
    }

    // Get employee IDs per poste
    let mut poste_employees: HashMap<i64, Vec<i64>> = HashMap::new();
    {
        let mut stmt = app
            .prepare("SELECT poste_id, id FROM employees WHERE poste_id IS NOT NULL ORDER BY poste_id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (poste_id, emp_id) = row.map_err(|e| e.to_string())?;
            poste_employees.entry(poste_id).or_default().push(emp_id);
        }
    }

    for (poste_id, emp_ids) in &poste_employees {
        // Representative = employee with most payslip records
        let representative_emp = emp_ids
            .iter()
            .max_by_key(|id| paies_count.get(id).copied().unwrap_or(0))
            .copied()
            .unwrap_or(emp_ids[0]);

        // Union of all rubriques from employees in this poste
        let mut all_rubriques: BTreeSet<String> = BTreeSet::new();
        for emp_id in emp_ids {
            if let Some(set) = emp_rubriques.get(emp_id) {
                all_rubriques.extend(set.iter().cloned());
            }
        }

        // Get latest montants for representative
        let latest_montants: Option<String> = app
            .query_row(
                "SELECT montants FROM paies WHERE employee_id=? AND mois GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]' ORDER BY mois DESC, c_date DESC LIMIT 1",
                [representative_emp],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten();

        let montant_values = if let Some(ref m) = latest_montants {
            parse_montants_for_seeding(m)
        } else {
            HashMap::new()
        };

        // Insert poste_rubriques
        for (sort_idx, rub_code) in all_rubriques.iter().enumerate() {
            let numeric_code: String = rub_code.chars().skip(1).collect();
            let default_value = montant_values.get(&numeric_code).copied().unwrap_or(0.0);
            app.execute(
                "INSERT OR IGNORE INTO poste_rubriques (poste_id, rubrique_code, default_value, is_fixed, sort_order) VALUES (?, ?, ?, 1, ?)",
                rusqlite::params![poste_id, rub_code, default_value, sort_idx as i64],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(())
}

/// Recompute cached statistics for all postes based on latest payslip per employee.
/// Uses the parsed financial totals from paies.montants.
pub fn recompute_all_poste_stats(app: &Connection) -> Result<(), String> {
    use std::collections::HashMap;

    // Latest paies per employee (excluding TOT-PAIE), with montants
    let mut latest_paies: HashMap<i64, (String, String)> = HashMap::new(); // employee_id -> (mois, montants)
    {
        let mut stmt = app
            .prepare(
                "SELECT p1.employee_id, p1.mois, p1.montants
                 FROM paies p1
                 JOIN (
                     SELECT employee_id, MAX(mois) as max_mois
                     FROM paies
                     WHERE mois GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]'
                     GROUP BY employee_id
                 ) p2 ON p1.employee_id = p2.employee_id AND p1.mois = p2.max_mois
                 WHERE p1.mois GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]'"
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (emp_id, mois, montants) = row.map_err(|e| e.to_string())?;
            if let Some(m) = montants {
                latest_paies.insert(emp_id, (mois, m));
            }
        }
    }

    // Employees grouped by poste_id
    let mut poste_employees: HashMap<i64, Vec<(i64, String, i64, Option<String>)>> = HashMap::new();
    {
        let mut stmt = app
            .prepare("SELECT id, poste_id, dte_entree, actif FROM employees WHERE poste_id IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<i64>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (emp_id, poste_id, dte_entree, actif) = row.map_err(|e| e.to_string())?;
            if let Some(pid) = poste_id {
                poste_employees
                    .entry(pid)
                    .or_default()
                    .push((emp_id, dte_entree, actif.unwrap_or(0), None));
            }
        }
    }

    // Parse dates and compute stats
    use chrono::{NaiveDate, Utc};
    fn parse_date(s: &str) -> Option<NaiveDate> {
        // Try yyyymmdd first, then dd/mm/yyyy
        let s = s.trim();
        if s.len() == 8 {
            if let Ok(y) = s[0..4].parse::<i32>() {
                if let Ok(m) = s[4..6].parse::<u32>() {
                    if let Ok(d) = s[6..8].parse::<u32>() {
                        return NaiveDate::from_ymd_opt(y, m, d);
                    }
                }
            }
        }
        if s.len() == 10 && s.as_bytes()[2] == b'/' {
            let parts: Vec<&str> = s.split('/').collect();
            if parts.len() == 3 {
                if let (Ok(d), Ok(m), Ok(y)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>(), parts[2].parse::<i32>()) {
                    return NaiveDate::from_ymd_opt(y, m, d);
                }
            }
        }
        None
    }

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    app.execute("DELETE FROM poste_stats", []).map_err(|e| e.to_string())?;

    for (poste_id, employees) in &poste_employees {
        let count = employees.len();
        let active_count = employees.iter().filter(|(_, _, actif, _)| *actif != 0).count();

        let now = Utc::now().naive_utc();
        let mut seniority_sum: f64 = 0.0;
        let mut seniority_n: i64 = 0;
        for (_, dte_entree, _, _) in employees {
            if let Some(d) = parse_date(dte_entree) {
                seniority_sum += (now.date() - d).num_days() as f64 / 365.25;
                seniority_n += 1;
            }
        }
        let avg_seniority = if seniority_n > 0 { seniority_sum / seniority_n as f64 } else { 0.0 };

        let mut total_brut: f64 = 0.0;
        let mut total_net: f64 = 0.0;
        let mut total_n: i64 = 0;
        let mut last_period: Option<String> = None;

        for (emp_id, _, _, _) in employees {
            if let Some((mois, montants)) = latest_paies.get(emp_id) {
                let map = crate::parse_montants(montants);
                let totals = crate::extract_totals_from_montants(&map);
                total_brut += totals.0;
                total_net += totals.1;
                total_n += 1;
                if last_period.is_none() || mois > last_period.as_ref().unwrap() {
                    last_period = Some(mois.clone());
                }
            }
        }
        let avg_brut = if total_n > 0 { total_brut / total_n as f64 } else { 0.0 };

        app.execute(
            "INSERT INTO poste_stats (poste_id, employee_count, active_count, avg_seniority_years, total_brut, total_net, avg_brut, last_period, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            rusqlite::params![
                poste_id,
                count as i64,
                active_count as i64,
                avg_seniority,
                total_brut,
                total_net,
                avg_brut,
                last_period,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(())
}
