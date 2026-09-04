use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Information about a single imported PCPAIE dossier.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DossierInfo {
    pub id: i64,
    pub doss_nom: String,
    pub db_path: String,
    pub imported_at: String,
    pub employee_count: usize,
}

/// The full registry of all dossiers, persisted as JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DossierRegistry {
    pub active_dossier_id: i64,
    pub dossiers: Vec<DossierInfo>,
}

impl Default for DossierRegistry {
    fn default() -> Self {
        DossierRegistry {
            active_dossier_id: 0,
            dossiers: Vec::new(),
        }
    }
}

/// Path to the registry JSON file inside the app data directory.
fn registry_path(app_data_dir: &str) -> String {
    Path::new(app_data_dir)
        .join("dossiers.json")
        .to_string_lossy()
        .to_string()
}

/// Load the dossier registry from disk. Returns a default empty registry if the
/// file does not exist yet.
pub fn load_registry(app_data_dir: &str) -> Result<DossierRegistry, String> {
    let path = registry_path(app_data_dir);
    if !Path::new(&path).exists() {
        return Ok(DossierRegistry::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Cannot read dossiers.json: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Cannot parse dossiers.json: {}", e))
}

/// Save the dossier registry to disk.
pub fn save_registry(app_data_dir: &str, registry: &DossierRegistry) -> Result<(), String> {
    let dir = Path::new(app_data_dir);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = registry_path(app_data_dir);
    let json = serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Cannot write dossiers.json: {}", e))
}

/// Generate a DB file path for a new dossier with the given id.
pub fn dossier_db_path(app_data_dir: &str, id: i64) -> String {
    Path::new(app_data_dir)
        .join(format!("hamtech_paie_{}.db", id))
        .to_string_lossy()
        .to_string()
}

/// Migrate an existing single-dossier installation to the multi-dossier system.
///
/// If `dossiers.json` does not exist but `hamtech_paie.db` does (the old
/// single-database path), this function:
///   1. Reads `doss_nom` from the existing `company_info` table.
///   2. Renames `hamtech_paie.db` → `hamtech_paie_1.db`.
///   3. Creates a registry with dossier id=1 pointing to the renamed file.
///
/// Returns the registry after migration (or the loaded registry if no migration
/// was needed).
pub fn migrate_existing_db(app_data_dir: &str) -> Result<DossierRegistry, String> {
    let reg_path = registry_path(app_data_dir);

    // If registry exists and has dossiers, just load it.
    if Path::new(&reg_path).exists() {
        let registry = load_registry(app_data_dir)?;
        if !registry.dossiers.is_empty() {
            return Ok(registry);
        }
        // Registry exists but is empty — fall through to check for orphan DBs.
    }

    let old_db = Path::new(app_data_dir).join("hamtech_paie.db");
    if !old_db.exists() {
        // No existing DB — nothing to migrate.
        return Ok(DossierRegistry::default());
    }

    // Check if the old DB has company_info (i.e. it was initialized).
    let old_db_str = old_db.to_string_lossy().to_string();
    let has_company = rusqlite::Connection::open(&old_db_str)
        .and_then(|c| c.query_row("SELECT COUNT(*) FROM company_info", [], |r| r.get::<_, i64>(0)))
        .unwrap_or(0)
        > 0;
    if !has_company {
        // DB exists but not initialized — nothing to migrate.
        return Ok(DossierRegistry::default());
    }

    // Check if the old DB has company_info (i.e. it was initialized).
    let old_db_str = old_db.to_string_lossy().to_string();
    let doss_nom = match rusqlite::Connection::open(&old_db_str) {
        Ok(conn) => conn
            .query_row("SELECT doss_nom FROM company_info WHERE id=1", [], |r| {
                r.get::<_, Option<String>>(0)
            })
            .ok()
            .flatten()
            .unwrap_or_else(|| "Dossier 1".to_string()),
        Err(_) => "Dossier 1".to_string(),
    };

    // Also get employee count for the registry.
    let emp_count = match rusqlite::Connection::open(&old_db_str) {
        Ok(conn) => conn
            .query_row("SELECT COUNT(*) FROM employees", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0),
        Err(_) => 0,
    };

    // Rename old DB to hamtech_paie_1.db
    let new_db = dossier_db_path(app_data_dir, 1);
    if Path::new(&new_db).exists() {
        // hamtech_paie_1.db already exists — use the old DB in place (don't rename).
        // Register it with its current path.
        let registry = DossierRegistry {
            active_dossier_id: 1,
            dossiers: vec![DossierInfo {
                id: 1,
                doss_nom,
                db_path: old_db_str.clone(),
                imported_at: chrono::Utc::now().to_rfc3339(),
                employee_count: emp_count as usize,
            }],
        };
        save_registry(app_data_dir, &registry)?;
        return Ok(registry);
    } else {
        fs::rename(&old_db, &new_db).map_err(|e| format!("Cannot rename DB: {}", e))?;
    }

    // Also rename WAL and SHM files if they exist.
    for ext in &["-wal", "-shm"] {
        let old_wal = format!("{}{}", old_db_str, ext);
        if Path::new(&old_wal).exists() {
            let new_wal = format!("{}{}", new_db, ext);
            let _ = fs::rename(&old_wal, &new_wal);
        }
    }

    let registry = DossierRegistry {
        active_dossier_id: 1,
        dossiers: vec![DossierInfo {
            id: 1,
            doss_nom,
            db_path: new_db,
            imported_at: chrono::Utc::now().to_rfc3339(),
            employee_count: emp_count as usize,
        }],
    };

    save_registry(app_data_dir, &registry)?;
    Ok(registry)
}

/// Find the next available dossier id (max + 1, or 1 if empty).
pub fn next_dossier_id(registry: &DossierRegistry) -> i64 {
    registry.dossiers.iter().map(|d| d.id).max().unwrap_or(0) + 1
}

/// Find a dossier by doss_nom (case-insensitive trim comparison).
pub fn find_by_name<'a>(registry: &'a DossierRegistry, name: &str) -> Option<&'a DossierInfo> {
    let name_trimmed = name.trim().to_lowercase();
    registry
        .dossiers
        .iter()
        .find(|d| d.doss_nom.trim().to_lowercase() == name_trimmed)
}

