import { createContext, useContext } from "react";
import type { CalcResult, SalaryHistoryEntry, HistoricalPayslip, Bonus, EmployeeSummary, OvertimeEntry, OvertimePreviewData, PreCalcEntry, CalcProgress, RubSuggestion, RubMatch } from "./types";

export interface SalaryContextValue {
  // Core data
  periods: string[];
  selectedPeriod: string;
  setSelectedPeriod: (p: string) => void;
  history: SalaryHistoryEntry[];
  loading: boolean;
  calculating: boolean;
  message: string;

  // Employees
  employees: EmployeeSummary[];
  sections: string[];
  structures: string[];
  affectatios: string[];

  // Calculation selection
  calcSelectedIds: Set<number>;
  toggleCalcSelect: (id: number) => void;
  selectAllCalc: () => void;
  clearCalcSelect: () => void;
  calcProgress: CalcProgress;
  displayHistory: SalaryHistoryEntry[];

  // Results expansion
  expandedRows: Set<string>;
  toggleRow: (h: SalaryHistoryEntry) => void;
  calcResults: Record<string, CalcResult>;
  historicalPayslips: Record<string, HistoricalPayslip>;
  payslipPreview: CalcResult | null;
  setPayslipPreview: (r: CalcResult | null) => void;

  // Actions
  handleStartNewMonth: () => void;
  handleCalculateAll: () => void;
  handleDeleteMonth: () => void;

  // Modal visibility
  showBonusModal: boolean;
  setShowBonusModal: (v: boolean) => void;
  showEditBonusModal: boolean;
  setShowEditBonusModal: (v: boolean) => void;
  showRubFlagsModal: boolean;
  setShowRubFlagsModal: (v: boolean) => void;
  showOvertimeModal: boolean;
  setShowOvertimeModal: (v: boolean) => void;
  showPreCalcModal: boolean;
  setShowPreCalcModal: (v: boolean) => void;

  // Bonus data
  periodBonuses: Bonus[];
  loadingBonuses: boolean;
  allBonuses: Bonus[];
  skippedBonusIds: Set<number>;
  toggleSkipBonus: (id: number) => void;
  handleDeleteBonus: (id: number) => void;
  startEditBonus: (b: Bonus) => void;

  // Bonus form
  bonusTitle: string;
  handleBonusTitleChange: (v: string) => void;
  bonusType: string;
  handleBonusTypeChange: (t: string) => void;
  bonusAmount: number;
  setBonusAmount: (n: number) => void;
  bonusIsPercent: boolean;
  setBonusIsPercent: (v: boolean) => void;
  bonusRubCode: string;
  setBonusRubCode: (c: string) => void;
  bonusTarget: string;
  setBonusTarget: (t: string) => void;
  bonusTargetValue: string;
  setBonusTargetValue: (v: string) => void;
  bonusRecurrence: string;
  setBonusRecurrence: (r: string) => void;
  bonusRecurrenceCount: number;
  setBonusRecurrenceCount: (n: number) => void;
  bonusIsAbsenceDep: boolean;
  setBonusIsAbsenceDep: (v: boolean) => void;
  bonusAbsenceDiv: number;
  setBonusAbsenceDiv: (n: number) => void;
  bonusAmountType: string;
  setBonusAmountType: (s: string) => void;
  bonusIncomeMin: number | null;
  setBonusIncomeMin: (n: number | null) => void;
  bonusIncomeMax: number | null;
  setBonusIncomeMax: (n: number | null) => void;
  bonusContractTypes: string;
  setBonusContractTypes: (s: string) => void;
  selectedEmpIds: Set<number>;
  setSelectedEmpIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  toggleEmp: (id: number) => void;
  empSearch: string;
  setEmpSearch: (s: string) => void;
  filterSection: string;
  setFilterSection: (s: string) => void;
  filterStructure: string;
  setFilterStructure: (s: string) => void;
  filterAffectatio: string;
  setFilterAffectatio: (s: string) => void;
  filteredEmployees: EmployeeSummary[];
  rubSuggestion: RubSuggestion | null;
  rubMatch: RubMatch | null;
  showNewRubrique: boolean;
  setShowNewRubrique: (v: boolean) => void;
  newRubLibelle: string;
  setNewRubLibelle: (s: string) => void;
  newRubImposable: boolean;
  setNewRubImposable: (v: boolean) => void;
  newRubCotisable: boolean;
  setNewRubCotisable: (v: boolean) => void;
  creatingRubrique: boolean;
  handleCreateRubrique: () => void;
  creatingBonus: boolean;
  handleCreateBonus: () => void;
  resetBonusForm: () => void;
  availableRubriques: Record<string, unknown>[];

