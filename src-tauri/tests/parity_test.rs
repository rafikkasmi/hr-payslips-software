// Integration test: compare Rust calculator output against historical payslips
// Run with: cargo test --lib test_parity_historical -- --ignored --nocapture

use app_lib::calculator;
use rusqlite::Connection;
use std::collections::HashMap;

#[test]
#[ignore]
fn test_parity_historical() {
    let db_path = "/home/rafik/.local/share/com.hamtech.paie/hamtech_paie.db";
    let conn = Connection::open(db_path).unwrap();

    // Load rubriques to know which are manual/formula
    let rubriques = calculator::load_rubriques(&conn).unwrap();

    // Get all employees
    let employees: Vec<(i64, String)> = conn
        .prepare("SELECT id, matricule FROM employees ORDER BY matricule LIMIT 20")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    let mut total_cmp = 0;
    let mut total_match = 0;
    let mut total_mismatch = 0;
    let mut mismatches: Vec<(String, String, f64, f64)> = Vec::new();

    for (emp_id, matricule) in &employees {
        // Get employee-specific rubrique codes
        let emp_rub_codes: std::collections::HashSet<String> = conn
            .prepare("SELECT rubrique_code FROM employee_rubriques WHERE employee_id=?")
            .unwrap()
            .query_map([emp_id], |r| Ok(r.get::<_, String>(0)?))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        // Get all payslips for this employee
        let payslips: Vec<(String, String)> = conn
            .prepare("SELECT mois, montants FROM paies WHERE employee_id=? AND mois != 'TOT-PAIE' ORDER BY mois")
            .unwrap()
            .query_map([emp_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        for (mois, montants) in &payslips {
            if montants.is_empty() { continue; }

            // Parse actual values from montants string
            let mut actual_r: HashMap<String, f64> = HashMap::new();
            let mut header_codes: std::collections::HashSet<String> = std::collections::HashSet::new();
            for line in montants.lines() {
                let line = line.trim();
                // Extract #Rxxx patterns from header line (may have text before #)
                if line.contains("#R") {
                    let mut rest = line;
                    while let Some(pos) = rest.find("#R") {
                        rest = &rest[pos+2..];
                        if rest.len() >= 3 {
                            let code = &rest[..3];
                            if code.chars().all(|c| c.is_ascii_digit()) {
                                header_codes.insert(code.to_string());
                            }
                            rest = &rest[3..];
                        }
                    }
                    continue;
                }
                if line.starts_with('R') && line.len() > 4 {
                    let code = &line[1..4];
                    if let Ok(val) = line[4..].trim().parse::<f64>() {
                        actual_r.insert(code.to_string(), val);
                    }
                }
            }

            // Build input values: manual + employee-specific rubriques from payslip
            let mut input_values: HashMap<String, (f64, f64)> = HashMap::new();
            for rub in &rubriques {
                let code = &rub.code;
                let is_manual = rub.manuelle || rub.formule.as_ref().map_or(true, |f| f.trim().is_empty());
                let is_emp = emp_rub_codes.contains(&format!("R{}", code));
                if rub.classe == 5.0 { continue; }
                if (is_manual || is_emp) {
                    if let Some(&val) = actual_r.get(code.as_str()) {
                        input_values.insert(code.clone(), (val, 0.0));
                    }
                }
            }
            // Pass day-count rubriques as explicit inputs to match PCPAIE behavior
            for code in &["026", "033", "060", "065", "089", "099"] {
                let val = actual_r.get(*code).copied().unwrap_or(0.0);
                if actual_r.contains_key(*code) || header_codes.contains(*code) {
                    let pass_val = if val == 0.0 && *code == "033" { 0.0001 } else { val };
                    input_values.insert(code.to_string(), (pass_val, 0.0));
                }
            }
            // Always pass R033=0.0001 if not already set, to prevent compute_absent_days
            if !input_values.contains_key("033") {
                input_values.insert("033".to_string(), (0.0001, 0.0));
            }

            // Run calculation
            let result = match calculator::calculate_salary(&conn, *emp_id, mois, &input_values) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("Calc error for {} {}: {}", matricule, mois, e);
                    continue;
                }
            };

            // Compare
            let mut mois_mismatches = 0;
            for line in &result.lines {
                let code = &line.code;
                if let Some(&actual) = actual_r.get(code) {
                    let calc = line.amount;
                    let diff = (actual - calc).abs();
                    let tol = if actual.abs() > 10.0 { 1.0 } else { 0.01 };
                    total_cmp += 1;
                    if diff <= tol {
                        total_match += 1;
                    } else {
                        total_mismatch += 1;
                        mois_mismatches += 1;
                        mismatches.push((format!("{} {}", matricule, mois), code.clone(), actual, calc));
                    }
                }
            }
            if mois_mismatches > 0 {
                eprintln!("  {} {}: {} mismatches", matricule, mois, mois_mismatches);
            }
        }
    }

    eprintln!("\n{}", "=".repeat(70));
    eprintln!("Total comparisons: {}", total_cmp);
    eprintln!("Matches: {} ({:.1}%)", total_match, 100.0 * total_match as f64 / total_cmp as f64);
    eprintln!("Mismatches: {} ({:.1}%)", total_mismatch, 100.0 * total_mismatch as f64 / total_cmp as f64);

    // Show R655 specifically
    let r655_matches = mismatches.iter().filter(|(_, c, _, _)| c == "655").count();
    eprintln!("\nR655 mismatches: {}", r655_matches);
    // Print details for top mismatched rubriques
    for target_code in &["005", "010", "765", "770", "767", "660", "665", "500", "650", "652", "763"] {
        let cnt = mismatches.iter().filter(|(_, c, _, _)| c == target_code).count();
        if cnt > 0 {
            eprintln!("\nR{} mismatches ({}):", target_code, cnt);
            for (label, code, actual, calc) in &mismatches {
                if code == target_code {
                    eprintln!("  {} actual={:.2} calc={:.2} diff={:.2}", label, actual, calc, (actual - calc).abs());
                }
            }
        }
    }

    // Show top mismatches by rubrique code
    use std::collections::HashMap as StdMap;
    let mut rub_counts: StdMap<String, usize> = StdMap::new();
    for (_, code, _, _) in &mismatches {
        *rub_counts.entry(code.clone()).or_insert(0) += 1;
    }
    let mut sorted: Vec<_> = rub_counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    eprintln!("\nTop mismatched rubriques:");
    for (code, cnt) in sorted.iter().take(15) {
        eprintln!("  R{}: {} mismatches", code, cnt);
    }

    // Show top mismatches by difference
    mismatches.sort_by(|a, b| (b.2 - b.3).abs().partial_cmp(&(a.2 - a.3).abs()).unwrap());
    eprintln!("\nTop 10 mismatches by difference:");
    for (label, code, actual, calc) in mismatches.iter().take(10) {
        eprintln!("  {} R{} actual={:.2} calc={:.2} diff={:.2}", label, code, actual, calc, (actual - calc).abs());
    }

    // Assert R655 has zero mismatches
    assert_eq!(r655_matches, 0, "R655 should have 0 mismatches");
}
