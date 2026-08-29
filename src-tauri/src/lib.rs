pub mod calculator;
mod db;
mod dbf;
mod import;
mod native_import;
mod pointeuse;

use calculator::{calculate_salary, save_calculation, CalcResult};
use chrono::Datelike;
use import::{import_pcpaie, ImportResult};
use pointeuse::{
    fuzzy_match_users_to_employees, import_pointeuse, link_pointeuse_to_employee,
    FuzzyMatchResult, PointeuseImportResult,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// Parse a PAIES montants string into a map of rubrique_code -> amount.
/// Format: lines like "R76370633.41000" where R + 3-digit code + amount
pub fn parse_montants(montants: &str) -> HashMap<String, f64> {
    let mut map = HashMap::new();
    let mut is_first = true;
    for line in montants.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        // First line is a header with NET/PRET and rubrique list; skip it
        if is_first {
            is_first = false;
            if line.contains("NET") || line.contains("PRET") || line.contains("#") {
                continue;
            }
        }
        // Lines are like "R00141738.10000" or old format "00115000.0000"
        // Format: optional R/N prefix, then 3-digit code, then value
        let mut chars = line.chars();
        let first = chars.next();
        let rest = match first {
            Some(c) if c.is_ascii_alphabetic() => chars.as_str(),
            Some(_) => line,
            None => continue,
        };
        if rest.len() < 3 { continue; }
        let (code_part, value_part) = rest.split_at(3);
        if let Ok(code_num) = code_part.parse::<u32>() {
            let is_negative = first == Some('N');
            let code = if is_negative { format!("N{:03}", code_num) } else { format!("R{:03}", code_num) };
            let mut value_str = value_part.trim().replace(',', ".");
            if value_str.ends_with('\u{0000}') { value_str = value_str.trim_end_matches('\u{0000}').to_string(); }
            if let Ok(mut value) = value_str.parse::<f64>() {
                if is_negative { value = -value; }
                map.insert(code, value);
            }
        }
    }
    map
}

/// Extract financial totals from a parsed montants map.
/// R763=brut, R770=net, R660=IRG, R767=retenues, R807=cotisable, R652=imposable
pub fn extract_totals_from_montants(map: &HashMap<String, f64>) -> (f64, f64, f64, f64, f64, f64) {
    let total_brut = *map.get("R763").unwrap_or(&0.0);
    let net_payer = *map.get("R770").unwrap_or(&0.0);
    let irg = *map.get("R660").unwrap_or(&0.0);
    let total_retenues = *map.get("R767").unwrap_or(&0.0);
    let base_cotisable = *map.get("R807").unwrap_or(&0.0);
    let base_imposable = *map.get("R652").unwrap_or(&0.0);
    (total_brut, net_payer, irg, total_retenues, base_cotisable, base_imposable)
}
use tauri::{Manager, State};

struct AppState {
    conn: Mutex<Connection>,
    db_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppStatus {
    initialized: bool,
    pcpaie_path: Option<String>,
    employee_count: usize,
    rubrique_count: usize,
    paie_count: usize,
}

#[tauri::command]
fn get_app_status(state: State<AppState>) -> Result<AppStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let initialized = db::is_initialized(&conn);

    let pcpaie_path: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key='pcpaie_path'",
            [],
            |r| r.get(0),
        )
        .ok();

    let employee_count: usize = conn
        .query_row("SELECT COUNT(*) FROM employees", [], |r| r.get(0))
        .unwrap_or(0);
    let rubrique_count: usize = conn
        .query_row("SELECT COUNT(*) FROM rubriques", [], |r| r.get(0))
        .unwrap_or(0);
    let paie_count: usize = conn
        .query_row("SELECT COUNT(*) FROM paies", [], |r| r.get(0))
        .unwrap_or(0);

    Ok(AppStatus {
        initialized,
        pcpaie_path,
        employee_count,
        rubrique_count,
        paie_count,
    })
}

#[tauri::command]
async fn import_pcpaie_db(
    state: State<'_, AppState>,
    pcpaie_path: String,
) -> Result<ImportResult, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
        import_pcpaie(&conn, &pcpaie_path, |_| {})
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_pointeuse_data(
    state: State<'_, AppState>,
    user_dat_path: String,
    attlog_paths: Vec<String>,
) -> Result<PointeuseImportResult, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
        import_pointeuse(&conn, &user_dat_path, &attlog_paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_fuzzy_matches(state: State<AppState>) -> Result<Vec<FuzzyMatchResult>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    fuzzy_match_users_to_employees(&conn)
}

#[tauri::command]
fn link_user_to_employee(
    state: State<AppState>,
    pin: i32,
    employee_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    link_pointeuse_to_employee(&conn, pin, employee_id)
}

// Employee queries
#[derive(Debug, Serialize, Deserialize)]
struct EmployeeSummary {
    id: i64,
    matricule: String,
    nom: String,
    prenom: String,
    actif: bool,
    pointeuse_pin: Option<i32>,
    shift_name: Option<String>,
    section: Option<String>,
    structure: Option<String>,
    affectatio: Option<String>,
    poste_name: Option<String>,
    fnc_code: Option<String>,
    sexe: Option<String>,
    sit_fam: Option<String>,
    categorie: Option<String>,
    unite: Option<String>,
    total_count: i64,
}

