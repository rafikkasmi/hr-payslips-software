import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// Types
export interface AppStatus {
  initialized: boolean;
  pcpaie_path: string | null;
  employee_count: number;
  rubrique_count: number;
  paie_count: number;
}

export interface ImportResult {
  employees: number;
  rubriques: number;
  paies: number;
  lookups: number;
  errors: string[];
}

export interface PointeuseImportResult {
  users_imported: number;
  attlog_entries: number;
  unmatched_pins: number[];
  date_range_start?: string | null;
  date_range_end?: string | null;
  per_user_counts?: [number, string, number][];
}

/** Result of scanning a PCPAIE folder for importable files. */
export interface PcpaieFolderScan {
  folder_path: string;
  /** Detected PCPAIE SQLite database (validated to contain RUBRIQUE, PERS0, PAIES tables) */
  pcpaie_db: string | null;
  /** True if the folder contains native PCPAIE .DTA files (RUBRIQUEX.DTA, PERS0.DTA, etc.) */
  has_native_files: boolean;
  /** List of detected native .DTA file names */
  native_dta_files: string[];
  /** Other SQLite files found that are not PCPAIE databases */
  other_dbs: string[];
  /** Detected pointeuse user.dat file */
  user_dat: string | null;
  /** Detected pointeuse attlog*.dat files */
  attlog_files: string[];
  /** All file names found in the folder (for display) */
  all_files: string[];
}

/** Result of importing an entire PCPAIE folder (DB + optional pointeuse data). */
export interface FolderImportResult {
  pcpaie: ImportResult;
  pointeuse_imported: boolean;
  pointeuse_users: number;
  pointeuse_entries: number;
  pcpaie_db_path: string;
  pointeuse_errors: string[];
}

export interface FuzzyMatchResult {
  pin: number;
  pointeuse_name: string;
  best_employee_id: number | null;
  best_score: number;
  best_matricule: string | null;
  best_nom: string | null;
  best_prenom: string | null;
  confirmed: boolean;
}

export interface EmployeeSummary {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  actif: boolean;
  pointeuse_pin: number | null;
  shift_name: string | null;
  section: string | null;
  structure: string | null;
  affectatio: string | null;
  poste_name: string | null;
  fnc_code: string | null;
  sexe: string | null;
  sit_fam: string | null;
  categorie: string | null;
  unite: string | null;
  total_count: number;
}

export interface EmployeeFilterOptions {
  sections: string[];
  structures: string[];
  unites: string[];
  categories: string[];
  postes: { id: number; name: string }[];
  sexes: string[];
  contrats: string[];
  echelons: string[];
  classes: string[];
}

export interface EmployeeFilters {
  search?: string | null;
  actif_only?: boolean | null;
  poste_id?: number | null;
  section?: string | null;
  structure?: string | null;
  unite?: string | null;
  categorie?: string | null;
  sexe?: string | null;
  contrat?: string | null;
  echelon?: string | null;
  classe?: string | null;
  hire_date_from?: string | null;
  hire_date_to?: string | null;
  exit_date_from?: string | null;
  exit_date_to?: string | null;
  page?: number | null;
  page_size?: number | null;
}

export interface Shift {
  id: number;
  name: string;
  description: string | null;
  shift_type: string;
  config: string;
  hourly_rate: number;
  monthly_hours: number;
}

export interface CalcLine {
  code: string;
  libelle: string;
  classe: number;
  amount: number;
  is_input: boolean;
  is_secu_s?: boolean;
  is_impos?: boolean;
}

export interface AppliedBonus {
  id: number;
  title: string;
  amount: number;
  bonus_type: string;
  rubrique_code: string | null;
  is_percentage: boolean;
  computed_amount: number;
  is_imposable: boolean;
  is_cotisable: boolean;
}

export interface CalcResult {
  employee_id: number;
  matricule: string;
  employee_name: string;
  period: string;
  lines: CalcLine[];
  total_brut: number;
  total_gains: number;
  total_retenues: number;
  net_payer: number;
  base_cotisable: number;
  base_imposable: number;
  irg: number;
  applied_bonuses?: AppliedBonus[];
}

export interface Leave {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: string;
}