/// Get the active dossier info.
pub fn get_active<'a>(registry: &'a DossierRegistry) -> Option<&'a DossierInfo> {
    registry
        .dossiers
        .iter()
        .find(|d| d.id == registry.active_dossier_id)
}

/// Statistics for a single dossier, queried from its DB.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DossierStats {
    pub employee_count: usize,
    pub rubrique_count: usize,
    pub paie_count: usize,
    pub db_size_bytes: u64,
    pub last_period: Option<String>,
}

/// Query statistics from a dossier's database file.
pub fn get_dossier_stats(db_path: &str) -> Result<DossierStats, String> {
    let conn = rusqlite::Connection::open(db_path).map_err(|e| format!("Cannot open DB: {}", e))?;
    let employee_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM employees", [], |r| r.get(0))
        .unwrap_or(0);
    let rubrique_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM rubriques", [], |r| r.get(0))
        .unwrap_or(0);
    let paie_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM paies", [], |r| r.get(0))
        .unwrap_or(0);
    let last_period: Option<String> = conn
        .query_row(
            "SELECT MAX(period) FROM paies",
            [],
            |r| r.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten();
    let db_size_bytes = std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    Ok(DossierStats {
        employee_count: employee_count as usize,
        rubrique_count: rubrique_count as usize,
        paie_count: paie_count as usize,
        db_size_bytes,
        last_period,
    })
}

/// Rename a dossier: update the registry and the company_info table in the dossier's DB.
pub fn rename_dossier(
    app_data_dir: &str,
    dossier_id: i64,
    new_name: &str,
) -> Result<DossierInfo, String> {
    let mut registry = load_registry(app_data_dir)?;
    let dossier = registry
        .dossiers
        .iter_mut()
        .find(|d| d.id == dossier_id)
        .ok_or("Dossier not found")?;
    let old_name = dossier.doss_nom.clone();
    dossier.doss_nom = new_name.trim().to_string();
    let updated = dossier.clone();

    // Update company_info in the dossier's DB
    let conn = rusqlite::Connection::open(&dossier.db_path)
        .map_err(|e| format!("Cannot open DB: {}", e))?;
    conn.execute(
        "UPDATE company_info SET doss_nom = ?1 WHERE id = 1",
        rusqlite::params![new_name],
    )
    .map_err(|e| format!("Failed to update company_info: {}", e))?;

    // Also update app_settings pcpaie_path label if it matches old name
    let _ = conn.execute(
        "UPDATE app_settings SET value = ?1 WHERE key = 'pcpaie_label'",
        rusqlite::params![new_name],
    );

    save_registry(app_data_dir, &registry)?;
    let _ = old_name; // suppress unused warning
    Ok(updated)
}
