import { useState, useEffect, useMemo } from "react";
import { api, type CalcResult, type SalaryHistoryEntry, type HistoricalPayslip, type Bonus, type EmployeeSummary } from "../lib/api";
import { PayslipPDF } from "./PayslipPDF";
import { SalaryContext, type SalaryContextValue } from "./salary/SalaryContext";
import { ActionBar } from "./salary/ActionBar";
import { EmployeeSelector } from "./salary/EmployeeSelector";
import { BonusSummary } from "./salary/BonusSummary";
import { ResultsTable } from "./salary/ResultsTable";
import { BonusModal } from "./salary/BonusModal";
import { EditBonusModal } from "./salary/EditBonusModal";
import { RubFlagsModal } from "./salary/RubFlagsModal";
import { OvertimeModal } from "./salary/OvertimeModal";
import { PreCalcModal } from "./salary/PreCalcModal";
import { WorkflowStepper } from "./salary/WorkflowStepper";
import { PeriodSelector } from "./PeriodSelector";
import { Calendar } from "lucide-react";

export function SalaryPage({ onNavigate }: { onNavigate?: (page: "dashboard" | "employees" | "postes" | "shifts" | "pointeuse" | "attendance" | "leaves" | "bonuses" | "salary") => void }) {
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [calcResults, setCalcResults] = useState<Record<string, CalcResult>>({});
  const [historicalPayslips, setHistoricalPayslips] = useState<Record<string, HistoricalPayslip>>({});
  const [message, setMessage] = useState("");

  // Period setup state
  const [showSetup] = useState(true);
  const [periodBonuses, setPeriodBonuses] = useState<Bonus[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loadingBonuses, setLoadingBonuses] = useState(false);
  const [creatingBonus, setCreatingBonus] = useState(false);

  // Bonus form state
  const [bonusTitle, setBonusTitle] = useState("");
  const [bonusType, setBonusType] = useState("bonus");
  const [bonusAmount, setBonusAmount] = useState(0);
  const [bonusIsPercent, setBonusIsPercent] = useState(false);
  const [bonusRubCode, setBonusRubCode] = useState("");
  const [bonusTarget, setBonusTarget] = useState("all");
  const [bonusTargetValue, setBonusTargetValue] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<number>>(new Set());
  const [empSearch, setEmpSearch] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterStructure, setFilterStructure] = useState("");
  const [filterAffectatio, setFilterAffectatio] = useState("");
  const [bonusRecurrence, setBonusRecurrence] = useState("one_time");
  const [bonusRecurrenceCount, setBonusRecurrenceCount] = useState(0);
  const [bonusIsAbsenceDep, setBonusIsAbsenceDep] = useState(false);
  const [bonusAbsenceDiv, setBonusAbsenceDiv] = useState(22);
  const [bonusAmountType, setBonusAmountType] = useState("fixed");
  const [bonusIncomeMin, setBonusIncomeMin] = useState<number | null>(null);
  const [bonusIncomeMax, setBonusIncomeMax] = useState<number | null>(null);
  const [bonusContractTypes, setBonusContractTypes] = useState("");
  const [allBonuses, setAllBonuses] = useState<Bonus[]>([]);
  const [skippedBonusIds, setSkippedBonusIds] = useState<Set<number>>(new Set());
  const [rubSuggestion, setRubSuggestion] = useState<{ code: string; title: string; similarity: number } | null>(null);
  const [rubMatch, setRubMatch] = useState<{ code: string; libelle: string; similarity: number } | null>(null);
  const [showNewRubrique, setShowNewRubrique] = useState(false);
  const [newRubLibelle, setNewRubLibelle] = useState("");
  const [newRubImposable, setNewRubImposable] = useState(true);
  const [newRubCotisable, setNewRubCotisable] = useState(true);
  const [creatingRubrique, setCreatingRubrique] = useState(false);
  const [payslipPreview, setPayslipPreview] = useState<CalcResult | null>(null);

  // Modal state
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [showEditBonusModal, setShowEditBonusModal] = useState(false);
  const [showRubFlagsModal, setShowRubFlagsModal] = useState(false);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [showPreCalcModal, setShowPreCalcModal] = useState(false);

  // Edit bonus state
  const [editingBonusId, setEditingBonusId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("bonus");
  const [editAmount, setEditAmount] = useState(0);
  const [editIsPercent, setEditIsPercent] = useState(false);
  const [editRubCode, setEditRubCode] = useState("");
  const [editRubMatch, setEditRubMatch] = useState<{ code: string; libelle: string; similarity: number } | null>(null);
  const [editRecurrence, setEditRecurrence] = useState("one_time");
  const [editRecurrenceCount, setEditRecurrenceCount] = useState(0);
  const [editTarget, setEditTarget] = useState("all");
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editSelectedEmpIds, setEditSelectedEmpIds] = useState<Set<number>>(new Set());
  const [editEmpSearch, setEditEmpSearch] = useState("");
  const [editFilterSection, setEditFilterSection] = useState("");
  const [editFilterStructure, setEditFilterStructure] = useState("");
  const [editFilterAffectatio, setEditFilterAffectatio] = useState("");
  const [editPayPeriod, setEditPayPeriod] = useState<string | null>(null);
  const [editIsImposable, setEditIsImposable] = useState(true);
  const [editIsCotisable, setEditIsCotisable] = useState(true);
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Overtime edit state
  const [overtimeEntries, setOvertimeEntries] = useState<Record<string, { hours_50: number; hours_100: number; status: string }>>({});
  const [loadingOvertime, setLoadingOvertime] = useState(false);
  const [overtimeEmpSearch, setOvertimeEmpSearch] = useState("");
  const [computingOvertime, setComputingOvertime] = useState(false);
  const [overtimePreview, setOvertimePreview] = useState<Record<number, { total_hours_50: number; total_hours_100: number; daily_details: Record<string, unknown>[] }>>({});
  const [showOvertimePreview, setShowOvertimePreview] = useState<Set<number>>(new Set());

  // Pre-calc review state
  const [preCalcData, setPreCalcData] = useState<Record<number, { rubriques: Record<string, { libelle: string; value: number }>[], bonuses: Record<string, unknown>[], overtime: Record<string, unknown> | null, attendanceDays: number }>>({});
  const [rubOverrides, setRubOverrides] = useState<Record<number, Record<string, number>>>({});
  const [loadingPreCalc, setLoadingPreCalc] = useState(false);
  const [expandedPreCalc, setExpandedPreCalc] = useState<Set<number>>(new Set());
  const [preCalcSearch, setPreCalcSearch] = useState("");
  const [rubriques, setRubriques] = useState<Record<string, unknown>[]>([]);

  // Calculation selection state
  const [calcSelectedIds, setCalcSelectedIds] = useState<Set<number>>(new Set());
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: "" });
  const [calcPartialResults, setCalcPartialResults] = useState<SalaryHistoryEntry[]>([]);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => {
    loadPeriods();
    api.getRubriques().then(r => setRubriques(r)).catch(e => console.error(e));
    api.getBonuses().then(b => setAllBonuses(b)).catch(e => console.error(e));
  }, []);

  const loadPeriods = async () => {
    try {
      const p = await api.getAvailablePeriods();
      setPeriods(p);
      if (p.length > 0 && !selectedPeriod) {
        setSelectedPeriod(p[0]);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (selectedPeriod) {
      loadHistory(selectedPeriod);
      loadPeriodBonuses(selectedPeriod);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (showSetup && selectedPeriod && employees.length > 0) {
      loadOvertimeForPeriod(selectedPeriod);
    }
  }, [showSetup, selectedPeriod, employees]);

  useEffect(() => {
    api.getEmployees().then(setEmployees).catch(console.error);
  }, []);

  const loadPeriodBonuses = async (period: string) => {
    setLoadingBonuses(true);
    try {
      const all = await api.getBonuses();
      const filtered = all.filter(b => {
        if (b.pay_period === null) return true;
        if (b.pay_period === period) return true;
        // Recurring/permanent bonuses: show if current period >= bonus start period
        if (b.recurrence_type && b.recurrence_type !== "one_time" && b.pay_period <= period) {
          // For recurring with count, hide if elapsed months exceed count
          if (b.recurrence_type === "recurring" && b.recurrence_count && b.recurrence_count > 0) {
            const [sy, sm] = b.pay_period.split("-").map(Number);
            const [py, pm] = period.split("-").map(Number);
            const elapsed = (py - sy) * 12 + (pm - sm) + 1;
            if (elapsed > b.recurrence_count) return false;
          }
          return true;
        }
        return false;
      });
      setPeriodBonuses(filtered);
      const skipped = await api.getSkippedBonuses(period);
      setSkippedBonusIds(new Set(skipped));
    } catch (e) { console.error(e); }
    finally { setLoadingBonuses(false); }
  };

  const toggleSkipBonus = async (bonusId: number) => {
    if (skippedBonusIds.has(bonusId)) {
      await api.unskipBonus(bonusId, selectedPeriod);
      setSkippedBonusIds(prev => { const n = new Set(prev); n.delete(bonusId); return n; });
    } else {
      await api.skipBonus(bonusId, selectedPeriod);
      setSkippedBonusIds(prev => new Set(prev).add(bonusId));
    }
  };

  const sections = useMemo(() => [...new Set(employees.map(e => e.section).filter(Boolean))] as string[], [employees]);
  const structures = useMemo(() => [...new Set(employees.map(e => e.structure).filter(Boolean))] as string[], [employees]);
  const affectatios = useMemo(() => [...new Set(employees.map(e => e.affectatio).filter(Boolean))] as string[], [employees]);

  const filteredEmployees = useMemo(() => employees.filter(e => {
    if (filterSection && e.section !== filterSection) return false;
    if (filterStructure && e.structure !== filterStructure) return false;
    if (filterAffectatio && e.affectatio !== filterAffectatio) return false;
    if (!e.actif) return false;
    if (empSearch) {
      const q = empSearch.toLowerCase();
      if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false;
    }
    return true;
  }), [employees, filterSection, filterStructure, filterAffectatio, empSearch]);

  const toggleEmp = (id: number) => {
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetBonusForm = () => {
    setBonusTitle(""); setBonusType("bonus"); setBonusAmount(0); setBonusIsPercent(false);
    setBonusRubCode(""); setBonusTarget("all"); setBonusTargetValue("");
    setSelectedEmpIds(new Set()); setEmpSearch("");
    setFilterSection(""); setFilterStructure(""); setFilterAffectatio("");
    setBonusRecurrence("one_time"); setBonusRecurrenceCount(0);
    setBonusIsAbsenceDep(false); setBonusAbsenceDiv(22);
    setBonusAmountType("fixed"); setBonusIncomeMin(null); setBonusIncomeMax(null);
    setBonusContractTypes("");
    setRubSuggestion(null); setRubMatch(null);
    setShowNewRubrique(false); setNewRubLibelle("");
    setNewRubImposable(true); setNewRubCotisable(true);
  };

  // Normalize a string for comparison: lowercase, remove accents, trim, collapse spaces
  const normalizeStr = (s: string): string => {
    return s.toLowerCase().trim()
      .replace(/[àáâäãå]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
      .replace(/[òóôöõ]/g, "o").replace(/[ùúûü]/g, "u").replace(/[ç]/g, "c")
      .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  };

  // Check similarity: exact match, starts-with, contains, or token overlap
  const computeSimilarity = (a: string, b: string): number => {
    const na = normalizeStr(a);
    const nb = normalizeStr(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1.0;
    if (na.startsWith(nb) || nb.startsWith(na)) return 0.9;
    if (na.includes(nb) || nb.includes(na)) return 0.8;
    // Token overlap (Jaccard)
    const tokensA = new Set(na.split(" "));
    const tokensB = new Set(nb.split(" "));
    let intersection = 0;
    tokensA.forEach(t => { if (tokensB.has(t)) intersection++; });
    const union = tokensA.size + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
  };

  const handleBonusTitleChange = (value: string) => {
    setBonusTitle(value);
    if (!value.trim()) {
      setRubSuggestion(null);
      setRubMatch(null);
      return;
    }

    // 1. Check existing bonuses for similar titles (duplication detection)
    let bestMatch: { code: string; title: string; similarity: number } | null = null;
    for (const b of allBonuses) {
      const sim = computeSimilarity(value, b.title);
      if (sim >= 0.5 && (!bestMatch || sim > bestMatch.similarity)) {
        bestMatch = { code: b.rubrique_code ?? "", title: b.title, similarity: sim };
      }
    }
    setRubSuggestion(bestMatch);
    if (bestMatch && bestMatch.code && bestMatch.similarity >= 0.8 && !bonusRubCode) {
      setBonusRubCode(bestMatch.code);
    }

    // 2. Fuzzy search rubriques by libelle to find best match
    const targetClasse = bonusType === "bonus" ? 1 : 2;
    let bestRub: { code: string; libelle: string; similarity: number } | null = null;
    for (const r of rubriques) {
      const libelle = String(r.libelle ?? "").trim();
      if (!libelle) continue;
      const classe = Number(r.classe ?? 0);
      if (classe !== targetClasse) continue;
      // Skip (R+) and (R-) variants - we want the base rubrique
      if (libelle.includes("(R+") || libelle.includes("(R-")) continue;
      const sim = computeSimilarity(value, libelle);
      if (sim >= 0.3 && (!bestRub || sim > bestRub.similarity)) {
        bestRub = { code: String(r.code), libelle, similarity: sim };
      }
    }
    setRubMatch(bestRub);
    // Auto-select rubrique if very strong match and nothing selected
    if (bestRub && bestRub.similarity >= 0.7 && !bonusRubCode && !bestMatch?.code) {
      setBonusRubCode(bestRub.code);
    }
  };

  const handleEditTitleChange = (value: string) => {
    setEditTitle(value);
    if (!value.trim()) { setEditRubMatch(null); return; }
    const targetClasse = editType === "bonus" ? 1 : 2;
    let bestRub: { code: string; libelle: string; similarity: number } | null = null;
    for (const r of rubriques) {
      const libelle = String(r.libelle ?? "").trim();
      if (!libelle) continue;
      const classe = Number(r.classe ?? 0);
      if (classe !== targetClasse) continue;
      if (libelle.includes("(R+") || libelle.includes("(R-")) continue;
      const sim = computeSimilarity(value, libelle);
      if (sim >= 0.3 && (!bestRub || sim > bestRub.similarity)) {
        bestRub = { code: String(r.code), libelle, similarity: sim };
      }
    }
    setEditRubMatch(bestRub);
  };

  const handleCreateRubrique = async () => {
    if (!newRubLibelle.trim()) return;
    setCreatingRubrique(true);
    try {
      const classe = bonusType === "bonus" ? 1 : 2;
      const newCode = await api.createRubrique(newRubLibelle.trim(), classe, true, newRubImposable, newRubCotisable);
      setBonusRubCode(newCode);
      setShowNewRubrique(false);
      setNewRubLibelle("");
      const fresh = await api.getRubriques();
      setRubriques(fresh);
      setMessage(`Rubrique R${newCode} « ${newRubLibelle.trim()} » créée (${newRubImposable ? "imposable" : "non imposable"}, ${newRubCotisable ? "cotisable" : "non cotisable"})`);
    } catch (e) {
      console.error(e);
      setMessage(`Erreur création rubrique: ${e}`);
    } finally {
      setCreatingRubrique(false);
    }
  };

  // Filter rubriques by bonus type (classe 1 = gain, classe 2 = retenue)
  const availableRubriques = rubriques.filter(r => {
    const classe = Number(r.classe ?? 0);
    const isManual = Number(r.manuelle ?? 0) === 1;
    const hasNoFormula = !String(r.formule ?? "").trim();
    const hasLabel = String(r.libelle ?? "").trim().length > 0;
    if (!hasLabel) return false;
    if (!(isManual || hasNoFormula)) return false;
    if (bonusType === "bonus") return classe === 1;
    if (bonusType === "deduction") return classe === 2;
    return true;
  });

  // When bonus type changes, reset rubrique if it doesn't match the new type
  const handleBonusTypeChange = (newType: string) => {
    setBonusType(newType);
    if (bonusRubCode) {
      const matched = rubriques.find(r => String(r.code) === bonusRubCode);
      const classe = Number(matched?.classe ?? 0);
      if ((newType === "bonus" && classe !== 1) || (newType === "deduction" && classe !== 2)) {
        setBonusRubCode("");
      }
    }
    // Re-run fuzzy match with new type
    if (bonusTitle.trim()) {
      const targetClasse = newType === "bonus" ? 1 : 2;
      let bestRub: { code: string; libelle: string; similarity: number } | null = null;
      for (const r of rubriques) {
        const libelle = String(r.libelle ?? "").trim();
        if (!libelle) continue;
        const classe = Number(r.classe ?? 0);
        if (classe !== targetClasse) continue;
        if (libelle.includes("(R+") || libelle.includes("(R-")) continue;
        const sim = computeSimilarity(bonusTitle, libelle);
        if (sim >= 0.3 && (!bestRub || sim > bestRub.similarity)) {
          bestRub = { code: String(r.code), libelle, similarity: sim };
        }
      }
      setRubMatch(bestRub);
    }
  };

  const handleCreateBonus = async () => {
    if (!bonusTitle.trim() || !selectedPeriod) return;
    setCreatingBonus(true);
    try {
      let targetType = bonusTarget;
      let targetValue: string | null = bonusTargetValue || null;
      let empIds: number[] | null = null;

      if (bonusTarget === "individual") {
        targetType = "individual";
        empIds = Array.from(selectedEmpIds);
      } else if (bonusTarget === "section") {
        targetValue = filterSection || bonusTargetValue;
      } else if (bonusTarget === "structure") {
        targetValue = filterStructure || bonusTargetValue;
      } else if (bonusTarget === "affectatio") {
        targetValue = filterAffectatio || bonusTargetValue;
      }

      await api.createEnhancedBonus(
        bonusTitle.trim(), null, bonusType, bonusAmount, bonusIsPercent,
        bonusRubCode || null, targetType, targetValue,
        bonusRecurrence === "permanent" ? null : selectedPeriod,
        empIds, null, null, bonusRecurrence, bonusRecurrenceCount || null,
        bonusIsAbsenceDep || null, bonusAbsenceDiv !== 22 ? bonusAbsenceDiv : null,
        bonusAmountType !== "fixed" ? bonusAmountType : null,
        bonusIncomeMin, bonusIncomeMax, bonusContractTypes.trim() || null,
      );
      const createdTitle = bonusTitle.trim();
      resetBonusForm();
      await loadPeriodBonuses(selectedPeriod);
      api.getBonuses().then(b => setAllBonuses(b)).catch(e => console.error(e));
      setMessage(`Bonus « ${createdTitle} » ajouté pour ${selectedPeriod}`);
    } catch (e) {
      console.error(e);
      setMessage(`Erreur lors de l'ajout du bonus: ${e}`);
    }
    finally { setCreatingBonus(false); }
  };

  const handleDeleteBonus = async (id: number) => {
    if (!confirm("Delete this bonus/deduction?")) return;
    try {
      await api.deleteBonus(id);
      if (selectedPeriod) await loadPeriodBonuses(selectedPeriod);
      api.getBonuses().then(b => setAllBonuses(b)).catch(e => console.error(e));
    } catch (e) { console.error(e); }
  };

  const startEditBonus = (b: Bonus) => {
    setEditingBonusId(b.id);
    setEditTitle(b.title);
    setEditType(b.bonus_type);
    setEditAmount(b.amount);
    setEditIsPercent(b.is_percentage);
    setEditRubCode(b.rubrique_code ?? "");
    setEditRecurrence(b.recurrence_type ?? "one_time");
    setEditRecurrenceCount(b.recurrence_count ?? 0);
    setEditTarget(b.target_type);
    setEditTargetValue(b.target_value ?? "");
    setEditSelectedEmpIds(new Set((b.assigned_employees ?? []).map(([id]) => id)));
    setEditEmpSearch("");
    setEditFilterSection("");
    setEditFilterStructure("");
    setEditFilterAffectatio("");
    setEditPayPeriod(b.pay_period);
    setEditIsImposable(b.is_imposable !== 0);
    setEditIsCotisable(b.is_cotisable !== 0);
    setEditDescription(b.description ?? "");
    setEditRubMatch(null);
    setShowEditBonusModal(true);
  };

  const cancelEditBonus = () => {
    setEditingBonusId(null);
    setEditRubMatch(null);
    setShowEditBonusModal(false);
  };

  const handleSaveEditBonus = async () => {
    if (!editingBonusId || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      let targetValue: string | null = editTargetValue || null;
      let empIds: number[] | null = null;
      if (editTarget === "individual") {
        empIds = Array.from(editSelectedEmpIds);
      } else if (editTarget === "section") {
        targetValue = editFilterSection || editTargetValue;
      } else if (editTarget === "structure") {
        targetValue = editFilterStructure || editTargetValue;
      } else if (editTarget === "affectatio") {
        targetValue = editFilterAffectatio || editTargetValue;
      }

      await api.updateBonus(editingBonusId, {
        title: editTitle.trim(),
        bonus_type: editType,
        amount: editAmount,
        is_percentage: editIsPercent,
        rubrique_code: editRubCode || null,
        target_type: editTarget,
        target_value: targetValue,
        pay_period: editPayPeriod,
        recurrence_type: editRecurrence,
        recurrence_count: editRecurrenceCount || 0,
        employee_ids: empIds ?? undefined,
        is_imposable: editIsImposable,
        is_cotisable: editIsCotisable,
      });
      setEditingBonusId(null);
      setShowEditBonusModal(false);
      if (selectedPeriod) await loadPeriodBonuses(selectedPeriod);
      api.getBonuses().then(b => setAllBonuses(b)).catch(e => console.error(e));
    } catch (e) { console.error(e); }
    finally { setSavingEdit(false); }
  };

  const toggleEditEmp = (id: number) => {
    setEditSelectedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Overtime functions
  const loadOvertimeForPeriod = async (period: string) => {
    setLoadingOvertime(true);
    try {
      const results: Record<string, { hours_50: number; hours_100: number; status: string }> = {};
      for (const emp of employees.filter(e => e.actif)) {
        try {
          const ot = await api.getOvertime(emp.id, period);
          if (ot && (ot.hours_50 || ot.hours_100)) {
            results[emp.id] = {
              hours_50: Number(ot.hours_50 ?? 0),
              hours_100: Number(ot.hours_100 ?? 0),
              status: String(ot.status ?? "pending"),
            };
          }
        } catch { /* no overtime for this employee */ }
      }
      setOvertimeEntries(results);
    } catch (e) { console.error(e); }
    finally { setLoadingOvertime(false); }
  };

  const handleSaveOvertime = async (empId: number) => {
    const ot = overtimeEntries[empId];
    if (!ot || !selectedPeriod) return;
    try {
      await api.saveOvertimeMonthly(empId, selectedPeriod, ot.hours_50, ot.hours_100, "manual");
      await api.confirmOvertimeMonthly(empId, selectedPeriod);
    } catch (e) { console.error(e); }
  };

  const handleComputeOvertimeFromAttendance = async (empId: number) => {
    if (!selectedPeriod) return;
    setComputingOvertime(true);
    try {
      const result = await api.computeOvertimeFromAttendance(empId, selectedPeriod, 8.0);
      const h50 = Number(result.total_hours_50 ?? 0);
      const h100 = Number(result.total_hours_100 ?? 0);
      setOvertimeEntries(prev => ({ ...prev, [empId]: { hours_50: h50, hours_100: h100, status: "draft" } }));
      setOvertimePreview(prev => ({ ...prev, [empId]: { total_hours_50: h50, total_hours_100: h100, daily_details: (result.daily_details ?? []) as Record<string, unknown>[] } }));
      if (h50 > 0 || h100 > 0) {
        await api.saveOvertimeMonthly(empId, selectedPeriod, h50, h100, "pointeuse");
        await api.confirmOvertimeMonthly(empId, selectedPeriod);
      }
    } catch (e) { console.error(e); }
    finally { setComputingOvertime(false); }
  };

  const handleComputeAllOvertime = async () => {
    if (!selectedPeriod) return;
    setComputingOvertime(true);
    try {
      for (const emp of employees.filter(e => e.actif)) {
        try {
          const result = await api.computeOvertimeFromAttendance(emp.id, selectedPeriod, 8.0);
          const h50 = Number(result.total_hours_50 ?? 0);
          const h100 = Number(result.total_hours_100 ?? 0);
          setOvertimeEntries(prev => ({ ...prev, [emp.id]: { hours_50: h50, hours_100: h100, status: "draft" } }));
          setOvertimePreview(prev => ({ ...prev, [emp.id]: { total_hours_50: h50, total_hours_100: h100, daily_details: (result.daily_details ?? []) as Record<string, unknown>[] } }));
          if (h50 > 0 || h100 > 0) {
            await api.saveOvertimeMonthly(emp.id, selectedPeriod, h50, h100, "pointeuse");
            await api.confirmOvertimeMonthly(emp.id, selectedPeriod);
          }
        } catch (e) { console.error(`OT compute error for emp ${emp.id}:`, e); }
      }
    } catch (e) { console.error(e); }
    finally { setComputingOvertime(false); }
  };

  const toggleOvertimePreview = (empId: number) => {
    setShowOvertimePreview(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const loadPreCalcReview = async () => {
    if (!selectedPeriod) return;
    setLoadingPreCalc(true);
    try {
      const activeEmps = employees.filter(e => e.actif);
      const data: Record<number, { rubriques: Record<string, { libelle: string; value: number }>[], bonuses: Record<string, unknown>[], overtime: Record<string, unknown> | null, attendanceDays: number, leaves?: { id: number; leave_type: string; start_date: string; end_date: string; days_count: number; reason: string | null; status: string }[], pendingLeaveCount?: number, congeDays?: number, sickDays?: number, absentDays?: number, workingDays?: number }> = {};
      const overrides: Record<number, Record<string, number>> = {};
      for (const emp of activeEmps) {
        try {
          const summary = await api.getPreCalcSummary(emp.id, selectedPeriod);
          const rubriques = (Array.isArray(summary.rubriques) ? summary.rubriques : []) as Record<string, { libelle: string; value: number }>[];
          data[emp.id] = {
            rubriques,
            bonuses: (Array.isArray(summary.bonuses) ? summary.bonuses : []) as Record<string, unknown>[],
            overtime: (summary.overtime ?? null) as Record<string, unknown> | null,
            attendanceDays: Number(summary.attendance_days ?? 0),
            leaves: Array.isArray(summary.leaves) ? summary.leaves as { id: number; leave_type: string; start_date: string; end_date: string; days_count: number; reason: string | null; status: string }[] : undefined,
            pendingLeaveCount: Number(summary.pending_leave_count ?? 0),
            congeDays: Number(summary.conge_days ?? 0),
            sickDays: Number(summary.sick_days ?? 0),
            absentDays: Number(summary.absent_days ?? 0),
            workingDays: Number(summary.working_days ?? 0),
          };
          // Initialize overrides with current rubrique values
          const empOverrides: Record<string, number> = {};
          for (const r of rubriques) {
            const code = String(r.code ?? "");
            empOverrides[code] = Number(r.value ?? 0);
          }
          overrides[emp.id] = empOverrides;
        } catch (e) {
          console.error(`Pre-calc error for emp ${emp.id}:`, e);
        }
      }
      setPreCalcData(data);
      setRubOverrides(overrides);
    } catch (e) { console.error(e); }
    finally { setLoadingPreCalc(false); }
  };

  const togglePreCalcExpand = (empId: number) => {
    setExpandedPreCalc(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const updateRubOverride = (empId: number, code: string, value: number) => {
    setRubOverrides(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] ?? {}), [code]: value },
    }));
  };

  const loadHistory = async (period: string) => {
    setLoading(true);
    setExpandedRows(new Set());
    setCalcResults({});
    setHistoricalPayslips({});
    try {
      const h = await api.getAllSalaryHistory(period);
      setHistory(h);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateAll = async () => {
    if (!selectedPeriod) return;
    await loadPreCalcReview();
    const targetEmps = calcSelectedIds.size > 0
      ? employees.filter(e => calcSelectedIds.has(e.id))
      : employees.filter(e => e.actif);
    if (targetEmps.length === 0) return;

    setCalculating(true);
    setMessage("");
    setCalcPartialResults([]);
    setCalcProgress({ done: 0, total: targetEmps.length, current: "" });

    const hasOverrides = Object.keys(rubOverrides).length > 0 && Object.values(rubOverrides).some(r => Object.keys(r).length > 0);
    let count = 0;
    let errors = 0;

    for (const emp of targetEmps) {
      setCalcProgress(prev => ({ ...prev, current: `${emp.nom} ${emp.prenom}` }));
      try {
        const overrides = rubOverrides[emp.id] || {};
        const inputValues: Record<string, [number, number]> = {};
        if (hasOverrides) {
          for (const [code, val] of Object.entries(overrides)) {
            inputValues[code] = [val, 0];
          }
        }
        const result = await api.calculateSalary(emp.id, selectedPeriod, inputValues);
        await api.saveSalaryCalculation(result);
        count++;
        // Add partial result so it shows immediately
        setCalcPartialResults(prev => [...prev, {
          id: result.employee_id,
          employee_id: result.employee_id,
          matricule: emp.matricule,
          nom: emp.nom,
          prenom: emp.prenom,
          source: "app",
          total_brut: result.total_brut,
          base_cotisable: result.base_cotisable,
          base_imposable: result.base_imposable,
          irg: result.irg,
          total_retenues: result.total_retenues,
          net_payer: result.net_payer,
        } as SalaryHistoryEntry]);
      } catch (e) {
        errors++;
        console.error(`Calc error for emp ${emp.id}:`, e);
      }
      setCalcProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    setMessage(`Calculé: ${count} employés${errors > 0 ? `, ${errors} erreurs` : ""} — ${selectedPeriod}`);
    await loadHistory(selectedPeriod);
    await loadPeriods();
    setCalcPartialResults([]);
    setCalculating(false);
  };

  const handleDeleteMonth = async () => {
    if (!selectedPeriod) return;
    if (!confirm(`Delete all calculations for ${selectedPeriod}? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const count = await api.deleteMonthCalculations(selectedPeriod);
      setMessage(`Deleted ${count} calculations for ${selectedPeriod}`);
      await loadHistory(selectedPeriod);
      await loadPeriods();
    } catch (e) {
      setMessage(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNewMonth = () => {
    const period = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    setSelectedPeriod(period);
  };

  const rowKey = (h: SalaryHistoryEntry) => `${h.source}-${h.id}`;

  const toggleRow = async (h: SalaryHistoryEntry) => {
    const key = rowKey(h);
    const next = new Set(expandedRows);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      if (h.employee_id && h.source === "app" && !calcResults[key]) {
        try {
          const result = await api.getSavedCalculation(h.employee_id, selectedPeriod);
          if (result) {
            setCalcResults(prev => ({ ...prev, [key]: result }));
          }
        } catch (e) { console.error(e); }
      }
      if (h.employee_id && h.source === "pcpaie" && !historicalPayslips[key]) {
        try {
          const rowPeriod = h.period ?? selectedPeriod;
          const payslip = await api.getHistoricalPayslip(h.employee_id, rowPeriod);
          setHistoricalPayslips(prev => ({ ...prev, [key]: payslip }));
        } catch (e) { console.error(e); }
      }
    }
    setExpandedRows(next);
  };

  // Merge partial results with history during calculation
  const displayHistory = calculating && calcPartialResults.length > 0
    ? [...calcPartialResults].sort((a, b) => {
        const nameA = `${a.nom ?? ""} ${a.prenom ?? ""}`;
        const nameB = `${b.nom ?? ""} ${b.prenom ?? ""}`;
        return nameA.localeCompare(nameB);
      })
    : [...history].sort((a, b) => {
        const nameA = `${a.nom ?? ""} ${a.prenom ?? ""}`;
        const nameB = `${b.nom ?? ""} ${b.prenom ?? ""}`;
        return nameA.localeCompare(nameB);
      });

  const toggleCalcSelect = (id: number) => {
    setCalcSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCalc = () => {
    setCalcSelectedIds(new Set(employees.filter(e => e.actif).map(e => e.id)));
  };

  const clearCalcSelect = () => {
    setCalcSelectedIds(new Set());
  };

  const appCount = history.filter(h => h.source === "app").length;
  const pcpaieCount = history.filter(h => h.source === "pcpaie").length;

  const overtimeCount = Object.values(overtimeEntries).filter(e => (e.hours_50 ?? 0) > 0 || (e.hours_100 ?? 0) > 0).length;
  const preCalcEditCount = Object.values(rubOverrides).reduce((sum, overrides) => sum + Object.keys(overrides).length, 0);

  const [resultsSearch, setResultsSearch] = useState("");
  const [resultsFilterSource, setResultsFilterSource] = useState("");
  const [resultsFilterSection, setResultsFilterSection] = useState("");
  const [resultsSortBy, setResultsSortBy] = useState("name");
  const [resultsSelectedRows, setResultsSelectedRows] = useState<Set<string>>(new Set());

  const toggleResultRowSelection = (key: string) => {
    setResultsSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const selectAllResultRows = () => setResultsSelectedRows(new Set(filteredHistory.map(h => `${h.source}-${h.id}`)));
  const clearResultRowSelection = () => setResultsSelectedRows(new Set());

  const filteredHistory = useMemo(() => {
    let result = [...displayHistory];
    if (resultsSearch) {
      const q = resultsSearch.toLowerCase();
      result = result.filter(h => `${h.nom} ${h.prenom} ${h.matricule}`.toLowerCase().includes(q));
    }
    if (resultsFilterSource) {
      result = result.filter(h => h.source === resultsFilterSource);
    }
    if (resultsSortBy === "name") {
      result.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));
    } else if (resultsSortBy === "brut_desc") {
      result.sort((a, b) => (b.total_brut ?? 0) - (a.total_brut ?? 0));
    } else if (resultsSortBy === "brut_asc") {
      result.sort((a, b) => (a.total_brut ?? 0) - (b.total_brut ?? 0));
    } else if (resultsSortBy === "net_desc") {
      result.sort((a, b) => (b.net_payer ?? 0) - (a.net_payer ?? 0));
    } else if (resultsSortBy === "net_asc") {
      result.sort((a, b) => (a.net_payer ?? 0) - (b.net_payer ?? 0));
    }
    return result;
  }, [displayHistory, resultsSearch, resultsFilterSource, resultsSortBy]);

  const stepStatus = {
    period: selectedPeriod ? "done" as const : "pending" as const,
    overtime: overtimeCount > 0 ? "done" as const : "skip" as const,
    precalc: preCalcEditCount > 0 ? "done" as const : "skip" as const,
    calculate: appCount > 0 ? "done" as const : "pending" as const,
    payslip: "pending" as const,
  };

  const ctxValue: SalaryContextValue = {
    periods, selectedPeriod, setSelectedPeriod, history, loading, calculating, message,
    employees, sections, structures, affectatios,
    calcSelectedIds, toggleCalcSelect, selectAllCalc, clearCalcSelect, calcProgress, displayHistory,
    expandedRows, toggleRow, calcResults, historicalPayslips, payslipPreview, setPayslipPreview,
    handleStartNewMonth, handleCalculateAll, handleDeleteMonth,
    showBonusModal, setShowBonusModal, showEditBonusModal, setShowEditBonusModal,
    showRubFlagsModal, setShowRubFlagsModal, showOvertimeModal, setShowOvertimeModal,
    showPreCalcModal, setShowPreCalcModal,
    periodBonuses, loadingBonuses, allBonuses, skippedBonusIds, toggleSkipBonus, handleDeleteBonus, startEditBonus,
    bonusTitle, handleBonusTitleChange, bonusType, handleBonusTypeChange, bonusAmount, setBonusAmount,
    bonusIsPercent, setBonusIsPercent, bonusRubCode, setBonusRubCode, bonusTarget, setBonusTarget,
    bonusTargetValue, setBonusTargetValue, bonusRecurrence, setBonusRecurrence, bonusRecurrenceCount, setBonusRecurrenceCount,
    bonusIsAbsenceDep, setBonusIsAbsenceDep, bonusAbsenceDiv, setBonusAbsenceDiv,
    bonusAmountType, setBonusAmountType, bonusIncomeMin, setBonusIncomeMin,
    bonusIncomeMax, setBonusIncomeMax, bonusContractTypes, setBonusContractTypes,
    selectedEmpIds, setSelectedEmpIds, toggleEmp, empSearch, setEmpSearch,
    filterSection, setFilterSection, filterStructure, setFilterStructure, filterAffectatio, setFilterAffectatio,
    filteredEmployees, rubSuggestion, rubMatch, showNewRubrique, setShowNewRubrique,
    newRubLibelle, setNewRubLibelle, newRubImposable, setNewRubImposable, newRubCotisable, setNewRubCotisable,
    creatingRubrique, handleCreateRubrique, creatingBonus, handleCreateBonus, resetBonusForm, availableRubriques,
    editingBonusId, editTitle, handleEditTitleChange, editType, setEditType, editAmount, setEditAmount,
    editIsPercent, setEditIsPercent, editRubCode, setEditRubCode, editRubMatch,
    editRecurrence, setEditRecurrence, editRecurrenceCount, setEditRecurrenceCount,
    editTarget, setEditTarget, editTargetValue, setEditTargetValue,
    editSelectedEmpIds, setEditSelectedEmpIds, toggleEditEmp, editEmpSearch, setEditEmpSearch,
    editFilterSection, setEditFilterSection, editFilterStructure, setEditFilterStructure,
    editFilterAffectatio, setEditFilterAffectatio, editPayPeriod, setEditPayPeriod,
    editIsImposable, setEditIsImposable, editIsCotisable, setEditIsCotisable,
    editDescription, setEditDescription, savingEdit, handleSaveEditBonus, cancelEditBonus,
    overtimeEntries, loadingOvertime, overtimeEmpSearch, setOvertimeEmpSearch, computingOvertime,
    overtimePreview, showOvertimePreview, toggleOvertimePreview, handleSaveOvertime,
    handleComputeOvertimeFromAttendance, handleComputeAllOvertime, setOvertimeEntries,
    preCalcData, rubOverrides, loadingPreCalc, expandedPreCalc, togglePreCalcExpand,
    preCalcSearch, setPreCalcSearch, updateRubOverride, loadPreCalcReview,
    rubriques, setRubriques, appCount, pcpaieCount,
    stepStatus, overtimeCount, preCalcEditCount,
    resultsSearch, setResultsSearch, resultsFilterSource, setResultsFilterSource,
    resultsFilterSection, setResultsFilterSection, resultsSortBy, setResultsSortBy,
    resultsSelectedRows, toggleResultRowSelection, selectAllResultRows, clearResultRowSelection,
    filteredHistory,
    navigateToBonuses: () => onNavigate?.("bonuses"),
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); handleCalculateAll(); }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Rechercher par nom"]');
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCalculateAll]);

  return (
    <SalaryContext.Provider value={ctxValue}>
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion de la Paie</h1>
          <p className="mt-1 text-sm text-gray-500">Calcul des salaires, primes et rubriques de paie</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <PeriodSelector
              value={selectedPeriod || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
              onChange={setSelectedPeriod}
              availablePeriods={periods}
            />
          </div>
        </div>

        <ActionBar />
        <WorkflowStepper />
        <EmployeeSelector />
        <BonusSummary />
        <ResultsTable />

        <BonusModal />
        <EditBonusModal />
        <RubFlagsModal />
        <OvertimeModal />
        <PreCalcModal />

        {payslipPreview && (
          <PayslipPDF result={payslipPreview} onClose={() => setPayslipPreview(null)} />
        )}
      </div>
      </div>
    </SalaryContext.Provider>
  );
}