  // Edit bonus
  editingBonusId: number | null;
  editTitle: string;
  handleEditTitleChange: (v: string) => void;
  editType: string;
  setEditType: (s: string) => void;
  editAmount: number;
  setEditAmount: (n: number) => void;
  editIsPercent: boolean;
  setEditIsPercent: (v: boolean) => void;
  editRubCode: string;
  setEditRubCode: (s: string) => void;
  editRubMatch: RubMatch | null;
  editRecurrence: string;
  setEditRecurrence: (s: string) => void;
  editRecurrenceCount: number;
  setEditRecurrenceCount: (n: number) => void;
  editTarget: string;
  setEditTarget: (s: string) => void;
  editTargetValue: string;
  setEditTargetValue: (s: string) => void;
  editSelectedEmpIds: Set<number>;
  setEditSelectedEmpIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  toggleEditEmp: (id: number) => void;
  editEmpSearch: string;
  setEditEmpSearch: (s: string) => void;
  editFilterSection: string;
  setEditFilterSection: (s: string) => void;
  editFilterStructure: string;
  setEditFilterStructure: (s: string) => void;
  editFilterAffectatio: string;
  setEditFilterAffectatio: (s: string) => void;
  editPayPeriod: string | null;
  setEditPayPeriod: (s: string | null) => void;
  editIsImposable: boolean;
  setEditIsImposable: (v: boolean) => void;
  editIsCotisable: boolean;
  setEditIsCotisable: (v: boolean) => void;
  editDescription: string;
  setEditDescription: (s: string) => void;
  savingEdit: boolean;
  handleSaveEditBonus: () => void;
  cancelEditBonus: () => void;

  // Overtime
  overtimeEntries: Record<string, OvertimeEntry>;
  loadingOvertime: boolean;
  overtimeEmpSearch: string;
  setOvertimeEmpSearch: (s: string) => void;
  computingOvertime: boolean;
  overtimePreview: Record<number, OvertimePreviewData>;
  showOvertimePreview: Set<number>;
  toggleOvertimePreview: (id: number) => void;
  handleSaveOvertime: (empId: number) => void;
  handleComputeOvertimeFromAttendance: (empId: number) => void;
  handleComputeAllOvertime: () => void;
  setOvertimeEntries: React.Dispatch<React.SetStateAction<Record<string, OvertimeEntry>>>;

  // Pre-calc
  preCalcData: Record<number, PreCalcEntry>;
  rubOverrides: Record<number, Record<string, number>>;
  loadingPreCalc: boolean;
  expandedPreCalc: Set<number>;
  togglePreCalcExpand: (id: number) => void;
  preCalcSearch: string;
  setPreCalcSearch: (s: string) => void;
  updateRubOverride: (empId: number, code: string, value: number) => void;
  loadPreCalcReview: () => void;

  // Rubriques
  rubriques: Record<string, unknown>[];
  setRubriques: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>;

  // Stats
  appCount: number;
  pcpaieCount: number;

  // Workflow stepper
  stepStatus: {
    period: "pending" | "done";
    overtime: "pending" | "done" | "skip";
    precalc: "pending" | "done" | "skip";
    calculate: "pending" | "done";
    payslip: "pending" | "done";
  };
  overtimeCount: number;
  preCalcEditCount: number;

  // Results table - search/filter/selection
  resultsSearch: string;
  setResultsSearch: (s: string) => void;
  resultsFilterSource: string;
  setResultsFilterSource: (s: string) => void;
  resultsFilterSection: string;
  setResultsFilterSection: (s: string) => void;
  resultsSortBy: string;
  setResultsSortBy: (s: string) => void;
  resultsSelectedRows: Set<string>;
  toggleResultRowSelection: (key: string) => void;
  selectAllResultRows: () => void;
  clearResultRowSelection: () => void;
  filteredHistory: SalaryHistoryEntry[];

  // Navigation
  navigateToBonuses: () => void;
}

export const SalaryContext = createContext<SalaryContextValue | null>(null);

export function useSalaryContext(): SalaryContextValue {
  const ctx = useContext(SalaryContext);
  if (!ctx) throw new Error("useSalaryContext must be used within SalaryContext.Provider");
  return ctx;
}
