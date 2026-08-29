import { useState, useEffect, Fragment } from "react";
import { api, type CalcResult, type SalaryHistoryEntry, type HistoricalPayslip, type Bonus, type EmployeeSummary } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { PayslipPDF } from "./PayslipPDF";
import { PeriodSelector } from "./PeriodSelector";
import {
  Calculator, Calendar, Trash2, Loader2, ChevronDown, ChevronRight,
  DollarSign, History, Play, Plus, Gift, Search, Settings, Clock,
  Pause, FileText,
} from "lucide-react";

export function SalaryPage() {
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
  const [showSetup, setShowSetup] = useState(true);
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
  const [showPreCalc, setShowPreCalc] = useState(false);
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

  const sections = [...new Set(employees.map(e => e.section).filter(Boolean))] as string[];
  const structures = [...new Set(employees.map(e => e.structure).filter(Boolean))] as string[];
  const affectatios = [...new Set(employees.map(e => e.affectatio).filter(Boolean))] as string[];

  const filteredEmployees = employees.filter(e => {
    if (filterSection && e.section !== filterSection) return false;
    if (filterStructure && e.structure !== filterStructure) return false;
    if (filterAffectatio && e.affectatio !== filterAffectatio) return false;
    if (empSearch) {
      const q = empSearch.toLowerCase();
      if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false;
    }
    return e.actif;
  });

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
        null, null, "fixed", null, null, null,
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
  };

  const cancelEditBonus = () => {
    setEditingBonusId(null);
    setEditRubMatch(null);
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
        employee_ids: empIds,
        is_imposable: editIsImposable,
        is_cotisable: editIsCotisable,
      });
      setEditingBonusId(null);
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
      const data: Record<number, { rubriques: Record<string, { libelle: string; value: number }>[], bonuses: Record<string, unknown>[], overtime: Record<string, unknown> | null, attendanceDays: number }> = {};
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
            inputValues[code] = [val, 1];
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
          const result = await api.calculateSalary(h.employee_id, selectedPeriod, {});
          setCalcResults(prev => ({ ...prev, [key]: result }));
        } catch (e) { console.error(e); }
      }
      if (h.employee_id && h.source === "pcpaie" && !historicalPayslips[key]) {
        try {
          const payslip = await api.getHistoricalPayslip(h.employee_id, selectedPeriod);
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Salary Management</h1>
      <p className="mt-1 text-sm text-gray-500">Calculate salaries for all employees, view history, and manage payroll periods</p>

      {/* Period selector + actions */}
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

          <button
            onClick={handleStartNewMonth}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Play className="h-4 w-4" /> Start Current Month
          </button>

          {selectedPeriod && (
            <>
              <button
                onClick={handleCalculateAll}
                disabled={calculating}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                {calcSelectedIds.size > 0 ? `Calculer (${calcSelectedIds.size} sélectionnés)` : `Calculer tout — ${selectedPeriod}`}
              </button>

              <button
                onClick={() => {
                  if (!showPreCalc) {
                    loadPreCalcReview();
                  }
                  setShowPreCalc(!showPreCalc);
                }}
                className="flex items-center gap-2 rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                <History className="h-4 w-4" /> Pre-calc Review
              </button>

              <button
                onClick={handleDeleteMonth}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" /> Delete Month
              </button>
            </>
          )}
        </div>

        {message && (
          <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{message}</div>
        )}

        {/* Calculation progress bar */}
        {calculating && calcProgress.total > 0 && (
          <div className="mt-3 rounded-lg bg-green-50 p-3">
            <div className="flex items-center justify-between text-sm text-green-800 mb-1">
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Calcul en cours... {calcProgress.current}
              </span>
              <span className="font-medium">{calcProgress.done}/{calcProgress.total}</span>
            </div>
            <div className="h-2 rounded-full bg-green-200 overflow-hidden">
              <div
                className="h-full bg-green-600 transition-all duration-300"
                style={{ width: `${(calcProgress.done / calcProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Employee selection for calculation */}
      {selectedPeriod && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-gray-500" />
              Sélection employés pour le calcul
              {calcSelectedIds.size > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 font-medium">
                  {calcSelectedIds.size} sélectionné{calcSelectedIds.size > 1 ? "s" : ""}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <button onClick={selectAllCalc} className="text-blue-600 hover:text-blue-700 font-medium">Tout sélectionner</button>
              <span className="text-gray-300">|</span>
              <button onClick={clearCalcSelect} className="text-gray-500 hover:text-gray-700 font-medium">Effacer</button>
            </div>
          </div>
          {calcSelectedIds.size === 0 && (
            <p className="text-xs text-gray-400 mb-2">Aucune sélection = calculer pour tous les employés actifs</p>
          )}
          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 p-2">
              {employees.filter(e => e.actif).map(emp => {
                const checked = calcSelectedIds.has(emp.id);
                return (
                  <label key={emp.id} className={`flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer ${checked ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCalcSelect(emp.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span className="font-mono text-gray-500">{emp.matricule}</span>
                    <span className="truncate">{emp.nom} {emp.prenom}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Period Setup Panel */}
      {selectedPeriod && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="h-4 w-4 text-gray-500" />
              Period Setup — {selectedPeriod}
            </h2>
            <button
              onClick={() => setShowSetup(!showSetup)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              {showSetup ? "Hide" : "Show"} Setup
            </button>
          </div>

          {showSetup && (
            <div className="mt-4 space-y-4">
              {/* Existing period bonuses list */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <Gift className="h-3.5 w-3.5" />
                  Bonuses & Deductions for {selectedPeriod}
                  {loadingBonuses && <Loader2 className="h-3 w-3 animate-spin" />}
                </h3>
                {periodBonuses.length === 0 ? (
                  <p className="text-xs text-gray-400">No bonuses or deductions set for this period yet.</p>
                ) : (
                  <div className="space-y-1">
                    {periodBonuses.map(b => {
                      const isPaused = skippedBonusIds.has(b.id);
                      return (
                      <div key={b.id} className={`rounded-lg border px-3 py-2 text-xs ${isPaused ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-100"}`}>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${b.bonus_type === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {b.bonus_type}
                          </span>
                          <span className={`font-medium ${isPaused ? "text-gray-400 line-through" : "text-gray-900"}`}>{b.title}</span>
                          <span className="text-gray-500">{b.is_percentage ? `${b.amount}%` : formatCurrency(b.amount)}</span>
                          {b.rubrique_code && <span className="font-mono text-gray-400">R{b.rubrique_code}</span>}
                          {/* Recurrence badge */}
                          {b.recurrence_type && b.recurrence_type !== "one_time" && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 font-medium">
                              {b.recurrence_type === "recurring"
                                ? `Recurring (${b.recurrence_count ?? 0}x)`
                                : "Permanent"}
                            </span>
                          )}
                          {/* Target badge */}
                          <span className="text-gray-400">
                            {b.target_type === "all" ? "Everyone"
                              : b.target_type === "individual"
                                ? `${b.assigned_employees?.length ?? 0} employee(s)`
                                : `${b.target_type}: ${b.target_value ?? ""}`}
                          </span>
                          {/* Period badge */}
                          {b.pay_period === null && (
                            <span className="text-gray-400 italic">(all periods)</span>
                          )}
                          {/* Paused badge */}
                          {isPaused && (
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-600 font-medium flex items-center gap-1">
                              <Pause className="h-3 w-3" /> En pause
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              onClick={() => toggleSkipBonus(b.id)}
                              title={isPaused ? "Reprendre pour ce mois" : "Mettre en pause pour ce mois"}
                              className={isPaused ? "text-green-500 hover:text-green-700" : "text-amber-500 hover:text-amber-700"}
                            >
                              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => handleDeleteBonus(b.id)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => startEditBonus(b)} className="text-blue-500 hover:text-blue-700">
                              <Settings className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* Show assigned employee names for individual targets */}
                        {b.target_type === "individual" && b.assigned_employees && b.assigned_employees.length > 0 && (
                          <div className="mt-1 ml-6 flex flex-wrap gap-1">
                            {b.assigned_employees.map(([id, name]) => (
                              <span key={id} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add new bonus/deduction form */}
              <div className="border-t border-gray-200 pt-3">
                <h3 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter une prime / indemnité / retenue pour {selectedPeriod}
                </h3>

                {/* Step 1: Type selector - gain or retenue */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">1. Type</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBonusTypeChange("bonus")}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${bonusType === "bonus" ? "bg-green-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-green-50"}`}
                    >
                      <span className={`rounded-full px-2 py-0.5 text-xs ${bonusType === "bonus" ? "bg-green-700" : "bg-green-100 text-green-700"}`}>+</span>
                      Prime / Indemnité (gain)
                    </button>
                    <button
                      onClick={() => handleBonusTypeChange("deduction")}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${bonusType === "deduction" ? "bg-red-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-red-50"}`}
                    >
                      <span className={`rounded-full px-2 py-0.5 text-xs ${bonusType === "deduction" ? "bg-red-700" : "bg-red-100 text-red-700"}`}>−</span>
                      Retenue (déduction)
                    </button>
                  </div>
                </div>

                {/* Step 2: Title with auto-suggestion */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">2. Libellé</label>
                  <input value={bonusTitle} onChange={e => handleBonusTitleChange(e.target.value)} placeholder={bonusType === "bonus" ? "ex: Prime de rendement, Indemnité de transport..." : "ex: Retenue SS, Avance sur salaire..."} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  {rubSuggestion && (
                    <div className={`mt-1.5 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${rubSuggestion.similarity >= 0.8 ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                      <span className="font-bold">{rubSuggestion.similarity >= 0.8 ? "✓" : "≈"}</span>
                      <span>Similaire à « {rubSuggestion.title} »</span>
                      {rubSuggestion.code ? (
                        <button onClick={() => setBonusRubCode(rubSuggestion.code)} className="ml-auto rounded bg-white px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50 border border-blue-200">
                          → R{rubSuggestion.code}
                        </button>
                      ) : (
                        <span className="ml-auto text-gray-500">(sans rubrique)</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 3: Rubrique picker - with fuzzy match suggestion */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    3. Rubrique de paie {bonusRubCode && <span className="text-green-600 font-medium">✓ R{bonusRubCode}</span>}
                  </label>

                  {/* Fuzzy match suggestion from rubrique libelles */}
                  {rubMatch && rubMatch.similarity >= 0.3 && bonusRubCode !== rubMatch.code && (
                    <div className={`mb-2 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${rubMatch.similarity >= 0.7 ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                      <span className="font-bold">{rubMatch.similarity >= 0.7 ? "🎯" : "💡"}</span>
                      <span>Rubrique similaire: <strong>R{rubMatch.code}</strong> — {rubMatch.libelle}</span>
                      <button onClick={() => setBonusRubCode(rubMatch.code)} className="ml-auto rounded bg-white px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50 border border-blue-200">
                        Choisir
                      </button>
                    </div>
                  )}

                  <select
                    value={bonusRubCode}
                    onChange={e => {
                      if (e.target.value === "__new__") {
                        setShowNewRubrique(true);
                        setNewRubLibelle(bonusTitle.trim());
                      } else {
                        setBonusRubCode(e.target.value);
                        setShowNewRubrique(false);
                      }
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${bonusRubCode ? "border-green-300 bg-green-50/30" : "border-gray-300"}`}
                  >
                    <option value="">— Choisir une rubrique —</option>
                    {availableRubriques.map(r => (
                      <option key={String(r.code)} value={String(r.code)}>
                        R{String(r.code)} — {String(r.libelle ?? "—")}
                      </option>
                    ))}
                    <option value="__new__">+ Créer une nouvelle rubrique...</option>
                  </select>

                  {/* Create new rubrique inline form */}
                  {showNewRubrique && (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nouvelle rubrique ({bonusType === "bonus" ? "Gain" : "Retenue"})</label>
                      <input
                        value={newRubLibelle}
                        onChange={e => setNewRubLibelle(e.target.value)}
                        placeholder="Libellé de la rubrique..."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2"
                      />
                      <div className="flex gap-4 mb-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-700">
                          <input type="checkbox" checked={newRubImposable} onChange={e => setNewRubImposable(e.target.checked)} />
                          Imposable (IRG)
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-700">
                          <input type="checkbox" checked={newRubCotisable} onChange={e => setNewRubCotisable(e.target.checked)} />
                          Cotisable (SS)
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateRubrique}
                          disabled={!newRubLibelle.trim() || creatingRubrique}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {creatingRubrique ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
                        </button>
                        <button onClick={() => setShowNewRubrique(false)} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Code auto à partir de R800 · {newRubImposable ? "Soumis à l'IRG" : "Non soumis à l'IRG"} · {newRubCotisable ? "Soumis à la SS" : "Non soumis à la SS"}</p>
                    </div>
                  )}

                  {!bonusRubCode && !showNewRubrique && (
                    <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                      <span>⚠</span> Sans rubrique, {bonusType === "bonus" ? "cette prime" : "cette retenue"} ne sera pas incluse dans le calcul du salaire
                    </p>
                  )}
                </div>

                {/* Step 4: Amount */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">4. Montant</label>
                    <div className="flex gap-2">
                      <input type="number" step="0.01" value={bonusAmount} onChange={e => setBonusAmount(parseFloat(e.target.value) || 0)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                        <input type="checkbox" checked={bonusIsPercent} onChange={e => setBonusIsPercent(e.target.checked)} />
                        % du brut
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Récurrence</label>
                    <select value={bonusRecurrence} onChange={e => setBonusRecurrence(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="one_time">Une fois (ce mois)</option>
                      <option value="recurring">Récurrent (N mois)</option>
                      <option value="permanent">Permanent (toujours)</option>
                    </select>
                  </div>
                </div>
                {bonusRecurrence === "recurring" && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de mois</label>
                    <input type="number" min="1" value={bonusRecurrenceCount} onChange={e => setBonusRecurrenceCount(parseInt(e.target.value) || 0)} className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                )}

                {/* Step 5: Target */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">5. Destinataires</label>
                  <div className="flex gap-2 flex-wrap">
                    {["all", "individual", "section", "structure", "affectatio"].map(t => (
                      <button
                        key={t}
                        onClick={() => { setBonusTarget(t); setBonusTargetValue(""); setSelectedEmpIds(new Set()); setFilterSection(""); setFilterStructure(""); setFilterAffectatio(""); }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${bonusTarget === t ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                      >
                        {t === "all" ? "Tout le monde" : t === "individual" ? "Employé(s) spécifique(s)" : `Par ${t}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Individual employee picker */}
                {bonusTarget === "individual" && (
                  <div className="mb-3 rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Search className="h-4 w-4 text-gray-400" />
                      <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Rechercher par nom ou matricule..." className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                      {filterSection && <button onClick={() => setFilterSection("")} className="text-xs text-blue-600">Effacer filtre</button>}
                    </div>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                        <option value="">Toutes sections</option>
                        {sections.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select value={filterStructure} onChange={e => setFilterStructure(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                        <option value="">Toutes structures</option>
                        {structures.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select value={filterAffectatio} onChange={e => setFilterAffectatio(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                        <option value="">Toutes affectatios</option>
                        {affectatios.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {filteredEmployees.map(emp => (
                        <label key={emp.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white cursor-pointer">
                          <input type="checkbox" checked={selectedEmpIds.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                          <span className="font-mono text-gray-500 w-16">{emp.matricule}</span>
                          <span className="flex-1">{emp.nom} {emp.prenom}</span>
                          {emp.section && <span className="text-gray-400">{emp.section}</span>}
                        </label>
                      ))}
                    </div>
                    {selectedEmpIds.size > 0 && (
                      <p className="mt-2 text-xs text-blue-600">{selectedEmpIds.size} employé(s) sélectionné(s)</p>
                    )}
                  </div>
                )}

                {/* Group target value picker */}
                {bonusTarget === "section" && (
                  <div className="mb-3">
                    <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Choisir une section...</option>
                      {sections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {bonusTarget === "structure" && (
                  <div className="mb-3">
                    <select value={filterStructure} onChange={e => setFilterStructure(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Choisir une structure...</option>
                      {structures.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {bonusTarget === "affectatio" && (
                  <div className="mb-3">
                    <select value={filterAffectatio} onChange={e => setFilterAffectatio(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Choisir une affectatio...</option>
                      {affectatios.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {/* Create button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCreateBonus}
                    disabled={!bonusTitle.trim() || creatingBonus || (bonusTarget === "individual" && selectedEmpIds.size === 0)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${bonusType === "bonus" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                  >
                    {creatingBonus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Ajouter {bonusType === "bonus" ? "la prime" : "la retenue"}
                  </button>
                  <button onClick={resetBonusForm} className="text-sm text-gray-500 hover:text-gray-700">Réinitialiser</button>
                </div>
              </div>

              {/* Edit bonus panel */}
              {editingBonusId !== null && (
                <div className="border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <Settings className="h-3.5 w-3.5" />
                      Edit Bonus / Deduction
                    </h3>
                    <button onClick={cancelEditBonus} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Title</label>
                      <input value={editTitle} onChange={e => handleEditTitleChange(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      {editRubMatch && editRubMatch.similarity >= 0.3 && editRubCode !== editRubMatch.code && (
                        <div className={`mt-1.5 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${editRubMatch.similarity >= 0.7 ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                          <span className="font-bold">{editRubMatch.similarity >= 0.7 ? "🎯" : "💡"}</span>
                          <span>Rubrique similaire: <strong>R{editRubMatch.code}</strong> — {editRubMatch.libelle}</span>
                          <button onClick={() => setEditRubCode(editRubMatch.code)} className="ml-auto rounded bg-white px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50 border border-blue-200">
                            Choisir
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                        <option value="bonus">Bonus (gain)</option>
                        <option value="deduction">Deduction (retenue)</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Description</label>
                      <input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description optionnelle..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(parseFloat(e.target.value) || 0)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                          <input type="checkbox" checked={editIsPercent} onChange={e => setEditIsPercent(e.target.checked)} />
                          % of base
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Rubrique Code</label>
                      <select
                        value={editRubCode}
                        onChange={e => setEditRubCode(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">— Auto / Aucune —</option>
                        {rubriques
                          .filter(r => {
                            const classe = Number(r.classe ?? 0);
                            const isManual = Number(r.manuelle ?? 0) === 1 || !String(r.formule ?? "").trim();
                            const hasLabel = String(r.libelle ?? "").trim().length > 0;
                            if (!hasLabel || !isManual) return false;
                            if (editType === "bonus") return classe === 1;
                            if (editType === "deduction") return classe === 2;
                            return true;
                          })
                          .map(r => (
                            <option key={String(r.code)} value={String(r.code)}>
                              R{String(r.code)} — {String(r.libelle ?? "—")}
                            </option>
                          ))}
                      </select>
                      {!editRubCode && (
                        <p className="mt-1 text-xs text-amber-600">⚠ Sans rubrique, ce bonus ne sera pas inclus dans le calcul automatiquement</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Recurrence</label>
                      <select value={editRecurrence} onChange={e => setEditRecurrence(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                        <option value="one_time">One time</option>
                        <option value="recurring">Recurring (N periods)</option>
                        <option value="permanent">Permanent (all future)</option>
                      </select>
                    </div>
                    {editRecurrence === "recurring" && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Number of periods</label>
                        <input type="number" min="1" value={editRecurrenceCount} onChange={e => setEditRecurrenceCount(parseInt(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Période de début</label>
                      <input type="month" value={editPayPeriod ?? ""} onChange={e => setEditPayPeriod(e.target.value || null)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      <p className="mt-0.5 text-xs text-gray-400">Laisser vide = toutes les périodes</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input type="checkbox" checked={editIsImposable} onChange={e => setEditIsImposable(e.target.checked)} />
                        Imposable (IRG)
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input type="checkbox" checked={editIsCotisable} onChange={e => setEditIsCotisable(e.target.checked)} />
                        Cotisable (SS)
                      </label>
                    </div>
                    {editingBonusId !== null && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSkipBonus(editingBonusId)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${skippedBonusIds.has(editingBonusId) ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}
                        >
                          {skippedBonusIds.has(editingBonusId) ? <><Play className="h-3 w-3" /> Reprendre pour {selectedPeriod}</> : <><Pause className="h-3 w-3" /> Mettre en pause pour {selectedPeriod}</>}
                        </button>
                        {skippedBonusIds.has(editingBonusId) && (
                          <span className="text-xs text-gray-500 italic">En pause pour ce mois</span>
                        )}
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Target</label>
                      <div className="flex gap-2 flex-wrap">
                        {["all", "individual", "section", "structure", "affectatio"].map(t => (
                          <button key={t} onClick={() => { setEditTarget(t); setEditSelectedEmpIds(new Set()); setEditFilterSection(""); setEditFilterStructure(""); setEditFilterAffectatio(""); }}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${editTarget === t ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                            {t === "all" ? "Everyone" : t === "individual" ? "Individual(s)" : `By ${t}`}
                          </button>
                        ))}
                      </div>
                    </div>
                    {editTarget === "individual" && (
                      <div className="col-span-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
                        <div className="flex items-center gap-2 mb-2">
                          <Search className="h-4 w-4 text-gray-400" />
                          <input value={editEmpSearch} onChange={e => setEditEmpSearch(e.target.value)} placeholder="Search..." className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                        </div>
                        <div className="flex gap-2 mb-2 flex-wrap">
                          <select value={editFilterSection} onChange={e => setEditFilterSection(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                            <option value="">All sections</option>
                            {sections.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={editFilterStructure} onChange={e => setEditFilterStructure(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                            <option value="">All structures</option>
                            {structures.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={editFilterAffectatio} onChange={e => setEditFilterAffectatio(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                            <option value="">All affectatios</option>
                            {affectatios.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-0.5">
                          {employees.filter(e => {
                            if (!e.actif) return false;
                            if (editFilterSection && e.section !== editFilterSection) return false;
                            if (editFilterStructure && e.structure !== editFilterStructure) return false;
                            if (editFilterAffectatio && e.affectatio !== editFilterAffectatio) return false;
                            if (editEmpSearch) {
                              const q = editEmpSearch.toLowerCase();
                              if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false;
                            }
                            return true;
                          }).map(emp => (
                            <label key={emp.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white cursor-pointer">
                              <input type="checkbox" checked={editSelectedEmpIds.has(emp.id)} onChange={() => toggleEditEmp(emp.id)} />
                              <span className="font-mono text-gray-500 w-16">{emp.matricule}</span>
                              <span className="flex-1">{emp.nom} {emp.prenom}</span>
                            </label>
                          ))}
                        </div>
                        {editSelectedEmpIds.size > 0 && <p className="mt-2 text-xs text-blue-600">{editSelectedEmpIds.size} employee(s) selected</p>}
                      </div>
                    )}
                    {editTarget === "section" && (
                      <div className="col-span-2">
                        <select value={editFilterSection || editTargetValue} onChange={e => setEditFilterSection(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                          <option value="">Select section...</option>
                          {sections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    {editTarget === "structure" && (
                      <div className="col-span-2">
                        <select value={editFilterStructure || editTargetValue} onChange={e => setEditFilterStructure(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                          <option value="">Select structure...</option>
                          {structures.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    {editTarget === "affectatio" && (
                      <div className="col-span-2">
                        <select value={editFilterAffectatio || editTargetValue} onChange={e => setEditFilterAffectatio(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                          <option value="">Select affectatio...</option>
                          {affectatios.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="col-span-2 flex items-center gap-3">
                      <button onClick={handleSaveEditBonus} disabled={!editTitle.trim() || savingEdit || (editTarget === "individual" && editSelectedEmpIds.size === 0)}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                        Save Changes
                      </button>
                      <button onClick={cancelEditBonus} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Overtime editing section */}
              <div className="border-t border-gray-200 pt-3">
                <h3 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Heures supplémentaires — {selectedPeriod}
                  {loadingOvertime && <Loader2 className="h-3 w-3 animate-spin" />}
                  <button
                    onClick={handleComputeAllOvertime}
                    disabled={computingOvertime}
                    className="ml-auto flex items-center gap-1 rounded-lg border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {computingOvertime ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calculator className="h-3 w-3" />}
                    Calculer depuis pointeuse
                  </button>
                </h3>
                <div className="flex items-center gap-2 mb-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input value={overtimeEmpSearch} onChange={e => setOvertimeEmpSearch(e.target.value)} placeholder="Rechercher employé..." className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {employees.filter(e => {
                    if (!e.actif) return false;
                    if (overtimeEmpSearch) {
                      const q = overtimeEmpSearch.toLowerCase();
                      if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false;
                    }
                    return true;
                  }).map(emp => {
                    const ot = overtimeEntries[emp.id];
                    const preview = overtimePreview[emp.id];
                    const showPreview = showOvertimePreview.has(emp.id);
                    return (
                      <div key={emp.id} className="rounded-lg border border-gray-100 px-3 py-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-500 w-16">{emp.matricule}</span>
                          <span className="flex-1">{emp.nom} {emp.prenom}</span>
                          <label className="flex items-center gap-1 text-gray-600">
                            Heures supp. 50%:
                            <input type="number" step="0.5" value={ot?.hours_50 ?? 0} onChange={e => {
                              const v = parseFloat(e.target.value) || 0;
                              setOvertimeEntries(prev => ({ ...prev, [emp.id]: { hours_50: v, hours_100: ot?.hours_100 ?? 0, status: ot?.status ?? "pending" } }));
                            }} className="w-16 rounded border border-gray-300 px-1.5 py-1 text-right" />
                          </label>
                          <label className="flex items-center gap-1 text-gray-600">
                            Heures supp. 100%:
                            <input type="number" step="0.5" value={ot?.hours_100 ?? 0} onChange={e => {
                              const v = parseFloat(e.target.value) || 0;
                              setOvertimeEntries(prev => ({ ...prev, [emp.id]: { hours_50: ot?.hours_50 ?? 0, hours_100: v, status: ot?.status ?? "pending" } }));
                            }} className="w-16 rounded border border-gray-300 px-1.5 py-1 text-right" />
                          </label>
                          <button
                            onClick={() => handleComputeOvertimeFromAttendance(emp.id)}
                            disabled={computingOvertime}
                            className="rounded bg-gray-100 px-2 py-1 text-gray-600 font-medium hover:bg-gray-200 disabled:opacity-50"
                            title="Calculer depuis les données de pointeuse"
                          >
                            {computingOvertime ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pointeuse"}
                          </button>
                          {(ot?.hours_50 || ot?.hours_100) && (
                            <button onClick={() => handleSaveOvertime(emp.id)} className="rounded bg-blue-600 px-2 py-1 text-white font-medium hover:bg-blue-700">Enregistrer</button>
                          )}
                        </div>
                        {preview && (
                          <div className="mt-1">
                            <button onClick={() => toggleOvertimePreview(emp.id)} className="text-blue-600 hover:text-blue-700 text-xs">
                              {showPreview ? "Masquer" : "Voir"} détails ({preview.daily_details.length} jours)
                            </button>
                            {showPreview && (
                              <div className="mt-1 max-h-32 overflow-y-auto rounded bg-gray-50 p-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-0.5">Date</th>
                                      <th className="text-left py-0.5">Jour</th>
                                      <th className="text-right py-0.5">Heures</th>
                                      <th className="text-right py-0.5">HS 50%</th>
                                      <th className="text-right py-0.5">HS 100%</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {preview.daily_details.map((d, i) => (
                                      <tr key={i} className="border-t border-gray-100">
                                        <td className="py-0.5 font-mono">{String(d.day)}</td>
                                        <td className="py-0.5 text-gray-500">{String(d.weekday)}</td>
                                        <td className="py-0.5 text-right">{Number(d.worked_hours).toFixed(2)}h</td>
                                        <td className="py-0.5 text-right">{Number(d.overtime_50).toFixed(2)}h</td>
                                        <td className="py-0.5 text-right">{Number(d.overtime_100).toFixed(2)}h</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pre-calc Review Panel */}
      {selectedPeriod && showPreCalc && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <History className="h-4 w-4 text-blue-600" />
              Pre-calc Review — {selectedPeriod}
              {loadingPreCalc && <Loader2 className="h-4 w-4 animate-spin" />}
            </h2>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input value={preCalcSearch} onChange={e => setPreCalcSearch(e.target.value)} placeholder="Rechercher employé..." className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
              <button onClick={() => loadPreCalcReview()} className="text-xs text-blue-600 hover:text-blue-700">Actualiser</button>
            </div>
          </div>

          {!loadingPreCalc && Object.keys(preCalcData).length > 0 ? (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {employees.filter(e => {
                if (!e.actif) return false;
                if (!preCalcData[e.id]) return false;
                if (preCalcSearch) {
                  const q = preCalcSearch.toLowerCase();
                  if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false;
                }
                return true;
              }).map(emp => {
                const data = preCalcData[emp.id];
                const isExpanded = expandedPreCalc.has(emp.id);
                const overrides = rubOverrides[emp.id] ?? {};
                const hasEdits = data.rubriques.some(r => {
                  const code = String(r.code ?? "");
                  return overrides[code] !== Number(r.value ?? 0);
                });
                return (
                  <div key={emp.id} className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => togglePreCalcExpand(emp.id)}>
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                      <span className="font-mono text-xs text-gray-500 w-16">{emp.matricule}</span>
                      <span className="text-sm font-medium flex-1">{emp.nom} {emp.prenom}</span>
                      <span className="text-xs text-gray-500">{data.attendanceDays} j. présence</span>
                      {data.overtime && (
                        <span className="text-xs text-gray-500">
                          Heures supp.: {Number(data.overtime.hours_50 ?? 0)}h (50%) + {Number(data.overtime.hours_100 ?? 0)}h (100%)
                        </span>
                      )}
                      <span className="text-xs text-gray-500">{data.bonuses.length} primes</span>
                      {hasEdits && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium">Edited</span>}
                    </div>
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                        {/* Bonuses preview */}
                        {data.bonuses.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-gray-600 mb-1">Primes à appliquer :</div>
                            <div className="flex flex-wrap gap-1">
                              {data.bonuses.map((b, i) => (
                                <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${String(b.bonus_type) === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                  {String(b.title)} — {b.is_percentage ? `${b.amount}%` : formatCurrency(Number(b.amount))}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Editable rubrique inputs */}
                        {data.rubriques.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-gray-600 mb-1 flex items-center justify-between">
                              <span>Rubriques (modifier avant le calcul) :</span>
                              {hasEdits && (
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  const reset: Record<string, number> = {};
                                  for (const r of data.rubriques) {
                                    const code = String(r.code ?? "");
                                    reset[code] = Number(r.value ?? 0);
                                  }
                                  setRubOverrides(prev => ({ ...prev, [emp.id]: reset }));
                                }} className="text-xs text-blue-600 hover:text-blue-700">Reset</button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                              {data.rubriques.map((r, i) => {
                                const code = String(r.code ?? "");
                                const libelle = String(r.libelle ?? "—");
                                const original = Number(r.value ?? 0);
                                const current = overrides[code] ?? original;
                                const changed = current !== original;
                                return (
                                  <div key={i} className={`flex items-center gap-1 text-xs rounded px-2 py-1 ${changed ? "bg-amber-50" : ""}`}>
                                    <span className="font-mono text-gray-500 w-12">{code}</span>
                                    <span className="text-gray-700 flex-1 truncate" title={libelle}>{libelle}</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={current}
                                      onChange={(e) => updateRubOverride(emp.id, code, parseFloat(e.target.value) || 0)}
                                      onClick={(e) => e.stopPropagation()}
                                      className={`w-20 rounded border px-1.5 py-1 text-right font-medium ${changed ? "border-amber-400 bg-amber-50" : "border-gray-300"}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {data.rubriques.length === 0 && data.bonuses.length === 0 && (
                          <p className="text-xs text-gray-400">Aucune donnée modifiable pour cet employé.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : !loadingPreCalc ? (
            <p className="text-sm text-gray-500">Aucune donnée chargée. Cliquez sur Actualiser.</p>
          ) : null}

          {Object.keys(preCalcData).length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
              <Calculator className="h-3.5 w-3.5" />
              Edited rubrique values will be used when you click <strong>Calculate All</strong>.
            </div>
          )}
        </div>
      )}

      {/* Unified history table */}
      {selectedPeriod && (
        <div className="mt-6 space-y-6">
          {displayHistory.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-blue-600" />
                  {selectedPeriod} — {displayHistory.length} records
                </h2>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {appCount > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> App ({appCount})</span>}
                  {pcpaieCount > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" /> Historical ({pcpaieCount})</span>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600"></th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Matricule</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Employee</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Brut</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Cotisable</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Imposable</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">IRG</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Retenues</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayHistory.map((h) => {
                      const key = rowKey(h);
                      const expanded = expandedRows.has(key);
                      const result = calcResults[key];
                      const histPayslip = historicalPayslips[key];
                      const isLegacy = h.source === "pcpaie";
                      return (
                        <Fragment key={key}>
                          <tr className={`hover:bg-gray-50 cursor-pointer ${isLegacy ? "bg-gray-50/50" : ""}`} onClick={() => toggleRow(h)}>
                            <td className="px-4 py-2">
                              {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{h.matricule}</td>
                            <td className="px-4 py-2 font-medium text-gray-900">
                              {h.nom} {h.prenom}
                              {isLegacy && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  <History className="h-3 w-3" /> Historical
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">{formatCurrency(h.total_brut ?? 0)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(h.base_cotisable ?? 0)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(h.base_imposable ?? 0)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(h.irg ?? 0)}</td>
                            <td className="px-4 py-2 text-right text-red-600">{formatCurrency(h.total_retenues ?? 0)}</td>
                            <td className="px-4 py-2 text-right font-bold text-green-700">{formatCurrency(h.net_payer ?? 0)}</td>
                          </tr>
                          {expanded && result && (
                            <tr className="bg-gray-50">
                              <td colSpan={9} className="px-8 py-4">
                                <h4 className="text-xs font-semibold text-gray-500 mb-2">RUBRIQUE DETAILS (APP CALCULATION)</h4>
                                <div className="space-y-1 max-h-60 overflow-y-auto">
                                  {result.lines.filter(l => l.amount !== 0).map((line) => (
                                    <div key={line.code} className="flex justify-between text-xs">
                                      <span className="font-mono text-gray-500 w-12">{line.code}</span>
                                      <span className="text-gray-700 flex-1 ml-2">{line.libelle}</span>
                                      <span className={`font-medium ${line.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                                        {formatCurrency(line.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {result.applied_bonuses && result.applied_bonuses.length > 0 && (
                                  <div className="mt-3 border-t border-gray-200 pt-2">
                                    <h4 className="text-xs font-semibold text-gray-500 mb-2">APPLIED BONUSES & DEDUCTIONS</h4>
                                    <div className="space-y-1">
                                      {result.applied_bonuses.map((b) => (
                                        <div key={b.id} className="flex justify-between text-xs">
                                          <span className="text-gray-700 flex-1">
                                            {b.title}
                                            {b.is_percentage && <span className="text-gray-400 ml-1">({b.amount}% of base)</span>}
                                            {b.rubrique_code && <span className="font-mono text-gray-400 ml-1">→ R{b.rubrique_code}</span>}
                                          </span>
                                          <span className={`font-medium ${b.computed_amount < 0 ? "text-red-600" : "text-green-700"}`}>
                                            {formatCurrency(b.computed_amount)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="mt-3 flex justify-end">
                                  <button
                                    onClick={() => setPayslipPreview(result)}
                                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    Bulletin de Paie (PDF)
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {expanded && histPayslip && (
                            <tr className="bg-gray-50">
                              <td colSpan={9} className="px-8 py-4">
                                <h4 className="text-xs font-semibold text-gray-500 mb-2">RUBRIQUE DETAILS (HISTORICAL — READ ONLY)</h4>
                                <div className="space-y-1 max-h-60 overflow-y-auto">
                                  {histPayslip.lines.filter(l => l.amount !== 0).map((line) => (
                                    <div key={line.code} className="flex justify-between text-xs">
                                      <span className="font-mono text-gray-500 w-12">{line.code}</span>
                                      <span className="text-gray-700 flex-1 ml-2">{line.code}</span>
                                      <span className={`font-medium ${line.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                                        {formatCurrency(line.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-100 font-semibold">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right">TOTALS</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(displayHistory.reduce((s, h) => s + (h.total_brut ?? 0), 0))}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(displayHistory.reduce((s, h) => s + (h.base_cotisable ?? 0), 0))}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(displayHistory.reduce((s, h) => s + (h.base_imposable ?? 0), 0))}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(displayHistory.reduce((s, h) => s + (h.irg ?? 0), 0))}</td>
                      <td className="px-4 py-2 text-right text-red-600">{formatCurrency(displayHistory.reduce((s, h) => s + (h.total_retenues ?? 0), 0))}</td>
                      <td className="px-4 py-2 text-right text-green-700">{formatCurrency(displayHistory.reduce((s, h) => s + (h.net_payer ?? 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {!loading && displayHistory.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
              <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-sm text-gray-500">No salary data for {selectedPeriod}</p>
              <p className="mt-1 text-xs text-gray-400">Click "Calculate All" to generate salaries for this period</p>
            </div>
          )}
        </div>
      )}

      {payslipPreview && (
        <PayslipPDF
          result={payslipPreview}
          onClose={() => setPayslipPreview(null)}
        />
      )}
    </div>
  );
}