export interface Bonus {
  id: number;
  title: string;
  description: string | null;
  bonus_type: string;
  amount: number;
  is_percentage: boolean;
  rubrique_code: string | null;
  target_type: string;
  target_value: string | null;
  pay_period: string | null;
  status: string;
  recurrence_type?: string | null;
  recurrence_count?: number | null;
  is_imposable?: number | null;
  is_cotisable?: number | null;
  assigned_employees?: [number, string][] | null;
}

export interface AttendanceDay {
  date: string;
  day: number;
  weekday: string;
  status: string;
  leave_type: string | null;
  punches: number;
}

export interface SalaryHistoryEntry {
  id: number;
  employee_id: number | null;
  period: string;
  matricule: string | null;
  total_brut?: number;
  total_gains?: number;
  total_retenues?: number;
  net_payer?: number;
  base_cotisable?: number;
  base_imposable?: number;
  irg?: number;
  status?: string;
  calculated_at?: string;
  nom: string | null;
  prenom: string | null;
  source: string;
  sit_fam?: string | null;
  nbre_enf?: number | null;
  nbr_jr_ouv?: number | null;
  nbr_hr_ouv?: number | null;
  c_date?: string | null;
}

export interface HistoricalPayslipLine {
  code: string;
  amount: number;
}

export interface HistoricalPayslip {
  id: number;
  period: string | null;
  matricule: string | null;
  total_brut: number;
  net_payer: number;
  irg: number;
  total_retenues: number;
  base_cotisable: number;
  base_imposable: number;
  sit_fam: string | null;
  nbre_enf: number | null;
  nbr_jr_ouv: number | null;
  nbr_hr_ouv: number | null;
  c_date: string | null;
  nom: string | null;
  prenom: string | null;
  lines: HistoricalPayslipLine[];
  source: string;
}

export interface PosteSummary {
  id: number;
  name: string;
  description: string | null;
  fnc_code: string | null;
  is_manual: boolean;
  employee_count: number;
  active_count: number;
  avg_seniority_years: number;
  total_brut: number;
  total_net: number;
  avg_brut: number;
  last_period: string | null;
}

export interface PosteRubrique {
  rubrique_code: string;
  default_value: number;
  is_fixed: boolean;
  sort_order: number;
  libelle: string | null;
  classe: number | null;
  manuelle: boolean;
}

export interface PosteDetail {
  poste: { id: number; name: string; description: string | null; fnc_code: string | null; is_manual: boolean };
  rubriques: PosteRubrique[];
  employees: { id: number; matricule: string; nom: string; prenom: string; actif: boolean }[];
  stats: {
    employee_count: number;
    active_count: number;
    avg_seniority_years: number;
    total_brut: number;
    total_net: number;
    avg_brut: number;
    last_period: string | null;
  };
}

export interface EmployeeRubrique {
  rubrique_code: string;
  value: number;
  source: string;
  libelle: string | null;
}

export interface RubriqueHistoryEntry {
  id: number;
  rubrique_code: string;
  old_value: number | null;
  new_value: number | null;
  change_date: string | null;
  reason: string | null;
}

