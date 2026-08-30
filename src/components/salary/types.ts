import type { CalcResult, SalaryHistoryEntry, HistoricalPayslip, Bonus, EmployeeSummary } from "../../lib/api";

export type { CalcResult, SalaryHistoryEntry, HistoricalPayslip, Bonus, EmployeeSummary };

export interface OvertimeEntry {
  hours_50: number;
  hours_100: number;
  status: string;
}

export interface OvertimePreviewData {
  total_hours_50: number;
  total_hours_100: number;
  daily_details: Record<string, unknown>[];
}

export interface PreCalcLeave {
  id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: string;
}

export interface PreCalcEntry {
  rubriques: Record<string, { libelle: string; value: number }>[];
  bonuses: Record<string, unknown>[];
  overtime: Record<string, unknown> | null;
  attendanceDays: number;
  leaves?: PreCalcLeave[];
  pendingLeaveCount?: number;
  congeDays?: number;
  sickDays?: number;
  absentDays?: number;
  workingDays?: number;
}

export interface CalcProgress {
  done: number;
  total: number;
  current: string;
}

export interface RubSuggestion {
  code: string;
  title: string;
  similarity: number;
}

export interface RubMatch {
  code: string;
  libelle: string;
  similarity: number;
}
