use app_lib::calculator;
use rusqlite::Connection;
use std::collections::HashMap;

#[test]
#[ignore]
fn test_r655_details() {
    let db_path = "/home/rafik/.local/share/com.hamtech.paie/hamtech_paie.db";
    let conn = Connection::open(db_path).unwrap();

    let rubriques = calculator::load_rubriques(&conn).unwrap();

    let employees: Vec<(i64, String)> = conn
        .prepare("SELECT id, matricule FROM employees ORDER BY matricule LIMIT 20")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    let mut r655_mismatches: Vec<(String, String, f64, f64)> = Vec::new();

    for (emp_id, matricule) in &employees {
        let emp_rub_codes: std::collections::HashSet<String> = conn
            .prepare("SELECT rubrique_code FROM employee_rubriques WHERE employee_id=?")
            .unwrap()
            .query_map([emp_id], |r| Ok(r.get::<_, String>(0)?))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        let payslips: Vec<(String, String)> = conn
            .prepare("SELECT mois, montants FROM paies WHERE employee_id=? AND mois != 'TOT-PAIE' ORDER BY mois")
            .unwrap()
            .query_map([emp_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        for (mois, montants) in &payslips {
            if montants.is_empty() { continue; }

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
                    // Header line may also contain text - skip data line parsing
                    continue;
                }
                if line.starts_with('R') && line.len() > 4 {
                    let code = &line[1..4];
                    if let Ok(val) = line[4..].trim().parse::<f64>() {
                        actual_r.insert(code.to_string(), val);
                    }
                }
            }

            let mut input_values: HashMap<String, (f64, f64)> = HashMap::new();
            for rub in &rubriques {
                let code = &rub.code;
                let is_manual = rub.manuelle || rub.formule.as_ref().map_or(true, |f| f.trim().is_empty());
                let is_emp = emp_rub_codes.contains(&format!("R{}", code));
                if rub.classe == 5.0 { continue; }
                if is_manual || is_emp {
                    if let Some(&val) = actual_r.get(code.as_str()) {
                        input_values.insert(code.clone(), (val, 0.0));
                    }
                }
            }
            for code in &["026", "033", "060", "065", "089", "099"] {
                let val = actual_r.get(*code).copied().unwrap_or(0.0);
                // Pass value if in data lines OR in header (zero value in payslip)
                if actual_r.contains_key(*code) || header_codes.contains(*code) {
                    // Use small non-zero for R033=0 to prevent compute_absent_days override
                    // R060 must stay 0 so it doesn't trigger R099 inclusion in R655
                    let pass_val = if val == 0.0 && *code == "033" { 0.0001 } else { val };
                    input_values.insert(code.to_string(), (pass_val, 0.0));
                }
            }
            // Always pass R033=0.0001 if not already set, to prevent compute_absent_days
            // from computing non-zero absences for historical payslips where R033=0
            if !input_values.contains_key("033") {
                input_values.insert("033".to_string(), (0.0001, 0.0));
            }

            let result = match calculator::calculate_salary(&conn, *emp_id, mois, &input_values) {
                Ok(r) => r,
                Err(_) => continue,
            };

            if let Some(&actual) = actual_r.get("655") {
                if let Some(calc_line) = result.lines.iter().find(|l| l.code == "655") {
                    let diff = (actual - calc_line.amount).abs();
                    if diff > 0.01 {
                        // Get context values
                        let r026 = actual_r.get("026").copied().unwrap_or(0.0);
                        let r099 = actual_r.get("099").copied().unwrap_or(0.0);
                        let r060 = actual_r.get("060").copied().unwrap_or(0.0);
                        let r033 = actual_r.get("033").copied().unwrap_or(0.0);
                        let r065 = actual_r.get("065").copied().unwrap_or(0.0);
                        r655_mismatches.push((
                            format!("{} {}", matricule, mois),
                            format!("R026={} R099={} R060={} R033={} R065={}", r026, r099, r060, r033, r065),
                            actual,
                            calc_line.amount,
                        ));
                    }
                }
            }
        }
    }

    eprintln!("R655 mismatches: {}", r655_mismatches.len());
    for (label, ctx, actual, calc) in r655_mismatches.iter().take(30) {
        eprintln!("  {} actual={:.4} calc={:.4} diff={:.4} [{}]", label, actual, calc, (actual - calc).abs(), ctx);
    }
}