// API functions
export const api = {
  getAppStatus: () => invoke<AppStatus>("get_app_status"),

  importPcpaie: (path: string) =>
    invoke<ImportResult>("import_pcpaie_db", { pcpaiePath: path }),

  /** Scan a folder for PCPAIE-importable files (SQLite DB, user.dat, attlog*.dat). */
  scanPcpaieDir: (folderPath: string) =>
    invoke<PcpaieFolderScan>("scan_pcpaie_dir", { dirPath: folderPath }),

  /** Import all PCPAIE data from a folder: auto-detect DB + pointeuse files, then import everything. */
  importPcpaieFolder: (folderPath: string) =>
    invoke<FolderImportResult>("import_pcpaie_folder", { folderPath }),

  importPointeuse: (userDatPath: string, attlogPaths: string[]) =>
    invoke<PointeuseImportResult>("import_pointeuse_data", {
      userDatPath,
      attlogPaths,
    }),

  getFuzzyMatches: () => invoke<FuzzyMatchResult[]>("get_fuzzy_matches"),

  linkUserToEmployee: (pin: number, employeeId: number) =>
    invoke<void>("link_user_to_employee", { pin, employeeId }),

  clearPointeuseData: () => invoke<void>("clear_pointeuse_data"),

  autoMatchAll: (threshold?: number) =>
    invoke<number>("auto_match_all", { threshold: threshold ?? null }),

  bulkLinkUsers: (links: [number, number][]) =>
    invoke<number>("bulk_link_users", { links }),

  getEmployees: (filters: EmployeeFilters = {}) =>
    invoke<EmployeeSummary[]>("get_employees", {
      search: filters.search ?? null,
      actifOnly: filters.actif_only ?? null,
      posteId: filters.poste_id ?? null,
      section: filters.section ?? null,
      structure: filters.structure ?? null,
      unite: filters.unite ?? null,
      categorie: filters.categorie ?? null,
      sexe: filters.sexe ?? null,
      contrat: filters.contrat ?? null,
      echelon: filters.echelon ?? null,
      classe: filters.classe ?? null,
      hireDateFrom: filters.hire_date_from ?? null,
      hireDateTo: filters.hire_date_to ?? null,
      exitDateFrom: filters.exit_date_from ?? null,
      exitDateTo: filters.exit_date_to ?? null,
      page: filters.page ?? 1,
      pageSize: filters.page_size ?? 50,
    }),
  getEmployeeFilterOptions: () => invoke<EmployeeFilterOptions>("get_employee_filter_options"),

  getEmployeeDetail: (employeeId: number) =>
    invoke<Record<string, unknown>>("get_employee_detail", { employeeId }),

  getEmployeeChildren: (employeeId: number) =>
    invoke<Record<string, unknown>[]>("get_employee_children", { employeeId }),

  getEmployeeLeaveHistory: (matricule: string, limit?: number) =>
    invoke<Record<string, unknown>[]>("get_employee_leave_history", { matricule, limit }),

  getEmployeeLoans: (matricule: string) =>
    invoke<Record<string, unknown>[]>("get_employee_loans", { matricule }),

  getEmployeeEvents: (matricule: string) =>
    invoke<Record<string, unknown>[]>("get_employee_events", { matricule }),

  getPayPeriods: () =>
    invoke<Record<string, unknown>[]>("get_pay_periods"),

  getShifts: () => invoke<Shift[]>("get_shifts"),

  createShift: (
    name: string,
    description: string | null,
    shiftType: string,
    config: string,
    hourlyRate: number,
    monthlyHours: number,
  ) =>
    invoke<number>("create_shift", {
      name,
      description,
      shiftType,
      config,
      hourlyRate,
      monthlyHours,
    }),

  assignShift: (employeeId: number, shiftId: number) =>
    invoke<void>("assign_shift", { employeeId, shiftId }),

  calculateSalary: (
    employeeId: number,
    period: string,
    inputValues: Record<string, [number, number]>,
  ) =>
    invoke<CalcResult>("calculate_employee_salary", {
      employeeId,
      period,
      inputValues,
    }),

  calculateAllSalaries: (period: string) =>
    invoke<CalcResult[]>("calculate_all_salaries", { period }),

  saveSalaryCalculation: (result: CalcResult) =>
    invoke<number>("save_salary_calculation", { result }),

  getSavedCalculation: (employeeId: number, period: string) =>
    invoke<CalcResult | null>("get_saved_calculation", { employeeId, period }),

  getSalaryHistory: (employeeId: number) =>
    invoke<Record<string, unknown>[]>("get_salary_history", { employeeId }),

  getAllSalaryHistory: (period?: string) =>
    invoke<SalaryHistoryEntry[]>("get_all_salary_history", {
      period: period ?? null,
    }),

  getHistoricalPayslip: (employeeId: number, period: string) =>
    invoke<HistoricalPayslip>("get_historical_payslip", {
      employeeId,
      period,
    }),

  getAvailablePeriods: () => invoke<string[]>("get_available_periods"),
  getEmployeeSalaryPeriods: (employeeId: number) => invoke<string[]>("get_employee_salary_periods", { employeeId }),

  deleteMonthCalculations: (period: string) =>
    invoke<number>("delete_month_calculations", { period }),

  getAttendanceCalendar: (employeeId: number, year: number, month: number) =>
    invoke<AttendanceDay[]>("get_attendance_calendar", {
      employeeId,
      year,
      month,
    }),

  getLeaves: (employeeId?: number) =>
    invoke<Leave[]>("get_leaves", { employeeId: employeeId ?? null }),

  createLeave: (
    employeeId: number,
    leaveType: string,
    startDate: string,
    endDate: string,
    daysCount: number,
    reason: string | null,
  ) =>
    invoke<number>("create_leave", {
      employeeId,
      leaveType,
      startDate,
      endDate,
      daysCount,
      reason,
    }),

  deleteLeave: (leaveId: number) =>
    invoke<void>("delete_leave", { leaveId }),

  approveLeave: (leaveId: number) =>
    invoke<void>("approve_leave", { leaveId }),

  rejectLeave: (leaveId: number) =>
    invoke<void>("reject_leave", { leaveId }),

  getLeaveBalance: (employeeId: number) =>
    invoke<{ entitled: number; used: number; remaining: number; pending: number; pers1_du_j: number; pers1_pr_j: number; pers1_ad_j: number; year: string }>("get_leave_balance", { employeeId }),

  getBonuses: () => invoke<Bonus[]>("get_bonuses"),

  createBonus: (
    title: string,
    description: string | null,
    bonusType: string,
    amount: number,
    isPercentage: boolean,
    rubriqueCode: string | null,
    targetType: string,
    targetValue: string | null,
    payPeriod: string | null,
    employeeIds: number[] | null,
  ) =>
    invoke<number>("create_bonus", {
      title,
      description,
      bonusType,
      amount,
      isPercentage,
      rubriqueCode,
      targetType,
      targetValue,
      payPeriod,
      employeeIds,
    }),

  deleteBonus: (bonusId: number) =>
    invoke<void>("delete_bonus", { bonusId }),

  skipBonus: (bonusId: number, period: string) =>
    invoke<void>("skip_bonus", { bonusId, period }),

  unskipBonus: (bonusId: number, period: string) =>
    invoke<void>("unskip_bonus", { bonusId, period }),

  getSkippedBonuses: (period: string) =>
    invoke<number[]>("get_skipped_bonuses", { period }),
  updateBonus: (
    bonusId: number,
    updates: {
      title?: string;
      bonus_type?: string;
      amount?: number;
      is_percentage?: boolean;
      rubrique_code?: string | null;
      target_type?: string;
      target_value?: string | null;
      pay_period?: string | null;
      recurrence_type?: string;
      recurrence_count?: number;
      employee_ids?: number[];
      is_imposable?: boolean;
      is_cotisable?: boolean;
    },
  ) => invoke<void>("update_bonus", { bonusId, ...updates }),

  getAttendance: (
    employeeId?: number,
    startDate?: string,
    endDate?: string,
  ) =>
    invoke<Record<string, unknown>[]>("get_attendance", {
      employeeId: employeeId ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    }),

  getRubriques: () =>
    invoke<Record<string, unknown>[]>("get_rubriques"),

  createRubrique: (libelle: string, classe: number, isBrut?: boolean, isImpos?: boolean, isSecuS?: boolean) =>
    invoke<string>("create_rubrique", {
      libelle,
      classe,
      isBrut: isBrut === false ? 0 : 1,
      isImpos: isImpos === false ? 0 : 1,
      isSecuS: isSecuS === false ? 0 : 1,
    }),

  updateRubrique: (code: string, updates: {
    libelle?: string | null;
    formule?: string | null;
    classe?: number | null;
    is_brut?: number | null;
    is_impos?: number | null;
    is_secu_s?: number | null;
    is_total?: number | null;
    is_imp?: number | null;
    manuelle?: number | null;
    init_val?: number | null;
    ord_clc?: number | null;
  }) =>
    invoke<void>("update_rubrique", {
      code,
      libelle: updates.libelle ?? null,
      formule: updates.formule ?? null,
      classe: updates.classe ?? null,
      isBrut: updates.is_brut ?? null,
      isImpos: updates.is_impos ?? null,
      isSecuS: updates.is_secu_s ?? null,
      isTotal: updates.is_total ?? null,
      isImp: updates.is_imp ?? null,
      manuelle: updates.manuelle ?? null,
      initVal: updates.init_val ?? null,
      ordClc: updates.ord_clc ?? null,
    }),

  updateRubriqueFlags: (code: string, flags: { isSecuS?: boolean; isImpos?: boolean; isBrut?: boolean }) =>
    invoke<void>("update_rubrique_flags", {
      code,
      isSecuS: flags.isSecuS ?? null,
      isImpos: flags.isImpos ?? null,
      isBrut: flags.isBrut ?? null,
    }),

  deleteRubrique: (code: string) =>
    invoke<void>("delete_rubrique", { code }),

  testRubriqueFormula: (code: string, formule: string, employeeId?: number, period?: string) =>
    invoke<{ success: boolean; value?: number; error?: string; formula: string; code: string }>(
      "test_rubrique_formula",
      { code, formule, employeeId: employeeId ?? null, period: period ?? null }
    ),

  getLookupValues: (tableName?: string) =>
    invoke<Record<string, unknown>[]>("get_lookup_values", {
      tableName: tableName ?? null,
    }),

  // Salary settings (global parameterization)
  getSalarySettings: () =>
    invoke<Record<string, string>>("get_salary_settings"),

  setSalarySetting: (key: string, value: string) =>
    invoke<void>("set_salary_setting", { key, value }),

  setSalarySettings: (settings: Record<string, string>) =>
    invoke<void>("set_salary_settings", { settings }),

  // File dialog helpers
  pickFile: (filters?: { name: string; extensions: string[] }[]) =>
    open({ multiple: false, filters }),
  pickFiles: (filters?: { name: string; extensions: string[] }[]) =>
    open({ multiple: true, filters }),
  pickDirectory: () => open({ directory: true }),

  // Postes
  getPostes: () => invoke<PosteSummary[]>("get_postes"),
  getPosteDetail: (posteId: number) =>
    invoke<Record<string, unknown>>("get_poste_detail", { posteId }),
  createPoste: (name: string, description: string | null) =>
    invoke<number>("create_poste", { name, description }),
  updatePoste: (posteId: number, name: string, description: string | null) =>
    invoke<void>("update_poste", { posteId, name, description }),
  deletePoste: (posteId: number) =>
    invoke<void>("delete_poste", { posteId }),
  updatePosteRubrique: (posteId: number, rubriqueCode: string, defaultValue: number) =>
    invoke<void>("update_poste_rubrique", { posteId, rubriqueCode, defaultValue }),
  deletePosteRubrique: (posteId: number, rubriqueCode: string) =>
    invoke<void>("delete_poste_rubrique", { posteId, rubriqueCode }),
  assignEmployeeToPoste: (employeeId: number, posteId: number | null) =>
    invoke<void>("assign_employee_to_poste", { employeeId, posteId }),
  syncPostesFromFnc: () => invoke<number>("sync_postes_from_fnc"),
  recomputePosteStats: () => invoke<number>("recompute_poste_stats"),

  // Employee salary & primes
  getEmployeeCurrentRubriques: (employeeId: number) =>
    invoke<EmployeeRubrique[]>("get_employee_current_rubriques", { employeeId }),
  updateEmployeeRubrique: (employeeId: number, rubriqueCode: string, newValue: number, reason: string | null) =>
    invoke<void>("update_employee_rubrique", { employeeId, rubriqueCode, newValue, reason }),
  getEmployeeRubriqueHistory: (employeeId: number, rubriqueCode?: string) =>
    invoke<RubriqueHistoryEntry[]>("get_employee_rubrique_history", {
      employeeId,
      rubriqueCode: rubriqueCode ?? null,
    }),

  // Overtime
  saveOvertimeEntry: (employeeId: number, date: string, hours50: number, hours100: number, source: string, note: string | null) =>
    invoke<number>("save_overtime_entry", { employeeId, date, hours_50: hours50, hours_100: hours100, source, note }),
  saveOvertimeMonthly: (employeeId: number, period: string, hours50: number, hours100: number, source: string) =>
    invoke<number>("save_overtime_monthly", { employeeId, period, hours_50: hours50, hours_100: hours100, source }),
  getOvertime: (employeeId: number, period: string) =>
    invoke<Record<string, unknown>>("get_overtime", { employeeId, period }),
  computeOvertimeFromAttendance: (employeeId: number, period: string, standardHoursPerDay?: number) =>
    invoke<Record<string, unknown>>("compute_overtime_from_attendance", {
      employeeId,
      period,
      standardHoursPerDay: standardHoursPerDay ?? null,
    }),
  confirmOvertimeMonthly: (employeeId: number, period: string) =>
    invoke<void>("confirm_overtime_monthly", { employeeId, period }),

  // Import settings
  getImportSettings: () => invoke<Record<string, unknown>>("get_import_settings"),
  saveImportSettings: (userDatPath: string | null, attlogDir: string | null, autoMatchThreshold: number | null) =>
    invoke<void>("save_import_settings", { userDatPath, attlogDir, autoMatchThreshold }),
  scanAttlogDir: (dirPath: string) =>
    invoke<string[]>("scan_attlog_dir", { dirPath }),

  // Enhanced bonuses
  getActiveBonusesForPeriod: (employeeId: number, period: string) =>
    invoke<Record<string, unknown>[]>("get_active_bonuses_for_period", { employeeId, period }),
  createEnhancedBonus: (
    title: string, description: string | null, bonusType: string, amount: number,
    isPercentage: boolean, rubriqueCode: string | null, targetType: string,
    targetValue: string | null, payPeriod: string | null, employeeIds: number[] | null,
    isImposable: boolean | null, isCotisable: boolean | null,
    recurrenceType: string | null, recurrenceCount: number | null,
    isAbsenceDependent: boolean | null, absenceDivisor: number | null,
    amountType: string | null, incomeGridMin: number | null,
    incomeGridMax: number | null, contractTypes: string | null,
  ) => invoke<number>("create_enhanced_bonus", {
    title, description, bonusType, amount, isPercentage, rubriqueCode,
    targetType, targetValue, payPeriod, employeeIds,
    isImposable, isCotisable, recurrenceType, recurrenceCount,
    isAbsenceDependent, absenceDivisor, amountType,
    incomeGridMin, incomeGridMax, contractTypes,
  }),
  applyBonusToEmployee: (bonusId: number, employeeId: number, period: string) =>
    invoke<void>("apply_bonus_to_employee", { bonusId, employeeId, period }),

  // Pre-calc summary
  getPreCalcSummary: (employeeId: number, period: string) =>
    invoke<Record<string, unknown>>("get_pre_calc_summary", { employeeId, period }),

  getEmployeeSalaryHistory: (employeeId: number, onlyRealMonths?: boolean) =>
    invoke<SalaryHistory>("get_employee_salary_history", { employeeId, only_real_months: onlyRealMonths ?? false }),

  // Field mappings (PCPAIE data mapping config)
  getFieldMappings: () => invoke<FieldMapping[]>("get_field_mappings"),
  updateFieldMapping: (m: UpdateFieldMapping) =>
    invoke<void>("update_field_mapping", {
      id: m.id,
      display_label: m.display_label,
      employee_column: m.employee_column,
      lookup_table: m.lookup_table ?? null,
      section: m.section,
      is_visible: m.is_visible,
    }),
  getAvailableLookupTables: () => invoke<string[]>("get_available_lookup_tables"),
  getLookupTablePreview: (tableName: string, limit?: number) =>
    invoke<LookupTablePreview>("get_lookup_table_preview", { tableName, limit: limit ?? 50 }),
  getAllLookupTablesPreview: () => invoke<Record<string, LookupTablePreview>>("get_all_lookup_tables_preview"),
  getAvailableEmployeeColumns: () => invoke<string[]>("get_available_employee_columns"),
  exportDatabase: (destPath: string) => invoke<string>("export_database", { destPath }),
  getDatabaseStats: () => invoke<Record<string, number>>("get_database_stats"),
};

export interface LookupTableValue {
  code: string;
  libelle: string;
}

export interface LookupTablePreview {
  table_name: string;
  total: number;
  values: LookupTableValue[];
}

export interface SalaryHistory {
  employee_id: number;
  periods: string[];
  rubriques: { code: string; libelle: string | null }[];
  series: { code: string; libelle: string | null; data: (number | null)[] }[];
  count: number;
}

export interface FieldMapping {
  id: number;
  logical_name: string;
  display_label: string;
  employee_column: string;
  lookup_table: string | null;
  section: string;
  sort_order: number;
  is_visible: boolean;
}

export interface UpdateFieldMapping {
  id: number;
  display_label: string;
  employee_column: string;
  lookup_table: string | null;
  section: string;
  is_visible: boolean;
}
