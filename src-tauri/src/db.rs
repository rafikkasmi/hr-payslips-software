use rusqlite::Connection;
use std::fs;
use std::path::Path;

pub fn get_db_path(app_data_dir: &str) -> String {
    let dir = Path::new(app_data_dir);
    fs::create_dir_all(dir).ok();
    dir.join("hamtech_paie.db").to_string_lossy().to_string()
}

pub fn init_db(db_path: &str) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
        PRAGMA synchronous=NORMAL;
        PRAGMA cache_size=-64000;
        PRAGMA mmap_size=268435456;
        PRAGMA temp_store=MEMORY;
        PRAGMA busy_timeout=5000;
        "#,
    )?;
    create_schema(&conn)?;
    create_indexes(&conn)?;
    Ok(conn)
}

pub fn is_initialized(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key='initialized'",
        [],
        |row| row.get::<_, String>(0),
    )
    .map(|v| v == "true")
    .unwrap_or(false)
}

fn create_indexes(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        -- Employees
        CREATE INDEX IF NOT EXISTS idx_employees_actif ON employees(actif);
        CREATE INDEX IF NOT EXISTS idx_employees_nom ON employees(nom, prenom);
        CREATE INDEX IF NOT EXISTS idx_employees_section ON employees(section);
        CREATE INDEX IF NOT EXISTS idx_employees_structure ON employees(structure);
        CREATE INDEX IF NOT EXISTS idx_employees_poste ON employees(poste_id);

        -- Salary calculations
        CREATE INDEX IF NOT EXISTS idx_salary_emp_period ON salary_calculations(employee_id, period);
        CREATE INDEX IF NOT EXISTS idx_salary_period ON salary_calculations(period);

        -- Salary lines
        CREATE INDEX IF NOT EXISTS idx_salary_lines_calc ON salary_lines(calculation_id);

        -- Employee rubriques
        CREATE INDEX IF NOT EXISTS idx_emp_rub_emp ON employee_rubriques(employee_id);
        CREATE INDEX IF NOT EXISTS idx_emp_rub_code ON employee_rubriques(rubrique_code);

        -- Bonuses
        CREATE INDEX IF NOT EXISTS idx_bonuses_status ON bonuses(status);
        CREATE INDEX IF NOT EXISTS idx_bonuses_period ON bonuses(pay_period);
        CREATE INDEX IF NOT EXISTS idx_bonuses_target ON bonuses(target_type, target_value);

        -- Bonus assignments
        CREATE INDEX IF NOT EXISTS idx_bonus_assign_bonus ON bonus_assignments(bonus_id);
        CREATE INDEX IF NOT EXISTS idx_bonus_assign_emp ON bonus_assignments(employee_id);

        -- Bonus applications
        CREATE INDEX IF NOT EXISTS idx_bonus_app_bonus_emp ON bonus_applications(bonus_id, employee_id);
        CREATE INDEX IF NOT EXISTS idx_bonus_app_period ON bonus_applications(period);

        -- Bonus skips
        CREATE INDEX IF NOT EXISTS idx_bonus_skips_period ON bonus_skips(period);
        CREATE INDEX IF NOT EXISTS idx_bonus_skips_bonus ON bonus_skips(bonus_id);

        -- Attendance
        CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, punch_datetime);
        CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(punch_datetime);

        -- Leaves
        CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(employee_id);
        CREATE INDEX IF NOT EXISTS idx_leaves_dates ON leaves(start_date, end_date);

        -- Overtime
        CREATE INDEX IF NOT EXISTS idx_overtime_emp_date ON overtime_entries(employee_id, date);
        CREATE INDEX IF NOT EXISTS idx_overtime_monthly_emp_period ON overtime_monthly(employee_id, period);

        -- Paies (legacy)
        CREATE INDEX IF NOT EXISTS idx_paies_emp ON paies(employee_id);
        CREATE INDEX IF NOT EXISTS idx_paies_mois ON paies(mois);

        -- Postes
        CREATE INDEX IF NOT EXISTS idx_poste_rub_poste ON poste_rubriques(poste_id);
        "#,
    )?;
    Ok(())
}

