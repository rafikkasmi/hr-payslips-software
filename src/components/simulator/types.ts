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
}

export type { CalcLine, EmployeeSummary, PosteSummary };
