pub mod calculator;
mod db;
mod import;
mod pointeuse;

use calculator::{calculate_salary, save_calculation, CalcResult};
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
fn parse_montants(montants: &str) -> HashMap<String, f64> {
    let mut map = HashMap::new();
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

/// Extract financial totals from a parsed montants map.
/// R763=brut, R770=net, R660=IRG, R767=retenues, R807=cotisable, R652=imposable
fn extract_totals_from_montants(map: &HashMap<String, f64>) -> (f64, f64, f64, f64, f64, f64) {
    let total_brut = *map.get("763").unwrap_or(&0.0);
    let net_payer = *map.get("770").unwrap_or(&0.0);
    let irg = *map.get("660").unwrap_or(&0.0);
    let total_retenues = *map.get("767").unwrap_or(&0.0);
    let base_cotisable = *map.get("807").unwrap_or(&0.0);
    let base_imposable = *map.get("652").unwrap_or(&0.0);
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
}

#[tauri::command]
fn get_employees(state: State<AppState>) -> Result<Vec<EmployeeSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"SELECT e.id, e.matricule, e.nom, e.prenom, e.actif, e.pointeuse_pin,
               s.name, e.section, e.structure, e.affectatio
               FROM employees e
               LEFT JOIN shifts s ON e.shift_id = s.id
               ORDER BY e.nom, e.prenom"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
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
fn get_employee_detail(
    state: State<AppState>,
    employee_id: i64,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let row = conn
        .query_row(
            r#"SELECT id, matricule, nom, prenom, sit_fam, nbre_enf, naiss_date,
               dte_entree, dte_sortie, actif, sexe, no_grille, categorie, section,
               echelon, classe, structure, unite, affectatio, contrat, sect1,
               code_caisss, code_irg, code_cnas, no_cnas, n_secu_sle, no_compte,
               pointeuse_pin, shift_id, adresse, telephone, e_mail, n_id_nat
               FROM employees WHERE id=?"#,
            [employee_id],
            |r| {
                Ok(serde_json::json!({
                    "id": r.get::<_, i64>(0)?,
                    "matricule": r.get::<_, Option<String>>(1)?,
                    "nom": r.get::<_, Option<String>>(2)?,
                    "prenom": r.get::<_, Option<String>>(3)?,
                    "sit_fam": r.get::<_, Option<String>>(4)?,
                    "nbre_enf": r.get::<_, Option<f64>>(5)?,
                    "naiss_date": r.get::<_, Option<String>>(6)?,
                    "dte_entree": r.get::<_, Option<String>>(7)?,
                    "dte_sortie": r.get::<_, Option<String>>(8)?,
                    "actif": r.get::<_, Option<i64>>(9)?,
                    "sexe": r.get::<_, Option<String>>(10)?,
                    "no_grille": r.get::<_, Option<String>>(11)?,
                    "categorie": r.get::<_, Option<String>>(12)?,
                    "section": r.get::<_, Option<String>>(13)?,
                    "echelon": r.get::<_, Option<String>>(14)?,
                    "classe": r.get::<_, Option<String>>(15)?,
                    "structure": r.get::<_, Option<String>>(16)?,
                    "unite": r.get::<_, Option<String>>(17)?,
                    "affectatio": r.get::<_, Option<String>>(18)?,
                    "contrat": r.get::<_, Option<String>>(19)?,
                    "sect1": r.get::<_, Option<String>>(20)?,
                    "code_caisss": r.get::<_, Option<String>>(21)?,
                    "code_irg": r.get::<_, Option<f64>>(22)?,
                    "code_cnas": r.get::<_, Option<f64>>(23)?,
                    "no_cnas": r.get::<_, Option<i64>>(24)?,
                    "n_secu_sle": r.get::<_, Option<String>>(25)?,
                    "no_compte": r.get::<_, Option<String>>(26)?,
                    "pointeuse_pin": r.get::<_, Option<i32>>(27)?,
                    "shift_id": r.get::<_, Option<i64>>(28)?,
                    "adresse": r.get::<_, Option<String>>(29)?,
                    "telephone": r.get::<_, Option<String>>(30)?,
                    "e_mail": r.get::<_, Option<String>>(31)?,
                    "n_id_nat": r.get::<_, Option<String>>(32)?,
                }))
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(row)
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
fn calculate_employee_salary(
    state: State<AppState>,
    employee_id: i64,
    period: String,
    input_values: HashMap<String, (f64, f64)>,
) -> Result<CalcResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    calculate_salary(&conn, employee_id, &period, &input_values)
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
fn get_salary_history(
    state: State<AppState>,
    employee_id: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
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
                "SELECT id, employee_id, leave_type, start_date, end_date, days_count, reason, status FROM leaves WHERE employee_id=? ORDER BY start_date DESC",
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
                "SELECT id, employee_id, leave_type, start_date, end_date, days_count, reason, status FROM leaves ORDER BY start_date DESC",
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
fn get_bonuses(state: State<AppState>) -> Result<Vec<Bonus>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"SELECT id, title, description, bonus_type, amount, is_percentage,
               rubrique_code, target_type, target_value, pay_period, status,
               recurrence_type, recurrence_count, is_imposable, is_cotisable
               FROM bonuses ORDER BY created_at DESC"#,
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
fn get_rubriques(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
#[tauri::command]
fn get_all_salary_history(
    state: State<AppState>,
    period: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
                       WHERE sc.period=? ORDER BY e.nom, e.prenom"#)
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
                       ORDER BY sc.period DESC, e.nom, e.prenom"#)
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

    // Also include legacy PCPAIE paies with parsed financial totals
    let mut stmt2 = conn
        .prepare(r#"SELECT p.id, p.employee_id, p.mois, p.matricule, p.montants, p.sit_fam, p.nbre_enf,
                    p.nbr_jr_ouv, p.nbr_hr_ouv, p.c_date, p.c_time,
                    e.nom, e.prenom
                    FROM paies p
                    LEFT JOIN employees e ON p.employee_id = e.id
                    WHERE p.mois != 'TOT-PAIE'
                    ORDER BY p.mois DESC, e.nom, e.prenom"#)
        .map_err(|e| e.to_string())?;
    let rows2 = stmt2
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;
    for row in rows2 {
        let r = row.map_err(|e| e.to_string())?;
        if let Some(ref p) = period {
            if r.get("period").and_then(|v| v.as_str()) == Some(p.as_str()) {
                results.push(r);
            }
        } else {
            results.push(r);
        }
    }

    Ok(results)
}

// Get a historical payslip with full rubrique breakdown from PAIES montants
#[tauri::command]
fn get_historical_payslip(
    state: State<AppState>,
    employee_id: i64,
    period: String,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let row = conn
        .query_row(
            r#"SELECT p.id, p.mois, p.matricule, p.montants, p.sit_fam, p.nbre_enf,
                      p.nbr_jr_ouv, p.nbr_hr_ouv, p.c_date, p.c_time,
                      e.nom, e.prenom
               FROM paies p
               LEFT JOIN employees e ON p.employee_id = e.id
               WHERE p.employee_id=? AND p.mois=? AND p.mois != 'TOT-PAIE'
               LIMIT 1"#,
            rusqlite::params![employee_id, period],
            |r| {
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

// Get available periods (from both salary_calculations and paies)
#[tauri::command]
fn get_available_periods(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut periods = std::collections::BTreeSet::new();

    let mut stmt = conn
        .prepare("SELECT DISTINCT period FROM salary_calculations ORDER BY period DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok(p) = r { periods.insert(p); }
    }

    let mut stmt2 = conn
        .prepare("SELECT DISTINCT mois FROM paies ORDER BY mois DESC")
        .map_err(|e| e.to_string())?;
    let rows2 = stmt2.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for r in rows2 {
        if let Ok(p) = r { periods.insert(p); }
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

// ===== Postes (Jobs) =====

#[derive(Debug, Serialize, Deserialize)]
struct PosteSummary {
    id: i64,
    name: String,
    description: Option<String>,
    employee_count: i64,
}

#[tauri::command]
fn get_postes(state: State<AppState>) -> Result<Vec<PosteSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(r#"SELECT p.id, p.name, p.description, COUNT(e.id) as emp_count
                    FROM postes p LEFT JOIN employees e ON e.poste_id = p.id
                    GROUP BY p.id ORDER BY p.name"#)
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(PosteSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            employee_count: row.get(3)?,
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
        .query_row("SELECT id, name, description FROM postes WHERE id=?", [poste_id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "description": r.get::<_, Option<String>>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(r#"SELECT pr.rubrique_code, pr.default_value, pr.is_fixed, pr.sort_order,
                    r.libelle, r.classe, r.manuelle
                    FROM poste_rubriques pr
                    LEFT JOIN rubriques r ON pr.rubrique_code = 'R' || printf('%03d', r.code)
                    WHERE pr.poste_id=? ORDER BY pr.sort_order"#)
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
        }))
    }).map_err(|e| e.to_string())?;
    let mut rubriques = Vec::new();
    for row in rub_rows {
        rubriques.push(row.map_err(|e| e.to_string())?);
    }

    let mut stmt2 = conn
        .prepare(r#"SELECT e.id, e.matricule, e.nom, e.prenom, e.actif
                    FROM employees e WHERE e.poste_id=? ORDER BY e.nom, e.prenom"#)
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

    Ok(serde_json::json!({
        "poste": poste,
        "rubriques": rubriques,
        "employees": employees,
    }))
}

#[tauri::command]
fn create_poste(state: State<AppState>, name: String, description: Option<String>) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO postes (name, description) VALUES (?, ?)", rusqlite::params![name, description])
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
            .prepare("SELECT id, rubrique_code, old_value, new_value, change_date, reason FROM employee_salary_history WHERE employee_id=? AND rubrique_code=? ORDER BY change_date DESC")
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
            .prepare("SELECT id, rubrique_code, old_value, new_value, change_date, reason FROM employee_salary_history WHERE employee_id=? ORDER BY change_date DESC")
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
fn get_pre_calc_summary(state: State<AppState>, employee_id: i64, period: String) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

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
            get_employee_detail,
            get_shifts,
            create_shift,
            assign_shift,
            calculate_employee_salary,
            save_salary_calculation,
            get_salary_history,
            calculate_all_salaries,
            delete_month_calculations,
            get_all_salary_history,
            get_historical_payslip,
            get_available_periods,
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
            get_lookup_values,
            // Postes
            get_postes,
            get_poste_detail,
            create_poste,
            update_poste,
            delete_poste,
            update_poste_rubrique,
            assign_employee_to_poste,
            // Employee salary & primes
            get_employee_current_rubriques,
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
