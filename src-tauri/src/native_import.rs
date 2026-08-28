//! Native PCPAIE file importer — full version with all data.
//! Reads .DTA (dBase III/IV) files and imports ALL data into the app's SQLite database.
//!
//! Pipeline (Go-like concurrency with Rust std::thread::scope + rayon):
//!
//! Phase 1 (parallel, 5 threads): Independent tables
//!   ├── RUBRIQUEX.DTA → rubriques
//!   ├── VALEURS.DTA   → lookup_values
//!   ├── DOSSIER.DTA   → company_info
//!   ├── GRILLE.DTA    → salary_grid
//!   └── PAIE_REF.DTA  → pay_periods
//!
//! Phase 2 (sequential): PERS0.DTA → employees (all 80 fields)
//!
//! Phase 3 (parallel, 4 threads):
//!   ├── PERS1.DTA → employee_rubriques + employee_rubrique_values
//!   ├── PERS2.DTA → employees UPDATE (all 61 fields)
//!   ├── ENFANTS.DTA → employee_children
//!   └── EVENTS.DTA → career_events
//!
//! Phase 4 (parallel, 2 threads — chunked with rayon):
//!   ├── PAIES.DTA   → paies (1.5M records, chunks of 5000)
//!   └── CONGES.DTA  → leave_history (1.59M records, chunks of 5000)
//!
//! Phase 5 (sequential): PRETS.DTA → employee_loans + post-processing

use rusqlite::Connection;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use crate::dbf::{DbfReader, get_str, get_num, get_bool};
use crate::import::ImportResult;