#[tauri::command]
fn get_employees(
    state: State<AppState>,
    search: Option<String>,
    actif_only: Option<bool>,
    poste_id: Option<i64>,
    section: Option<String>,
    structure: Option<String>,
    unite: Option<String>,
    categorie: Option<String>,
    sexe: Option<String>,
    contrat: Option<String>,
    echelon: Option<String>,
    classe: Option<String>,
    hire_date_from: Option<String>,
    hire_date_to: Option<String>,
    exit_date_from: Option<String>,
    exit_date_to: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<Vec<EmployeeSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(50).min(500);
    let offset = (page - 1) * page_size;

    eprintln!("get_employees filters: actif_only={:?}, poste_id={:?}, sexe={:?}", actif_only, poste_id, sexe);

    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref s) = search {
        let s = s.trim();
        if !s.is_empty() {
            where_clauses.push("(e.nom LIKE ? OR e.prenom LIKE ? OR e.matricule LIKE ?)".to_string());
            let pattern = format!("%{}%", s);
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern));
        }
    }
    if actif_only.unwrap_or(false) {
        where_clauses.push("e.actif = 1".to_string());
    }
    if let Some(pid) = poste_id {
        where_clauses.push("e.poste_id = ?".to_string());
        params.push(Box::new(pid));
    }
    if let Some(ref sec) = section {
        if !sec.is_empty() {
            where_clauses.push("e.section = ?".to_string());
            params.push(Box::new(sec.clone()));
        }
    }
    if let Some(ref stru) = structure {
        if !stru.is_empty() {
            where_clauses.push("e.structure = ?".to_string());
            params.push(Box::new(stru.clone()));
        }
    }
    if let Some(ref unt) = unite {
        if !unt.is_empty() {
            where_clauses.push("e.unite = ?".to_string());
            params.push(Box::new(unt.clone()));
        }
    }
    if let Some(ref cat) = categorie {
        if !cat.is_empty() {
            where_clauses.push("e.categorie = ?".to_string());
            params.push(Box::new(cat.clone()));
        }
    }
    if let Some(ref sx) = sexe {
        if !sx.is_empty() {
            where_clauses.push("e.sexe = ?".to_string());
            params.push(Box::new(sx.clone()));
        }
    }
    if let Some(ref ctr) = contrat {
        if !ctr.is_empty() {
            where_clauses.push("e.contrat = ?".to_string());
            params.push(Box::new(ctr.clone()));
        }
    }
    if let Some(ref ech) = echelon {
        if !ech.is_empty() {
            where_clauses.push("e.echelon = ?".to_string());
            params.push(Box::new(ech.clone()));
        }
    }
    if let Some(ref cls) = classe {
        if !cls.is_empty() {
            where_clauses.push("e.classe = ?".to_string());
            params.push(Box::new(cls.clone()));
        }
    }
    if let Some(ref hdf) = hire_date_from {
        if !hdf.is_empty() {
            where_clauses.push("e.dte_entree >= ?".to_string());
            params.push(Box::new(hdf.clone()));
        }
    }
    if let Some(ref hdt) = hire_date_to {
        if !hdt.is_empty() {
            where_clauses.push("e.dte_entree <= ?".to_string());
            params.push(Box::new(hdt.clone()));
        }
    }
    if let Some(ref edf) = exit_date_from {
        if !edf.is_empty() {
            where_clauses.push("e.dte_sortie >= ?".to_string());
            params.push(Box::new(edf.clone()));
        }
    }
    if let Some(ref edt) = exit_date_to {
        if !edt.is_empty() {
            where_clauses.push("e.dte_sortie <= ?".to_string());
            params.push(Box::new(edt.clone()));
        }
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let sql = format!(
        r#"SELECT e.id, e.matricule, e.nom, e.prenom, e.actif, e.pointeuse_pin,
           s.name, e.section, e.structure, e.affectatio,
           p.name, p.fnc_code, e.sexe, e.sit_fam, e.categorie, e.unite,
           COUNT(*) OVER () as total_count
           FROM employees e
           LEFT JOIN shifts s ON e.shift_id = s.id
           LEFT JOIN postes p ON e.poste_id = p.id
           {where_sql}
           ORDER BY e.nom, e.prenom
           LIMIT ? OFFSET ?"#,
        where_sql = where_sql
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    params.push(Box::new(page_size));
    params.push(Box::new(offset));

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p: &Box<dyn rusqlite::ToSql>| p.as_ref()).collect();
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(EmployeeSummary {
                id: row.get(0)?,
                matricule: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                nom: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                prenom: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                actif: row.get::<_, Option<i64>>(4)?.unwrap_or(0) != 0,
                pointeuse_pin: row.get(5)?,
                shift_name: row.get(6)?,
                section: row.get(7)?,
                structure: row.get(8)?,
                affectatio: row.get(9)?,
                poste_name: row.get(10)?,
                fnc_code: row.get(11)?,
                sexe: row.get(12)?,
                sit_fam: row.get(13)?,
                categorie: row.get(14)?,
                unite: row.get(15)?,
                total_count: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut employees = Vec::new();
    for row in rows {
        employees.push(row.map_err(|e| e.to_string())?);
    }
    Ok(employees)
}

#[tauri::command]
fn get_employee_filter_options(state: State<AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let sections: Vec<String> = conn
        .prepare("SELECT DISTINCT section FROM employees WHERE section IS NOT NULL AND section != '' ORDER BY section")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let structures: Vec<String> = conn
        .prepare("SELECT DISTINCT structure FROM employees WHERE structure IS NOT NULL AND structure != '' ORDER BY structure")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let unites: Vec<String> = conn
        .prepare("SELECT DISTINCT unite FROM employees WHERE unite IS NOT NULL AND unite != '' ORDER BY unite")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let categories: Vec<String> = conn
        .prepare("SELECT DISTINCT categorie FROM employees WHERE categorie IS NOT NULL AND categorie != '' ORDER BY categorie")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let postes: Vec<(i64, String)> = conn
        .prepare("SELECT id, name FROM postes ORDER BY name")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let contrats: Vec<String> = conn
        .prepare("SELECT DISTINCT contrat FROM employees WHERE contrat IS NOT NULL AND contrat != '' ORDER BY contrat")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let echelons: Vec<String> = conn
        .prepare("SELECT DISTINCT echelon FROM employees WHERE echelon IS NOT NULL AND echelon != '' ORDER BY echelon")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let classes: Vec<String> = conn
        .prepare("SELECT DISTINCT classe FROM employees WHERE classe IS NOT NULL AND classe != '' ORDER BY classe")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(serde_json::json!({
        "sections": sections,
        "structures": structures,
        "unites": unites,
        "categories": categories,
        "postes": postes.iter().map(|(id, name)| serde_json::json!({"id": id, "name": name})).collect::<Vec<_>>(),
        "sexes": ["M", "F"],
        "contrats": contrats,
        "echelons": echelons,
        "classes": classes,
    }))
}

#[tauri::command]
async fn get_employee_detail(
    state: State<'_, AppState>,
    employee_id: i64,
) -> Result<serde_json::Value, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let mut row = conn
            .query_row(
            r#"SELECT e.id, e.matricule, e.nom, e.prenom, e.sit_fam, e.nbre_enf, e.naiss_date,
               e.dte_entree, e.dte_sortie, e.actif, e.sexe, e.no_grille, e.categorie, e.section,
               e.echelon, e.classe, e.structure, e.unite, e.affectatio, e.contrat, e.sect1,
               e.code_caisss, e.code_irg, e.code_cnas, e.no_cnas, e.n_secu_sle, e.no_compte,
               e.pointeuse_pin, e.shift_id, e.adresse, e.telephone, e.e_mail, e.n_id_nat,
               unt.libelle, aff.libelle, con.libelle, sec.libelle, str.libelle, cat.libelle,
               -- PERS2 fields
               e.adresse2, e.naiss_lieu, e.n_act_nais, e.comun_nais, e.code_post,
               e.fil_p_pere, e.fil_n_mere, e.fil_p_mere, e.filiation, e.cnationalt,
               e.conj_nom, e.conj_datem, e.nom_p_conj,
               e.cin_no, e.cin_d_le, e.cin_d_a,
               e.pc_no, e.pc_d_le, e.pc_d_a,
               e.pass_no, e.pass_d_le, e.pass_d_a,
               e.remarque, e.groupage,
               -- PERS0 extra fields
               e.motif_sort, e.dte_cont_d, e.dte_cont_f, e.dte_repris,
               e.nbr_enfp10, e.nbr_enfm10, e.no_mutuel, e.conj_trav,
               e.attrib1, e.attrib2, e.attrib3, e.categ_sp, e.diplome, e.code_grill,
               e.gestion, e.lock_val, e.conge, e.sorti,
               -- PERS0 extra (new)
               e.nbr_enf_af, e.nbr_prs_ch, e.no_profil,
               e.org_payeur, e.org_pemploy, e.cod_regl,
               e.mutu_dted, e.mutu_dtef, e.ok_intemp, e.ok_nat_etr,
               -- Career dates
               e.date_fnc, e.date_sec, e.date_das, e.date_unt, e.date_aff,
               e.date_dip, e.date_cat, e.date_emp,
               e.date_at1, e.date_at2, e.date_at3,
               -- PERS2 notes (new)
               e.note_fnc, e.note_sec, e.note_das, e.note_unt, e.note_aff,
               e.note_dip, e.note_cat, e.note_emp,
               e.note_at1, e.note_at2, e.note_at3,
               e.note_con, e.note_mtf, e.memoire1, e.memoire2,
               -- PERS1 fields (new)
               e.conge_du_j, e.conge_du_c, e.conge_du_i,
               e.conge_pr_j, e.conge_pr_c, e.conge_pr_i,
               e.conge_ad_j, e.conge_ad_c, e.conge_ad_i,
               e.conge_ok, e.notep, e.anotep,
               e.nbr_jr_ouv, e.nbr_hr_ouv, e.pret_obs1, e.pret_obs2,
               -- Count of children
               (SELECT COUNT(*) FROM employee_children WHERE employee_id = e.id) as child_count,
               -- New lookup labels for missing fields
               fnc.libelle, bnq.libelle, catsp.libelle, dip.libelle,
               at1.libelle, at2.libelle, at3.libelle
               FROM employees e
               LEFT JOIN lookup_values unt ON unt.table_name='UNT' AND unt.code = e.unite
               LEFT JOIN lookup_values aff ON aff.table_name='AFF' AND aff.code = e.affectatio
               LEFT JOIN lookup_values con ON con.table_name='CON' AND con.code = e.contrat
               LEFT JOIN lookup_values sec ON sec.table_name='SEC' AND sec.code = e.section
               LEFT JOIN lookup_values str ON str.table_name='SEC' AND str.code = e.structure
               LEFT JOIN lookup_values cat ON cat.table_name='CAT' AND cat.code = e.categorie
               LEFT JOIN lookup_values fnc ON fnc.table_name='FNC' AND fnc.code = e.sect1
               LEFT JOIN lookup_values bnq ON bnq.table_name='BNQ' AND bnq.code = e.org_payeur
               LEFT JOIN lookup_values catsp ON catsp.table_name='CAT' AND catsp.code = e.categ_sp
               LEFT JOIN lookup_values dip ON dip.table_name='DIP' AND dip.code = e.diplome
               LEFT JOIN lookup_values at1 ON at1.table_name='AT1' AND at1.code = e.attrib1
               LEFT JOIN lookup_values at2 ON at2.table_name='AT2' AND at2.code = e.attrib2
               LEFT JOIN lookup_values at3 ON at3.table_name='AT3' AND at3.code = e.attrib3
               WHERE e.id=?"#,
            [employee_id],
            |r| {
                let mut m = serde_json::Map::new();
                m.insert("id".into(), serde_json::Value::from(r.get::<_, i64>(0)?));
                m.insert("matricule".into(), r.get::<_, Option<String>>(1)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("nom".into(), r.get::<_, Option<String>>(2)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("prenom".into(), r.get::<_, Option<String>>(3)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("sit_fam".into(), r.get::<_, Option<String>>(4)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("nbre_enf".into(), r.get::<_, Option<f64>>(5)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("naiss_date".into(), r.get::<_, Option<String>>(6)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("dte_entree".into(), r.get::<_, Option<String>>(7)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("dte_sortie".into(), r.get::<_, Option<String>>(8)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("actif".into(), r.get::<_, Option<i64>>(9)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("sexe".into(), r.get::<_, Option<String>>(10)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("no_grille".into(), r.get::<_, Option<String>>(11)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("categorie".into(), r.get::<_, Option<String>>(12)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("section".into(), r.get::<_, Option<String>>(13)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("echelon".into(), r.get::<_, Option<String>>(14)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("classe".into(), r.get::<_, Option<String>>(15)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("structure".into(), r.get::<_, Option<String>>(16)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("unite".into(), r.get::<_, Option<String>>(17)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("affectatio".into(), r.get::<_, Option<String>>(18)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("contrat".into(), r.get::<_, Option<String>>(19)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("sect1".into(), r.get::<_, Option<String>>(20)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("code_caisss".into(), r.get::<_, Option<String>>(21)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("code_irg".into(), r.get::<_, Option<f64>>(22)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("code_cnas".into(), r.get::<_, Option<f64>>(23)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("no_cnas".into(), r.get::<_, Option<i64>>(24)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("n_secu_sle".into(), r.get::<_, Option<String>>(25)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("no_compte".into(), r.get::<_, Option<String>>(26)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pointeuse_pin".into(), r.get::<_, Option<i32>>(27)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("shift_id".into(), r.get::<_, Option<i64>>(28)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("adresse".into(), r.get::<_, Option<String>>(29)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("telephone".into(), r.get::<_, Option<String>>(30)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("e_mail".into(), r.get::<_, Option<String>>(31)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("n_id_nat".into(), r.get::<_, Option<String>>(32)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("unite_libelle".into(), r.get::<_, Option<String>>(33)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("affectatio_libelle".into(), r.get::<_, Option<String>>(34)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("contrat_libelle".into(), r.get::<_, Option<String>>(35)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("section_libelle".into(), r.get::<_, Option<String>>(36)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("structure_libelle".into(), r.get::<_, Option<String>>(37)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("categorie_libelle".into(), r.get::<_, Option<String>>(38)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                // PERS2
                m.insert("adresse2".into(), r.get::<_, Option<String>>(39)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("naiss_lieu".into(), r.get::<_, Option<String>>(40)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("n_act_nais".into(), r.get::<_, Option<String>>(41)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("comun_nais".into(), r.get::<_, Option<String>>(42)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("code_post".into(), r.get::<_, Option<String>>(43)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("fil_p_pere".into(), r.get::<_, Option<String>>(44)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("fil_n_mere".into(), r.get::<_, Option<String>>(45)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("fil_p_mere".into(), r.get::<_, Option<String>>(46)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("filiation".into(), r.get::<_, Option<String>>(47)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("cnationalt".into(), r.get::<_, Option<String>>(48)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("conj_nom".into(), r.get::<_, Option<String>>(49)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("conj_datem".into(), r.get::<_, Option<String>>(50)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("nom_p_conj".into(), r.get::<_, Option<String>>(51)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("cin_no".into(), r.get::<_, Option<String>>(52)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("cin_d_le".into(), r.get::<_, Option<String>>(53)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("cin_d_a".into(), r.get::<_, Option<String>>(54)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pc_no".into(), r.get::<_, Option<String>>(55)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pc_d_le".into(), r.get::<_, Option<String>>(56)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pc_d_a".into(), r.get::<_, Option<String>>(57)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pass_no".into(), r.get::<_, Option<String>>(58)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pass_d_le".into(), r.get::<_, Option<String>>(59)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pass_d_a".into(), r.get::<_, Option<String>>(60)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("remarque".into(), r.get::<_, Option<String>>(61)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("groupage".into(), r.get::<_, Option<String>>(62)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                // PERS0 extra
                m.insert("motif_sort".into(), r.get::<_, Option<String>>(63)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("dte_cont_d".into(), r.get::<_, Option<String>>(64)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("dte_cont_f".into(), r.get::<_, Option<String>>(65)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("dte_repris".into(), r.get::<_, Option<String>>(66)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("nbr_enfp10".into(), r.get::<_, Option<f64>>(67)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("nbr_enfm10".into(), r.get::<_, Option<f64>>(68)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("no_mutuel".into(), r.get::<_, Option<String>>(69)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("conj_trav".into(), r.get::<_, Option<String>>(70)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("attrib1".into(), r.get::<_, Option<String>>(71)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("attrib2".into(), r.get::<_, Option<String>>(72)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("attrib3".into(), r.get::<_, Option<String>>(73)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("categ_sp".into(), r.get::<_, Option<String>>(74)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("diplome".into(), r.get::<_, Option<String>>(75)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("code_grill".into(), r.get::<_, Option<String>>(76)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("gestion".into(), r.get::<_, Option<f64>>(77)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("lock_val".into(), r.get::<_, Option<i64>>(78)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge".into(), r.get::<_, Option<i64>>(79)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("sorti".into(), r.get::<_, Option<i64>>(80)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                // PERS0 extra (new)
                m.insert("nbr_enf_af".into(), r.get::<_, Option<f64>>(81)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("nbr_prs_ch".into(), r.get::<_, Option<f64>>(82)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("no_profil".into(), r.get::<_, Option<f64>>(83)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("org_payeur".into(), r.get::<_, Option<String>>(84)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("org_pemploy".into(), r.get::<_, Option<String>>(85)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("cod_regl".into(), r.get::<_, Option<f64>>(86)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("mutu_dted".into(), r.get::<_, Option<String>>(87)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("mutu_dtef".into(), r.get::<_, Option<String>>(88)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("ok_intemp".into(), r.get::<_, Option<i64>>(89)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("ok_nat_etr".into(), r.get::<_, Option<i64>>(90)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                // Career dates
                m.insert("date_fnc".into(), r.get::<_, Option<String>>(91)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_sec".into(), r.get::<_, Option<String>>(92)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_das".into(), r.get::<_, Option<String>>(93)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_unt".into(), r.get::<_, Option<String>>(94)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_aff".into(), r.get::<_, Option<String>>(95)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_dip".into(), r.get::<_, Option<String>>(96)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_cat".into(), r.get::<_, Option<String>>(97)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_emp".into(), r.get::<_, Option<String>>(98)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_at1".into(), r.get::<_, Option<String>>(99)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_at2".into(), r.get::<_, Option<String>>(100)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("date_at3".into(), r.get::<_, Option<String>>(101)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                // PERS2 notes (new)
                m.insert("note_fnc".into(), r.get::<_, Option<String>>(102)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_sec".into(), r.get::<_, Option<String>>(103)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_das".into(), r.get::<_, Option<String>>(104)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_unt".into(), r.get::<_, Option<String>>(105)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_aff".into(), r.get::<_, Option<String>>(106)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_dip".into(), r.get::<_, Option<String>>(107)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_cat".into(), r.get::<_, Option<String>>(108)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_emp".into(), r.get::<_, Option<String>>(109)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_at1".into(), r.get::<_, Option<String>>(110)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_at2".into(), r.get::<_, Option<String>>(111)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_at3".into(), r.get::<_, Option<String>>(112)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_con".into(), r.get::<_, Option<String>>(113)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("note_mtf".into(), r.get::<_, Option<String>>(114)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("memoire1".into(), r.get::<_, Option<String>>(115)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("memoire2".into(), r.get::<_, Option<String>>(116)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                // PERS1 fields (new)
                m.insert("conge_du_j".into(), r.get::<_, Option<f64>>(117)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_du_c".into(), r.get::<_, Option<f64>>(118)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_du_i".into(), r.get::<_, Option<f64>>(119)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_pr_j".into(), r.get::<_, Option<f64>>(120)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_pr_c".into(), r.get::<_, Option<f64>>(121)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_pr_i".into(), r.get::<_, Option<f64>>(122)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_ad_j".into(), r.get::<_, Option<f64>>(123)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_ad_c".into(), r.get::<_, Option<f64>>(124)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_ad_i".into(), r.get::<_, Option<f64>>(125)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("conge_ok".into(), r.get::<_, Option<i64>>(126)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("notep".into(), r.get::<_, Option<String>>(127)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("anotep".into(), r.get::<_, Option<String>>(128)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("nbr_jr_ouv".into(), r.get::<_, Option<f64>>(129)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("nbr_hr_ouv".into(), r.get::<_, Option<f64>>(130)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                m.insert("pret_obs1".into(), r.get::<_, Option<String>>(131)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("pret_obs2".into(), r.get::<_, Option<String>>(132)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("child_count".into(), r.get::<_, Option<i64>>(133)?.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null));
                // New lookup labels
                m.insert("fonction_libelle".into(), r.get::<_, Option<String>>(134)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("banque_libelle".into(), r.get::<_, Option<String>>(135)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("categ_sp_libelle".into(), r.get::<_, Option<String>>(136)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("diplome_libelle".into(), r.get::<_, Option<String>>(137)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("attrib1_libelle".into(), r.get::<_, Option<String>>(138)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("attrib2_libelle".into(), r.get::<_, Option<String>>(139)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                m.insert("attrib3_libelle".into(), r.get::<_, Option<String>>(140)?.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                Ok(serde_json::Value::Object(m))
            },
        )
        .map_err(|e| e.to_string())?;

        // Build mapped_fields from field_mappings configuration
        let mut mapped_fields = Vec::new();
        let mappings: Vec<(String, String, String, Option<String>, String, i64)> = {
            let mut stmt = conn
                .prepare("SELECT display_label, employee_column, logical_name, lookup_table, section, sort_order FROM field_mappings WHERE is_visible=1 ORDER BY section, sort_order")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
            ))).map_err(|e| e.to_string())?;
            let mut v = Vec::new();
            for row in rows { v.push(row.map_err(|e| e.to_string())?); }
            v
        };

        for (label, col, logical, lookup_table, section, order) in &mappings {
            // Get raw value from employee
            let sql = format!("SELECT {} FROM employees WHERE id=?", col);
            let raw_val: Option<String> = conn.query_row(&sql, [employee_id], |r| r.get(0)).ok().flatten();
            // Get lookup label if configured
            let libelle = if let (Some(ref lt), Some(ref code)) = (lookup_table, &raw_val) {
                if code.is_empty() || lt.is_empty() { None }
                else {
                    conn.query_row(
                        "SELECT libelle FROM lookup_values WHERE table_name=? AND code=?",
                        rusqlite::params![lt, code],
                        |r| r.get::<_, String>(0),
                    ).ok()
                }
            } else { None };

            mapped_fields.push(serde_json::json!({
                "logical_name": logical,
                "label": label,
                "column": col,
                "lookup_table": lookup_table,
                "section": section,
                "sort_order": order,
                "raw_value": raw_val,
                "libelle": libelle,
            }));
        }
        // Insert mapped_fields into the result
        if let serde_json::Value::Object(ref mut m) = row {
            m.insert("mapped_fields".into(), serde_json::Value::Array(mapped_fields));
        }
        Ok(row)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ============================================================
// Employee children, leave history, loans, career events
// ============================================================

#[tauri::command]
fn get_employee_children(
    state: State<AppState>,
    employee_id: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, matricule, prenom, nais_date, scolarise FROM employee_children WHERE employee_id=? ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([employee_id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "matricule": r.get::<_, Option<String>>(1)?,
                "prenom": r.get::<_, Option<String>>(2)?,
                "nais_date": r.get::<_, Option<String>>(3)?,
                "scolarise": r.get::<_, Option<String>>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
fn get_employee_leave_history(
    state: State<AppState>,
    matricule: String,
    limit: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(500);
    let mut stmt = conn
        .prepare("SELECT id, matricule, date, mois, jours, libelle, alibelle, cotisable, imposable, sens FROM leave_history WHERE matricule=? ORDER BY date DESC LIMIT ?")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![matricule, lim], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "matricule": r.get::<_, Option<String>>(1)?,
                "date": r.get::<_, Option<String>>(2)?,
                "mois": r.get::<_, Option<String>>(3)?,
                "jours": r.get::<_, Option<f64>>(4)?,
                "libelle": r.get::<_, Option<String>>(5)?,
                "alibelle": r.get::<_, Option<String>>(6)?,
                "cotisable": r.get::<_, Option<f64>>(7)?,
                "imposable": r.get::<_, Option<f64>>(8)?,
                "sens": r.get::<_, Option<String>>(9)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
fn get_employee_loans(
    state: State<AppState>,
    matricule: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, matricule, code_rub, mois, date, libelle, montant, sens, no_pret FROM employee_loans WHERE matricule=? ORDER BY date DESC LIMIT 200")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([matricule], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "matricule": r.get::<_, Option<String>>(1)?,
                "code_rub": r.get::<_, Option<String>>(2)?,
                "mois": r.get::<_, Option<String>>(3)?,
                "date": r.get::<_, Option<String>>(4)?,
                "libelle": r.get::<_, Option<String>>(5)?,
                "montant": r.get::<_, Option<f64>>(6)?,
                "sens": r.get::<_, Option<String>>(7)?,
                "no_pret": r.get::<_, Option<i64>>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
fn get_employee_events(
    state: State<AppState>,
    matricule: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, matricule, libelle, alibelle, date, heure, codop FROM career_events WHERE matricule=? ORDER BY date DESC LIMIT 200")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([matricule], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "matricule": r.get::<_, Option<String>>(1)?,
                "libelle": r.get::<_, Option<String>>(2)?,
                "alibelle": r.get::<_, Option<String>>(3)?,
                "date": r.get::<_, Option<String>>(4)?,
                "heure": r.get::<_, Option<String>>(5)?,
                "codop": r.get::<_, Option<String>>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
fn get_pay_periods(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, mois, libelle, alibelle, signe FROM pay_periods ORDER BY mois DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "mois": r.get::<_, Option<String>>(1)?,
                "libelle": r.get::<_, Option<String>>(2)?,
                "alibelle": r.get::<_, Option<String>>(3)?,
                "signe": r.get::<_, Option<String>>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

// Shift management
#[derive(Debug, Serialize, Deserialize)]
struct Shift {
    id: i64,
    name: String,
    description: Option<String>,
    shift_type: String,
    config: String,
    hourly_rate: f64,
    monthly_hours: f64,
}

#[tauri::command]
fn get_shifts(state: State<AppState>) -> Result<Vec<Shift>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, shift_type, config, hourly_rate, monthly_hours FROM shifts ORDER BY id")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Shift {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                shift_type: row.get(3)?,
                config: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "{}".into()),
                hourly_rate: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                monthly_hours: row.get::<_, Option<f64>>(6)?.unwrap_or(173.33),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut shifts = Vec::new();
    for row in rows {
        shifts.push(row.map_err(|e| e.to_string())?);
    }
    Ok(shifts)
}

#[tauri::command]
fn create_shift(
    state: State<AppState>,
    name: String,
    description: Option<String>,
    shift_type: String,
    config: String,
    hourly_rate: f64,
    monthly_hours: f64,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        r#"INSERT INTO shifts (name, description, shift_type, config, hourly_rate, monthly_hours)
           VALUES (?,?,?,?,?,?)"#,
        rusqlite::params![name, description, shift_type, config, hourly_rate, monthly_hours],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn assign_shift(
    state: State<AppState>,
    employee_id: i64,
    shift_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE employees SET shift_id=?, updated_at=datetime('now') WHERE id=?",
        rusqlite::params![shift_id, employee_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Salary calculation
#[tauri::command]
async fn calculate_employee_salary(
    state: State<'_, AppState>,
    employee_id: i64,
    period: String,
    input_values: HashMap<String, (f64, f64)>,
) -> Result<CalcResult, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
        calculate_salary(&conn, employee_id, &period, &input_values)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn save_salary_calculation(
    state: State<AppState>,
    result: CalcResult,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    save_calculation(&conn, &result)
}

#[tauri::command]
fn get_saved_calculation(
    state: State<AppState>,
    employee_id: i64,
    period: String,
) -> Result<Option<CalcResult>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let row = conn.query_row(
        r#"SELECT id, employee_id, matricule, period, results_json,
                  total_brut, total_gains, total_retenues, net_payer,
                  base_cotisable, base_imposable, irg
           FROM salary_calculations WHERE employee_id=? AND period=? LIMIT 1"#,
        rusqlite::params![employee_id, period],
        |r| {
            let results_json: String = r.get(4)?;
            let lines: Vec<calculator::CalcLine> = serde_json::from_str(&results_json).unwrap_or_default();
            Ok(CalcResult {
                employee_id: r.get(1)?,
                matricule: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                employee_name: String::new(),
                period: r.get(3)?,
                lines,
                total_brut: r.get(5)?,
                total_gains: r.get(6)?,
                total_retenues: r.get(7)?,
                net_payer: r.get(8)?,
                base_cotisable: r.get(9)?,
                base_imposable: r.get(10)?,
                irg: r.get(11)?,
                applied_bonuses: Vec::new(),
            })
        },
    );
    match row {
        Ok(result) => Ok(Some(result)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_salary_history(
    state: State<AppState>,
    employee_id: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // First try calculated salary history
    let mut stmt = conn
        .prepare(
            r#"SELECT id, period, total_brut, total_gains, total_retenues, net_payer,
               base_cotisable, base_imposable, irg, status, calculated_at
               FROM salary_calculations WHERE employee_id=? ORDER BY period DESC"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([employee_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "period": row.get::<_, String>(1)?,
                "total_brut": row.get::<_, f64>(2)?,
                "total_gains": row.get::<_, f64>(3)?,
                "total_retenues": row.get::<_, f64>(4)?,
                "net_payer": row.get::<_, f64>(5)?,
                "base_cotisable": row.get::<_, f64>(6)?,
                "base_imposable": row.get::<_, f64>(7)?,
                "irg": row.get::<_, f64>(8)?,
                "status": row.get::<_, String>(9)?,
                "calculated_at": row.get::<_, String>(10)?,
                "source": "calculated",
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }

    // Fallback to imported historical payslips if no calculations exist
    if results.is_empty() {
        let mut stmt = conn
            .prepare("SELECT mois, montants FROM paies WHERE employee_id=? AND mois GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]' ORDER BY mois DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([employee_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (mois, montants) = row.map_err(|e| e.to_string())?;
            let values = parse_montants(&montants);
            let (total_brut, net_payer, irg, total_retenues, base_cotisable, base_imposable) = extract_totals_from_montants(&values);
            results.push(serde_json::json!({
                "id": -1,
                "period": mois,
                "total_brut": total_brut,
                "total_gains": base_cotisable,
                "total_retenues": total_retenues,
                "net_payer": net_payer,
                "base_cotisable": base_cotisable,
                "base_imposable": base_imposable,
                "irg": irg,
                "status": "imported",
                "calculated_at": null,
                "source": "imported",
            }));
        }
    }

    Ok(results)
}

// Leaves
#[derive(Debug, Serialize, Deserialize)]
struct Leave {
    id: i64,
    employee_id: i64,
    leave_type: String,
    start_date: String,
    end_date: String,
    days_count: f64,
    reason: Option<String>,
    status: String,
}

#[tauri::command]
fn get_leaves(state: State<AppState>, employee_id: Option<i64>) -> Result<Vec<Leave>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut leaves = Vec::new();
    if let Some(eid) = employee_id {
        let mut stmt = conn
            .prepare(
                "SELECT id, employee_id, leave_type, start_date, end_date, days_count, reason, status FROM leaves WHERE employee_id=? ORDER BY start_date DESC LIMIT 200",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([eid], |row| {
                Ok(Leave {
                    id: row.get(0)?,
                    employee_id: row.get(1)?,
                    leave_type: row.get(2)?,
                    start_date: row.get(3)?,
                    end_date: row.get(4)?,
                    days_count: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                    reason: row.get(6)?,
                    status: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            leaves.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, employee_id, leave_type, start_date, end_date, days_count, reason, status FROM leaves ORDER BY start_date DESC LIMIT 200",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Leave {
                    id: row.get(0)?,
                    employee_id: row.get(1)?,
                    leave_type: row.get(2)?,
                    start_date: row.get(3)?,
                    end_date: row.get(4)?,
                    days_count: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                    reason: row.get(6)?,
                    status: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            leaves.push(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(leaves)
}

#[tauri::command]
fn create_leave(
    state: State<AppState>,
    employee_id: i64,
    leave_type: String,
    start_date: String,
    end_date: String,
    days_count: f64,
    reason: Option<String>,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        r#"INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days_count, reason)
           VALUES (?,?,?,?,?,?)"#,
        rusqlite::params![employee_id, leave_type, start_date, end_date, days_count, reason],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn delete_leave(state: State<AppState>, leave_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM leaves WHERE id=?", [leave_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Bonuses
#[derive(Debug, Serialize, Deserialize)]
struct Bonus {
    id: i64,
    title: String,
    description: Option<String>,
    bonus_type: String,
    amount: f64,
    is_percentage: bool,
    rubrique_code: Option<String>,
    target_type: String,
    target_value: Option<String>,
    pay_period: Option<String>,
    status: String,
    #[serde(default)]
    recurrence_type: Option<String>,
    #[serde(default)]
    recurrence_count: Option<i64>,
    #[serde(default)]
    is_imposable: Option<i64>,
    #[serde(default)]
    is_cotisable: Option<i64>,
    #[serde(default)]
    assigned_employees: Option<Vec<(i64, String)>>,
}

#[tauri::command]
async fn get_bonuses(state: State<'_, AppState>) -> Result<Vec<Bonus>, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"SELECT id, title, description, bonus_type, amount, is_percentage,
               rubrique_code, target_type, target_value, pay_period, status,
               recurrence_type, recurrence_count, is_imposable, is_cotisable
               FROM bonuses ORDER BY created_at DESC LIMIT 200"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Bonus {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                bonus_type: row.get(3)?,
                amount: row.get(4)?,
                is_percentage: row.get::<_, Option<i64>>(5)?.unwrap_or(0) != 0,
                rubrique_code: row.get(6)?,
                target_type: row.get(7)?,
                target_value: row.get(8)?,
                pay_period: row.get(9)?,
                status: row.get(10)?,
                recurrence_type: row.get::<_, Option<String>>(11)?,
                recurrence_count: row.get::<_, Option<i64>>(12)?,
                is_imposable: row.get::<_, Option<i64>>(13)?,
                is_cotisable: row.get::<_, Option<i64>>(14)?,
                assigned_employees: None,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut bonuses = Vec::new();
    for row in rows {
        let mut b = row.map_err(|e| e.to_string())?;
        // If individual target, load assigned employee names
        if b.target_type == "individual" {
            let mut emp_stmt = conn.prepare(
                "SELECT e.id, e.nom || ' ' || COALESCE(e.prenom, '') FROM bonus_assignments ba JOIN employees e ON e.id = ba.employee_id WHERE ba.bonus_id = ?"
            ).map_err(|e| e.to_string())?;
            let emp_rows = emp_stmt.query_map([b.id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
            }).map_err(|e| e.to_string())?;
            let mut emps = Vec::new();
            for er in emp_rows {
                emps.push(er.map_err(|e| e.to_string())?);
            }
            b.assigned_employees = Some(emps);
        }
        bonuses.push(b);
    }
    Ok(bonuses)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn skip_bonus(state: State<AppState>, bonus_id: i64, period: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO bonus_skips (bonus_id, period) VALUES (?, ?)",
        rusqlite::params![bonus_id, period],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn unskip_bonus(state: State<AppState>, bonus_id: i64, period: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM bonus_skips WHERE bonus_id=? AND period=?",
        rusqlite::params![bonus_id, period],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_skipped_bonuses(state: State<AppState>, period: String) -> Result<Vec<i64>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT bonus_id FROM bonus_skips WHERE period=?")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([period], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| e.to_string())?);
    }
    Ok(ids)
}

#[tauri::command]
fn create_bonus(
    state: State<AppState>,
    title: String,
    description: Option<String>,
    bonus_type: String,
    amount: f64,
    is_percentage: bool,
    rubrique_code: Option<String>,
    target_type: String,
    target_value: Option<String>,
    pay_period: Option<String>,
    employee_ids: Option<Vec<i64>>,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        r#"INSERT INTO bonuses (title, description, bonus_type, amount, is_percentage,
           rubrique_code, target_type, target_value, pay_period)
           VALUES (?,?,?,?,?,?,?,?,?)"#,
        rusqlite::params![
            title, description, bonus_type, amount, is_percentage as i64,
            rubrique_code, target_type, target_value, pay_period
        ],
    )
    .map_err(|e| e.to_string())?;
    let bonus_id = conn.last_insert_rowid();

    if target_type == "individual" {
        if let Some(ids) = employee_ids {
            for emp_id in ids {
                conn.execute(
                    "INSERT INTO bonus_assignments (bonus_id, employee_id) VALUES (?, ?)",
                    rusqlite::params![bonus_id, emp_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(bonus_id)
}

#[tauri::command]
fn delete_bonus(state: State<AppState>, bonus_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bonuses WHERE id=?", [bonus_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_bonus(
    state: State<AppState>,
    bonus_id: i64,
    title: Option<String>,
    bonus_type: Option<String>,
    amount: Option<f64>,
    is_percentage: Option<bool>,
    rubrique_code: Option<Option<String>>,
    target_type: Option<String>,
    target_value: Option<Option<String>>,
    pay_period: Option<Option<String>>,
    recurrence_type: Option<String>,
    recurrence_count: Option<i64>,
    employee_ids: Option<Vec<i64>>,
    is_imposable: Option<bool>,
    is_cotisable: Option<bool>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Build dynamic UPDATE query
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(v) = title { sets.push("title = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = bonus_type { sets.push("bonus_type = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = amount { sets.push("amount = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = is_percentage { sets.push("is_percentage = ?".into()); params.push(Box::new(v as i64)); }
    if let Some(v) = rubrique_code { sets.push("rubrique_code = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = target_type { sets.push("target_type = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = target_value { sets.push("target_value = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = pay_period { sets.push("pay_period = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = recurrence_type { sets.push("recurrence_type = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = recurrence_count { sets.push("recurrence_count = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = is_imposable { sets.push("is_imposable = ?".into()); params.push(Box::new(v as i64)); }
    if let Some(v) = is_cotisable { sets.push("is_cotisable = ?".into()); params.push(Box::new(v as i64)); }

    if sets.is_empty() && employee_ids.is_none() {
        return Ok(());
    }

    if !sets.is_empty() {
        let sql = format!("UPDATE bonuses SET {} WHERE id = ?", sets.join(", "));
        params.push(Box::new(bonus_id));
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    // Update employee assignments if provided
    if let Some(ids) = employee_ids {
        conn.execute("DELETE FROM bonus_assignments WHERE bonus_id = ?", [bonus_id])
            .map_err(|e| e.to_string())?;
        for emp_id in ids {
            conn.execute(
                "INSERT INTO bonus_assignments (bonus_id, employee_id) VALUES (?, ?)",
                rusqlite::params![bonus_id, emp_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_active_bonuses_for_period(state: State<AppState>, employee_id: i64, period: String) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Get employee info for target matching
    let (_matricule, section, structure, unite, affectatio, contrat): (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = conn
        .query_row("SELECT matricule, section, structure, unite, affectatio, contrat FROM employees WHERE id=?", [employee_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .map_err(|e| e.to_string())?;

    // Query active bonuses that match this period (or have no period = recurring)
    // For recurring/permanent bonuses, pay_period is the start period — apply to all periods >= start
    let mut stmt = conn
        .prepare(r#"SELECT id, title, description, bonus_type, amount, is_percentage,
                    rubrique_code, target_type, target_value, pay_period, status,
                    is_imposable, is_cotisable, recurrence_type, recurrence_count,
                    is_absence_dependent, absence_divisor, amount_type,
                    income_grid_min, income_grid_max, contract_types
                    FROM bonuses WHERE status='active'
                    AND (pay_period IS NULL OR pay_period=? OR (
                        recurrence_type IS NOT NULL AND recurrence_type != 'one_time' AND pay_period <= ?
                    ))"#)
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([&period, &period], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "title": row.get::<_, String>(1)?,
            "description": row.get::<_, Option<String>>(2)?,
            "bonus_type": row.get::<_, String>(3)?,
            "amount": row.get::<_, f64>(4)?,
            "is_percentage": row.get::<_, Option<i64>>(5)?.unwrap_or(0) != 0,
            "rubrique_code": row.get::<_, Option<String>>(6)?,
            "target_type": row.get::<_, String>(7)?,
            "target_value": row.get::<_, Option<String>>(8)?,
            "pay_period": row.get::<_, Option<String>>(9)?,
            "status": row.get::<_, String>(10)?,
            "is_imposable": row.get::<_, Option<i64>>(11)?.unwrap_or(0) != 0,
            "is_cotisable": row.get::<_, Option<i64>>(12)?.unwrap_or(0) != 0,
            "recurrence_type": row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "one_time".to_string()),
            "recurrence_count": row.get::<_, Option<i64>>(14)?.unwrap_or(0),
            "is_absence_dependent": row.get::<_, Option<i64>>(15)?.unwrap_or(0) != 0,
            "absence_divisor": row.get::<_, Option<f64>>(16)?.unwrap_or(22.0),
            "amount_type": row.get::<_, Option<String>>(17)?.unwrap_or_else(|| "fixed".to_string()),
            "income_grid_min": row.get::<_, Option<f64>>(18)?,
            "income_grid_max": row.get::<_, Option<f64>>(19)?,
            "contract_types": row.get::<_, Option<String>>(20)?,
        }))
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        let bonus = row.map_err(|e| e.to_string())?;

        // Check if this bonus applies to this employee
        let target_type = bonus["target_type"].as_str().unwrap_or("individual");
        let applies = match target_type {
            "all" => true,
            "individual" => {
                // Check bonus_assignments or bonus_targets
                let bonus_id = bonus["id"].as_i64().unwrap_or(0);
                let assigned: bool = conn
                    .query_row(
                        "SELECT COUNT(*) FROM bonus_assignments WHERE bonus_id=? AND employee_id=?",
                        rusqlite::params![bonus_id, employee_id],
                        |r| r.get::<_, i64>(0),
                    )
                    .map(|c| c > 0)
                    .unwrap_or(false);
                assigned
            }
            "department" | "section" => {
                let target_val = bonus["target_value"].as_str();
                target_val.is_some() && section.as_deref() == target_val
            }
            "structure" => {
                let target_val = bonus["target_value"].as_str();
                target_val.is_some() && structure.as_deref() == target_val
            }
            "unite" => {
                let target_val = bonus["target_value"].as_str();
                target_val.is_some() && unite.as_deref() == target_val
            }
            "affectatio" => {
                let target_val = bonus["target_value"].as_str();
                target_val.is_some() && affectatio.as_deref() == target_val
            }
            "contract" => {
                let target_val = bonus["target_value"].as_str();
                target_val.is_some() && contrat.as_deref() == target_val
            }
            _ => false,
        };

        if applies {
            // Check recurrence: if recurring with count, check how many times already applied
            let recurrence_type = bonus["recurrence_type"].as_str().unwrap_or("one_time");
            let recurrence_count = bonus["recurrence_count"].as_i64().unwrap_or(0);
            if recurrence_type == "recurring" && recurrence_count > 0 {
                let bonus_id = bonus["id"].as_i64().unwrap_or(0);
                let already_applied: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM bonus_applications WHERE bonus_id=? AND employee_id=?",
                        rusqlite::params![bonus_id, employee_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                if already_applied >= recurrence_count {
                    continue;
                }
            }

            // Check if already applied for this period (one_time)
            if recurrence_type == "one_time" {
                let bonus_id = bonus["id"].as_i64().unwrap_or(0);
                let already_applied: bool = conn
                    .query_row(
                        "SELECT COUNT(*) FROM bonus_applications WHERE bonus_id=? AND employee_id=? AND period=?",
                        rusqlite::params![bonus_id, employee_id, period],
                        |r| r.get::<_, i64>(0),
                    )
                    .map(|c| c > 0)
                    .unwrap_or(false);
                if already_applied {
                    continue;
                }
            }

            result.push(bonus);
        }
    }

    Ok(result)
}

#[tauri::command]
fn create_enhanced_bonus(
    state: State<AppState>,
    title: String,
    description: Option<String>,
    bonus_type: String,
    amount: f64,
    is_percentage: bool,
    rubrique_code: Option<String>,
    target_type: String,
    target_value: Option<String>,
    pay_period: Option<String>,
    employee_ids: Option<Vec<i64>>,
    is_imposable: Option<bool>,
    is_cotisable: Option<bool>,
    recurrence_type: Option<String>,
    recurrence_count: Option<i64>,
    is_absence_dependent: Option<bool>,
    absence_divisor: Option<f64>,
    amount_type: Option<String>,
    income_grid_min: Option<f64>,
    income_grid_max: Option<f64>,
    contract_types: Option<String>,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        r#"INSERT INTO bonuses (title, description, bonus_type, amount, is_percentage,
           rubrique_code, target_type, target_value, pay_period,
           is_imposable, is_cotisable, recurrence_type, recurrence_count,
           is_absence_dependent, absence_divisor, amount_type,
           income_grid_min, income_grid_max, contract_types)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
        rusqlite::params![
            title, description, bonus_type, amount, is_percentage as i64,
            rubrique_code, target_type, target_value, pay_period,
            is_imposable.unwrap_or(false) as i64,
            is_cotisable.unwrap_or(false) as i64,
            recurrence_type.as_deref().unwrap_or("one_time"),
            recurrence_count.unwrap_or(0),
            is_absence_dependent.unwrap_or(false) as i64,
            absence_divisor.unwrap_or(22.0),
            amount_type.as_deref().unwrap_or("fixed"),
            income_grid_min, income_grid_max, contract_types
        ],
    )
    .map_err(|e| e.to_string())?;
    let bonus_id = conn.last_insert_rowid();

    if target_type == "individual" {
        if let Some(ids) = employee_ids {
            for emp_id in ids {
                conn.execute(
                    "INSERT INTO bonus_assignments (bonus_id, employee_id) VALUES (?, ?)",
                    rusqlite::params![bonus_id, emp_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(bonus_id)
}

#[tauri::command]
fn apply_bonus_to_employee(state: State<AppState>, bonus_id: i64, employee_id: i64, period: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO bonus_applications (bonus_id, employee_id, period) VALUES (?, ?, ?)",
        rusqlite::params![bonus_id, employee_id, period],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// Attendance
#[tauri::command]
fn get_attendance(
    state: State<AppState>,
    employee_id: Option<i64>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut query = String::from(
        "SELECT a.id, a.employee_id, a.pointeuse_pin, a.punch_datetime, a.verify_mode, a.work_code, a.device_id,
         e.nom, e.prenom
         FROM attendance a LEFT JOIN employees e ON a.employee_id = e.id WHERE 1=1",
    );
    let mut params: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(eid) = employee_id {
        query.push_str(" AND a.employee_id = ?");
        params.push(eid.into());
    }
    if let Some(ref sd) = start_date {
        query.push_str(" AND a.punch_datetime >= ?");
        params.push(sd.clone().into());
    }
    if let Some(ref ed) = end_date {
        query.push_str(" AND a.punch_datetime <= ?");
        params.push(ed.clone().into());
    }
    query.push_str(" ORDER BY a.punch_datetime DESC LIMIT 500");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p as &dyn rusqlite::ToSql).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "employee_id": row.get::<_, Option<i64>>(1)?,
                "pointeuse_pin": row.get::<_, Option<i32>>(2)?,
                "punch_datetime": row.get::<_, String>(3)?,
                "verify_mode": row.get::<_, Option<i32>>(4)?,
                "work_code": row.get::<_, Option<i32>>(5)?,
                "device_id": row.get::<_, Option<String>>(6)?,
                "nom": row.get::<_, Option<String>>(7)?,
                "prenom": row.get::<_, Option<String>>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

// Rubriques
#[tauri::command]
async fn get_rubriques(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"SELECT code, libelle, formule, classe, is_brut, is_impos, is_secu_s,
               is_total, is_imp, manuelle, init_val, ord_clc
               FROM rubriques ORDER BY CAST(code AS INTEGER)"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "code": row.get::<_, String>(0)?,
                "libelle": row.get::<_, Option<String>>(1)?,
                "formule": row.get::<_, Option<String>>(2)?,
                "classe": row.get::<_, Option<f64>>(3)?,
                "is_brut": row.get::<_, Option<i64>>(4)?,
                "is_impos": row.get::<_, Option<i64>>(5)?,
                "is_secu_s": row.get::<_, Option<i64>>(6)?,
                "is_total": row.get::<_, Option<i64>>(7)?,
                "is_imp": row.get::<_, Option<i64>>(8)?,
                "manuelle": row.get::<_, Option<i64>>(9)?,
                "init_val": row.get::<_, Option<f64>>(10)?,
                "ord_clc": row.get::<_, Option<f64>>(11)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn create_rubrique(
    state: State<AppState>,
    libelle: String,
    classe: f64,
    is_brut: Option<i64>,
    is_impos: Option<i64>,
    is_secu_s: Option<i64>,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Find next available code starting from 800
    let mut next_code = 800i64;
    let mut stmt = conn
        .prepare("SELECT CAST(code AS INTEGER) FROM rubriques WHERE CAST(code AS INTEGER) >= 800 ORDER BY CAST(code AS INTEGER)")
        .map_err(|e| e.to_string())?;
    let used_codes: Vec<i64> = stmt
        .query_map([], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    for c in &used_codes {
        if *c == next_code {
            next_code += 1;
        } else {
            break;
        }
    }

    let code_str = format!("{:03}", next_code);
    conn.execute(
        r#"INSERT INTO rubriques (code, libelle, classe, manuelle, is_brut, is_impos, is_secu_s, is_total, is_imp, ord_clc)
           VALUES (?, ?, ?, 1, ?, ?, ?, 1, 0, 60000)"#,
        rusqlite::params![
            code_str,
            libelle,
            classe,
            is_brut.unwrap_or(1),
            is_impos.unwrap_or(1),
            is_secu_s.unwrap_or(1),
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(code_str)
}

#[tauri::command]
fn update_rubrique(
    state: State<AppState>,
    code: String,
    libelle: Option<String>,
    formule: Option<String>,
    classe: Option<f64>,
    is_brut: Option<i64>,
    is_impos: Option<i64>,
    is_secu_s: Option<i64>,
    is_total: Option<i64>,
    is_imp: Option<i64>,
    manuelle: Option<i64>,
    init_val: Option<f64>,
    ord_clc: Option<f64>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(l) = libelle { sets.push("libelle = ?".into()); params.push(Box::new(l)); }
    if let Some(f) = formule { sets.push("formule = ?".into()); params.push(Box::new(f)); }
    if let Some(c) = classe { sets.push("classe = ?".into()); params.push(Box::new(c)); }
    if let Some(v) = is_brut { sets.push("is_brut = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = is_impos { sets.push("is_impos = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = is_secu_s { sets.push("is_secu_s = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = is_total { sets.push("is_total = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = is_imp { sets.push("is_imp = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = manuelle { sets.push("manuelle = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = init_val { sets.push("init_val = ?".into()); params.push(Box::new(v)); }
    if let Some(v) = ord_clc { sets.push("ord_clc = ?".into()); params.push(Box::new(v)); }

    if sets.is_empty() {
        return Ok(());
    }
    params.push(Box::new(code.clone()));
    let sql = format!("UPDATE rubriques SET {} WHERE code = ?", sets.join(", "));
    conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_rubrique_flags(
    state: State<AppState>,
    code: String,
    is_secu_s: Option<bool>,
    is_impos: Option<bool>,
    is_brut: Option<bool>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(v) = is_secu_s { sets.push("is_secu_s = ?".into()); params.push(Box::new(v as i64)); }
    if let Some(v) = is_impos { sets.push("is_impos = ?".into()); params.push(Box::new(v as i64)); }
    if let Some(v) = is_brut { sets.push("is_brut = ?".into()); params.push(Box::new(v as i64)); }

    if sets.is_empty() {
        return Ok(());
    }

    let sql = format!("UPDATE rubriques SET {} WHERE code = ?", sets.join(", "));
    params.push(Box::new(code));
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_rubrique(
    state: State<AppState>,
    code: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    // Check if rubrique is used in employee_rubriques or poste_rubriques
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM employee_rubriques WHERE rubrique_code = ?",
            [&code],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err(format!("Cette rubrique est utilisée par {} employé(s). Supprimez d'abord les affectations.", count));
    }
    conn.execute("DELETE FROM rubriques WHERE code = ?", [&code])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn test_rubrique_formula(
    state: State<AppState>,
    code: String,
    formule: String,
    employee_id: Option<i64>,
    period: Option<String>,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let emp_id = employee_id.unwrap_or(1);
    let period_str = period.unwrap_or_else(|| format!("{}-{:02}", chrono::Local::now().year(), chrono::Local::now().month()));

    // Load all rubriques
    let rubriques = calculator::load_rubriques(&conn)?;
    let r_values: HashMap<String, f64> = rubriques
        .iter()
        .map(|r| (r.code.clone(), r.init_val))
        .collect();

    // Load T values (parameters) — use defaults
    let t_values: HashMap<usize, f64> = HashMap::new();

    // Try to evaluate the formula
    let result = calculator::eval_formula_public(&formule, &r_values, &t_values, 0.0, 0.0, &period_str);

    match result {
        Ok(val) => Ok(serde_json::json!({
            "success": true,
            "value": val,
            "formula": formule,
            "code": code,
        })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": e,
            "formula": formule,
            "code": code,
        })),
    }
}

// ============================================================
// Salary settings (global parameterization)
// ============================================================

#[tauri::command]
fn get_salary_settings(state: State<AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM salary_settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "key": row.get::<_, String>(0)?,
            "value": row.get::<_, String>(1)?,
        }))
    }).map_err(|e| e.to_string())?;
    let mut settings = serde_json::Map::new();
    for row in rows {
        let r = row.map_err(|e| e.to_string())?;
        settings.insert(r["key"].as_str().unwrap_or("").to_string(), r["value"].clone());
    }
    Ok(serde_json::Value::Object(settings))
}

#[tauri::command]
fn set_salary_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO salary_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        rusqlite::params![key, value],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_salary_settings(state: State<AppState>, settings: HashMap<String, String>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (key, value) in &settings {
        tx.execute(
            "INSERT INTO salary_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            rusqlite::params![key, value],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// Lookup values (departments, regions, areas)
#[tauri::command]
fn get_lookup_values(
    state: State<AppState>,
    table_name: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    if let Some(tn) = table_name {
        let mut stmt = conn
            .prepare("SELECT id, table_name, code, libelle FROM lookup_values WHERE table_name=? ORDER BY code")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&tn], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, i64>(0)?,
                    "table_name": row.get::<_, String>(1)?,
                    "code": row.get::<_, String>(2)?,
                    "libelle": row.get::<_, Option<String>>(3)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = conn
            .prepare("SELECT id, table_name, code, libelle FROM lookup_values ORDER BY table_name, code")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, i64>(0)?,
                    "table_name": row.get::<_, String>(1)?,
                    "code": row.get::<_, String>(2)?,
                    "libelle": row.get::<_, Option<String>>(3)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(results)
}

// Clear all pointeuse data (users, attendance, pins)
#[tauri::command]
fn clear_pointeuse_data(state: State<AppState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM attendance", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pointeuse_users", []).map_err(|e| e.to_string())?;
    conn.execute("UPDATE employees SET pointeuse_pin=NULL", []).map_err(|e| e.to_string())?;
    Ok(())
}

// Auto-match all pointeuse users to employees (links all with score >= threshold)
#[tauri::command]
fn auto_match_all(state: State<AppState>, threshold: Option<f64>) -> Result<usize, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let matches = fuzzy_match_users_to_employees(&conn)?;
    let min_score = threshold.unwrap_or(60.0);
    let mut linked = 0usize;
    for m in &matches {
        if let Some(emp_id) = m.best_employee_id {
            if m.best_score >= min_score {
                link_pointeuse_to_employee(&conn, m.pin, emp_id)?;
                linked += 1;
            }
        }
    }
    Ok(linked)
}

// Bulk link multiple pointeuse users to employees
#[tauri::command]
fn bulk_link_users(state: State<AppState>, links: Vec<(i32, i64)>) -> Result<usize, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut count = 0usize;
    for (pin, emp_id) in links {
        link_pointeuse_to_employee(&conn, pin, emp_id)?;
        count += 1;
    }
    Ok(count)
}

// Calculate salaries for all active employees for a given period
#[tauri::command]
async fn calculate_all_salaries(
    state: State<'_, AppState>,
    period: String,
) -> Result<Vec<CalcResult>, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
        let emp_ids: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT id FROM employees WHERE actif=1 ORDER BY nom, prenom")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
            let mut ids = Vec::new();
            for r in rows {
                ids.push(r.map_err(|e| e.to_string())?);
            }
            ids
        };
        let mut results = Vec::new();
        for eid in emp_ids {
            match calculate_salary(&conn, eid, &period, &HashMap::new()) {
                Ok(r) => {
                    save_calculation(&conn, &r)?;
                    results.push(r);
                }
                Err(e) => {
                    eprintln!("Calc error for emp {}: {}", eid, e);
                }
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

// Delete all salary calculations for a given period
#[tauri::command]
fn delete_month_calculations(state: State<AppState>, period: String) -> Result<usize, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let count = conn.execute(
        "DELETE FROM salary_calculations WHERE period=?",
        [&period],
    ).map_err(|e| e.to_string())?;
    Ok(count)
}

// Get salary history for all employees (or filtered by period)
// Optimized: filters in SQL, uses LIMIT, runs in spawn_blocking to avoid Mutex contention
#[tauri::command]
async fn get_all_salary_history(
    state: State<'_, AppState>,
    period: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA busy_timeout=5000;").ok();
        let mut results = Vec::new();

        // New calculations from our app
        if let Some(ref p) = period {
            let mut stmt = conn
                .prepare(r#"SELECT sc.id, sc.employee_id, sc.period, sc.matricule, sc.total_brut,
                           sc.total_gains, sc.total_retenues, sc.net_payer, sc.base_cotisable,
                           sc.base_imposable, sc.irg, sc.status, sc.calculated_at,
                           e.nom, e.prenom
                           FROM salary_calculations sc
                           LEFT JOIN employees e ON sc.employee_id = e.id
                           WHERE sc.period=? ORDER BY e.nom, e.prenom LIMIT 500"#)
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([&p], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, i64>(0)?,
                        "employee_id": row.get::<_, Option<i64>>(1)?,
                        "period": row.get::<_, String>(2)?,
                        "matricule": row.get::<_, Option<String>>(3)?,
                        "total_brut": row.get::<_, f64>(4)?,
                        "total_gains": row.get::<_, f64>(5)?,
                        "total_retenues": row.get::<_, f64>(6)?,
                        "net_payer": row.get::<_, f64>(7)?,
                        "base_cotisable": row.get::<_, f64>(8)?,
                        "base_imposable": row.get::<_, f64>(9)?,
                        "irg": row.get::<_, f64>(10)?,
                        "status": row.get::<_, String>(11)?,
                        "calculated_at": row.get::<_, String>(12)?,
                        "nom": row.get::<_, Option<String>>(13)?,
                        "prenom": row.get::<_, Option<String>>(14)?,
                        "source": "app",
                    }))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                results.push(row.map_err(|e| e.to_string())?);
            }
        } else {
            let mut stmt = conn
                .prepare(r#"SELECT sc.id, sc.employee_id, sc.period, sc.matricule, sc.total_brut,
                           sc.total_gains, sc.total_retenues, sc.net_payer, sc.base_cotisable,
                           sc.base_imposable, sc.irg, sc.status, sc.calculated_at,
                           e.nom, e.prenom
                           FROM salary_calculations sc
                           LEFT JOIN employees e ON sc.employee_id = e.id
                           ORDER BY sc.period DESC, e.nom, e.prenom LIMIT 500"#)
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, i64>(0)?,
                        "employee_id": row.get::<_, Option<i64>>(1)?,
                        "period": row.get::<_, String>(2)?,
                        "matricule": row.get::<_, Option<String>>(3)?,
                        "total_brut": row.get::<_, f64>(4)?,
                        "total_gains": row.get::<_, f64>(5)?,
                        "total_retenues": row.get::<_, f64>(6)?,
                        "net_payer": row.get::<_, f64>(7)?,
                        "base_cotisable": row.get::<_, f64>(8)?,
                        "base_imposable": row.get::<_, f64>(9)?,
                        "irg": row.get::<_, f64>(10)?,
                        "status": row.get::<_, String>(11)?,
                        "calculated_at": row.get::<_, String>(12)?,
                        "nom": row.get::<_, Option<String>>(13)?,
                        "prenom": row.get::<_, Option<String>>(14)?,
                        "source": "app",
                    }))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                results.push(row.map_err(|e| e.to_string())?);
            }
        }

        // Legacy PCPAIE paies — filter period in SQL, add LIMIT
        let (sql2, params2): (&str, Vec<&dyn rusqlite::ToSql>) = if let Some(ref p) = period {
            (r#"SELECT p.id, p.employee_id, p.mois, p.matricule, p.montants, p.sit_fam, p.nbre_enf,
                        p.nbr_jr_ouv, p.nbr_hr_ouv, p.c_date, p.c_time,
                        e.nom, e.prenom
                        FROM paies p
                        LEFT JOIN employees e ON p.employee_id = e.id
                        WHERE p.mois=? AND p.mois != 'TOT-PAIE'
                        ORDER BY e.nom, e.prenom LIMIT 500"#,
             vec![p as &dyn rusqlite::ToSql])
        } else {
            (r#"SELECT p.id, p.employee_id, p.mois, p.matricule, p.montants, p.sit_fam, p.nbre_enf,
                        p.nbr_jr_ouv, p.nbr_hr_ouv, p.c_date, p.c_time,
                        e.nom, e.prenom
                        FROM paies p
                        LEFT JOIN employees e ON p.employee_id = e.id
                        WHERE p.mois != 'TOT-PAIE'
                        ORDER BY p.mois DESC, e.nom, e.prenom LIMIT 500"#,
             vec![])
        };
        let mut stmt2 = conn.prepare(sql2).map_err(|e| e.to_string())?;
        let rows2 = stmt2.query_map(params2.as_slice(), |row| {
            let montants: Option<String> = row.get(4)?;
            let (total_brut, net_payer, irg, total_retenues, base_cotisable, base_imposable) =
                if let Some(ref m) = montants {
                    let map = parse_montants(m);
                    extract_totals_from_montants(&map)
                } else {
                    (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
                };
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "employee_id": row.get::<_, Option<i64>>(1)?,
                "period": row.get::<_, Option<String>>(2)?,
                "matricule": row.get::<_, Option<String>>(3)?,
                "total_brut": total_brut,
                "net_payer": net_payer,
                "irg": irg,
                "total_retenues": total_retenues,
                "base_cotisable": base_cotisable,
                "base_imposable": base_imposable,
                "sit_fam": row.get::<_, Option<String>>(5)?,
                "nbre_enf": row.get::<_, Option<f64>>(6)?,
                "nbr_jr_ouv": row.get::<_, Option<f64>>(7)?,
                "nbr_hr_ouv": row.get::<_, Option<f64>>(8)?,
                "c_date": row.get::<_, Option<String>>(9)?,
                "nom": row.get::<_, Option<String>>(11)?,
                "prenom": row.get::<_, Option<String>>(12)?,
                "source": "pcpaie",
            }))
        }).map_err(|e| e.to_string())?;
        for row in rows2 {
            results.push(row.map_err(|e| e.to_string())?);
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

// Get a historical payslip with full rubrique breakdown from PAIES montants
#[tauri::command]
fn period_to_paies_patterns(period: &str) -> Vec<String> {
    // period is YYYY-MM; generate common raw paies.mois patterns
    let parts: Vec<&str> = period.split('-').collect();
    if parts.len() != 2 {
        return vec![period.to_string()];
    }
    if let (Ok(y), Ok(m)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
        let mm = format!("{:02}", m);
        vec![
            format!("{}-{}", mm, y),
            format!("{}/{}", mm, y),
            format!("{}{}", mm, y),
        ]
    } else {
        vec![period.to_string()]
    }
}

#[tauri::command]
fn get_historical_payslip(
    state: State<AppState>,
    employee_id: i64,
    period: String,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let patterns = period_to_paies_patterns(&period);

    if patterns.len() < 3 {
        // Malformed period; return empty payslip
        return Ok(serde_json::json!({
            "period": period,
            "lines": [],
            "total_brut": 0.0,
            "net_payer": 0.0,
            "irg": 0.0,
            "total_retenues": 0.0,
            "base_cotisable": 0.0,
            "base_imposable": 0.0,
            "source": "pcpaie",
        }));
    }

    let sql = format!(
        r#"SELECT p.id, p.mois, p.matricule, p.montants, p.sit_fam, p.nbre_enf,
                  p.nbr_jr_ouv, p.nbr_hr_ouv, p.c_date, p.c_time,
                  e.nom, e.prenom
           FROM paies p
           LEFT JOIN employees e ON p.employee_id = e.id
           WHERE p.employee_id=? AND p.mois GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]' AND (p.mois = '{}' OR p.mois = '{}' OR p.mois = '{}')
           ORDER BY p.mois DESC
           LIMIT 1"#,
        patterns[0], patterns[1], patterns[2]
    );

    let row = conn.query_row(&sql, [employee_id], |r| {
                let montants: Option<String> = r.get(3)?;
                let lines: Vec<serde_json::Value> = if let Some(ref m) = montants {
                    let map = parse_montants(m);
                    let mut lines: Vec<(String, f64)> = map
                        .into_iter()
                        .map(|(code, amount)| (code, amount))
                        .collect();
                    lines.sort_by(|a, b| a.0.cmp(&b.0));
                    lines
                        .into_iter()
                        .map(|(code, amount)| {
                            serde_json::json!({
                                "code": code,
                                "amount": amount,
                            })
                        })
                        .collect()
                } else {
                    Vec::new()
                };

                let montants_str = montants.as_deref().unwrap_or("");
                let map = parse_montants(montants_str);
                let (total_brut, net_payer, irg, total_retenues, base_cotisable, base_imposable) =
                    extract_totals_from_montants(&map);

                Ok(serde_json::json!({
                    "id": r.get::<_, i64>(0)?,
                    "period": r.get::<_, Option<String>>(1)?,
                    "matricule": r.get::<_, Option<String>>(2)?,
                    "total_brut": total_brut,
                    "net_payer": net_payer,
                    "irg": irg,
                    "total_retenues": total_retenues,
                    "base_cotisable": base_cotisable,
                    "base_imposable": base_imposable,
                    "sit_fam": r.get::<_, Option<String>>(4)?,
                    "nbre_enf": r.get::<_, Option<f64>>(5)?,
                    "nbr_jr_ouv": r.get::<_, Option<f64>>(6)?,
                    "nbr_hr_ouv": r.get::<_, Option<f64>>(7)?,
                    "c_date": r.get::<_, Option<String>>(8)?,
                    "nom": r.get::<_, Option<String>>(10)?,
                    "prenom": r.get::<_, Option<String>>(11)?,
                    "lines": lines,
                    "source": "pcpaie",
                }))
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(row)
}

fn normalize_period(p: &str) -> Option<String> {
    // Accepts: YYYY-MM, MM-AAAA, MM/AAAA, MMYYYY
    let p = p.trim();
    if p.len() < 6 { return None; }

    // MMYYYY (6 digits, all numeric)
    if p.len() == 6 && p.chars().all(|c| c.is_ascii_digit()) {
        if let (Ok(m), Ok(y)) = (p[..2].parse::<u32>(), p[2..].parse::<u32>()) {
            if (1000..=9999).contains(&y) && (1..=12).contains(&m) {
                return Some(format!("{}-{:02}", y, m));
            }
        }
    }

    // YYYY-MM
    if p.len() == 7 && p.chars().nth(4) == Some('-') {
        if let (Ok(y), Ok(m)) = (p[..4].parse::<u32>(), p[5..].parse::<u32>()) {
            if (1000..=9999).contains(&y) && (1..=12).contains(&m) {
                return Some(format!("{}-{:02}", y, m));
            }
        }
    }

    // MM-AAAA or MM/AAAA (find separator position)
    let sep_pos = p.find(&['-', '/'][..]);
    if let Some(pos) = sep_pos {
        let (a, b) = p.split_at(pos);
        let b = &b[1..];
        if let (Ok(v1), Ok(v2)) = (a.parse::<u32>(), b.parse::<u32>()) {
            let (y, m) = if v1 > 31 { (v1, v2) } else if v2 > 31 { (v2, v1) } else { return None; };
            if (1000..=9999).contains(&y) && (1..=12).contains(&m) {
                return Some(format!("{}-{:02}", y, m));
            }
        }
    }

    None
}

#[tauri::command]
fn get_available_periods(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut periods = std::collections::BTreeSet::new();

    // From salary_calculations (already YYYY-MM)
    let mut stmt = conn
        .prepare("SELECT DISTINCT period FROM salary_calculations ORDER BY period DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok(p) = r { periods.insert(p); }
    }

    // From paies (MM-AAAA, MM/AAAA etc.)
    let mut stmt2 = conn
        .prepare("SELECT DISTINCT mois FROM paies")
        .map_err(|e| e.to_string())?;
    let rows2 = stmt2.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for r in rows2 {
        if let Ok(p) = r {
            if let Some(norm) = normalize_period(&p) {
                periods.insert(norm);
            }
        }
    }

    Ok(periods.into_iter().rev().collect())
}

#[tauri::command]
fn get_employee_salary_periods(state: State<AppState>, employee_id: i64) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut periods = std::collections::BTreeSet::new();

    // From salary_calculations
    let mut stmt = conn
        .prepare("SELECT DISTINCT period FROM salary_calculations WHERE employee_id=? ORDER BY period DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([employee_id], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok(p) = r { periods.insert(p); }
    }

    // From paies
    let mut stmt2 = conn
        .prepare("SELECT DISTINCT mois FROM paies WHERE employee_id=?")
        .map_err(|e| e.to_string())?;
    let rows2 = stmt2.query_map([employee_id], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for r in rows2 {
        if let Ok(p) = r {
            if let Some(norm) = normalize_period(&p) {
                periods.insert(norm);
            }
        }
    }

    Ok(periods.into_iter().rev().collect())
}

// Get employee attendance calendar for a month (daily status)
#[tauri::command]
fn get_attendance_calendar(
    state: State<AppState>,
    employee_id: i64,
    year: i32,
    month: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Get leaves for this employee that overlap this month
    let mut stmt_leaves = conn
        .prepare(r#"SELECT leave_type, start_date, end_date, days_count
                    FROM leaves WHERE employee_id=? AND status='approved'
                    AND (start_date <= ? AND end_date >= ?)"#)
        .map_err(|e| e.to_string())?;

    let month_start = format!("{:04}-{:02}-01", year, month);
    let last_day = if month == 12 { 31 } else {
        let _next_month_start = format!("{:04}-{:02}-01", year, month + 1);
        // Calculate last day by subtracting 1 from next month start
        // Simple approach: use known days per month
        [31,28,31,30,31,30,31,31,30,31,30,31][(month as usize) - 1]
    };
    let month_end = format!("{:04}-{:02}-{:02}", year, month, last_day);

    let leave_rows = stmt_leaves
        .query_map(rusqlite::params![employee_id, month_end, month_start], |row| {
            Ok((
                row.get::<_, String>(0)?,       // leave_type
                row.get::<_, String>(1)?,       // start_date
                row.get::<_, String>(2)?,       // end_date
                row.get::<_, Option<f64>>(3)?,  // days_count
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut leaves: Vec<(String, String, String)> = Vec::new();
    for r in leave_rows {
        let (lt, sd, ed, _) = r.map_err(|e| e.to_string())?;
        leaves.push((lt, sd, ed));
    }

    // Get attendance punches for this month
    let mut stmt_att = conn
        .prepare(r#"SELECT DATE(punch_datetime) as day, COUNT(*) as punches
                    FROM attendance WHERE employee_id=?
                    AND punch_datetime >= ? AND punch_datetime < ?
                    GROUP BY DATE(punch_datetime)"#)
        .map_err(|e| e.to_string())?;

    let next_month_start = if month == 12 {
        format!("{:04}-01-01", year + 1)
    } else {
        format!("{:04}-{:02}-01", year, month + 1)
    };

    let att_rows = stmt_att
        .query_map(rusqlite::params![employee_id, month_start, next_month_start], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut attendance_days: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for r in att_rows {
        let (day, count) = r.map_err(|e| e.to_string())?;
        attendance_days.insert(day, count);
    }

    // Build calendar
    let mut calendar = Vec::new();
    for day in 1..=last_day {
        let date_str = format!("{:04}-{:02}-{:02}", year, month, day);
        let weekday = calculate_weekday(year, month, day);

        // Check if on leave
        let mut day_status = "normal";
        let mut leave_type = None;

        for (lt, sd, ed) in &leaves {
            if date_str.as_str() >= sd.as_str() && date_str.as_str() <= ed.as_str() {
                leave_type = Some(lt.clone());
                day_status = match lt.as_str() {
                    "sick" => "sick_leave",
                    "annual" | "leave" => "leave",
                    "unpaid" => "unpaid_leave",
                    "maternity" => "maternity_leave",
                    _ => "leave",
                };
                break;
            }
        }

        // Check attendance (only if not on leave)
        let punches = attendance_days.get(&date_str).copied().unwrap_or(0);
        if day_status == "normal" {
            if weekday == "Friday" || weekday == "Saturday" {
                // Weekend - check if they worked
                if punches > 0 {
                    day_status = "working";
                } else {
                    day_status = "weekend";
                }
            } else if punches > 0 {
                day_status = "working";
            } else {
                day_status = "absent";
            }
        }

        calendar.push(serde_json::json!({
            "date": date_str,
            "day": day,
            "weekday": weekday,
            "status": day_status,
            "leave_type": leave_type,
            "punches": punches,
        }));
    }

    Ok(calendar)
}

fn calculate_weekday(year: i32, month: i32, day: i32) -> &'static str {
    // Zeller's congruence
    let (y, m) = if month < 3 { (year - 1, month + 12) } else { (year, month) };
    let k = y % 100;
    let j = y / 100;
    let h = (day + 13 * (m + 1) / 5 + k + k / 4 + j / 4 + 5 * j) % 7;
    match h {
        0 => "Saturday",
        1 => "Sunday",
        2 => "Monday",
        3 => "Tuesday",
        4 => "Wednesday",
        5 => "Thursday",
        6 => "Friday",
        _ => "Unknown",
    }
}

// ===== Field Mappings (PCPAIE data mapping configuration) =====

#[derive(Debug, Serialize, Deserialize)]
struct FieldMapping {
    id: i64,
    logical_name: String,
    display_label: String,
    employee_column: String,
    lookup_table: Option<String>,
    section: String,
    sort_order: i64,
    is_visible: bool,
}

#[tauri::command]
fn get_field_mappings(state: State<AppState>) -> Result<Vec<FieldMapping>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, logical_name, display_label, employee_column, lookup_table, section, sort_order, is_visible FROM field_mappings ORDER BY section, sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(FieldMapping {
            id: row.get(0)?,
            logical_name: row.get(1)?,
            display_label: row.get(2)?,
            employee_column: row.get(3)?,
            lookup_table: row.get(4)?,
            section: row.get(5)?,
            sort_order: row.get(6)?,
            is_visible: row.get::<_, Option<i64>>(7)?.unwrap_or(1) != 0,
        })
    }).map_err(|e| e.to_string())?;
    let mut mappings = Vec::new();
    for row in rows {
        mappings.push(row.map_err(|e| e.to_string())?);
    }
    Ok(mappings)
}

#[tauri::command]
fn update_field_mapping(
    state: State<AppState>,
    id: i64,
    display_label: String,
    employee_column: String,
    lookup_table: Option<String>,
    section: String,
    is_visible: bool,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE field_mappings SET display_label=?, employee_column=?, lookup_table=?, section=?, is_visible=? WHERE id=?",
        rusqlite::params![display_label, employee_column, lookup_table, section, if is_visible { 1 } else { 0 }, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_available_lookup_tables(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT DISTINCT table_name FROM lookup_values ORDER BY table_name")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut tables = Vec::new();
    for row in rows {
        tables.push(row.map_err(|e| e.to_string())?);
    }
    Ok(tables)
}

#[tauri::command]
fn get_lookup_table_preview(
    state: State<AppState>,
    table_name: String,
    limit: Option<i64>,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50).min(500);
    let mut stmt = conn
        .prepare("SELECT code, libelle FROM lookup_values WHERE table_name=? ORDER BY code LIMIT ?")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![table_name, limit], |r| {
            Ok(serde_json::json!({
                "code": r.get::<_, String>(0)?,
                "libelle": r.get::<_, String>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut values = Vec::new();
    for row in rows {
        values.push(row.map_err(|e| e.to_string())?);
    }
    // Also get total count
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM lookup_values WHERE table_name=?", [&table_name], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "table_name": table_name,
        "total": total,
        "values": values,
    }))
}

#[tauri::command]
fn get_all_lookup_tables_preview(state: State<AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT table_name, code, libelle FROM lookup_values ORDER BY table_name, code")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut by_table: std::collections::BTreeMap<String, Vec<serde_json::Value>> = std::collections::BTreeMap::new();
    for row in rows {
        let (table, code, libelle) = row.map_err(|e| e.to_string())?;
        by_table.entry(table).or_default().push(serde_json::json!({
            "code": code,
            "libelle": libelle,
        }));
    }
    let result: serde_json::Map<String, serde_json::Value> = by_table
        .into_iter()
        .map(|(table, values)| {
            (table, serde_json::json!({ "total": values.len(), "values": values }))
        })
        .collect();
    Ok(serde_json::Value::Object(result))
}

#[tauri::command]
fn get_available_employee_columns(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("PRAGMA table_info(employees)")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?;
    let mut cols = Vec::new();
    for row in rows {
        cols.push(row.map_err(|e| e.to_string())?);
    }
    Ok(cols)
}

// ===== Postes (Jobs) =====

#[derive(Debug, Serialize, Deserialize)]
struct PosteSummary {
    id: i64,
    name: String,
    description: Option<String>,
    fnc_code: Option<String>,
    is_manual: bool,
    employee_count: i64,
    active_count: i64,
    avg_seniority_years: f64,
    total_brut: f64,
    total_net: f64,
    avg_brut: f64,
    last_period: Option<String>,
}

#[tauri::command]
fn get_postes(state: State<AppState>) -> Result<Vec<PosteSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(r#"SELECT p.id, p.name, p.description, p.fnc_code, p.is_manual,
                    COALESCE(s.employee_count, 0), COALESCE(s.active_count, 0),
                    COALESCE(s.avg_seniority_years, 0), COALESCE(s.total_brut, 0),
                    COALESCE(s.total_net, 0), COALESCE(s.avg_brut, 0), s.last_period
                    FROM postes p
                    LEFT JOIN poste_stats s ON s.poste_id = p.id
                    ORDER BY p.name"#)
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(PosteSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            fnc_code: row.get(3)?,
            is_manual: row.get::<_, Option<i64>>(4)?.unwrap_or(0) != 0,
            employee_count: row.get(5)?,
            active_count: row.get(6)?,
            avg_seniority_years: row.get(7)?,
            total_brut: row.get(8)?,
            total_net: row.get(9)?,
            avg_brut: row.get(10)?,
            last_period: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut postes = Vec::new();
    for row in rows {
        postes.push(row.map_err(|e| e.to_string())?);
    }
    Ok(postes)
}

#[tauri::command]
fn get_poste_detail(state: State<AppState>, poste_id: i64) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let poste: serde_json::Value = conn
        .query_row("SELECT id, name, description, fnc_code, is_manual FROM postes WHERE id=?", [poste_id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "description": r.get::<_, Option<String>>(2)?,
                "fnc_code": r.get::<_, Option<String>>(3)?,
                "is_manual": r.get::<_, Option<i64>>(4)?.unwrap_or(0) != 0,
            }))
        })
        .map_err(|e| e.to_string())?;

    // Rubriques for this poste (régime indemnitaire = gains only), joined with rubriques table
    let mut stmt = conn
        .prepare(r#"SELECT pr.rubrique_code, pr.default_value, pr.is_fixed, pr.sort_order,
                    r.libelle, r.classe, r.manuelle, r.is_brut
                    FROM poste_rubriques pr
                    LEFT JOIN rubriques r ON r.code = SUBSTR(pr.rubrique_code, 2)
                    WHERE pr.poste_id=? AND (r.is_brut IN (1, 6) OR r.is_brut IS NULL)
                    ORDER BY pr.sort_order"#)
        .map_err(|e| e.to_string())?;
    let rub_rows = stmt.query_map([poste_id], |row| {
        Ok(serde_json::json!({
            "rubrique_code": row.get::<_, String>(0)?,
            "default_value": row.get::<_, f64>(1)?,
            "is_fixed": row.get::<_, Option<i64>>(2)?.unwrap_or(1) != 0,
            "sort_order": row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            "libelle": row.get::<_, Option<String>>(4)?,
            "classe": row.get::<_, Option<f64>>(5)?,
            "manuelle": row.get::<_, Option<i64>>(6)?.unwrap_or(0) != 0,
            "is_brut": row.get::<_, Option<f64>>(7)?,
            "libelle": row.get::<_, Option<String>>(4)?,
            "classe": row.get::<_, Option<f64>>(5)?,
            "manuelle": row.get::<_, Option<i64>>(6)?.unwrap_or(0) != 0,
        }))
    }).map_err(|e| e.to_string())?;
    let mut rubriques = Vec::new();
    for row in rub_rows {
        rubriques.push(row.map_err(|e| e.to_string())?);
    }

    // Employees with pagination
    let mut stmt2 = conn
        .prepare(r#"SELECT e.id, e.matricule, e.nom, e.prenom, e.actif
                    FROM employees e WHERE e.poste_id=? ORDER BY e.nom, e.prenom LIMIT 200"#)
        .map_err(|e| e.to_string())?;
    let emp_rows = stmt2.query_map([poste_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "matricule": row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            "nom": row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            "prenom": row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            "actif": row.get::<_, Option<i64>>(4)?.unwrap_or(0) != 0,
        }))
    }).map_err(|e| e.to_string())?;
    let mut employees = Vec::new();
    for row in emp_rows {
        employees.push(row.map_err(|e| e.to_string())?);
    }

    // Stats for this poste
    let stats: serde_json::Value = conn
        .query_row("SELECT employee_count, active_count, avg_seniority_years, total_brut, total_net, avg_brut, last_period FROM poste_stats WHERE poste_id=?", [poste_id], |r| {
            Ok(serde_json::json!({
                "employee_count": r.get::<_, Option<i64>>(0)?.unwrap_or(0),
                "active_count": r.get::<_, Option<i64>>(1)?.unwrap_or(0),
                "avg_seniority_years": r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                "total_brut": r.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
                "total_net": r.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
                "avg_brut": r.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                "last_period": r.get::<_, Option<String>>(6)?,
            }))
        })
        .unwrap_or(serde_json::json!({
            "employee_count": 0,
            "active_count": 0,
            "avg_seniority_years": 0.0,
            "total_brut": 0.0,
            "total_net": 0.0,
            "avg_brut": 0.0,
            "last_period": null,
        }));

    Ok(serde_json::json!({
        "poste": poste,
        "rubriques": rubriques,
        "employees": employees,
        "stats": stats,
    }))
}

#[tauri::command]
fn create_poste(state: State<AppState>, name: String, description: Option<String>) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO postes (name, description, is_manual) VALUES (?, ?, 1)", rusqlite::params![name, description])
        .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn update_poste(state: State<AppState>, poste_id: i64, name: String, description: Option<String>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE postes SET name=?, description=?, updated_at=datetime('now') WHERE id=?",
        rusqlite::params![name, description, poste_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_poste(state: State<AppState>, poste_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE employees SET poste_id=NULL WHERE poste_id=?", [poste_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM postes WHERE id=?", [poste_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_poste_rubrique(state: State<AppState>, poste_id: i64, rubrique_code: String, default_value: f64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO poste_rubriques (poste_id, rubrique_code, default_value, is_fixed, sort_order) VALUES (?, ?, ?, 1, COALESCE((SELECT sort_order FROM poste_rubriques WHERE poste_id=? AND rubrique_code=?), 0))",
        rusqlite::params![poste_id, rubrique_code, default_value, poste_id, rubrique_code],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn assign_employee_to_poste(state: State<AppState>, employee_id: i64, poste_id: Option<i64>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE employees SET poste_id=?, updated_at=datetime('now') WHERE id=?",
        rusqlite::params![poste_id, employee_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn sync_postes_from_fnc(state: State<AppState>) -> Result<usize, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    crate::import::seed_postes(&conn).map_err(|e| e.to_string())?;
    crate::import::recompute_all_poste_stats(&conn).map_err(|e| e.to_string())?;
    Ok(1)
}

#[tauri::command]
fn recompute_poste_stats(state: State<AppState>) -> Result<usize, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    crate::import::recompute_all_poste_stats(&conn).map_err(|e| e.to_string())?;
    Ok(1)
}

#[tauri::command]
fn export_database(state: State<AppState>, dest_path: String) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    // Use SQLite backup API via execute
    conn.execute(&format!("VACUUM INTO '{}'", dest_path.replace('\'', "''")), [])
        .map_err(|e| e.to_string())?;
    Ok(dest_path)
}

#[tauri::command]
fn get_database_stats(state: State<AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tables = ["employees", "postes", "paies", "rubriques", "lookup_values", "poste_rubriques", "employee_rubriques", "field_mappings"];
    let mut stats = serde_json::Map::new();
    for t in &tables {
        let count: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {}", t), [], |r| r.get(0))
            .unwrap_or(0);
        stats.insert(t.to_string(), serde_json::Value::from(count));
    }
    // DB file size
    let db_path = &state.db_path;
    if let Ok(meta) = std::fs::metadata(db_path) {
        stats.insert("db_size_bytes".into(), serde_json::Value::from(meta.len() as i64));
    }
    Ok(serde_json::Value::Object(stats))
}

// ===== Employee Salary & Prime Management =====

#[tauri::command]
fn get_employee_current_rubriques(state: State<AppState>, employee_id: i64) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Get poste_id for the employee
    let poste_id: Option<i64> = conn
        .query_row("SELECT poste_id FROM employees WHERE id=?", [employee_id], |r| r.get(0))
        .ok()
        .flatten();

    // Get poste defaults
    let mut poste_defaults: HashMap<String, f64> = HashMap::new();
    if let Some(pid) = poste_id {
        let mut stmt = conn.prepare("SELECT rubrique_code, default_value FROM poste_rubriques WHERE poste_id=?")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([pid], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (code, val) = row.map_err(|e| e.to_string())?;
            poste_defaults.insert(code, val);
        }
    }

    // Get employee overrides (current only — effective_to IS NULL)
    let mut overrides: HashMap<String, f64> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT rubrique_code, value FROM employee_rubrique_overrides WHERE employee_id=? AND effective_to IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([employee_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (code, val) = row.map_err(|e| e.to_string())?;
            overrides.insert(code, val);
        }
    }

    // Merge: override takes priority over poste default
    let mut all_codes: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    all_codes.extend(poste_defaults.keys().cloned());
    all_codes.extend(overrides.keys().cloned());

    let mut results = Vec::new();
    for code in all_codes {
        let (value, source) = if let Some(v) = overrides.get(&code) {
            (*v, "override")
        } else if let Some(v) = poste_defaults.get(&code) {
            (*v, "poste")
        } else {
            (0.0, "poste")
        };

        // Get libelle from rubriques table
        let numeric_code: String = code.chars().skip(1).collect();
        let libelle: Option<String> = conn
            .query_row("SELECT libelle FROM rubriques WHERE code=?", [&numeric_code], |r| r.get(0))
            .ok()
            .flatten();

        results.push(serde_json::json!({
            "rubrique_code": code,
            "value": value,
            "source": source,
            "libelle": libelle,
        }));
    }

    Ok(results)
}

#[tauri::command]
fn get_employee_salary_history(
    state: State<AppState>,
    employee_id: i64,
    only_real_months: Option<bool>,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let only_real = only_real_months.unwrap_or(false);

    // Fetch all paies for the employee (optionally filter real months)
    let sql = if only_real {
        "SELECT mois, montants, c_date, date FROM paies WHERE employee_id=? AND mois GLOB '[0-9][0-9]-[0-9][0-9][0-9][0-9]' ORDER BY mois"
    } else {
        "SELECT mois, montants, c_date, date FROM paies WHERE employee_id=? ORDER BY mois"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([employee_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, Option<String>>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut periods: Vec<String> = Vec::new();
    let mut values_by_period: HashMap<String, HashMap<String, f64>> = HashMap::new();

    for row in rows {
        let (mois, montants, _c_date, _date) = row.map_err(|e| e.to_string())?;
        periods.push(mois.clone());
        values_by_period.insert(mois, parse_montants(&montants));
    }

    // Build rubrique time series
    let mut all_rubriques: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for map in values_by_period.values() {
        all_rubriques.extend(map.keys().cloned());
    }

    // Get libelles
    let mut rubriques_meta: Vec<serde_json::Value> = Vec::new();
    for code in &all_rubriques {
        let numeric: String = code.chars().skip(1).collect();
        let libelle: Option<String> = conn
            .query_row("SELECT libelle FROM rubriques WHERE code=?", [&numeric], |r| r.get(0))
            .ok()
            .flatten();
        rubriques_meta.push(serde_json::json!({
            "code": code,
            "libelle": libelle,
        }));
    }

    // Build series: one array per rubrique with values aligned with periods
    let mut series: Vec<serde_json::Value> = Vec::new();
    for code in &all_rubriques {
        let data: Vec<Option<f64>> = periods.iter().map(|p| values_by_period.get(p).and_then(|m| m.get(code).copied())).collect();
        let numeric: String = code.chars().skip(1).collect();
        let libelle: Option<String> = conn
            .query_row("SELECT libelle FROM rubriques WHERE code=?", [&numeric], |r| r.get(0))
            .ok()
            .flatten();
        series.push(serde_json::json!({
            "code": code,
            "libelle": libelle,
            "data": data,
        }));
    }

    Ok(serde_json::json!({
        "employee_id": employee_id,
        "periods": periods,
        "rubriques": rubriques_meta,
        "series": series,
        "count": periods.len(),
    }))
}

#[tauri::command]
fn update_employee_rubrique(state: State<AppState>, employee_id: i64, rubrique_code: String, new_value: f64, reason: Option<String>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Get current value (from override or poste default)
    let current_value: Option<f64> = conn
        .query_row(
            "SELECT value FROM employee_rubrique_overrides WHERE employee_id=? AND rubrique_code=? AND effective_to IS NULL",
            rusqlite::params![employee_id, rubrique_code],
            |r| r.get(0),
        )
        .ok()
        .or_else(|| {
            // Try poste default
            let poste_id: Option<i64> = conn
                .query_row("SELECT poste_id FROM employees WHERE id=?", [employee_id], |r| r.get(0))
                .ok()
                .flatten();
            if let Some(pid) = poste_id {
                conn.query_row(
                    "SELECT default_value FROM poste_rubriques WHERE poste_id=? AND rubrique_code=?",
                    rusqlite::params![pid, rubrique_code],
                    |r| r.get(0),
                ).ok()
            } else {
                None
            }
        });

    // Record history
    conn.execute(
        "INSERT INTO employee_salary_history (employee_id, rubrique_code, old_value, new_value, reason) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![employee_id, rubrique_code, current_value, new_value, reason],
    ).map_err(|e| e.to_string())?;

    // Close current override if exists
    conn.execute(
        "UPDATE employee_rubrique_overrides SET effective_to=datetime('now') WHERE employee_id=? AND rubrique_code=? AND effective_to IS NULL",
        rusqlite::params![employee_id, rubrique_code],
    ).map_err(|e| e.to_string())?;

    // Insert new override
    conn.execute(
        "INSERT INTO employee_rubrique_overrides (employee_id, rubrique_code, value) VALUES (?, ?, ?)",
        rusqlite::params![employee_id, rubrique_code, new_value],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_employee_rubrique_history(state: State<AppState>, employee_id: i64, rubrique_code: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    if let Some(code) = rubrique_code {
        let mut stmt = conn
            .prepare("SELECT id, rubrique_code, old_value, new_value, change_date, reason FROM employee_salary_history WHERE employee_id=? AND rubrique_code=? ORDER BY change_date DESC LIMIT 100")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![employee_id, code], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "rubrique_code": row.get::<_, String>(1)?,
                "old_value": row.get::<_, Option<f64>>(2)?,
                "new_value": row.get::<_, Option<f64>>(3)?,
                "change_date": row.get::<_, Option<String>>(4)?,
                "reason": row.get::<_, Option<String>>(5)?,
            }))
        }).map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = conn
            .prepare("SELECT id, rubrique_code, old_value, new_value, change_date, reason FROM employee_salary_history WHERE employee_id=? ORDER BY change_date DESC LIMIT 100")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([employee_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "rubrique_code": row.get::<_, String>(1)?,
                "old_value": row.get::<_, Option<f64>>(2)?,
                "new_value": row.get::<_, Option<f64>>(3)?,
                "change_date": row.get::<_, Option<String>>(4)?,
                "reason": row.get::<_, Option<String>>(5)?,
            }))
        }).map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    Ok(results)
}

// ===== Overtime =====

#[tauri::command]
fn save_overtime_entry(state: State<AppState>, employee_id: i64, date: String, hours_50: f64, hours_100: f64, source: String, note: Option<String>) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO overtime_entries (employee_id, date, hours_50, hours_100, source, note) VALUES (?, ?, ?, ?, ?, ?)",
        rusqlite::params![employee_id, date, hours_50, hours_100, source, note],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn save_overtime_monthly(state: State<AppState>, employee_id: i64, period: String, hours_50: f64, hours_100: f64, source: String) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO overtime_monthly (employee_id, period, total_hours_50, total_hours_100, source, status, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))",
        rusqlite::params![employee_id, period, hours_50, hours_100, source],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn get_overtime(state: State<AppState>, employee_id: i64, period: String) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Get monthly aggregate
    let monthly: Option<serde_json::Value> = conn
        .query_row(
            "SELECT id, total_hours_50, total_hours_100, source, status, created_at, updated_at FROM overtime_monthly WHERE employee_id=? AND period=?",
            rusqlite::params![employee_id, period],
            |r| Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "total_hours_50": r.get::<_, f64>(1)?,
                "total_hours_100": r.get::<_, f64>(2)?,
                "source": r.get::<_, String>(3)?,
                "status": r.get::<_, String>(4)?,
                "created_at": r.get::<_, String>(5)?,
                "updated_at": r.get::<_, String>(6)?,
            })),
        )
        .ok();

    // Get daily entries for this period (YYYY-MM)
    let date_prefix = format!("{}-", period);
    let mut stmt = conn
        .prepare("SELECT id, date, hours_50, hours_100, source, note FROM overtime_entries WHERE employee_id=? AND date LIKE ? ORDER BY date")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![employee_id, format!("{}%", date_prefix)], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "date": row.get::<_, String>(1)?,
            "hours_50": row.get::<_, f64>(2)?,
            "hours_100": row.get::<_, f64>(3)?,
            "source": row.get::<_, String>(4)?,
            "note": row.get::<_, Option<String>>(5)?,
        }))
    }).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| e.to_string())?);
    }

    Ok(serde_json::json!({
        "monthly": monthly,
        "entries": entries,
    }))
}

#[tauri::command]
fn confirm_overtime_monthly(state: State<AppState>, employee_id: i64, period: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE overtime_monthly SET status='confirmed', updated_at=datetime('now') WHERE employee_id=? AND period=?",
        rusqlite::params![employee_id, period],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn compute_overtime_from_attendance(
    state: State<AppState>,
    employee_id: i64,
    period: String,
    standard_hours_per_day: Option<f64>,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let std_hours = standard_hours_per_day.unwrap_or(8.0);

    let (yr, mo): (i32, i32) = period.split("-")
        .next()
        .and_then(|y| y.parse().ok())
        .zip(period.split("-").nth(1).and_then(|m| m.parse().ok()))
        .unwrap_or((2024, 1));

    let month_start = format!("{:04}-{:02}-01", yr, mo);
    let next_month_start = if mo == 12 {
        format!("{:04}-01-01", yr + 1)
    } else {
        format!("{:04}-{:02}-01", yr, mo + 1)
    };

    // Get all punches for this employee in this period, grouped by day
    let mut stmt = conn
        .prepare(r#"SELECT DATE(punch_datetime) as day, 
                    MIN(punch_datetime) as first_punch, 
                    MAX(punch_datetime) as last_punch,
                    COUNT(*) as punch_count
                    FROM attendance 
                    WHERE employee_id=? AND punch_datetime >= ? AND punch_datetime < ?
                    GROUP BY DATE(punch_datetime)
                    ORDER BY day"#)
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(
        rusqlite::params![employee_id, month_start, next_month_start],
        |row| {
            Ok((
                row.get::<_, String>(0)?,       // day
                row.get::<_, String>(1)?,       // first_punch
                row.get::<_, String>(2)?,       // last_punch
                row.get::<_, i64>(3)?,          // punch_count
            ))
        },
    ).map_err(|e| e.to_string())?;

    let mut daily_details: Vec<serde_json::Value> = Vec::new();
    let mut total_hours_50 = 0.0_f64;
    let mut total_hours_100 = 0.0_f64;

    for row in rows {
        let (day, first_punch, last_punch, punch_count) = row.map_err(|e| e.to_string())?;

        // Compute worked hours from first to last punch
        let worked_hours = compute_hours_between(&first_punch, &last_punch);

        // Determine if weekend (Friday or Saturday in Algeria)
        let weekday = compute_weekday_from_date(&day);
        let is_weekend = weekday == "Friday" || weekday == "Saturday";

        // Overtime calculation:
        // - Weekdays: hours beyond standard are 50% overtime
        // - Weekends: all worked hours are 100% overtime
        let (ot_50, ot_100) = if is_weekend {
            (0.0, worked_hours)
        } else if worked_hours > std_hours {
            (worked_hours - std_hours, 0.0)
        } else {
            (0.0, 0.0)
        };

        total_hours_50 += ot_50;
        total_hours_100 += ot_100;

        daily_details.push(serde_json::json!({
            "day": day,
            "weekday": weekday,
            "first_punch": first_punch,
            "last_punch": last_punch,
            "punch_count": punch_count,
            "worked_hours": (worked_hours * 100.0).round() / 100.0,
            "overtime_50": (ot_50 * 100.0).round() / 100.0,
            "overtime_100": (ot_100 * 100.0).round() / 100.0,
        }));
    }

    Ok(serde_json::json!({
        "employee_id": employee_id,
        "period": period,
        "standard_hours_per_day": std_hours,
        "total_hours_50": (total_hours_50 * 100.0).round() / 100.0,
        "total_hours_100": (total_hours_100 * 100.0).round() / 100.0,
        "daily_details": daily_details,
    }))
}

fn compute_hours_between(start: &str, end: &str) -> f64 {
    // Parse datetime strings like "2024-06-15 08:30:00"
    let parse_dt = |s: &str| -> Option<chrono::DateTime<chrono::Utc>> {
        // Try parsing with space separator
        let normalized = s.replace('T', " ");
        chrono::NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%d %H:%M:%S")
            .ok()
            .map(|ndt| {
                chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(ndt, chrono::Utc)
            })
    };

    match (parse_dt(start), parse_dt(end)) {
        (Some(s), Some(e)) => {
            let dur = e - s;
            dur.num_minutes() as f64 / 60.0
        }
        _ => 0.0,
    }
}

fn compute_weekday_from_date(date_str: &str) -> &'static str {
    // Parse YYYY-MM-DD
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 { return "Unknown"; }
    let year: i32 = match parts[0].parse() { Ok(v) => v, Err(_) => return "Unknown" };
    let month: i32 = match parts[1].parse() { Ok(v) => v, Err(_) => return "Unknown" };
    let day: i32 = match parts[2].parse() { Ok(v) => v, Err(_) => return "Unknown" };
    calculate_weekday(year, month, day)
}

// ===== Pre-calc Summary =====

#[tauri::command]
async fn get_pre_calc_summary(state: State<'_, AppState>, employee_id: i64, period: String) -> Result<serde_json::Value, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    // Get employee info
    let emp: serde_json::Value = conn
        .query_row("SELECT id, matricule, nom, prenom, section, structure, unite, affectatio, contrat FROM employees WHERE id=?", [employee_id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "matricule": r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                "nom": r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                "prenom": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                "section": r.get::<_, Option<String>>(4)?,
                "structure": r.get::<_, Option<String>>(5)?,
                "unite": r.get::<_, Option<String>>(6)?,
                "affectatio": r.get::<_, Option<String>>(7)?,
                "contrat": r.get::<_, Option<String>>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    // Get current rubrique values (poste defaults + overrides)
    let mut rub_stmt = conn
        .prepare(r#"SELECT COALESCE(ero.value, pr.default_value, 0) as value,
                    COALESCE(ero.rubrique_code, pr.rubrique_code) as code,
                    r.libelle
                    FROM employees e
                    LEFT JOIN poste_rubriques pr ON pr.poste_id = e.poste_id
                    LEFT JOIN employee_rubrique_overrides ero ON ero.employee_id = e.id AND ero.rubrique_code = pr.rubrique_code AND ero.effective_to IS NULL
                    LEFT JOIN rubriques r ON REPLACE(COALESCE(ero.rubrique_code, pr.rubrique_code), 'R', '') = printf('%03d', r.code)
                    WHERE e.id = ?
                    ORDER BY code"#)
        .map_err(|e| e.to_string())?;
    let rub_rows = rub_stmt.query_map([employee_id], |row| {
        Ok(serde_json::json!({
            "code": row.get::<_, String>(1)?,
            "value": row.get::<_, f64>(0)?,
            "libelle": row.get::<_, Option<String>>(2)?,
        }))
    }).map_err(|e| e.to_string())?;
    let mut rubriques = Vec::new();
    for row in rub_rows {
        rubriques.push(row.map_err(|e| e.to_string())?);
    }

    // Get active bonuses
    let bonuses = get_active_bonuses_for_period_inner(&conn, employee_id, &period)?;

    // Get overtime
    let overtime: Option<serde_json::Value> = conn
        .query_row(
            "SELECT total_hours_50, total_hours_100, status FROM overtime_monthly WHERE employee_id=? AND period=?",
            rusqlite::params![employee_id, period],
            |r| Ok(serde_json::json!({
                "hours_50": r.get::<_, f64>(0)?,
                "hours_100": r.get::<_, f64>(1)?,
                "status": r.get::<_, String>(2)?,
            })),
        )
        .ok();

    // Get attendance summary for the period
    let (yr, mo): (i32, i32) = period.split("-")
        .next()
        .and_then(|y| y.parse().ok())
        .zip(period.split("-").nth(1).and_then(|m| m.parse().ok()))
        .unwrap_or((2024, 1));
    let month_start = format!("{:04}-{:02}-01", yr, mo);
    let next_month_start = if mo == 12 {
        format!("{:04}-01-01", yr + 1)
    } else {
        format!("{:04}-{:02}-01", yr, mo + 1)
    };
    let attendance_days: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT DATE(punch_datetime)) FROM attendance WHERE employee_id=? AND punch_datetime >= ? AND punch_datetime < ?",
            rusqlite::params![employee_id, month_start, next_month_start],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(serde_json::json!({
        "employee": emp,
        "rubriques": rubriques,
        "bonuses": bonuses,
        "overtime": overtime,
        "attendance_days": attendance_days,
        "period": period,
    }))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn get_active_bonuses_for_period_inner(conn: &Connection, employee_id: i64, period: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(r#"SELECT b.id, b.title, b.amount, b.bonus_type, b.is_percentage, b.rubrique_code,
                    b.is_imposable, b.is_cotisable, b.recurrence_type, b.is_absence_dependent
                    FROM bonuses b
                    LEFT JOIN bonus_assignments ba ON ba.bonus_id = b.id AND ba.employee_id = ?
                    LEFT JOIN employees e ON e.id = ?
                    WHERE b.status = 'active'
                    AND (b.pay_period IS NULL OR b.pay_period = ?)
                    AND (
                        b.target_type = 'all'
                        OR ba.employee_id IS NOT NULL
                        OR (b.target_type = 'section' AND e.section = b.target_value)
                        OR (b.target_type = 'structure' AND e.structure = b.target_value)
                        OR (b.target_type = 'unite' AND e.unite = b.target_value)
                        OR (b.target_type = 'affectatio' AND e.affectatio = b.target_value)
                        OR (b.target_type = 'contract' AND e.contrat = b.target_value)
                    )"#)
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![employee_id, employee_id, period], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "title": row.get::<_, String>(1)?,
            "amount": row.get::<_, f64>(2)?,
            "bonus_type": row.get::<_, String>(3)?,
            "is_percentage": row.get::<_, Option<i64>>(4)?.unwrap_or(0) != 0,
            "rubrique_code": row.get::<_, Option<String>>(5)?,
            "is_imposable": row.get::<_, Option<i64>>(6)?.unwrap_or(0) != 0,
            "is_cotisable": row.get::<_, Option<i64>>(7)?.unwrap_or(0) != 0,
            "recurrence_type": row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "one_time".to_string()),
            "is_absence_dependent": row.get::<_, Option<i64>>(9)?.unwrap_or(0) != 0,
        }))
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ===== Import Settings =====

#[tauri::command]
fn get_import_settings(state: State<AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let user_dat_path: Option<String> = conn.query_row("SELECT value FROM app_settings WHERE key='pointeuse_user_dat'", [], |r| r.get(0)).ok();
    let attlog_dir: Option<String> = conn.query_row("SELECT value FROM app_settings WHERE key='pointeuse_attlog_dir'", [], |r| r.get(0)).ok();
    let auto_match_threshold: Option<f64> = conn.query_row("SELECT value FROM app_settings WHERE key='pointeuse_auto_match_threshold'", [], |r| r.get(0)).ok();
    Ok(serde_json::json!({
        "user_dat_path": user_dat_path,
        "attlog_dir": attlog_dir,
        "auto_match_threshold": auto_match_threshold,
    }))
}

#[tauri::command]
fn save_import_settings(state: State<AppState>, user_dat_path: Option<String>, attlog_dir: Option<String>, auto_match_threshold: Option<f64>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if let Some(p) = user_dat_path {
        conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pointeuse_user_dat', ?)", [&p]).map_err(|e| e.to_string())?;
    }
    if let Some(d) = attlog_dir {
        conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pointeuse_attlog_dir', ?)", [&d]).map_err(|e| e.to_string())?;
    }
    if let Some(t) = auto_match_threshold {
        conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pointeuse_auto_match_threshold', ?)", [t.to_string()]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Result of scanning a PCPAIE folder for importable files.
#[derive(Debug, Serialize, Deserialize)]
struct PcpaieFolderScan {
    /// Folder path that was scanned
    folder_path: String,
    /// Detected PCPAIE SQLite database file (validated to contain PCPAIE tables)
    pcpaie_db: Option<String>,
    /// True if the folder contains native PCPAIE .DTA files (RUBRIQUEX.DTA, PERS0.DTA, etc.)
    has_native_files: bool,
    /// List of detected native .DTA files
    native_dta_files: Vec<String>,
    /// Other SQLite files found in the folder (not recognized as PCPAIE)
    other_dbs: Vec<String>,
    /// Detected pointeuse user.dat file
    user_dat: Option<String>,
    /// Detected pointeuse attlog*.dat files
    attlog_files: Vec<String>,
    /// All files in the folder (for display)
    all_files: Vec<String>,
}

/// Check whether a file starts with the SQLite magic header ("SQLite format 3\0").
/// This lets us detect SQLite databases regardless of file extension.
fn is_sqlite_file(path: &str) -> bool {
    match std::fs::File::open(path) {
        Ok(mut f) => {
            use std::io::Read;
            let mut header = [0u8; 16];
            match f.read(&mut header) {
                Ok(n) if n >= 16 => {
                    // SQLite magic string: "SQLite format 3\0"
                    &header == b"SQLite format 3\0"
                }
                _ => false,
            }
        }
        Err(_) => false,
    }
}

/// Check whether a SQLite file contains the expected PCPAIE tables.
/// Returns the list of matching PCPAIE tables found (empty if not a PCPAIE DB).
fn pcpaie_tables_found(path: &str) -> Vec<String> {
    match Connection::open(path) {
        Ok(conn) => {
            // PCPAIE databases always have these core tables.
            // Table names in SQLite are case-insensitive, but we check both
            // the exact uppercase names and a case-insensitive match to be safe.
            let mut stmt = match conn.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' \
                 AND (name IN ('RUBRIQUE','PERS0','PAIES','PERS1','PERS2','DOSSIER','VALEURS') \
                      OR lower(name) IN ('rubrique','pers0','paies','pers1','pers2','dossier','valeurs'))",
            ) {
                Ok(s) => s,
                Err(_) => return Vec::new(),
            };
            stmt.query_map([], |r| r.get::<_, String>(0))
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default()
        }
        Err(_) => Vec::new(),
    }
}

/// Check whether a file is a valid PCPAIE database (SQLite + contains RUBRIQUE, PERS0, PAIES).
fn is_pcpaie_database(path: &str) -> bool {
    if !is_sqlite_file(path) {
        return false;
    }
    let tables = pcpaie_tables_found(path);
    // All three core tables must be present (case-insensitive check)
    let has_rubrique = tables.iter().any(|t| t.eq_ignore_ascii_case("RUBRIQUE"));
    let has_pers0 = tables.iter().any(|t| t.eq_ignore_ascii_case("PERS0"));
    let has_paies = tables.iter().any(|t| t.eq_ignore_ascii_case("PAIES"));
    has_rubrique && has_pers0 && has_paies
}

/// Scan a folder for PCPAIE-importable files: SQLite databases, native .DTA files, pointeuse user.dat, and attlog*.dat files.
#[tauri::command]
fn scan_pcpaie_dir(dir_path: String) -> Result<PcpaieFolderScan, String> {
    let path = std::path::Path::new(&dir_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let mut pcpaie_db: Option<String> = None;
    let mut other_dbs: Vec<String> = Vec::new();
    let mut user_dat: Option<String> = None;
    let mut attlog_files: Vec<String> = Vec::new();
    let mut all_files: Vec<String> = Vec::new();
    let mut native_dta_files: Vec<String> = Vec::new();

    // Key native PCPAIE .DTA files to detect
    let key_dta_files = [
        "rubriquex.dta", "pers0.dta", "pers1.dta", "pers2.dta",
        "paies.dta", "valeurs.dta", "dossier.dta",
    ];

    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let file_path = p.to_string_lossy().to_string();
        let file_name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        all_files.push(file_name.clone());

        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase());

        // Detect pointeuse user.dat
        if file_name == "user.dat" {
            user_dat = Some(file_path.clone());
            continue;
        }

        // Detect pointeuse attlog*.dat files
        if file_name.starts_with("attlog") && ext.as_deref() == Some("dat") {
            attlog_files.push(file_path.clone());
            continue;
        }

        // Detect native PCPAIE .DTA files
        if key_dta_files.contains(&file_name.as_str()) {
            native_dta_files.push(file_name.clone());
            continue; // Don't try to read them as SQLite
        }

        // Detect SQLite database files by magic header, regardless of extension.
        if is_sqlite_file(&file_path) {
            if is_pcpaie_database(&file_path) {
                if pcpaie_db.is_none() {
                    pcpaie_db = Some(file_path.clone());
                } else {
                    other_dbs.push(file_path.clone());
                }
            } else {
                other_dbs.push(file_path.clone());
            }
        }
    }

    native_dta_files.sort();
    attlog_files.sort();
    all_files.sort();

    // The folder is a valid native PCPAIE folder if it has at least RUBRIQUEX.DTA and PERS0.DTA
    let has_native = native_dta_files.contains(&"rubriquex.dta".to_string())
        && native_dta_files.contains(&"pers0.dta".to_string());

    Ok(PcpaieFolderScan {
        folder_path: dir_path,
        pcpaie_db,
        has_native_files: has_native,
        native_dta_files,
        other_dbs,
        user_dat,
        attlog_files,
        all_files,
    })
}

/// Result of importing an entire PCPAIE folder (DB + optional pointeuse data).
#[derive(Debug, Serialize, Deserialize)]
struct FolderImportResult {
    /// PCPAIE database import result (employees, rubriques, paies, lookups)
    pcpaie: ImportResult,
    /// Whether pointeuse data was found and imported
    pointeuse_imported: bool,
    /// Number of pointeuse users imported (0 if none)
    pointeuse_users: usize,
    /// Number of pointeuse attendance entries imported (0 if none)
    pointeuse_entries: usize,
    /// Path of the PCPAIE database that was imported
    pcpaie_db_path: String,
    /// Errors specific to pointeuse import
    pointeuse_errors: Vec<String>,
}

/// Progress event payload emitted during import.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ImportProgressEvent {
    step: String,
    current: usize,
    total: usize,
    message: String,
    /// Overall percentage across all phases (0-100)
    overall_percent: f64,
}

/// Import all PCPAIE data from a folder: auto-detect SQLite DB or native .DTA files,
/// plus pointeuse files, then import everything.
/// Emits "import-progress" events with real record counts during import.
#[tauri::command]
async fn import_pcpaie_folder(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    folder_path: String,
) -> Result<FolderImportResult, String> {
    let db_path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

        // 1. Scan the folder for importable files
        let scan = scan_pcpaie_dir_internal(&folder_path)?;

        // 2. Import PCPAIE data — either from SQLite DB or native .DTA files
        let (pcpaie_result, pcpaie_db_path) = if let Some(db_path) = &scan.pcpaie_db {
            // SQLite database found — emit basic progress
            {
                use tauri::Emitter;
                let _ = app_handle.emit("import-progress", ImportProgressEvent {
                    step: "rubriques".to_string(),
                    current: 0, total: 0,
                    message: "Import SQLite...".to_string(),
                    overall_percent: 0.0,
                });
            }
            let result = import_pcpaie(&conn, db_path, |_| {})?;
            {
                use tauri::Emitter;
                let _ = app_handle.emit("import-progress", ImportProgressEvent {
                    step: "done".to_string(),
                    current: 1, total: 1,
                    message: "Import SQLite terminé".to_string(),
                    overall_percent: 100.0,
                });
            }
            (result, db_path.clone())
        } else if scan.has_native_files {
            // Native .DTA files — parallel import with real progress
            // The native_import module calculates overall_percent itself
            // and calls our callback with (phase, step, current, total, message, overall_percent)
            let app_handle_clone = app_handle.clone();
            let progress_cb = move |_phase: &str, step: &str, current: usize, total: usize, message: &str, overall: f64| {
                use tauri::Emitter;
                let _ = app_handle_clone.emit("import-progress", ImportProgressEvent {
                    step: step.to_string(),
                    current,
                    total,
                    message: message.to_string(),
                    overall_percent: overall,
                });
            };

            let result = native_import::import_native_pcpaie(&conn, &folder_path, progress_cb)?;
            (result, folder_path.clone())
        } else {
            return Err(
                "No PCPAIE data found in the selected folder. Expected either a SQLite database (with RUBRIQUE, PERS0, PAIES tables) or native PCPAIE files (RUBRIQUEX.DTA, PERS0.DTA, etc.).".to_string()
            );
        };

        // 3. Import pointeuse data if user.dat and attlog files are present
        let mut pointeuse_imported = false;
        let mut pointeuse_users = 0;
        let mut pointeuse_entries = 0;
        let mut pointeuse_errors: Vec<String> = Vec::new();

        if let Some(user_dat) = &scan.user_dat {
            if !scan.attlog_files.is_empty() {
                {
                    use tauri::Emitter;
                    let _ = app_handle.emit("import-progress", ImportProgressEvent {
                        step: "pointeuse".to_string(),
                        current: 0,
                        total: 0,
                        message: "Import des données pointeuse...".to_string(),
                        overall_percent: 95.0,
                    });
                }
                match import_pointeuse(&conn, user_dat, &scan.attlog_files) {
                    Ok(result) => {
                        pointeuse_imported = true;
                        pointeuse_users = result.users_imported;
                        pointeuse_entries = result.attlog_entries;
                    }
                    Err(e) => {
                        pointeuse_errors.push(format!("Pointeuse import failed: {}", e));
                    }
                }
            } else {
                pointeuse_errors.push(
                    "user.dat found but no attlog*.dat files detected in the folder.".to_string(),
                );
            }
        }

        // Final event
        {
            use tauri::Emitter;
            let _ = app_handle.emit("import-progress", ImportProgressEvent {
                step: "done".to_string(),
                current: 1,
                total: 1,
                message: "Import terminé".to_string(),
                overall_percent: 100.0,
            });
        }

        Ok(FolderImportResult {
            pcpaie: pcpaie_result,
            pointeuse_imported,
            pointeuse_users,
            pointeuse_entries,
            pcpaie_db_path,
            pointeuse_errors,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Internal (non-command) version of scan_pcpaie_dir for reuse within Rust code.
fn scan_pcpaie_dir_internal(dir_path: &str) -> Result<PcpaieFolderScan, String> {
    let path = std::path::Path::new(dir_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let mut pcpaie_db: Option<String> = None;
    let mut other_dbs: Vec<String> = Vec::new();
    let mut user_dat: Option<String> = None;
    let mut attlog_files: Vec<String> = Vec::new();
    let mut all_files: Vec<String> = Vec::new();
    let mut native_dta_files: Vec<String> = Vec::new();

    let key_dta_files = [
        "rubriquex.dta", "pers0.dta", "pers1.dta", "pers2.dta",
        "paies.dta", "valeurs.dta", "dossier.dta",
    ];

    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let file_path = p.to_string_lossy().to_string();
        let file_name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        all_files.push(file_name.clone());

        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase());

        if file_name == "user.dat" {
            user_dat = Some(file_path.clone());
            continue;
        }

        if file_name.starts_with("attlog") && ext.as_deref() == Some("dat") {
            attlog_files.push(file_path.clone());
            continue;
        }

        // Detect native PCPAIE .DTA files
        if key_dta_files.contains(&file_name.as_str()) {
            native_dta_files.push(file_name.clone());
            continue;
        }

        if matches!(ext.as_deref(), Some("db") | Some("sqlite") | Some("sqlite3"))
            || file_name.contains(".db.")
            || is_sqlite_file(&file_path)
        {
            if is_pcpaie_database(&file_path) {
                if pcpaie_db.is_none() {
                    pcpaie_db = Some(file_path.clone());
                } else {
                    other_dbs.push(file_path.clone());
                }
            } else if is_sqlite_file(&file_path) {
                other_dbs.push(file_path.clone());
            }
        }
    }

    native_dta_files.sort();
    attlog_files.sort();
    all_files.sort();

    let has_native = native_dta_files.contains(&"rubriquex.dta".to_string())
        && native_dta_files.contains(&"pers0.dta".to_string());

    Ok(PcpaieFolderScan {
        folder_path: dir_path.to_string(),
        pcpaie_db,
        has_native_files: has_native,
        native_dta_files,
        other_dbs,
        user_dat,
        attlog_files,
        all_files,
    })
}

#[tauri::command]
fn scan_attlog_dir(dir_path: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&dir_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }
    let mut files = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        if p.is_file() {
            if let Some(ext) = p.extension() {
                if ext.eq_ignore_ascii_case("dat") {
                    files.push(p.to_string_lossy().to_string());
                }
            }
        }
    }
    files.sort();
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            let db_path = db::get_db_path(&app_data_dir.to_string_lossy());
            let conn = db::init_db(&db_path).expect("Failed to init database");

            app.manage(AppState {
                conn: Mutex::new(conn),
                db_path: db_path.clone(),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            import_pcpaie_db,
            import_pointeuse_data,
            get_fuzzy_matches,
            link_user_to_employee,
            clear_pointeuse_data,
            auto_match_all,
            bulk_link_users,
            get_employees,
            get_employee_filter_options,
            get_employee_detail,
            get_employee_children,
            get_employee_leave_history,
            get_employee_loans,
            get_employee_events,
            get_pay_periods,
            get_shifts,
            create_shift,
            assign_shift,
            calculate_employee_salary,
            save_salary_calculation,
            get_saved_calculation,
            get_salary_history,
            calculate_all_salaries,
            delete_month_calculations,
            get_all_salary_history,
            get_historical_payslip,
            get_available_periods,
            get_employee_salary_periods,
            get_attendance_calendar,
            get_leaves,
            create_leave,
            delete_leave,
            get_bonuses,
            create_bonus,
            delete_bonus,
            skip_bonus,
            unskip_bonus,
            get_skipped_bonuses,
            get_attendance,
            get_rubriques,
            create_rubrique,
            update_rubrique,
            update_rubrique_flags,
            delete_rubrique,
            test_rubrique_formula,
            get_salary_settings,
            set_salary_setting,
            set_salary_settings,
            get_lookup_values,
            // Field mappings
            get_field_mappings,
            update_field_mapping,
            get_available_lookup_tables,
            get_lookup_table_preview,
            get_all_lookup_tables_preview,
            get_available_employee_columns,
            // Postes
            get_postes,
            get_poste_detail,
            create_poste,
            update_poste,
            delete_poste,
            update_poste_rubrique,
            assign_employee_to_poste,
            sync_postes_from_fnc,
            recompute_poste_stats,
            export_database,
            get_database_stats,
            // Employee salary & primes
            get_employee_current_rubriques,
            get_employee_salary_history,
            update_employee_rubrique,
            get_employee_rubrique_history,
            // Overtime
            save_overtime_entry,
            save_overtime_monthly,
            get_overtime,
            confirm_overtime_monthly,
            compute_overtime_from_attendance,
            // Import settings
            get_import_settings,
            save_import_settings,
            scan_attlog_dir,
            // PCPAIE folder import
            scan_pcpaie_dir,
            import_pcpaie_folder,
            // Enhanced bonuses
            get_active_bonuses_for_period,
            create_enhanced_bonus,
            update_bonus,
            apply_bonus_to_employee,
            // Pre-calc summary
            get_pre_calc_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
