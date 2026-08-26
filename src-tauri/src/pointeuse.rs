use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointeuseUser {
    pub pin: u16,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttlogEntry {
    pub pin: i32,
    pub datetime: String,
    pub verify_mode: i32,
    pub work_code: i32,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointeuseImportResult {
    pub users_imported: usize,
    pub attlog_entries: usize,
    pub unmatched_pins: Vec<i32>,
    #[serde(default)]
    pub date_range_start: Option<String>,
    #[serde(default)]
    pub date_range_end: Option<String>,
    #[serde(default)]
    pub per_user_counts: Vec<(i32, String, usize)>,
}

pub fn parse_user_dat(path: &str) -> Result<Vec<PointeuseUser>, String> {
    let data = fs::read(path).map_err(|e| format!("Cannot read user.dat: {}", e))?;
    let rec_size = 72;
    if data.len() % rec_size != 0 {
        return Err(format!(
            "user.dat size {} is not a multiple of record size {}",
            data.len(),
            rec_size
        ));
    }

    let mut users = Vec::new();
    let num_records = data.len() / rec_size;
    for i in 0..num_records {
        let rec = &data[i * rec_size..(i + 1) * rec_size];
        let pin = u16::from_le_bytes([rec[0], rec[1]]);
        // Name starts at offset 11, null-terminated
        let name_bytes = &rec[11..];
        let name_end = name_bytes.iter().position(|&b| b == 0).unwrap_or(name_bytes.len());
        let name = String::from_utf8_lossy(&name_bytes[..name_end]).to_string();
        if pin > 0 && !name.is_empty() {
            users.push(PointeuseUser { pin, name });
        }
    }
    Ok(users)
}

pub fn parse_attlog(path: &str, device_id: &str) -> Result<Vec<AttlogEntry>, String> {
    let data = fs::read(path).map_err(|e| format!("Cannot read attlog: {}", e))?;
    let mut entries = Vec::new();

    for line in data.split(|&b| b == b'\n') {
        let line = String::from_utf8_lossy(line);
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 5 {
            continue;
        }
        let pin: i32 = parts[0].trim().parse().unwrap_or(-1);
        if pin < 0 {
            continue;
        }
        let datetime = parts[1].trim().to_string();
        let verify_mode: i32 = parts[3].trim().parse().unwrap_or(0);
        let work_code: i32 = parts[4].trim().parse().unwrap_or(0);
        entries.push(AttlogEntry {
            pin,
            datetime,
            verify_mode,
            work_code,
            device_id: device_id.to_string(),
        });
    }

    Ok(entries)
}

pub fn import_pointeuse(
    app: &Connection,
    user_dat_path: &str,
    attlog_paths: &[String],
) -> Result<PointeuseImportResult, String> {
    // 1. Parse and store user.dat
    let users = parse_user_dat(user_dat_path)?;
    let users_imported = users.len();

    // Store pointeuse users in a temp table for matching
    app.execute_batch(
        r#"CREATE TABLE IF NOT EXISTS pointeuse_users (
            pin INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            employee_id INTEGER
        );"#,
    )
    .map_err(|e| e.to_string())?;

    for user in &users {
        app.execute(
            "INSERT OR REPLACE INTO pointeuse_users (pin, name) VALUES (?, ?)",
            rusqlite::params![user.pin, user.name],
        )
        .map_err(|e| e.to_string())?;
    }

    // 2. Parse and store attlog entries
    let mut total_entries = 0;
    let mut all_pins = std::collections::HashSet::new();
    let mut min_date: Option<String> = None;
    let mut max_date: Option<String> = None;
    let mut per_user: std::collections::HashMap<i32, (String, usize)> = std::collections::HashMap::new();

    for attlog_path in attlog_paths {
        let device_id = Path::new(attlog_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".into());

        let entries = parse_attlog(attlog_path, &device_id)?;
        for entry in &entries {
            all_pins.insert(entry.pin);
            let date_part = entry.datetime.split(' ').next().unwrap_or(&entry.datetime).to_string();
            if min_date.as_ref().map_or(true, |d| &date_part < d) {
                min_date = Some(date_part.clone());
            }
            if max_date.as_ref().map_or(true, |d| &date_part > d) {
                max_date = Some(date_part.clone());
            }
            let user_name = users.iter().find(|u| u.pin as i32 == entry.pin)
                .map(|u| u.name.clone())
                .unwrap_or_else(|| format!("PIN {}", entry.pin));
            let entry_count = per_user.entry(entry.pin).or_insert((user_name, 0));
            entry_count.1 += 1;

            app.execute(
                r#"INSERT INTO attendance (pointeuse_pin, punch_datetime, verify_mode, work_code, device_id)
                   VALUES (?,?,?,?,?)"#,
                rusqlite::params![entry.pin, entry.datetime, entry.verify_mode, entry.work_code, entry.device_id],
            )
            .map_err(|e| e.to_string())?;
            total_entries += 1;
        }
    }

    // 3. Find unmatched pins
    let matched_pins: std::collections::HashSet<i32> = users
        .iter()
        .map(|u| u.pin as i32)
        .collect();
    let unmatched: Vec<i32> = all_pins
        .iter()
        .filter(|p| !matched_pins.contains(p))
        .copied()
        .collect();

    let mut per_user_counts: Vec<(i32, String, usize)> = per_user
        .into_iter()
        .map(|(pin, (name, count))| (pin, name, count))
        .collect();
    per_user_counts.sort_by(|a, b| b.2.cmp(&a.2));

    Ok(PointeuseImportResult {
        users_imported,
        attlog_entries: total_entries,
        unmatched_pins: unmatched,
        date_range_start: min_date,
        date_range_end: max_date,
        per_user_counts,
    })
}

/// Fuzzy match pointeuse users to employees using name similarity
pub fn fuzzy_match_users_to_employees(
    app: &Connection,
) -> Result<Vec<FuzzyMatchResult>, String> {
    let mut stmt = app
        .prepare("SELECT pin, name FROM pointeuse_users WHERE employee_id IS NULL")
        .map_err(|e| e.to_string())?;

    let users: Vec<(i32, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut emp_stmt = app
        .prepare("SELECT id, matricule, nom, prenom FROM employees WHERE actif=1")
        .map_err(|e| e.to_string())?;

    let employees: Vec<(i64, String, String, String)> = emp_stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut results = Vec::new();
    for (pin, pname) in &users {
        let pname_upper = pname.to_uppercase();
        let parts: Vec<&str> = pname_upper.split('.').collect();
        let p_surname = parts.get(0).map(|s| s.trim()).unwrap_or("");
        let p_firstname = parts.get(1).map(|s| s.trim()).unwrap_or("");

        let mut best_match: Option<(i64, f64, String, String, String)> = None;

        for (emp_id, mat, nom, prenom) in &employees {
            let nom_upper = nom.to_uppercase();
            let prenom_upper = prenom.to_uppercase();

            let mut score = 0.0f64;

            // Exact surname match
            if nom_upper == *p_surname {
                score += 50.0;
            } else if nom_upper.contains(p_surname) || p_surname.contains(&nom_upper) {
                score += 30.0;
            }

            // First name match
            if !p_firstname.is_empty() {
                if prenom_upper == *p_firstname {
                    score += 40.0;
                } else if prenom_upper.contains(p_firstname) || p_firstname.contains(&prenom_upper) {
                    score += 20.0;
                }
            }

            // Levenshtein-based similarity for surname
            let dist = levenshtein(p_surname, &nom_upper);
            let max_len = p_surname.len().max(nom_upper.len());
            if max_len > 0 {
                let similarity = 1.0 - (dist as f64 / max_len as f64);
                score += similarity * 25.0;
            }

            if score > best_match.as_ref().map(|m| m.1).unwrap_or(0.0) {
                best_match = Some((*emp_id, score, mat.clone(), nom.clone(), prenom.clone()));
            }
        }

        results.push(FuzzyMatchResult {
            pin: *pin,
            pointeuse_name: pname.clone(),
            best_employee_id: best_match.as_ref().map(|m| m.0),
            best_score: best_match.as_ref().map(|m| m.1).unwrap_or(0.0),
            best_matricule: best_match.as_ref().map(|m| m.2.clone()),
            best_nom: best_match.as_ref().map(|m| m.3.clone()),
            best_prenom: best_match.as_ref().map(|m| m.4.clone()),
            confirmed: false,
        });
    }

    // Sort by score descending
    results.sort_by(|a, b| b.best_score.partial_cmp(&a.best_score).unwrap_or(std::cmp::Ordering::Equal));

    Ok(results)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzyMatchResult {
    pub pin: i32,
    pub pointeuse_name: String,
    pub best_employee_id: Option<i64>,
    pub best_score: f64,
    pub best_matricule: Option<String>,
    pub best_nom: Option<String>,
    pub best_prenom: Option<String>,
    pub confirmed: bool,
}

pub fn link_pointeuse_to_employee(
    app: &Connection,
    pin: i32,
    employee_id: i64,
) -> Result<(), String> {
    app.execute(
        "UPDATE pointeuse_users SET employee_id=? WHERE pin=?",
        rusqlite::params![employee_id, pin],
    )
    .map_err(|e| e.to_string())?;

    app.execute(
        "UPDATE employees SET pointeuse_pin=? WHERE id=?",
        rusqlite::params![pin, employee_id],
    )
    .map_err(|e| e.to_string())?;

    // Link existing attendance records
    app.execute(
        "UPDATE attendance SET employee_id=? WHERE pointeuse_pin=?",
        rusqlite::params![employee_id, pin],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    if a_len == 0 {
        return b_len;
    }
    if b_len == 0 {
        return a_len;
    }

    let mut prev: Vec<usize> = (0..=b_len).collect();
    let mut curr: Vec<usize> = vec![0; b_len + 1];

    for i in 1..=a_len {
        curr[0] = i;
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[b_len]
}