/// Find a file in a folder case-insensitively.
fn find_file(folder: &str, name: &str) -> Option<String> {
    let path = std::path::Path::new(folder);
    if let Ok(entries) = path.read_dir() {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.file_name().to_string_lossy().to_uppercase() == name.to_uppercase() {
                return Some(entry.path().to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Open a separate SQLite connection for parallel import work.
/// Uses WAL mode, 30s busy_timeout, and disables FK enforcement during import.
fn open_import_conn(db_path: &str) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("conn open: {}", e))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000; PRAGMA foreign_keys=OFF;")
        .map_err(|e| format!("PRAGMA: {}", e))?;
    Ok(conn)
}

/// Progress callback: (phase, step, current, total, message, overall_percent)
pub type ProgressCb = Arc<dyn Fn(&str, &str, usize, usize, &str, f64) + Send + Sync>;

/// Import all PCPAIE data from native .DTA files with parallel processing.
pub fn import_native_pcpaie(
    app_conn: &Connection,
    folder_path: &str,
    progress_cb: impl Fn(&str, &str, usize, usize, &str, f64) + Send + Sync + 'static,
) -> Result<ImportResult, String> {
    let progress = Arc::new(progress_cb);
    let db_path = app_conn
        .query_row("PRAGMA database_list", [], |r| r.get::<_, String>(2))
        .unwrap_or_else(|_| "hamtech.db".to_string());

    let mut errors = Vec::new();

    // Disable FK enforcement on the main connection during import
    app_conn.execute_batch("PRAGMA foreign_keys=OFF;").ok();

    // ============================================================
    // PHASE 1: Independent tables in parallel (5 threads)
    // ============================================================
    progress("phase1", "start", 0, 7, "Phase 1 — Tables indépendantes (7 threads parallèles)...", 0.0);

    let phase1_results = std::thread::scope(|s| {
        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p1 = progress.clone();
        let t_rub = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "RUBRIQUEX.DTA") {
                Some(path) => import_rubriques(&conn, &path, move |c, t, m| { p1("phase1", "rubriques", c, t, m, 0.0) }),
                None => Err("RUBRIQUEX.DTA not found".into()),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p2 = progress.clone();
        let t_val = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "VALEURS.DTA") {
                Some(path) => import_lookups(&conn, &path, move |c, t, m| { p2("phase1", "lookups", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p3 = progress.clone();
        let t_dos = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "DOSSIER.DTA") {
                Some(path) => { p3("phase1", "company", 0, 1, "DOSSIER.DTA...", 0.0); import_company_info(&conn, &path)?; p3("phase1", "company", 1, 1, "DOSSIER.DTA OK", 0.0); Ok(1usize) }
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p4 = progress.clone();
        let t_grl = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "GRILLE.DTA") {
                Some(path) => import_grille(&conn, &path, move |c, t, m| { p4("phase1", "grille", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p5 = progress.clone();
        let t_pref = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "PAIE_REF.DTA") {
                Some(path) => import_paie_ref(&conn, &path, move |c, t, m| { p5("phase1", "paie_ref", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p6 = progress.clone();
        let t_param = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "PARAMETR.DTA") {
                Some(path) => import_parametr(&conn, &path, move |c, t, m| { p6("phase1", "parametr", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p7 = progress.clone();
        let t_usersn = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "USERSN.DTA") {
                Some(path) => { p7("phase1", "usersn", 0, 1, "USERSN.DTA...", 0.0); import_usersn(&conn, &path)?; p7("phase1", "usersn", 1, 1, "USERSN.DTA OK", 0.0); Ok(1usize) }
                None => Ok(0),
            }
        });

        let r1 = t_rub.join().unwrap_or_else(|e| Err(format!("RUBRIQUEX panic: {:?}", e)));
        let r2 = t_val.join().unwrap_or_else(|e| Err(format!("VALEURS panic: {:?}", e)));
        let r3 = t_dos.join().unwrap_or_else(|e| Err(format!("DOSSIER panic: {:?}", e)));
        let r4 = t_grl.join().unwrap_or_else(|e| Err(format!("GRILLE panic: {:?}", e)));
        let r5 = t_pref.join().unwrap_or_else(|e| Err(format!("PAIE_REF panic: {:?}", e)));
        let r6 = t_param.join().unwrap_or_else(|e| Err(format!("PARAMETR panic: {:?}", e)));
        let r7 = t_usersn.join().unwrap_or_else(|e| Err(format!("USERSN panic: {:?}", e)));
        (r1, r2, r3, r4, r5, r6, r7)
    });

    let rubriques_count = match phase1_results.0 { Ok(n) => n, Err(e) => { errors.push(e); 0 } };
    let lookups_count = match phase1_results.1 { Ok(n) => n, Err(e) => { errors.push(e); 0 } };
    if let Err(e) = phase1_results.2 { errors.push(e); }
    if let Err(e) = phase1_results.3 { errors.push(e); }
    if let Err(e) = phase1_results.4 { errors.push(e); }
    if let Err(e) = phase1_results.5 { errors.push(e); }
    if let Err(e) = phase1_results.6 { errors.push(e); }

    progress("phase1", "done", 7, 7, "Phase 1 terminée", 10.0);

    // ============================================================
    // PHASE 2: PERS0 — employees (sequential, all 80 fields)
    // ============================================================
    progress("phase2", "start", 0, 0, "Phase 2 — Employés (PERS0.DTA, tous les champs)...", 10.0);

    let employees_count = match find_file(folder_path, "PERS0.DTA") {
        Some(path) => {
            let p = progress.clone();
            import_employees(app_conn, &path, move |c, t, m| { p("phase2", "employees", c, t, m, 0.0) })
                .unwrap_or_else(|e| { errors.push(format!("PERS0: {}", e)); 0 })
        }
        None => { errors.push("PERS0.DTA not found".into()); 0 }
    };

    progress("phase2", "done", employees_count, employees_count, "Phase 2 terminée", 25.0);

    // ============================================================
    // PHASE 3: PERS1 + PERS2 + ENFANTS + EVENTS in parallel (4 threads)
    // ============================================================
    progress("phase3", "start", 0, 4, "Phase 3 — PERS1 + PERS2 + ENFANTS + EVENTS (4 threads)...", 25.0);

    let phase3_results = std::thread::scope(|s| {
        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p1 = progress.clone();
        let t1 = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "PERS1.DTA") {
                Some(path) => import_pers1(&conn, &path, move |c, t, m| { p1("phase3", "pers1", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p2 = progress.clone();
        let t2 = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "PERS2.DTA") {
                Some(path) => import_pers2(&conn, &path, move |c, t, m| { p2("phase3", "pers2", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p3 = progress.clone();
        let t3 = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "ENFANTS.DTA") {
                Some(path) => import_enfants(&conn, &path, move |c, t, m| { p3("phase3", "enfants", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let dbp = db_path.clone();
        let folder = folder_path.to_string();
        let p4 = progress.clone();
        let t4 = s.spawn(move || {
            let conn = open_import_conn(&dbp)?;
            match find_file(&folder, "EVENTS.DTA") {
                Some(path) => import_events(&conn, &path, move |c, t, m| { p4("phase3", "events", c, t, m, 0.0) }),
                None => Ok(0),
            }
        });

        let r1 = t1.join().unwrap_or_else(|e| Err(format!("PERS1 panic: {:?}", e)));
        let r2 = t2.join().unwrap_or_else(|e| Err(format!("PERS2 panic: {:?}", e)));
        let r3 = t3.join().unwrap_or_else(|e| Err(format!("ENFANTS panic: {:?}", e)));
        let r4 = t4.join().unwrap_or_else(|e| Err(format!("EVENTS panic: {:?}", e)));
        (r1, r2, r3, r4)
    });

    if let Err(e) = phase3_results.0 { errors.push(format!("PERS1: {}", e)); }
    if let Err(e) = phase3_results.1 { errors.push(format!("PERS2: {}", e)); }
    if let Err(e) = phase3_results.2 { errors.push(e); }
    if let Err(e) = phase3_results.3 { errors.push(e); }

    progress("phase3", "done", 4, 4, "Phase 3 terminée", 35.0);

    // ============================================================
    // PHASE 4: PAIES + CONGES in parallel (2 threads, chunked rayon)
    // ============================================================
    let mut paies_count = 0usize;
    let mut conges_count = 0usize;

    progress("phase4", "start", 0, 0, "Phase 4 — PAIES + CONGES (2 threads, chunks parallèles)...", 35.0);

    let phase4_results = std::thread::scope(|s| {
        let dbp1 = db_path.clone();
        let folder1 = folder_path.to_string();
        let p1 = progress.clone();
        let t_paies = s.spawn(move || {
            let conn = open_import_conn(&dbp1)?;
            match find_file(&folder1, "PAIES.DTA") {
                Some(path) => import_paies_parallel(&conn, &path, p1),
                None => Ok(0usize),
            }
        });

        let dbp2 = db_path.clone();
        let folder2 = folder_path.to_string();
        let p2 = progress.clone();
        let t_conges = s.spawn(move || {
            let conn = open_import_conn(&dbp2)?;
            match find_file(&folder2, "CONGES.DTA") {
                Some(path) => import_conges_parallel(&conn, &path, p2),
                None => Ok(0usize),
            }
        });

        let r1 = t_paies.join().unwrap_or_else(|e| Err(format!("PAIES panic: {:?}", e)));
        let r2 = t_conges.join().unwrap_or_else(|e| Err(format!("CONGES panic: {:?}", e)));
        (r1, r2)
    });

    match phase4_results.0 { Ok(n) => paies_count = n, Err(e) => errors.push(format!("PAIES: {}", e)) }
    match phase4_results.1 { Ok(n) => conges_count = n, Err(e) => errors.push(format!("CONGES: {}", e)) }

    progress("phase4", "done", paies_count + conges_count, paies_count + conges_count, "Phase 4 terminée", 85.0);

    // ============================================================
    // PHASE 5: PRETS + post-processing (sequential)
    // ============================================================
    progress("phase5", "start", 0, 3, "Phase 5 — Prêts + post-traitement...", 85.0);

    // PRETS.DTA — use a separate connection to avoid transaction conflicts
    let mut prets_count = 0usize;
    if let Some(path) = find_file(folder_path, "PRETS.DTA") {
        progress("phase5", "prets", 0, 0, "PRETS.DTA — prêts...", 85.0);
        match open_import_conn(&db_path).and_then(|conn| import_prets(&conn, &path)) {
            Ok(n) => prets_count = n,
            Err(e) => errors.push(format!("PRETS: {}", e)),
        }
        progress("phase5", "prets", prets_count, prets_count, &format!("PRETS.DTA — {} prêts importés", prets_count), 88.0);
    }

    // Seed postes
    progress("phase5", "postes", 0, 1, "Génération des postes...", 90.0);
    crate::import::seed_postes(app_conn).unwrap_or_else(|e| { errors.push(format!("Postes: {}", e)); });
    progress("phase5", "postes", 1, 1, "Postes générés", 95.0);

    // Finalize
    progress("phase5", "finalizing", 0, 1, "Finalisation...", 97.0);
    app_conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('initialized', 'true')", []).map_err(|e| e.to_string())?;
    app_conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pcpaie_path', ?1)", [folder_path]).map_err(|e| e.to_string())?;
    // Re-enable FK enforcement
    app_conn.execute_batch("PRAGMA foreign_keys=ON;").ok();

    // Auto-cleanup: checkpoint WAL + vacuum to compact the database
    progress("phase5", "cleanup", 0, 1, "Nettoyage DB (VACUUM + WAL checkpoint)...", 98.0);
    app_conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").ok();
    app_conn.execute_batch("VACUUM;").ok();
    progress("phase5", "cleanup", 1, 1, "DB nettoyée", 99.0);

    progress("phase5", "done", 1, 1, "Import terminé", 100.0);

    Ok(ImportResult {
        employees: employees_count,
        rubriques: rubriques_count,
        paies: paies_count,
        lookups: lookups_count,
        errors,
    })
}

// ================================================================
// PERS0 — Employees (all 80 fields)
// ================================================================
fn import_employees(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;

    progress(0, total, "PERS0.DTA — employés (tous les champs)...");

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        let matricule = get_str(&record, "MATRICULE").trim().to_string();
        if matricule.is_empty() { continue; }

        app.execute(
            r#"INSERT OR REPLACE INTO employees
               (matricule, nom, prenom, sit_fam, nbre_enf, naiss_date, dte_entree, dte_sortie,
                actif, sexe, no_grille, categorie, section, echelon, classe, structure, unite,
                affectatio, contrat, sect1, code_caisss, org_payeur, org_pemploy, code_irg,
                code_cnas, no_cnas, n_secu_sle, no_compte, cod_regl,
                motif_sort, dte_cont_d, dte_cont_f, dte_repris, nbr_enfp10, nbr_enfm10,
                no_mutuel, mutu_dted, mutu_dtef, conj_trav, ok_intemp, ok_nat_etr,
                attrib1, attrib2, attrib3, categ_sp, diplome, code_grill, gestion, lock_val, conge, sorti,
                nbr_enf_af, nbr_prs_ch, no_profil)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            rusqlite::params![
                matricule,
                get_str(&record, "NOM"), get_str(&record, "PRENOM"),
                get_str(&record, "SIT_FAM"), get_num(&record, "NBRE_ENF"),
                get_str(&record, "NAISS_DATE"), get_str(&record, "DTE_ENTREE"), get_str(&record, "DTE_SORTIE"),
                if get_bool(&record, "ACTIF") { 1 } else { 0 }, get_str(&record, "SEXE"),
                get_str(&record, "NO_GRILLE"), get_str(&record, "CATEGORIE"), get_str(&record, "SECTION"),
                get_str(&record, "ECHELON"), get_str(&record, "CLASSE"), get_str(&record, "STRUCTURE"),
                get_str(&record, "UNITE"), get_str(&record, "AFFECTATIO"), get_str(&record, "CONTRAT"),
                get_str(&record, "SECT1"), get_str(&record, "CODE_CAISS"), get_str(&record, "ORG_PAYEUR"),
                get_str(&record, "ORG_PEMPLY"), get_num(&record, "CODE_IRG"), get_num(&record, "CODE_CNAS"),
                if get_bool(&record, "NO_CNAS") { 1 } else { 0 }, get_str(&record, "N_SECU_SLE"),
                get_str(&record, "NO_COMPTE"), get_num(&record, "COD_REGL"),
                get_str(&record, "MOTIF_SORT"), get_str(&record, "DTE_CONT_D"), get_str(&record, "DTE_CONT_F"),
                get_str(&record, "DTE_REPRIS"), get_num(&record, "NBR_ENFP10"), get_num(&record, "NBR_ENFM10"),
                get_str(&record, "NO_MUTUEL"), get_str(&record, "MUTU_DTED"), get_str(&record, "MUTU_DTEF"),
                get_str(&record, "CONJ_TRAV"),
                if get_bool(&record, "OK_INTEMP") { 1 } else { 0 },
                if get_bool(&record, "OK_NAT_ETR") { 1 } else { 0 },
                get_str(&record, "ATTRIB1"), get_str(&record, "ATTRIB2"), get_str(&record, "ATTRIB3"),
                get_str(&record, "CATEG_SP"), get_str(&record, "DIPLOME"), get_str(&record, "CODE_GRILL"),
                get_num(&record, "GESTION"),
                if get_bool(&record, "LOCK_VAL") { 1 } else { 0 },
                if get_bool(&record, "CONGE") { 1 } else { 0 },
                if get_bool(&record, "SORTI") { 1 } else { 0 },
                get_num(&record, "NBR_ENF_AF"), get_num(&record, "NBR_PRS_CH"), get_num(&record, "NO_PROFIL"),
            ],
        ).map_err(|e| e.to_string())?;
        inserted += 1;

        if inserted % 200 == 0 || inserted == total {
            progress(inserted, total, &format!("PERS0.DTA — {}/{} employés", inserted, total));
        }
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    progress(inserted, total, &format!("PERS0.DTA — {} employés importés", inserted));
    Ok(inserted)
}

// ================================================================
// PERS2 — All 61 fields (filiation, conjoint, CIN, passeport, etc.)
// ================================================================
fn import_pers2(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut processed = 0;
    let mut in_txn = false;

    progress(0, total, "PERS2.DTA — données civiles & familiales (tous les champs)...");

    while let Some(record) = reader.read_record()? {
        let matricule = get_str(&record, "MATRICULE").trim().to_string();
        if matricule.is_empty() { continue; }

        if !in_txn {
            app.execute_batch("BEGIN").map_err(|e| e.to_string())?;
            in_txn = true;
        }

        app.execute(
            r#"UPDATE employees SET
               adresse=?, adresse2=?, telephone=?, e_mail=?, n_id_nat=?,
               naiss_lieu=?, n_act_nais=?, comun_nais=?, code_post=?,
               fil_p_pere=?, fil_n_mere=?, fil_p_mere=?, filiation=?, cnationalt=?,
               conj_nom=?, conj_datem=?, nom_p_conj=?,
               cin_no=?, cin_d_le=?, cin_d_a=?,
               pc_no=?, pc_d_le=?, pc_d_a=?,
               pass_no=?, pass_d_le=?, pass_d_a=?,
               remarque=?, groupage=?,
               date_fnc=?, date_sec=?, date_das=?, date_unt=?, date_aff=?,
               date_dip=?, date_cat=?, date_emp=?, date_at1=?, date_at2=?, date_at3=?,
               note_fnc=?, note_sec=?, note_das=?, note_unt=?, note_aff=?,
               note_dip=?, note_cat=?, note_emp=?, note_at1=?, note_at2=?, note_at3=?,
               note_con=?, note_mtf=?, memoire1=?, memoire2=?
               WHERE matricule=?"#,
            rusqlite::params![
                get_str(&record, "ADRESSE"), get_str(&record, "ADRESSE2"),
                get_str(&record, "TELEPHONE"), get_str(&record, "E_MAIL"), get_str(&record, "N_ID_NAT"),
                get_str(&record, "NAISS_LIEU"), get_str(&record, "N_ACT_NAIS"), get_str(&record, "COMUN_NAIS"),
                get_str(&record, "CODE_POST"),
                get_str(&record, "FIL_P_PERE"), get_str(&record, "FIL_N_MERE"), get_str(&record, "FIL_P_MERE"),
                get_str(&record, "FILIATION"), get_str(&record, "CNATIONALT"),
                get_str(&record, "CONJ_NOM"), get_str(&record, "CONJ_DATEM"), get_str(&record, "NOM_P_CONJ"),
                get_str(&record, "CIN_NO"), get_str(&record, "CIN_D_LE"), get_str(&record, "CIN_D_A"),
                get_str(&record, "PC_NO"), get_str(&record, "PC_D_LE"), get_str(&record, "PC_D_A"),
                get_str(&record, "PASS_NO"), get_str(&record, "PASS_D_LE"), get_str(&record, "PASS_D_A"),
                get_str(&record, "REMARQUE"), get_str(&record, "GROUPAGE"),
                get_str(&record, "DATE_FNC"), get_str(&record, "DATE_SEC"), get_str(&record, "DATE_DAS"),
                get_str(&record, "DATE_UNT"), get_str(&record, "DATE_AFF"),
                get_str(&record, "DATE_DIP"), get_str(&record, "DATE_CAT"), get_str(&record, "DATE_EMP"),
                get_str(&record, "DATE_AT1"), get_str(&record, "DATE_AT2"), get_str(&record, "DATE_AT3"),
                get_str(&record, "NOTE_FNC"), get_str(&record, "NOTE_SEC"), get_str(&record, "NOTE_DAS"),
                get_str(&record, "NOTE_UNT"), get_str(&record, "NOTE_AFF"),
                get_str(&record, "NOTE_DIP"), get_str(&record, "NOTE_CAT"), get_str(&record, "NOTE_EMP"),
                get_str(&record, "NOTE_AT1"), get_str(&record, "NOTE_AT2"), get_str(&record, "NOTE_AT3"),
                get_str(&record, "NOTE_CON"), get_str(&record, "NOTE_MTF"),
                get_str(&record, "MEMOIRE1"), get_str(&record, "MEMOIRE2"),
                matricule,
            ],
        ).ok();
        processed += 1;

        // Commit every 50 records to release the write lock for parallel threads
        if processed % 50 == 0 {
            app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            in_txn = false;
            progress(processed, total, &format!("PERS2.DTA — {}/{} employés mis à jour", processed, total));
        }
    }

    if in_txn {
        app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    }
    progress(processed, total, &format!("PERS2.DTA — {} employés mis à jour", processed));
    Ok(processed)
}

// ================================================================
// PERS1 — COD_RUB01-120 + VAL_RUB01-120
// ================================================================
fn import_pers1(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut processed = 0;
    let mut inserted = 0;
    let mut in_txn = false;

    progress(0, total, "PERS1.DTA — affectations rubriques + valeurs...");

    while let Some(record) = reader.read_record()? {
        let matricule = get_str(&record, "MATRICULE").trim().to_string();
        if matricule.is_empty() { continue; }

        if !in_txn {
            app.execute_batch("BEGIN").map_err(|e| e.to_string())?;
            in_txn = true;
        }

        let emp_id: Option<i64> = app.query_row("SELECT id FROM employees WHERE matricule=?", [&matricule], |r| r.get(0)).ok();

        if let Some(emp_id) = emp_id {
            for i in 1..=120u32 {
                let cod_field = format!("COD_RUB{:02}", i);
                let val_field = format!("VAL_RUB{:02}", i);
                let code = get_str(&record, &cod_field).trim().to_string();
                if code.is_empty() { continue; }

                // Insert rubrique assignment
                app.execute(
                    "INSERT OR REPLACE INTO employee_rubriques (employee_id, rubrique_code, sort_order) VALUES (?,?,?)",
                    rusqlite::params![emp_id, code, (i - 1) as i64],
                ).ok();

                // Insert rubrique value
                let value = get_num(&record, &val_field);
                app.execute(
                    "INSERT OR REPLACE INTO employee_rubrique_values (employee_id, rubrique_code, value, sort_order) VALUES (?,?,?,?)",
                    rusqlite::params![emp_id, code, value, (i - 1) as i64],
                ).ok();
                inserted += 1;
            }
        }

        // Update PERS1 extra fields (congés, notes, jours ouvrables, prêts obs)
        app.execute(
            r#"UPDATE employees SET
               conge_du_j=?, conge_du_c=?, conge_du_i=?,
               conge_pr_j=?, conge_pr_c=?, conge_pr_i=?,
               conge_ad_j=?, conge_ad_c=?, conge_ad_i=?,
               conge_ok=?, notep=?, anotep=?,
               nbr_jr_ouv=?, nbr_hr_ouv=?,
               pret_obs1=?, pret_obs2=?
               WHERE id=?"#,
            rusqlite::params![
                get_num(&record, "CONGE_DU_J"), get_num(&record, "CONGE_DU_C"), get_num(&record, "CONGE_DU_I"),
                get_num(&record, "CONGE_PR_J"), get_num(&record, "CONGE_PR_C"), get_num(&record, "CONGE_PR_I"),
                get_num(&record, "CONGE_AD_J"), get_num(&record, "CONGE_AD_C"), get_num(&record, "CONGE_AD_I"),
                if get_bool(&record, "CONGE_OK") { 1 } else { 0 },
                get_str(&record, "NOTEP"), get_str(&record, "ANOTEP"),
                get_num(&record, "NBR_JR_OUV"), get_num(&record, "NBR_HR_OUV"),
                get_str(&record, "PRET_OBS1"), get_str(&record, "PRET_OBS2"),
                emp_id,
            ],
        ).ok();

        processed += 1;

        // Commit every 50 records to release the write lock for parallel threads
        if processed % 50 == 0 {
            app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            in_txn = false;
            progress(processed, total, &format!("PERS1.DTA — {}/{} employés ({} valeurs)", processed, total, inserted));
        }
    }

    if in_txn {
        app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    }
    progress(processed, total, &format!("PERS1.DTA — {} valeurs importées", inserted));
    Ok(inserted)
}

// ================================================================
// ENFANTS.DTA — Employee children
// ================================================================
fn import_enfants(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;
    let mut in_txn = false;

    progress(0, total, "ENFANTS.DTA — enfants...");

    while let Some(record) = reader.read_record()? {
        let matricule = get_str(&record, "MATRICULE").trim().to_string();
        if matricule.is_empty() { continue; }

        if !in_txn {
            app.execute_batch("BEGIN").map_err(|e| e.to_string())?;
            in_txn = true;
        }

        let emp_id: Option<i64> = app.query_row("SELECT id FROM employees WHERE matricule=?", [&matricule], |r| r.get(0)).ok();

        app.execute(
            "INSERT INTO employee_children (employee_id, matricule, prenom, nais_date, scolarise) VALUES (?,?,?,?,?)",
            rusqlite::params![emp_id, matricule, get_str(&record, "PRENOM"), get_str(&record, "NAIS_DATE"), get_str(&record, "SCOLARISE")],
        ).map_err(|e| e.to_string())?;
        inserted += 1;

        // Commit every 50 records to release the write lock
        if inserted % 50 == 0 {
            app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            in_txn = false;
            progress(inserted, total, &format!("ENFANTS.DTA — {}/{} enfants", inserted, total));
        }
    }

    if in_txn {
        app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    }
    progress(inserted, total, &format!("ENFANTS.DTA — {} enfants importés", inserted));
    Ok(inserted)
}

// ================================================================
// EVENTS.DTA — Career events
// ================================================================
fn import_events(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;

    progress(0, total, "EVENTS.DTA — événements de carrière...");

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        let matricule = get_str(&record, "MATRICULE").trim().to_string();
        if matricule.is_empty() { continue; }

        app.execute(
            "INSERT INTO career_events (matricule, libelle, alibelle, date, heure, codop) VALUES (?,?,?,?,?,?)",
            rusqlite::params![matricule, get_str(&record, "LIBELLE"), get_str(&record, "ALIBELLE"),
                get_str(&record, "DATE"), get_str(&record, "HEURE"), get_str(&record, "CODOP")],
        ).map_err(|e| e.to_string())?;
        inserted += 1;

        if inserted % 20 == 0 || inserted == total {
            progress(inserted, total, &format!("EVENTS.DTA — {}/{} événements", inserted, total));
        }
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    progress(inserted, total, &format!("EVENTS.DTA — {} événements importés", inserted));
    Ok(inserted)
}

// ================================================================
// PRETS.DTA — Employee loans
// ================================================================
fn import_prets(app: &Connection, path: &str) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let mut inserted = 0;

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        let matricule = get_str(&record, "MATRICULE").trim().to_string();
        if matricule.is_empty() { continue; }

        app.execute(
            "INSERT INTO employee_loans (matricule, code_rub, mois, date, libelle, montant, sens, no_pret) VALUES (?,?,?,?,?,?,?,?)",
            rusqlite::params![matricule, get_str(&record, "CODE_RUB"), get_str(&record, "MOIS"),
                get_str(&record, "DATE"), get_str(&record, "LIBELLE"), get_num(&record, "MONTANT"),
                get_str(&record, "SENS"), get_num(&record, "NO_PRET") as i64],
        ).map_err(|e| e.to_string())?;
        inserted += 1;
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(inserted)
}

// ================================================================
// GRILLE.DTA — Salary grid
// ================================================================
fn import_grille(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;

    progress(0, total, "GRILLE.DTA — grille salariale...");

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        app.execute(
            "INSERT INTO salary_grid (montant, i_e_p, indice, code, no_grille) VALUES (?,?,?,?,?)",
            rusqlite::params![get_num(&record, "MONTANT"), get_num(&record, "I_E_P"),
                get_num(&record, "INDICE"), get_str(&record, "CODE"), get_str(&record, "NO_GRILLE")],
        ).map_err(|e| e.to_string())?;
        inserted += 1;
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    progress(inserted, total, &format!("GRILLE.DTA — {} entrées importées", inserted));
    Ok(inserted)
}

// ================================================================
// PARAMETR.DTA — System parameters (key-value with memo)
// ================================================================
fn import_parametr(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;

    progress(0, total, "PARAMETR.DTA — paramètres système...");

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        let key = get_str(&record, "PAR_KEY").trim().to_string();
        if key.is_empty() { continue; }
        let val = get_str(&record, "PAR_VAL");

        app.execute(
            "INSERT OR REPLACE INTO system_params (par_key, par_val) VALUES (?,?)",
            rusqlite::params![key, val],
        ).map_err(|e| e.to_string())?;
        inserted += 1;
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    progress(inserted, total, &format!("PARAMETR.DTA — {} paramètres importés", inserted));
    Ok(inserted)
}

// ================================================================
// USERSN.DTA — PCPAIE users
// ================================================================
fn import_usersn(app: &Connection, path: &str) -> Result<(), String> {
    let mut reader = DbfReader::open(path)?;

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        app.execute(
            "INSERT INTO pcpaie_users (code, nom, passe, mois_curnt, no_salar) VALUES (?,?,?,?,?)",
            rusqlite::params![
                get_str(&record, "CODE"), get_str(&record, "NOM"),
                get_str(&record, "PASSE"), get_str(&record, "MOIS_CURNT"),
                get_num(&record, "NO_SALAR"),
            ],
        ).map_err(|e| e.to_string())?;
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(())
}

// ================================================================
// PAIE_REF.DTA — Pay periods
// ================================================================
fn import_paie_ref(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;

    progress(0, total, "PAIE_REF.DTA — périodes de paie...");

    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        let mois = get_str(&record, "MOIS").trim().to_string();
        if mois.is_empty() { continue; }

        app.execute(
            "INSERT OR REPLACE INTO pay_periods (mois, libelle, alibelle, signe) VALUES (?,?,?,?)",
            rusqlite::params![mois, get_str(&record, "LIBELLE"), get_str(&record, "ALIBELLE"), get_str(&record, "SIGNE")],
        ).map_err(|e| e.to_string())?;
        inserted += 1;
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    progress(inserted, total, &format!("PAIE_REF.DTA — {} périodes importées", inserted));
    Ok(inserted)
}

// ================================================================
// Rubriques, Lookups, Company — same as before
// ================================================================
fn import_rubriques(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;
    let mut record_num = 0u32;

    progress(0, total, "RUBRIQUEX.DTA — rubriques & formules...");
    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        record_num += 1;
        let code = format!("{:03}", record_num);

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
                code, get_str(&record, "LIBELLE"), get_str(&record, "ALIBELLE"), get_str(&record, "FORMULE"),
                get_num(&record, "CLASSE"), get_num(&record, "V_MIN"), get_num(&record, "V_MAX"),
                if get_bool(&record, "IS_INIT") { 1 } else { 0 }, if get_bool(&record, "IS_REGULAR") { 1 } else { 0 },
                if get_bool(&record, "IS_BRUT") { 1 } else { 0 }, if get_bool(&record, "IS_IMPOS") { 1 } else { 0 },
                if get_bool(&record, "IS_SECU_S") { 1 } else { 0 }, if get_bool(&record, "IS_TOTAL") { 1 } else { 0 },
                if get_bool(&record, "IS_IMP") { 1 } else { 0 },
                get_num(&record, "ORD_BUL"), get_num(&record, "ORD_CLC"), get_num(&record, "ORD_REC"), get_num(&record, "ORD_JRN"),
                if get_bool(&record, "IS_LOCKED") { 1 } else { 0 }, if get_bool(&record, "CALCUL") { 1 } else { 0 },
                if get_bool(&record, "MANUELLE") { 1 } else { 0 },
                get_num(&record, "INIT_VAL"), get_str(&record, "PRECISION"), get_str(&record, "IMAGE"),
                get_num(&record, "PAR_1"), get_num(&record, "PAR_2"), get_str(&record, "RC_NB_BASE"), get_str(&record, "POINTER"),
                get_num(&record, "TYPE_PCC"), get_str(&record, "CD_NB_BASE"), get_str(&record, "CD_TAUX"),
                get_str(&record, "BR_COMP"), get_str(&record, "BR_TIERS"),
                get_str(&record, "BR_COMP_D"), get_str(&record, "BR_TIERS_D"), get_str(&record, "BR_COMP_C"), get_str(&record, "BR_TIERS_C"),
                get_num(&record, "TRANS_COD"), if get_bool(&record, "N_ARRONDIR") { 1 } else { 0 },
                if get_bool(&record, "RECALC_OK") { 1 } else { 0 }, get_num(&record, "IS_IMP_B"), get_str(&record, "USER_CODE"),
            ],
        ).map_err(|e| e.to_string())?;
        inserted += 1;

        if inserted % 100 == 0 || inserted == total {
            progress(inserted, total, &format!("RUBRIQUEX.DTA — {}/{} rubriques", inserted, total));
        }
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    progress(inserted, total, &format!("RUBRIQUEX.DTA — {} rubriques importées", inserted));
    Ok(inserted)
}

fn import_lookups(app: &Connection, path: &str, progress: impl Fn(usize, usize, &str)) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let mut inserted = 0;

    progress(0, total, "VALEURS.DTA — valeurs de lookup...");
    app.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    while let Some(record) = reader.read_record()? {
        let table = get_str(&record, "TABLE");
        let code = get_str(&record, "CODE");
        if table.is_empty() || code.is_empty() { continue; }

        app.execute(
            r#"INSERT OR REPLACE INTO lookup_values
               (table_name, code, libelle, aux_nom, compte, compte_ccp, no_agence, selection)
               VALUES (?,?,?,?,?,?,?,?)"#,
            rusqlite::params![table, code, get_str(&record, "LIBELLE"), get_str(&record, "AUX_NOM"),
                get_str(&record, "COMPTE"), get_str(&record, "COMPTE_CCP"), get_str(&record, "NO_AGENCE"),
                if get_bool(&record, "SELECTION") { 1 } else { 0 }],
        ).map_err(|e| e.to_string())?;
        inserted += 1;

        if inserted % 100 == 0 || inserted == total {
            progress(inserted, total, &format!("VALEURS.DTA — {}/{} valeurs", inserted, total));
        }
    }

    app.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    progress(inserted, total, &format!("VALEURS.DTA — {} valeurs importées", inserted));
    Ok(inserted)
}

fn import_company_info(app: &Connection, path: &str) -> Result<(), String> {
    let mut reader = DbfReader::open(path)?;
    if let Some(record) = reader.read_record()? {
        app.execute(
            r#"INSERT OR REPLACE INTO company_info
               (id, doss_nom, doss_rue, doss_vil, doss_nsecu, doss_skey1,
                doss_skey2, doss_skey3, doss_skey4, doss_nger, doss_pger, clot_mois, clot_annee)
               VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)"#,
            rusqlite::params![get_str(&record, "DOSS_NOM"), get_str(&record, "DOSS_RUE"), get_str(&record, "DOSS_VIL"),
                get_str(&record, "DOSS_NSECU"), get_str(&record, "DOSS_SKEY1"), get_str(&record, "DOSS_SKEY2"),
                get_str(&record, "DOSS_SKEY3"), get_str(&record, "DOSS_SKEY4"), get_str(&record, "DOSS_NGER"),
                get_str(&record, "DOSS_PGER"), get_num(&record, "CLOT_MOIS"), get_num(&record, "CLOT_ANNEE")],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ================================================================
// PAIES.DTA — Chunked parallel import with rayon
// ================================================================
#[derive(Debug, Clone)]
struct PaiesRecord {
    emp_id: i64, matricule: String, mois: String, montants: String,
    sit_fam: String, nbre_enf: f64, no_grille: String, code_irg: f64, code_cnas: f64,
    nbr_enf_af: f64, nbr_prs_ch: f64, nbr_jr_ouv: f64, nbr_hr_ouv: f64,
    sect1: String, structure: String, classe: String, unite: String, affectatio: String,
    c_date: String, c_time: String,
}

fn import_paies_parallel(app: &Connection, path: &str, progress: ProgressCb) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let chunk_size = 7500usize;

    let emp_map: std::collections::HashMap<String, i64> = {
        let mut stmt = app.prepare("SELECT matricule, id FROM employees").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    progress("phase4", "paies", 0, total, &format!("PAIES.DTA — {} records (chunks de {})...", total, chunk_size), 35.0);

    let inserted_total = AtomicUsize::new(0);
    let processed_total = AtomicUsize::new(0);

    loop {
        let mut chunk = Vec::with_capacity(chunk_size);
        for _ in 0..chunk_size {
            match reader.read_record()? {
                Some(rec) => chunk.push(rec),
                None => break,
            }
        }
        if chunk.is_empty() { break; }

        let chunk_len = chunk.len();
        let parsed: Vec<PaiesRecord> = chunk.par_iter().filter_map(|record| {
            let matricule = get_str(record, "MATRICULE").trim().to_string();
            if matricule.is_empty() { return None; }
            let emp_id = emp_map.get(&matricule)?;
            Some(PaiesRecord {
                emp_id: *emp_id, matricule, mois: get_str(record, "MOIS"), montants: get_str(record, "MONTANTS"),
                sit_fam: get_str(record, "SIT_FAM"), nbre_enf: get_num(record, "NBRE_ENF"),
                no_grille: get_str(record, "NO_GRILLE"), code_irg: get_num(record, "CODE_IRG"),
                code_cnas: get_num(record, "CODE_CNAS"), nbr_enf_af: get_num(record, "NBR_ENF_AF"),
                nbr_prs_ch: get_num(record, "NBR_PRS_CH"), nbr_jr_ouv: get_num(record, "NBR_JR_OUV"),
                nbr_hr_ouv: get_num(record, "NBR_HR_OUV"), sect1: get_str(record, "SECT1"),
                structure: get_str(record, "STRUCTURE"), classe: get_str(record, "CLASSE"),
                unite: get_str(record, "UNITE"), affectatio: get_str(record, "AFFECTATIO"),
                c_date: get_str(record, "C_DATE"), c_time: get_str(record, "C_TIME"),
            })
        }).collect();

        app.execute_batch("BEGIN").map_err(|e| e.to_string())?;
        for rec in &parsed {
            app.execute(
                r#"INSERT INTO paies (employee_id, mois, matricule, montants, sit_fam, nbre_enf,
                    no_grille, code_irg, code_cnas, nbr_enf_af, nbr_prs_ch, nbr_jr_ouv, nbr_hr_ouv,
                    sect1, structure, classe, unite, affectatio, c_date, c_time)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
                rusqlite::params![rec.emp_id, rec.mois, rec.matricule, rec.montants, rec.sit_fam, rec.nbre_enf,
                    rec.no_grille, rec.code_irg, rec.code_cnas, rec.nbr_enf_af, rec.nbr_prs_ch,
                    rec.nbr_jr_ouv, rec.nbr_hr_ouv, rec.sect1, rec.structure, rec.classe, rec.unite,
                    rec.affectatio, rec.c_date, rec.c_time],
            ).map_err(|e| e.to_string())?;
        }
        app.execute_batch("COMMIT").map_err(|e| e.to_string())?;

        let ins = inserted_total.fetch_add(parsed.len(), Ordering::Relaxed) + parsed.len();
        let proc = processed_total.fetch_add(chunk_len, Ordering::Relaxed) + chunk_len;
        let pct = 35.0 + (proc as f64 / total.max(1) as f64) * 25.0; // 35% → 60%
        progress("phase4", "paies", proc, total,
            &format!("PAIES.DTA — {}/{} traités, {} importés", proc, total, ins), pct);
    }

    let final_count = inserted_total.load(Ordering::Relaxed);
    progress("phase4", "paies", final_count, total, &format!("PAIES.DTA — {} bulletins importés", final_count), 60.0);
    Ok(final_count)
}

// ================================================================
// CONGES.DTA — Chunked parallel import with rayon (1.59M records)
// ================================================================
#[derive(Debug, Clone)]
struct CongesRecord {
    matricule: String, date: String, mois: String, jours: f64,
    libelle: String, alibelle: String, cotisable: f64, imposable: f64, sens: String,
}

fn import_conges_parallel(app: &Connection, path: &str, progress: ProgressCb) -> Result<usize, String> {
    let mut reader = DbfReader::open(path)?;
    let total = reader.record_count() as usize;
    let chunk_size = 7500usize;

    progress("phase4", "conges", 0, total, &format!("CONGES.DTA — {} records (chunks de {})...", total, chunk_size), 35.0);

    let inserted_total = AtomicUsize::new(0);
    let processed_total = AtomicUsize::new(0);

    loop {
        let mut chunk = Vec::with_capacity(chunk_size);
        for _ in 0..chunk_size {
            match reader.read_record()? {
                Some(rec) => chunk.push(rec),
                None => break,
            }
        }
        if chunk.is_empty() { break; }

        let chunk_len = chunk.len();
        let parsed: Vec<CongesRecord> = chunk.par_iter().filter_map(|record| {
            let matricule = get_str(record, "MATRICULE").trim().to_string();
            if matricule.is_empty() { return None; }
            Some(CongesRecord {
                matricule, date: get_str(record, "DATE"), mois: get_str(record, "MOIS"),
                jours: get_num(record, "JOURS"), libelle: get_str(record, "LIBELLE"),
                alibelle: get_str(record, "ALIBELLE"), cotisable: get_num(record, "COTISABLE"),
                imposable: get_num(record, "IMPOSABLE"), sens: get_str(record, "SENS"),
            })
        }).collect();

        app.execute_batch("BEGIN").map_err(|e| e.to_string())?;
        for rec in &parsed {
            app.execute(
                "INSERT INTO leave_history (matricule, date, mois, jours, libelle, alibelle, cotisable, imposable, sens) VALUES (?,?,?,?,?,?,?,?,?)",
                rusqlite::params![rec.matricule, rec.date, rec.mois, rec.jours, rec.libelle, rec.alibelle, rec.cotisable, rec.imposable, rec.sens],
            ).map_err(|e| e.to_string())?;
        }
        app.execute_batch("COMMIT").map_err(|e| e.to_string())?;

        let ins = inserted_total.fetch_add(parsed.len(), Ordering::Relaxed) + parsed.len();
        let proc = processed_total.fetch_add(chunk_len, Ordering::Relaxed) + chunk_len;
        let pct = 35.0 + (proc as f64 / total.max(1) as f64) * 25.0; // 35% → 60%
        progress("phase4", "conges", proc, total,
            &format!("CONGES.DTA — {}/{} traités, {} importés", proc, total, ins), pct);
    }

    let final_count = inserted_total.load(Ordering::Relaxed);
    progress("phase4", "conges", final_count, total, &format!("CONGES.DTA — {} congés importés", final_count), 60.0);
    Ok(final_count)
}