fn create_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        -- App settings (key-value)
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        -- Employees (from PERS0)
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matricule TEXT UNIQUE NOT NULL,
            nom TEXT,
            prenom TEXT,
            sit_fam TEXT,
            nbre_enf REAL DEFAULT 0,
            naiss_date TEXT,
            dte_entree TEXT,
            dte_sortie TEXT,
            actif INTEGER DEFAULT 1,
            sexe TEXT,
            no_grille TEXT,
            categorie TEXT,
            section TEXT,
            echelon TEXT,
            classe TEXT,
            structure TEXT,
            unite TEXT,
            affectatio TEXT,
            contrat TEXT,
            sect1 TEXT,
            code_caisss TEXT,
            org_payeur TEXT,
            org_pemploy TEXT,
            code_irg REAL,
            code_cnas REAL,
            no_cnas INTEGER,
            n_secu_sle TEXT,
            no_compte TEXT,
            cod_regl REAL,
            -- Pointeuse linking
            pointeuse_pin INTEGER,
            -- Shift assignment
            shift_id INTEGER,
            -- Extra fields from PERS2
            adresse TEXT,
            adresse2 TEXT,
            telephone TEXT,
            e_mail TEXT,
            n_id_nat TEXT,
            naiss_lieu TEXT,
            n_act_nais TEXT,
            comun_nais TEXT,
            code_post TEXT,
            fil_p_pere TEXT,
            fil_n_mere TEXT,
            fil_p_mere TEXT,
            filiation TEXT,
            cnationalt TEXT,
            conj_nom TEXT,
            conj_datem TEXT,
            nom_p_conj TEXT,
            cin_no TEXT,
            cin_d_le TEXT,
            cin_d_a TEXT,
            pc_no TEXT,
            pc_d_le TEXT,
            pc_d_a TEXT,
            pass_no TEXT,
            pass_d_le TEXT,
            pass_d_a TEXT,
            remarque TEXT,
            groupage TEXT,
            date_fnc TEXT,
            date_sec TEXT,
            date_das TEXT,
            date_unt TEXT,
            date_aff TEXT,
            date_dip TEXT,
            date_cat TEXT,
            date_emp TEXT,
            date_at1 TEXT,
            date_at2 TEXT,
            date_at3 TEXT,
            note_fnc TEXT,
            note_sec TEXT,
            note_das TEXT,
            note_unt TEXT,
            note_aff TEXT,
            note_dip TEXT,
            note_cat TEXT,
            note_emp TEXT,
            note_at1 TEXT,
            note_at2 TEXT,
            note_at3 TEXT,
            note_con TEXT,
            note_mtf TEXT,
            -- Extra PERS0 fields
            motif_sort TEXT,
            dte_cont_d TEXT,
            dte_cont_f TEXT,
            dte_repris TEXT,
            nbr_enfp10 REAL DEFAULT 0,
            nbr_enfm10 REAL DEFAULT 0,
            no_mutuel TEXT,
            mutu_dted TEXT,
            mutu_dtef TEXT,
            conj_trav TEXT,
            ok_intemp INTEGER DEFAULT 0,
            ok_nat_etr INTEGER DEFAULT 0,
            attrib1 TEXT,
            attrib2 TEXT,
            attrib3 TEXT,
            categ_sp TEXT,
            diplome TEXT,
            code_grill TEXT,
            gestion REAL,
            lock_val INTEGER DEFAULT 0,
            conge INTEGER DEFAULT 0,
            sorti INTEGER DEFAULT 0,
            -- PERS0 extra fields (previously forgotten)
            nbr_enf_af REAL DEFAULT 0,
            nbr_prs_ch REAL DEFAULT 0,
            no_profil REAL DEFAULT 0,
            -- DAS (site/lieu de travail) and EMP (niveau scolarité)
            site_code TEXT,
            scolarite_code TEXT,
            -- PERS1 extra fields (congés, notes, jours ouvrables)
            conge_du_j REAL DEFAULT 0,
            conge_du_c REAL DEFAULT 0,
            conge_du_i REAL DEFAULT 0,
            conge_pr_j REAL DEFAULT 0,
            conge_pr_c REAL DEFAULT 0,
            conge_pr_i REAL DEFAULT 0,
            conge_ad_j REAL DEFAULT 0,
            conge_ad_c REAL DEFAULT 0,
            conge_ad_i REAL DEFAULT 0,
            conge_ok INTEGER DEFAULT 0,
            notep TEXT,
            anotep TEXT,
            nbr_jr_ouv REAL DEFAULT 0,
            nbr_hr_ouv REAL DEFAULT 0,
            pret_obs1 TEXT,
            pret_obs2 TEXT,
            -- PERS2 extra fields (previously forgotten)
            memoire1 TEXT,
            memoire2 TEXT,
            -- Timestamps
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (shift_id) REFERENCES shifts(id)
        );

        -- Employee rubrique assignments (from PERS1: which rubriques apply to each employee)
        CREATE TABLE IF NOT EXISTS employee_rubriques (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            rubrique_code TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        -- Rubriques (payroll calculation rules)
        CREATE TABLE IF NOT EXISTS rubriques (
            code TEXT PRIMARY KEY,
            libelle TEXT,
            alibelle TEXT,
            formule TEXT,
            classe REAL,
            v_min REAL,
            v_max REAL,
            is_init INTEGER DEFAULT 0,
            is_regular INTEGER DEFAULT 0,
            is_brut INTEGER DEFAULT 0,
            is_impos INTEGER DEFAULT 0,
            is_secu_s INTEGER DEFAULT 0,
            is_total INTEGER DEFAULT 0,
            is_imp INTEGER DEFAULT 0,
            ord_bul REAL,
            ord_clc REAL,
            ord_rec REAL,
            ord_jrn REAL,
            is_locked INTEGER DEFAULT 0,
            calcul INTEGER DEFAULT 0,
            manuelle INTEGER DEFAULT 0,
            init_val REAL DEFAULT 0,
            precision TEXT,
            image TEXT,
            par_1 REAL,
            par_2 REAL,
            rc_nb_base TEXT,
            pointer TEXT,
            type_pcc REAL,
            cd_nb_base TEXT,
            cd_taux TEXT,
            br_comp TEXT,
            br_tiers TEXT,
            br_comp_d TEXT,
            br_tiers_d TEXT,
            br_comp_c TEXT,
            br_tiers_c TEXT,
            trans_cod REAL,
            n_arrondir INTEGER DEFAULT 0,
            recalc_ok INTEGER DEFAULT 0,
            is_imp_b REAL,
            user_code TEXT
        );

        -- Payroll history (from PAIES)
        CREATE TABLE IF NOT EXISTS paies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            mois TEXT NOT NULL,
            matricule TEXT,
            montants TEXT,
            sit_fam TEXT,
            nbre_enf REAL,
            no_grille TEXT,
            code_irg REAL,
            code_cnas REAL,
            nbr_enf_af REAL,
            nbr_prs_ch REAL,
            nbr_jr_ouv REAL,
            nbr_hr_ouv REAL,
            sect1 TEXT,
            structure TEXT,
            classe TEXT,
            unite TEXT,
            affectatio TEXT,
            c_date TEXT,
            c_time TEXT,
            imported_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        -- Shifts (work schedules)
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            shift_type TEXT NOT NULL DEFAULT 'standard',
            -- 'standard': fixed days with weekends
            -- 'rotation': work N days, rest N days
            -- 'night': night shift
            -- '3x8': 3 shifts of 8 hours
            -- 'part_time': part time
            -- Config stored as JSON
            config TEXT DEFAULT '{}',
            -- For standard: {"work_days":[1,2,3,4,5], "weekend_days":[6,7], "start_time":"08:00", "end_time":"17:00"}
            -- For rotation: {"work_days":3, "rest_days":3, "start_time":"08:00", "end_time":"17:00"}
            -- For night: {"work_days":[1,2,3,4,5], "start_time":"22:00", "end_time":"06:00"}
            -- For 3x8: {"shifts":[{"start":"06:00","end":"14:00"},{"start":"14:00","end":"22:00"},{"start":"22:00","end":"06:00"}]}
            -- For part_time: {"work_days":[1,2,3,4,5], "start_time":"08:00", "end_time":"12:00"}
            hourly_rate REAL DEFAULT 0,
            monthly_hours REAL DEFAULT 173.33,
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- Attendance records (from pointeuse attlog)
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER,
            pointeuse_pin INTEGER,
            punch_datetime TEXT NOT NULL,
            verify_mode INTEGER DEFAULT 0,
            work_code INTEGER DEFAULT 0,
            device_id TEXT,
            imported_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
        );

        -- Index for fast lookups
        CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_pin ON attendance(pointeuse_pin);
        CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(punch_datetime);

        -- Leaves (congés)
        CREATE TABLE IF NOT EXISTS leaves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            leave_type TEXT NOT NULL,
            -- 'annual', 'sick', 'unpaid', 'maternity', 'special'
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            days_count REAL,
            reason TEXT,
            status TEXT DEFAULT 'approved',
            -- 'pending', 'approved', 'rejected'
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        -- Bonuses and deductions
        CREATE TABLE IF NOT EXISTS bonuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            bonus_type TEXT NOT NULL,
            -- 'bonus' or 'deduction'
            amount REAL NOT NULL,
            is_percentage INTEGER DEFAULT 0,
            -- If 1, amount is a percentage of base salary
            rubrique_code TEXT,
            -- Which rubrique to map this to in calculation
            target_type TEXT NOT NULL DEFAULT 'individual',
            -- 'individual', 'department', 'region', 'area', 'all'
            target_value TEXT,
            -- For department: the dept name; for individual: employee_id; etc.
            pay_period TEXT,
            -- Which month this applies to (YYYY-MM), NULL = all months
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- Bonus assignments (for individual targets)
        CREATE TABLE IF NOT EXISTS bonus_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bonus_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            FOREIGN KEY (bonus_id) REFERENCES bonuses(id) ON DELETE CASCADE,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        -- Salary calculations (generated each month)
        CREATE TABLE IF NOT EXISTS salary_calculations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            period TEXT NOT NULL,
            -- YYYY-MM
            matricule TEXT,
            results_json TEXT,
            -- Full calculation results as JSON
            total_brut REAL DEFAULT 0,
            total_gains REAL DEFAULT 0,
            total_retenues REAL DEFAULT 0,
            net_payer REAL DEFAULT 0,
            base_cotisable REAL DEFAULT 0,
            base_imposable REAL DEFAULT 0,
            irg REAL DEFAULT 0,
            status TEXT DEFAULT 'calculated',
            -- 'draft', 'calculated', 'validated', 'paid'
            calculated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            UNIQUE(employee_id, period)
        );

        -- Salary calculation lines (individual rubrique results)
        CREATE TABLE IF NOT EXISTS salary_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            calculation_id INTEGER NOT NULL,
            rubrique_code TEXT NOT NULL,
            rubrique_libelle TEXT,
            classe REAL,
            amount REAL DEFAULT 0,
            is_input INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (calculation_id) REFERENCES salary_calculations(id) ON DELETE CASCADE
        );

        -- Global parameters (T variables from PCPAIE)
        CREATE TABLE IF NOT EXISTS global_params (
            key TEXT PRIMARY KEY,
            value REAL
        );

        -- Salary calculation settings (global parameterization)
        CREATE TABLE IF NOT EXISTS salary_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Lookup values (from VALEURS table)
        CREATE TABLE IF NOT EXISTS lookup_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            code TEXT NOT NULL,
            libelle TEXT,
            aux_nom TEXT,
            compte TEXT,
            compte_ccp TEXT,
            no_agence TEXT,
            selection INTEGER DEFAULT 0,
            UNIQUE(table_name, code)
        );

        -- Company info (from DOSSIER)
        CREATE TABLE IF NOT EXISTS company_info (
            id INTEGER PRIMARY KEY DEFAULT 1,
            doss_nom TEXT,
            doss_rue TEXT,
            doss_vil TEXT,
            doss_nsecu TEXT,
            doss_skey1 TEXT,
            doss_skey2 TEXT,
            doss_skey3 TEXT,
            doss_skey4 TEXT,
            doss_nger TEXT,
            doss_pger TEXT,
            clot_mois REAL,
            clot_annee REAL
        );

        -- Postes (Jobs) - auto-derived from employee rubrique clusters or PCPAIE FNC
        CREATE TABLE IF NOT EXISTS postes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            fnc_code TEXT,  -- PCPAIE function code (lookup_values FNC)
            is_manual INTEGER DEFAULT 0,  -- 0 = from PCPAIE, 1 = user-created
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(fnc_code)
        );

        -- Poste rubrique defaults (fixed rubriques per poste)
        CREATE TABLE IF NOT EXISTS poste_rubriques (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poste_id INTEGER NOT NULL,
            rubrique_code TEXT NOT NULL,
            default_value REAL DEFAULT 0,
            is_fixed INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (poste_id) REFERENCES postes(id) ON DELETE CASCADE,
            UNIQUE(poste_id, rubrique_code)
        );

        -- Poste statistics cache (computed from latest payslip per employee)
        CREATE TABLE IF NOT EXISTS poste_stats (
            poste_id INTEGER PRIMARY KEY,
            employee_count INTEGER DEFAULT 0,
            active_count INTEGER DEFAULT 0,
            avg_seniority_years REAL DEFAULT 0,
            total_brut REAL DEFAULT 0,
            total_net REAL DEFAULT 0,
            avg_brut REAL DEFAULT 0,
            last_period TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (poste_id) REFERENCES postes(id) ON DELETE CASCADE
        );

        -- Employee salary history (track all changes to rubrique values)
        CREATE TABLE IF NOT EXISTS employee_salary_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            rubrique_code TEXT NOT NULL,
            old_value REAL,
            new_value REAL,
            change_date TEXT DEFAULT (datetime('now')),
            reason TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        -- Field mappings: configurable PCPAIE field -> employee column + lookup table
        CREATE TABLE IF NOT EXISTS field_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            logical_name TEXT NOT NULL UNIQUE,  -- e.g. "categorie_socio_pro"
            display_label TEXT NOT NULL,         -- e.g. "Catégorie socio-pro"
            employee_column TEXT NOT NULL,       -- e.g. "categ_sp"
            lookup_table TEXT,                   -- e.g. "CAT" or NULL for raw value
            section TEXT DEFAULT 'Professionnel', -- UI section in employee detail
            sort_order INTEGER DEFAULT 0,
            is_visible INTEGER DEFAULT 1
        );

        -- Employee rubrique overrides (individual values that override poste defaults)
        CREATE TABLE IF NOT EXISTS employee_rubrique_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            rubrique_code TEXT NOT NULL,
            value REAL NOT NULL,
            effective_from TEXT DEFAULT (datetime('now')),
            effective_to TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_emp_overrides_current ON employee_rubrique_overrides(employee_id, rubrique_code) WHERE effective_to IS NULL;

        -- Overtime entries (daily)
        CREATE TABLE IF NOT EXISTS overtime_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            hours_50 REAL DEFAULT 0,
            hours_100 REAL DEFAULT 0,
            source TEXT DEFAULT 'manual',
            note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        -- Overtime monthly aggregates
        CREATE TABLE IF NOT EXISTS overtime_monthly (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            period TEXT NOT NULL,
            total_hours_50 REAL DEFAULT 0,
            total_hours_100 REAL DEFAULT 0,
            source TEXT DEFAULT 'manual',
            status TEXT DEFAULT 'draft',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            UNIQUE(employee_id, period)
        );

        -- Extended bonus tables (Phase 6)
        CREATE TABLE IF NOT EXISTS bonus_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bonus_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            period TEXT NOT NULL,
            status TEXT DEFAULT 'applied',
            applied_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (bonus_id) REFERENCES bonuses(id) ON DELETE CASCADE,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            UNIQUE(bonus_id, employee_id, period)
        );

        CREATE TABLE IF NOT EXISTS bonus_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bonus_id INTEGER NOT NULL,
            target_type TEXT NOT NULL,
            target_value TEXT,
            FOREIGN KEY (bonus_id) REFERENCES bonuses(id) ON DELETE CASCADE
        );

        -- Bonus skips (pause a bonus for a specific period)
        CREATE TABLE IF NOT EXISTS bonus_skips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bonus_id INTEGER NOT NULL,
            period TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (bonus_id) REFERENCES bonuses(id) ON DELETE CASCADE,
            UNIQUE(bonus_id, period)
        );

        -- Pointeuse users
        CREATE TABLE IF NOT EXISTS pointeuse_users (
            pin INTEGER PRIMARY KEY,
            name TEXT,
            privilege INTEGER DEFAULT 0,
            imported_at TEXT DEFAULT (datetime('now'))
        );

        -- Employee children (from ENFANTS.DTA)
        CREATE TABLE IF NOT EXISTS employee_children (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER,
            matricule TEXT,
            prenom TEXT,
            nais_date TEXT,
            scolarise TEXT,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_children_emp ON employee_children(employee_id);

        -- Leave history (from CONGES.DTA — 1.59M records)
        CREATE TABLE IF NOT EXISTS leave_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matricule TEXT NOT NULL,
            date TEXT,
            mois TEXT,
            jours REAL,
            libelle TEXT,
            alibelle TEXT,
            cotisable REAL,
            imposable REAL,
            sens TEXT,
            FOREIGN KEY (matricule) REFERENCES employees(matricule) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_leave_hist_mat ON leave_history(matricule);
        CREATE INDEX IF NOT EXISTS idx_leave_hist_mois ON leave_history(mois);

        -- Employee loans (from PRETS.DTA)
        CREATE TABLE IF NOT EXISTS employee_loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matricule TEXT NOT NULL,
            code_rub TEXT,
            mois TEXT,
            date TEXT,
            libelle TEXT,
            montant REAL,
            sens TEXT,
            no_pret INTEGER,
            FOREIGN KEY (matricule) REFERENCES employees(matricule) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_loans_mat ON employee_loans(matricule);

        -- Salary grid (from GRILLE.DTA)
        CREATE TABLE IF NOT EXISTS salary_grid (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            montant REAL,
            i_e_p REAL,
            indice REAL,
            code TEXT,
            no_grille TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_grid_code ON salary_grid(code);
        CREATE INDEX IF NOT EXISTS idx_grid_no ON salary_grid(no_grille);

        -- Career events (from EVENTS.DTA)
        CREATE TABLE IF NOT EXISTS career_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matricule TEXT NOT NULL,
            libelle TEXT,
            alibelle TEXT,
            date TEXT,
            heure TEXT,
            codop TEXT,
            FOREIGN KEY (matricule) REFERENCES employees(matricule) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_events_mat ON career_events(matricule);

        -- Pay periods reference (from PAIE_REF.DTA)
        CREATE TABLE IF NOT EXISTS pay_periods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mois TEXT UNIQUE,
            libelle TEXT,
            alibelle TEXT,
            signe TEXT
        );

        -- Employee rubrique values (from PERS1 VAL_RUB01-120)
        CREATE TABLE IF NOT EXISTS employee_rubrique_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            rubrique_code TEXT NOT NULL,
            value REAL DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            UNIQUE(employee_id, rubrique_code)
        );
        CREATE INDEX IF NOT EXISTS idx_rubval_emp ON employee_rubrique_values(employee_id);

        -- System parameters (from PARAMETR.DTA)
        CREATE TABLE IF NOT EXISTS system_params (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            par_key TEXT UNIQUE NOT NULL,
            par_val TEXT
        );

        -- PCPAIE users (from USERSN.DTA)
        CREATE TABLE IF NOT EXISTS pcpaie_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            nom TEXT,
            passe TEXT,
            mois_curnt TEXT,
            no_salar REAL DEFAULT 0
        );

        -- Indexes for poste/employee linking (non-dependent)
        CREATE INDEX IF NOT EXISTS idx_employees_sect1 ON employees(sect1);

        -- Indexes on paies (1.5M records) — critical for seed_postes performance
        CREATE INDEX IF NOT EXISTS idx_paies_emp ON paies(employee_id);
        CREATE INDEX IF NOT EXISTS idx_paies_emp_mois ON paies(employee_id, mois DESC);
        CREATE INDEX IF NOT EXISTS idx_paies_mois ON paies(mois);

        -- Missing indexes identified by audit (ones that don't depend on migrations)
        CREATE INDEX IF NOT EXISTS idx_salary_calc_period ON salary_calculations(period);
        CREATE INDEX IF NOT EXISTS idx_poste_rubriques_poste ON poste_rubriques(poste_id);
        CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leaves(employee_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, punch_datetime);
        "#,
    )?;

    // Run schema migrations inside a transaction so the database is never left
    // in a half-migrated state if one of the ALTER TABLE statements fails.
    conn.execute_batch("BEGIN")?;
    let migration_result: rusqlite::Result<()> = (|| {
        // Add poste_id column to employees if not exists
        let has_poste_id: bool = conn
            .prepare("PRAGMA table_info(employees)")?
            .query_map([], |r| r.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .any(|col| col == "poste_id");
        if !has_poste_id {
            conn.execute("ALTER TABLE employees ADD COLUMN poste_id INTEGER REFERENCES postes(id)", [])?;
        }

        // Add fnc_code/is_manual columns to postes if not exists
        let poste_cols: Vec<String> = conn
            .prepare("PRAGMA table_info(postes)")?
            .query_map([], |r| r.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        for (col, def) in [("fnc_code", "TEXT"), ("is_manual", "INTEGER DEFAULT 0")] {
            if !poste_cols.iter().any(|c| c == col) {
                conn.execute(&format!("ALTER TABLE postes ADD COLUMN {} {}", col, def), [])?;
            }
        }

        // Add site_code/scolarite_code columns to employees if not exists
        let emp_cols: Vec<String> = conn
            .prepare("PRAGMA table_info(employees)")?
            .query_map([], |r| r.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        for (col, def) in [("site_code", "TEXT"), ("scolarite_code", "TEXT")] {
            if !emp_cols.iter().any(|c| c == col) {
                conn.execute(&format!("ALTER TABLE employees ADD COLUMN {} {}", col, def), [])?;
            }
        }

        // Seed default field_mappings if empty
        let mapping_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM field_mappings", [], |r| r.get(0))
            .unwrap_or(0);
        if mapping_count == 0 {
            let defaults = [
                ("fonction", "Fonction", "sect1", "FNC", "Professionnel", 1),
                ("categorie_socio_pro", "Catégorie socio-pro", "categ_sp", "CAT", "Professionnel", 2),
                ("corps_metier", "Corps/Groupe métier", "categorie", "CON", "Professionnel", 3),
                ("famille_departement", "Famille/Département", "structure", "SEC", "Professionnel", 4),
                ("niveau_hierarchique", "Niveau hiérarchique", "unite", "UNT", "Professionnel", 5),
                ("niveau_etude", "Niveau d'étude", "affectatio", "AFF", "Professionnel", 6),
                ("diplome", "Diplôme", "diplome", "DIP", "Professionnel", 7),
                ("site", "Site/Lieu de travail", "site_code", "DAS", "Professionnel", 8),
                ("etablissement", "Établissement", "attrib1", "AT1", "Professionnel", 9),
                ("service", "Service/Département", "attrib2", "AT2", "Professionnel", 10),
                ("lieu_precis", "Lieu précis", "attrib3", "AT3", "Professionnel", 11),
                ("niveau_scolarite", "Niveau scolarité", "scolarite_code", "EMP", "Professionnel", 12),
                ("banque", "Banque", "org_payeur", "BNQ", "Sécurité sociale & Banque", 1),
                ("motif_sortie", "Motif de sortie", "motif_sort", "MTF", "Professionnel", 13),
            ];
            for (logical, label, col, lookup, section, order) in &defaults {
                conn.execute(
                    "INSERT OR IGNORE INTO field_mappings (logical_name, display_label, employee_column, lookup_table, section, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, 1)",
                    rusqlite::params![logical, label, col, lookup, section, order],
                )?;
            }
        }

        // Add extended bonus columns if they don't exist
        let bonus_cols: Vec<String> = conn
            .prepare("PRAGMA table_info(bonuses)")?
            .query_map([], |r| r.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        let new_bonus_cols = [
            ("is_imposable", "INTEGER DEFAULT 0"),
            ("is_cotisable", "INTEGER DEFAULT 0"),
            ("recurrence_type", "TEXT DEFAULT 'one_time'"),
            ("recurrence_count", "INTEGER DEFAULT 0"),
            ("is_absence_dependent", "INTEGER DEFAULT 0"),
            ("absence_divisor", "REAL DEFAULT 22.0"),
            ("amount_type", "TEXT DEFAULT 'fixed'"),
            ("income_grid_min", "REAL"),
            ("income_grid_max", "REAL"),
            ("contract_types", "TEXT"),
        ];
        for (col, def) in &new_bonus_cols {
            if !bonus_cols.iter().any(|c| c == col) {
                conn.execute(&format!("ALTER TABLE bonuses ADD COLUMN {} {}", col, def), [])?;
            }
        }
        Ok(())
    })();
    match migration_result {
        Ok(()) => conn.execute_batch("COMMIT")?,
        Err(e) => {
            // Best-effort rollback; ignore rollback errors and surface the original failure
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
    }

    // Indexes that depend on migrated columns (poste_id, fnc_code, bonuses columns)
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_employees_poste ON employees(poste_id);
        CREATE INDEX IF NOT EXISTS idx_postes_fnc ON postes(fnc_code);
        CREATE INDEX IF NOT EXISTS idx_bonuses_status ON bonuses(status);
        CREATE INDEX IF NOT EXISTS idx_bonuses_created ON bonuses(created_at DESC);
        "#,
    )?;

    Ok(())
}
