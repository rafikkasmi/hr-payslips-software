import type { CalcLine, EmployeeSummary, PosteSummary } from "../../lib/api";

export interface RubInput {
  code: string;
  libelle: string;
  montant: number;
  nombre: number;
  classe: number;
  formule: string | null;
  calcul: number;
}

export interface RubriqueMeta {
  code: string;
  libelle: string;
  classe: number;
  init_val: number;
  formule: string | null;
  calcul: number; // 0 = manuelle/saisissable, 1 = calculée
  // Extended flags (Phase 5)
  v_min?: number;
  v_max?: number;
  ord_bul?: number;
  precision?: string | null;
  is_regular?: number;
  is_locked?: number;
}

export type { CalcLine, EmployeeSummary, PosteSummary };
