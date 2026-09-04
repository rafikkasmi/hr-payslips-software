import { useState, useEffect, useDeferredValue } from "react";
import { api, type EmployeeSummary, type Shift, type AttendanceDay, type CalcResult, type EmployeeRubrique, type RubriqueHistoryEntry, type EmployeeFilterOptions, type HistoricalPayslip } from "../lib/api";
import { SalaryHistoryPanel } from "./SalaryHistoryPanel";
import { PeriodSelector } from "./PeriodSelector";
import { formatCurrency } from "../lib/utils";
import {
  Search, X, Clock, Calculator, History, ChevronLeft, ChevronRight,
  Loader2, DollarSign, Edit2, Save, Filter, Calendar,
} from "lucide-react";

const statusColors: Record<string, string> = {
  working: "bg-green-500 text-white",
  absent: "bg-red-500 text-white",
  leave: "bg-blue-400 text-white",
  sick_leave: "bg-purple-500 text-white",
  unpaid_leave: "bg-orange-400 text-white",
  maternity_leave: "bg-pink-400 text-white",
  weekend: "bg-gray-200 text-gray-500",
  normal: "bg-gray-100 text-gray-400",
};

const statusLabels: Record<string, string> = {
  working: "Working", absent: "Absent", leave: "Leave",
  sick_leave: "Sick", unpaid_leave: "Unpaid", maternity_leave: "Maternity",
  weekend: "Weekend", normal: "—",
};

export function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "attendance" | "salary" | "salary_history" | "primes" | "family" | "leave" | "loans" | "events">("info");
  const [calendar, setCalendar] = useState<AttendanceDay[]>([]);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [salaryHistory, setSalaryHistory] = useState<Record<string, unknown>[]>([]);
  const [salaryPeriods, setSalaryPeriods] = useState<string[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<HistoricalPayslip | null>(null);
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcPeriod, setCalcPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [calculating, setCalculating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [calcCalendar, setCalcCalendar] = useState<AttendanceDay[]>([]);
  const [empRubriques, setEmpRubriques] = useState<EmployeeRubrique[]>([]);
  const [editingRub, setEditingRub] = useState<string | null>(null);
  const [editRubValue, setEditRubValue] = useState("");
  const [rubHistory, setRubHistory] = useState<RubriqueHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [preCalc, setPreCalc] = useState<Record<string, unknown> | null>(null);
  const [loadingPreCalc, setLoadingPreCalc] = useState(false);
  const [rubInputs, setRubInputs] = useState<Record<string, number>>({});

  // Server-side filters
  const [filterOptions, setFilterOptions] = useState<EmployeeFilterOptions | null>(null);
  const [fPoste, setFPoste] = useState<number | null>(null);
  const [fSection, setFSection] = useState<string | null>(null);
  const [fStructure, setFStructure] = useState<string | null>(null);
  const [fUnite, setFUnite] = useState<string | null>(null);
  const [fCategorie, setFCategorie] = useState<string | null>(null);
  const [fSexe, setFSexe] = useState<string | null>(null);
  const [fContrat, setFContrat] = useState<string | null>(null);
  const [fEchelon, setFEchelon] = useState<string | null>(null);
  const [fClasse, setFClasse] = useState<string | null>(null);
  const [fHireFrom, setFHireFrom] = useState<string>("");
  const [fHireTo, setFHireTo] = useState<string>("");
  const [fExitFrom, setFExitFrom] = useState<string>("");
  const [fExitTo, setFExitTo] = useState<string>("");
  const [fActifOnly, setFActifOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const deferredSearch = useDeferredValue(search);

  const loadData = async () => {
    setLoading(true);
    try {
      const [shfts, opts] = await Promise.all([api.getShifts(), api.getEmployeeFilterOptions()]);
      setShifts(shfts);
      setFilterOptions(opts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Load employees whenever filters or page change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const payload = {
      search: deferredSearch || null,
      actif_only: fActifOnly || null,
      poste_id: fPoste,
      section: fSection,
      structure: fStructure,
      unite: fUnite,
      categorie: fCategorie,
      sexe: fSexe,
      contrat: fContrat,
      echelon: fEchelon,
      classe: fClasse,
      hire_date_from: fHireFrom || null,
      hire_date_to: fHireTo || null,
      exit_date_from: fExitFrom || null,
      exit_date_to: fExitTo || null,
      page: currentPage + 1,
      page_size: pageSize,
    };
    console.log("getEmployees payload:", payload);
    api.getEmployees(payload)
      .then((emps) => {
        if (cancelled) return;
        setEmployees(emps);
        if (emps.length > 0) setTotalCount(emps[0].total_count);
        else setTotalCount(0);
      })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [deferredSearch, fActifOnly, fPoste, fSection, fStructure, fUnite, fCategorie, fSexe, fContrat, fEchelon, fClasse, fHireFrom, fHireTo, fExitFrom, fExitTo, currentPage]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(0); }, [deferredSearch, fActifOnly, fPoste, fSection, fStructure, fUnite, fCategorie, fSexe, fContrat, fEchelon, fClasse, fHireFrom, fHireTo, fExitFrom, fExitTo]);

  const clearFilters = () => {
    setFPoste(null); setFSection(null); setFStructure(null);
    setFUnite(null); setFCategorie(null); setFSexe(null); setFActifOnly(false);
    setFContrat(null); setFEchelon(null); setFClasse(null);
    setFHireFrom(""); setFHireTo(""); setFExitFrom(""); setFExitTo("");
  };
  const activeFilterCount = [fPoste, fSection, fStructure, fUnite, fCategorie, fSexe, fContrat, fEchelon, fClasse].filter(v => v != null && v !== "").length
    + (fActifOnly ? 1 : 0)
    + (fHireFrom ? 1 : 0) + (fHireTo ? 1 : 0) + (fExitFrom ? 1 : 0) + (fExitTo ? 1 : 0);

  useEffect(() => {
    if (selectedEmp && detailTab === "attendance") {
      loadCalendar();
    }
    if (selectedEmp && detailTab === "salary") {
      loadSalaryHistory();
      loadPayslip();
    }
    if (selectedEmp && detailTab === "salary_history") {
      // SalaryHistoryPanel loads its own data
    }
    if (selectedEmp && detailTab === "primes") {
      loadEmpRubriques();
    }
  }, [selectedEmp, detailTab, calYear, calMonth, calcPeriod]);

  const loadCalendar = async () => {
    if (!selectedEmp) return;
    setDetailLoading(true);
    try {
      const cal = await api.getAttendanceCalendar(selectedEmp.id, calYear, calMonth);
      setCalendar(cal);
    } catch (e) { console.error(e); }
    finally { setDetailLoading(false); }
  };

  const loadSalaryHistory = async () => {
    if (!selectedEmp) return;
    try {
      const [h, periods] = await Promise.all([
        api.getSalaryHistory(selectedEmp.id),
        api.getEmployeeSalaryPeriods(selectedEmp.id),
      ]);
      setSalaryHistory(h);
      setSalaryPeriods(periods);
    } catch (e) { console.error(e); }
  };

  const loadPayslip = async () => {
    if (!selectedEmp || !calcPeriod) return;
    setLoadingPayslip(true);
    try {
      const payslip = await api.getHistoricalPayslip(selectedEmp.id, calcPeriod);
      setSelectedPayslip(payslip);
    } catch (e) {
      console.error(e);
      setSelectedPayslip(null);
    } finally {
      setLoadingPayslip(false);
    }
  };

  const handleCalculate = async () => {
    if (!selectedEmp) return;
    setCalculating(true);
    try {
      // Convert rubInputs to the format expected by the API: code -> [M, N]
      const inputValues: Record<string, [number, number]> = {};
      for (const [code, value] of Object.entries(rubInputs)) {
        const numericCode = code.replace(/^R+/, "");
        inputValues[numericCode] = [value, 0];
      }
      const result = await api.calculateSalary(selectedEmp.id, calcPeriod, inputValues);
      setCalcResult(result);
      await api.saveSalaryCalculation(result);
      await loadSalaryHistory();
      // Load attendance calendar for the calc period
      const [yr, mo] = calcPeriod.split("-").map(Number);
      try {
        const cal = await api.getAttendanceCalendar(selectedEmp.id, yr, mo);
        setCalcCalendar(cal);
      } catch (e) { console.error(e); }
    } catch (e) { console.error(e); }
    finally { setCalculating(false); }
  };

  const loadEmpRubriques = async () => {
    if (!selectedEmp) return;
    try {
      const r = await api.getEmployeeCurrentRubriques(selectedEmp.id);
      setEmpRubriques(r);
    } catch (e) { console.error(e); }
  };

  const handleSaveRubrique = async (code: string) => {
    if (!selectedEmp) return;
    const val = parseFloat(editRubValue) || 0;
    try {
      await api.updateEmployeeRubrique(selectedEmp.id, code, val, null);
      setEditingRub(null);
      await loadEmpRubriques();
    } catch (e) { console.error(e); }
  };

  const loadRubHistory = async (code?: string) => {
    if (!selectedEmp) return;
    try {
      const h = await api.getEmployeeRubriqueHistory(selectedEmp.id, code);
      setRubHistory(h);
      setShowHistory(true);
    } catch (e) { console.error(e); }
  };

  const handleLoadPreCalc = async () => {
    if (!selectedEmp) return;
    setLoadingPreCalc(true);
    try {
      const summary = await api.getPreCalcSummary(selectedEmp.id, calcPeriod);
      setPreCalc(summary as Record<string, unknown>);
      // Load rubrique inputs into editable state
      if (Array.isArray(summary.rubriques)) {
        const inputs: Record<string, number> = {};
        for (const r of summary.rubriques as Record<string, unknown>[]) {
          const code = String(r.code ?? "");
          const value = Number(r.value ?? 0);
          if (code) inputs[code] = value;
        }
        setRubInputs(inputs);
      }
    } catch (e) { console.error(e); }
    finally { setLoadingPreCalc(false); }
  };

  const handleAssignShift = async (empId: number, shiftId: number) => {
    try {
      await api.assignShift(empId, shiftId);
      // Optimistic update: update local state instead of full reload
      setEmployees(prev => prev.map(e =>
        e.id === empId ? { ...e, shift_name: shifts.find(s => s.id === shiftId)?.name ?? null } : e
      ));
    } catch (e) { console.error(e); }
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const paged = employees;

  const monthName = new Date(calYear, calMonth - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Employés</h1>
      <p className="mt-1 text-sm text-gray-500">{totalCount} employés au total · page {currentPage + 1}/{totalPages || 1}</p>

      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, prénom ou matricule..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${activeFilterCount > 0 ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
        >
          <Filter className="h-4 w-4" />
          Filtres
          {activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-xs text-white">{activeFilterCount}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Filtres avancés</h3>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-red-600 hover:text-red-800">Effacer les filtres</button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-4 text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
              Filtre actif: {totalCount} employé(s) trouvé(s)
              {fActifOnly && " | Actifs seulement"}
              {fPoste != null && ` | Poste #${fPoste}`}
              {fSexe && ` | Sexe: ${fSexe}`}
              {fContrat && ` | Contrat: ${fContrat}`}
              {fEchelon && ` | Échelon: ${fEchelon}`}
              {fClasse && ` | Classe: ${fClasse}`}
              {fHireFrom && ` | Embauche dès: ${fHireFrom}`}
              {fHireTo && ` | Embauche jusqu'au: ${fHireTo}`}
              {fExitFrom && ` | Sortie dès: ${fExitFrom}`}
              {fExitTo && ` | Sortie jusqu'au: ${fExitTo}`}
            </div>
            <div>
              <label className="text-xs text-gray-500">Fonction / Poste</label>
              <select value={fPoste != null ? String(fPoste) : ""} onChange={(e) => setFPoste(e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                <option value="">Tous</option>
                {filterOptions?.postes.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
            </div>
            {filterOptions?.sections && filterOptions.sections.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Section</label>
                <select value={fSection ?? ""} onChange={(e) => setFSection(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Toutes</option>
                  {filterOptions.sections.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {filterOptions?.structures && filterOptions.structures.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Structure</label>
                <select value={fStructure ?? ""} onChange={(e) => setFStructure(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Toutes</option>
                  {filterOptions.structures.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {filterOptions?.unites && filterOptions.unites.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Unité</label>
                <select value={fUnite ?? ""} onChange={(e) => setFUnite(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Toutes</option>
                  {filterOptions.unites.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
            {filterOptions?.categories && filterOptions.categories.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Catégorie</label>
                <select value={fCategorie ?? ""} onChange={(e) => setFCategorie(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Toutes</option>
                  {filterOptions.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">Sexe</label>
              <select value={fSexe ?? ""} onChange={(e) => setFSexe(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                <option value="">Tous</option>
                <option value="M">Homme</option>
                <option value="F">Femme</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={fActifOnly} onChange={(e) => setFActifOnly(e.target.checked)} className="rounded border-gray-300" />
                Actifs seulement
              </label>
            </div>
            {filterOptions?.contrats && filterOptions.contrats.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Contrat</label>
                <select value={fContrat ?? ""} onChange={(e) => setFContrat(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Tous</option>
                  {filterOptions.contrats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {filterOptions?.echelons && filterOptions.echelons.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Échelon</label>
                <select value={fEchelon ?? ""} onChange={(e) => setFEchelon(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Tous</option>
                  {filterOptions.echelons.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {filterOptions?.classes && filterOptions.classes.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Classe</label>
                <select value={fClasse ?? ""} onChange={(e) => setFClasse(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Toutes</option>
                  {filterOptions.classes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <label className="text-xs text-gray-500">Date d'embauche (du → au)</label>
              <div className="mt-1 flex items-center gap-1">
                <input type="date" value={fHireFrom} onChange={(e) => setFHireFrom(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                <span className="text-gray-400 text-xs">→</span>
                <input type="date" value={fHireTo} onChange={(e) => setFHireTo(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500">Date de sortie (du → au)</label>
              <div className="mt-1 flex items-center gap-1">
                <input type="date" value={fExitFrom} onChange={(e) => setFExitFrom(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                <span className="text-gray-400 text-xs">→</span>
                <input type="date" value={fExitTo} onChange={(e) => setFExitTo(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-gray-500">Chargement...</div>
      ) : (
        <div>
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Matricule</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nom</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Poste/Fonction</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Pointeuse</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vacation</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actif</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedEmp(emp); setPreCalc(null); setCalcResult(null); setRubInputs({}); }}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{emp.matricule}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{emp.nom} {emp.prenom}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.poste_name || "—"}</td>
                  <td className="px-4 py-3">
                    {emp.pointeuse_pin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        PIN {emp.pointeuse_pin}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Non liée</span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={emp.shift_name || ""}
                      onChange={(e) => {
                        const shift = shifts.find((s) => s.name === e.target.value);
                        if (shift) handleAssignShift(emp.id, shift.id);
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="">Aucune vacation</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex h-2 w-2 rounded-full ${emp.actif ? "bg-green-500" : "bg-gray-300"}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs font-medium text-blue-600 hover:text-blue-800">Voir →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Page {currentPage + 1} / {totalPages || 1} — {totalCount} employés
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                ← Précédent
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
        </div>
      )}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSelectedEmp(null)}>
          <div className="max-h-[90vh] w-[900px] max-w-[95vw] overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedEmp.nom} {selectedEmp.prenom}</h2>
                <p className="text-sm text-gray-500">Matricule: {selectedEmp.matricule} · PIN: {selectedEmp.pointeuse_pin ?? "—"}</p>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="rounded-lg p-1.5 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-gray-200 px-6">
              {[
                { key: "info", label: "Info", icon: null },
                { key: "family", label: "Famille", icon: null },
                { key: "attendance", label: "Présence", icon: Clock },
                { key: "salary", label: "Salaire", icon: Calculator },
                { key: "salary_history", label: "Historique salaire", icon: History },
                { key: "primes", label: "Primes", icon: DollarSign },
                { key: "leave", label: "Congés", icon: null },
                { key: "loans", label: "Prêts", icon: null },
                { key: "events", label: "Événements", icon: null },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key as "info" | "attendance" | "salary" | "salary_history" | "primes" | "family" | "leave" | "loans" | "events")}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 ${
                    detailTab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              {detailTab === "info" && <EmployeeInfoTab emp={selectedEmp} />}
              {detailTab === "family" && <EmployeeFamilyTab emp={selectedEmp} />}
              {detailTab === "leave" && <EmployeeLeaveTab matricule={selectedEmp.matricule} />}
              {detailTab === "loans" && <EmployeeLoansTab matricule={selectedEmp.matricule} />}
              {detailTab === "events" && <EmployeeEventsTab matricule={selectedEmp.matricule} />}
              {detailTab === "primes" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Valeurs des rubriques</h3>
                    <button
                      onClick={() => loadRubHistory()}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <History className="h-3 w-3" /> Voir tout l'historique
                    </button>
                  </div>
                  <div className="space-y-1">
                    {empRubriques.length === 0 && (
                      <p className="text-sm text-gray-400">Aucune rubrique assignée</p>
                    )}
                    {empRubriques.map((r) => (
                      <div key={r.rubrique_code} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
                        <span className="font-mono text-xs text-gray-500 w-16">{r.rubrique_code}</span>
                        <span className="text-sm text-gray-700 flex-1">{r.libelle ?? "—"}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.source === "override" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                          {r.source === "override" ? "Remplacement" : "Poste"}
                        </span>
                        {editingRub === r.rubrique_code ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={editRubValue}
                              onChange={(e) => setEditRubValue(e.target.value)}
                              className="w-28 rounded border border-gray-300 px-2 py-0.5 text-right text-sm"
                              autoFocus
                            />
                            <button onClick={() => handleSaveRubrique(r.rubrique_code)} className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"><Save className="h-3 w-3" /></button>
                            <button onClick={() => setEditingRub(null)} className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-300">Annuler</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 w-28 text-right">{formatCurrency(r.value)}</span>
                            <button
                              onClick={() => { setEditingRub(r.rubrique_code); setEditRubValue(String(r.value)); }}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => loadRubHistory(r.rubrique_code)}
                              className="text-gray-400 hover:text-gray-600"
                              title="History"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {showHistory && rubHistory.length > 0 && (
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-gray-600">Historique des modifications</h4>
                        <button onClick={() => setShowHistory(false)} className="text-xs text-gray-500 hover:text-gray-700">Fermer</button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {rubHistory.map((h) => (
                          <div key={h.id} className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-gray-500 w-16">{h.rubrique_code}</span>
                            <span className="text-gray-600">{formatCurrency(h.old_value ?? 0)} → {formatCurrency(h.new_value ?? 0)}</span>
                            <span className="text-gray-400 ml-auto">{h.change_date ?? "—"}</span>
                            {h.reason && <span className="text-gray-500">({h.reason})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {detailTab === "attendance" && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <button onClick={() => { if (calMonth === 1) { setCalMonth(12); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold min-w-[140px] text-center">{monthName}</span>
                    <button onClick={() => { if (calMonth === 12) { setCalMonth(1); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {detailLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                  ) : (
                    <>
                      <div className="grid grid-cols-7 gap-1">
                        {["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => (
                          <div key={d} className="text-center text-xs font-semibold text-gray-400 pb-1">{d}</div>
                        ))}
                        {(() => {
                          const weekdayOrder = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                          const firstWeekday = calendar.length > 0 ? calendar[0].weekday : "Saturday";
                          const leadCount = weekdayOrder.indexOf(firstWeekday);
                          return Array.from({ length: leadCount }, (_, i) => (
                            <div key={`blank-${i}`} className="min-h-[40px]" />
                          ));
                        })()}
                        {calendar.map((day) => (
                          <div
                            key={day.date}
                            className={`rounded p-1.5 min-h-[40px] ${statusColors[day.status] ?? "bg-gray-100"}`}
                            title={`${day.date} — ${statusLabels[day.status] ?? day.status}`}
                          >
                            <div className="text-[10px] font-bold">{day.day}</div>
                            {day.punches > 0 && <div className="text-[8px] opacity-80">{day.punches}p</div>}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                        {Object.entries(statusLabels).filter(([k]) => k !== "normal").map(([key, label]) => (
                          <div key={key} className="flex items-center gap-1">
                            <div className={`h-2.5 w-2.5 rounded ${statusColors[key]}`} />
                            {label}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {detailTab === "salary" && (
                <div>
                  <div className="rounded-lg border border-gray-200 p-4 mb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <PeriodSelector
                        value={calcPeriod}
                        onChange={setCalcPeriod}
                        availablePeriods={salaryPeriods}
                        label="Période de calcul"
                      />
                      <button
                        onClick={handleCalculate}
                        disabled={calculating}
                        className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                        Calculer
                      </button>
                      <button
                        onClick={handleLoadPreCalc}
                        disabled={loadingPreCalc}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {loadingPreCalc ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                        Résumé pré-calcul
                      </button>
                    </div>

                    {preCalc && (
                      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-blue-900">Résumé pré-calcul — {String(preCalc.period ?? "")}</h4>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="rounded bg-white p-2">
                            <div className="text-xs text-gray-500">Jours de présence</div>
                            <div className="font-bold">{Number(preCalc.attendance_days ?? 0)}</div>
                          </div>
                          <div className="rounded bg-white p-2">
                            <div className="text-xs text-gray-500">Heures supplémentaires</div>
                            <div className="font-bold">{preCalc.overtime ? `${Number((preCalc.overtime as Record<string, unknown>).hours_50 ?? 0)}h (50%) + ${Number((preCalc.overtime as Record<string, unknown>).hours_100 ?? 0)}h (100%)` : "Aucune"}</div>
                          </div>
                          <div className="rounded bg-white p-2">
                            <div className="text-xs text-gray-500">Primes actives</div>
                            <div className="font-bold">{Array.isArray(preCalc.bonuses) ? (preCalc.bonuses as unknown[]).length : 0}</div>
                          </div>
                        </div>
                        {Array.isArray(preCalc.bonuses) && (preCalc.bonuses as unknown[]).length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-600">Primes à appliquer :</div>
                            {(preCalc.bonuses as Record<string, unknown>[]).map((b, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className={`rounded-full px-2 py-0.5 ${String(b.bonus_type) === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{String(b.bonus_type)}</span>
                                <span className="font-medium">{String(b.title)}</span>
                                <span className="text-gray-500">{b.is_percentage ? `${b.amount}%` : formatCurrency(Number(b.amount))}</span>
                                {b.rubrique_code ? <span className="text-gray-400">→ R{String(b.rubrique_code)}</span> : null}
                              </div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(preCalc.rubriques) && (preCalc.rubriques as unknown[]).length > 0 && (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            <span className="text-xs font-semibold text-gray-600 flex items-center justify-between">
                              <span>Rubriques ({(preCalc.rubriques as unknown[]).length}) :</span>
                              <span className="text-gray-400 font-normal">Modifier les valeurs avant le calcul</span>
                            </span>
                            {(preCalc.rubriques as Record<string, unknown>[]).map((r, i) => {
                              const code = String(r.code ?? "");
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="font-mono text-gray-500 w-14">{code}</span>
                                  <span className="text-gray-700 flex-1 truncate">{String(r.libelle ?? "—")}</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={rubInputs[code] ?? 0}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value) || 0;
                                      setRubInputs(prev => ({ ...prev, [code]: v }));
                                    }}
                                    className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-xs font-medium"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {calcResult && (
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div className="rounded-lg bg-gray-50 p-3">
                            <div className="text-xs text-gray-500">Total Brut</div>
                            <div className="text-sm font-bold">{formatCurrency(calcResult.total_brut)}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-3">
                            <div className="text-xs text-gray-500">Cotisable</div>
                            <div className="text-sm font-bold">{formatCurrency(calcResult.base_cotisable)}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-3">
                            <div className="text-xs text-gray-500">IRG</div>
                            <div className="text-sm font-bold">{formatCurrency(calcResult.irg)}</div>
                          </div>
                          <div className="rounded-lg bg-green-50 p-3">
                            <div className="text-xs text-green-600">Net à Payer</div>
                            <div className="text-sm font-bold text-green-700">{formatCurrency(calcResult.net_payer)}</div>
                          </div>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-0.5">
                          {calcResult.lines.filter(l => l.amount !== 0).map((line) => (
                            <div key={line.code} className="flex justify-between text-xs py-0.5">
                              <span className="font-mono text-gray-500 w-10">{line.code}</span>
                              <span className="text-gray-700 flex-1 ml-2">{line.libelle}</span>
                              <span className={`font-medium ${line.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                                {formatCurrency(line.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {calcResult.applied_bonuses && calcResult.applied_bonuses.length > 0 && (
                          <div className="mt-2 border-t border-gray-200 pt-2">
                            <h4 className="text-xs font-semibold text-gray-500 mb-1">PRIMES & DÉDUCTIONS APPLIQUÉES</h4>
                            <div className="space-y-0.5">
                              {calcResult.applied_bonuses.map((b) => (
                                <div key={b.id} className="flex justify-between text-xs py-0.5">
                                  <span className="text-gray-700 flex-1">
                                    {b.title}
                                    {b.is_percentage && <span className="text-gray-400 ml-1">({b.amount}%)</span>}
                                  </span>
                                  <span className={`font-medium ${b.computed_amount < 0 ? "text-red-600" : "text-green-700"}`}>
                                    {formatCurrency(b.computed_amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Attendance calendar grid */}
                        {calcCalendar.length > 0 && (
                          <div className="mt-4 border-t border-gray-200 pt-3">
                            <h4 className="text-xs font-semibold text-gray-500 mb-2">PRÉSENCE — {calcPeriod}</h4>
                            <div className="grid grid-cols-7 gap-1">
                              {["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => (
                                <div key={d} className="text-center text-[10px] font-semibold text-gray-400 pb-1">{d}</div>
                              ))}
                              {(() => {
                                const weekdayOrder = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                                const firstWeekday = calcCalendar.length > 0 ? calcCalendar[0].weekday : "Saturday";
                                const leadCount = weekdayOrder.indexOf(firstWeekday);
                                return Array.from({ length: leadCount }, (_, i) => (
                                  <div key={`calc-blank-${i}`} className="min-h-[28px]" />
                                ));
                              })()}
                              {calcCalendar.map((day) => (
                                <div
                                  key={day.date}
                                  className={`rounded p-1 min-h-[28px] ${statusColors[day.status] ?? "bg-gray-100"}`}
                                  title={`${day.date} — ${statusLabels[day.status] ?? day.status}${day.punches ? ` (${day.punches} punches)` : ""}`}
                                >
                                  <div className="text-[9px] font-bold text-center">{day.day}</div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-600">
                              {Object.entries(statusLabels).filter(([k]) => k !== "normal").map(([key, label]) => (
                                <div key={key} className="flex items-center gap-1">
                                  <div className={`h-2 w-2 rounded ${statusColors[key]}`} />
                                  {label}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selected period details */}
                  <div className="rounded-lg border border-gray-200 p-4">
                    <h4 className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> DÉTAILS DE LA PÉRIODE SÉLECTIONNÉE — {calcPeriod}
                    </h4>
                    {loadingPayslip ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>
                    ) : selectedPayslip?.lines && selectedPayslip.lines.length > 0 ? (
                      <div>
                        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div className="rounded bg-gray-50 p-2 text-center">
                            <p className="text-xs text-gray-500">Brut</p>
                            <p className="text-sm font-semibold text-gray-800">{formatCurrency(selectedPayslip.total_brut)}</p>
                          </div>
                          <div className="rounded bg-gray-50 p-2 text-center">
                            <p className="text-xs text-gray-500">Net</p>
                            <p className="text-sm font-semibold text-green-700">{formatCurrency(selectedPayslip.net_payer)}</p>
                          </div>
                          <div className="rounded bg-gray-50 p-2 text-center">
                            <p className="text-xs text-gray-500">IRG</p>
                            <p className="text-sm font-semibold text-red-600">{formatCurrency(selectedPayslip.irg)}</p>
                          </div>
                          <div className="rounded bg-gray-50 p-2 text-center">
                            <p className="text-xs text-gray-500">Retenues</p>
                            <p className="text-sm font-semibold text-gray-800">{formatCurrency(selectedPayslip.total_retenues)}</p>
                          </div>
                          <div className="rounded bg-gray-50 p-2 text-center">
                            <p className="text-xs text-gray-500">Base cotisable</p>
                            <p className="text-sm font-semibold text-gray-800">{formatCurrency(selectedPayslip.base_cotisable)}</p>
                          </div>
                          <div className="rounded bg-gray-50 p-2 text-center">
                            <p className="text-xs text-gray-500">Base imposable</p>
                            <p className="text-sm font-semibold text-gray-800">{formatCurrency(selectedPayslip.base_imposable)}</p>
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-gray-50 text-left">
                              <tr>
                                <th className="px-2 py-1 font-medium text-gray-600">Code</th>
                                <th className="px-2 py-1 text-right font-medium text-gray-600">Montant</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {selectedPayslip.lines.map((line, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  <td className="px-2 py-1 font-mono text-gray-700">{line.code}</td>
                                  <td className="px-2 py-1 text-right text-gray-700">{formatCurrency(line.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Aucune fiche de paie historique pour {calcPeriod}.</p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                      <History className="h-3 w-3" /> HISTORIQUE DES SALAIRES
                      {salaryHistory.length > 0 && salaryHistory[0]?.source === "imported" && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">Importé</span>
                      )}
                    </h4>
                    {(() => {
                      const filtered = salaryHistory.filter((h) => h.period === calcPeriod);
                      return filtered.length === 0 ? (
                        <p className="text-sm text-gray-400">Aucun historique pour {calcPeriod}</p>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {filtered.map((h, i) => (
                            <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-xs text-gray-500">{String(h.period ?? "—")}</span>
                                <span className="text-gray-700">Net: {formatCurrency(Number(h.net_payer ?? 0))}</span>
                              </div>
                              <div className="flex gap-3 text-xs text-gray-500">
                                <span>Brut: {formatCurrency(Number(h.total_brut ?? 0))}</span>
                                <span>IRG: {formatCurrency(Number(h.irg ?? 0))}</span>
                                <span className="text-gray-400">{h.calculated_at ? String(h.calculated_at).split(" ")[0] : "Importé"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              {detailTab === "salary_history" && selectedEmp && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Historique des salaires</h3>
                  <SalaryHistoryPanel employeeId={selectedEmp.id} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeInfoTab({ emp }: { emp: EmployeeSummary }) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    api.getEmployeeDetail(emp.id).then(setDetail).catch((e) => {
      console.error(e);
      setError(String(e));
    });
  }, [emp.id]);

  if (error) return <div className="py-8 text-center text-sm text-red-600">Erreur: {error}</div>;
  if (!detail) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;

  const withLabel = (code: unknown, libelle: unknown): string => {
    const label = libelle != null ? String(libelle).trim() : "";
    const raw = code != null ? String(code).trim() : "";
    if (label && label !== "") return label;
    if (raw && raw !== "") return raw;
    return "—";
  };

  const val = (k: string): string => {
    const v = detail[k];
    if (v == null) return "—";
    const s = String(v).trim();
    return s === "" ? "—" : s;
  };

  const sections: [string, [string, string][]][] = [
    ["Identité", [
      ["Matricule", val("matricule")],
      ["Nom", val("nom")],
      ["Prénom", val("prenom")],
      ["Sexe", val("sexe")],
      ["Date de naissance", val("naiss_date")],
      ["Lieu de naissance", val("naiss_lieu")],
      ["Acte de naissance", val("n_act_nais")],
      ["Commune de naissance", val("comun_nais")],
      ["Nationalité", val("cnationalt")],
      ["Sit. Famille", val("sit_fam")],
      ["Enfants à charge", val("nbre_enf")],
      ["Enfants < 10 ans (M)", String(detail.nbr_enfp10 ?? "—")],
      ["Enfants < 10 ans (F)", String(detail.nbr_enfm10 ?? "—")],
    ]],
    ["Filiation", [
      ["Filiation", val("filiation")],
      ["Prénom du père", val("fil_p_pere")],
      ["Nom de la mère", val("fil_n_mere")],
      ["Prénom de la mère", val("fil_p_mere")],
    ]],
    ["Conjoint", [
      ["Nom du conjoint", val("conj_nom")],
      ["Prénom du conjoint", val("nom_p_conj")],
      ["Date mariage", val("conj_datem")],
      ["Conjoint travaille", val("conj_trav")],
    ]],
    ["Documents", [
      ["N° ID National", val("n_id_nat")],
      ["CIN N°", val("cin_no")],
      ["CIN délivrée le", val("cin_d_le")],
      ["CIN à", val("cin_d_a")],
      ["Passeport N°", val("pass_no")],
      ["Passeport délivré le", val("pass_d_le")],
      ["Passeport à", val("pass_d_a")],
      ["Permis conduite N°", val("pc_no")],
      ["PC délivré le", val("pc_d_le")],
      ["PC à", val("pc_d_a")],
    ]],
    ["Contact", [
      ["Téléphone", val("telephone")],
      ["Email", val("e_mail")],
      ["Adresse", val("adresse")],
      ["Adresse 2", val("adresse2")],
      ["Code postal", val("code_post")],
    ]],
    ["Professionnel", [
      ["Date entrée", val("dte_entree")],
      ["Date sortie", val("dte_sortie")],
      ["Motif sortie", withLabel(detail.motif_sort, null)],
      ["Contrat du", val("dte_cont_d")],
      ["Contrat au", val("dte_cont_f")],
      ["Date reprise", val("dte_repris")],
      ["Fonction", withLabel(detail.sect1, detail.fonction_libelle)],
      ["Catégorie", withLabel(detail.categorie, detail.categorie_libelle)],
      ["Catégorie socio-pro", withLabel(detail.categ_sp, detail.categ_sp_libelle)],
      ["Section", withLabel(detail.section, detail.section_libelle)],
      ["Échelon", val("echelon")],
      ["Classe", val("classe")],
      ["Structure/Département", withLabel(detail.structure, detail.structure_libelle)],
      ["Unité", withLabel(detail.unite, detail.unite_libelle)],
      ["Affectation", withLabel(detail.affectatio, detail.affectatio_libelle)],
      ["Contrat", withLabel(detail.contrat, detail.contrat_libelle)],
      ["Diplôme", withLabel(detail.diplome, detail.diplome_libelle)],
      ["Service (AT1)", withLabel(detail.attrib1, detail.attrib1_libelle)],
      ["Département (AT2)", withLabel(detail.attrib2, detail.attrib2_libelle)],
      ["Lieu (AT3)", withLabel(detail.attrib3, detail.attrib3_libelle)],
      ["Grille", val("no_grille")],
      ["Code grille", val("code_grill")],
    ]],
    ["Sécurité sociale & Banque", [
      ["N° SS", val("n_secu_sle")],
      ["N° CNAS", val("no_cnas")],
      ["Code CNAS", val("code_cnas")],
      ["Code IRG", val("code_irg")],
      ["N° Compte", val("no_compte")],
      ["Banque", withLabel(detail.org_payeur, detail.banque_libelle)],
      ["Mutuelle", val("no_mutuel")],
      ["Mutuelle depuis", val("mutu_dted")],
      ["Mutuelle jusqu'à", val("mutu_dtef")],
      ["Org. payeur", val("org_payeur")],
      ["Org. employeur", val("org_pemploy")],
      ["Code règlement", val("cod_regl")],
    ]],
    ["Dates de carrière", [
      ["Date fonction", val("date_fnc")],
      ["Date section", val("date_sec")],
      ["Date DAS", val("date_das")],
      ["Date unité", val("date_unt")],
      ["Date affectation", val("date_aff")],
      ["Date diplôme", val("date_dip")],
      ["Date catégorie", val("date_cat")],
      ["Date emploi", val("date_emp")],
      ["Date AT1", val("date_at1")],
      ["Date AT2", val("date_at2")],
      ["Date AT3", val("date_at3")],
    ]],
    ["Congés (PERS1)", [
      ["Congé dû (jours)", val("conge_du_j")],
      ["Congé dû (cotisable)", val("conge_du_c")],
      ["Congé dû (imposable)", val("conge_du_i")],
      ["Congé pris (jours)", val("conge_pr_j")],
      ["Congé pris (cotisable)", val("conge_pr_c")],
      ["Congé pris (imposable)", val("conge_pr_i")],
      ["Congé add. (jours)", val("conge_ad_j")],
      ["Congé add. (cotisable)", val("conge_ad_c")],
      ["Congé add. (imposable)", val("conge_ad_i")],
      ["Congé validé", String(detail.conge_ok === 1 ? "Oui" : "Non")],
      ["Jours ouvrables", val("nbr_jr_ouv")],
      ["Heures ouvrables", val("nbr_hr_ouv")],
    ]],
    ["Notes", [
      ["Note fonction", val("note_fnc")],
      ["Note section", val("note_sec")],
      ["Note DAS", val("note_das")],
      ["Note unité", val("note_unt")],
      ["Note affectation", val("note_aff")],
      ["Note diplôme", val("note_dip")],
      ["Note catégorie", val("note_cat")],
      ["Note emploi", val("note_emp")],
      ["Note AT1", val("note_at1")],
      ["Note AT2", val("note_at2")],
      ["Note AT3", val("note_at3")],
      ["Note contrat", val("note_con")],
      ["Note motif", val("note_mtf")],
      ["Note de paie", val("notep")],
      ["Note paie (AR)", val("anotep")],
      ["Mémoire 1", val("memoire1")],
      ["Mémoire 2", val("memoire2")],
    ]],
    ["Divers", [
      ["Remarque", val("remarque")],
      ["Groupage", val("groupage")],
      ["Gestion", String(detail.gestion ?? "—")],
      ["N° profil", val("no_profil")],
      ["Enfants à charge", val("nbr_enf_af")],
      ["Personnes à charge", val("nbr_prs_ch")],
      ["Enfants +10 ans", val("nbr_enfp10")],
      ["Enfants -10 ans", val("nbr_enfm10")],
      ["Conjoint travaille", val("conj_trav")],
      ["Intempérie", String(detail.ok_intemp === 1 ? "Oui" : "Non")],
      ["Nationalité étrangère", String(detail.ok_nat_etr === 1 ? "Oui" : "Non")],
      ["Verrouillage valeurs", String(detail.lock_val ?? "—")],
      ["Congé (flag)", String(detail.conge ?? "—")],
      ["Sorti (flag)", String(detail.sorti ?? "—")],
      ["Obs. prêt 1", val("pret_obs1")],
      ["Obs. prêt 2", val("pret_obs2")],
      ["Enfants (table)", String(detail.child_count ?? "0")],
    ]],
  ];

  return (
    <div className="space-y-4">
      {sections.map(([sectionTitle, fields]) => (
        <div key={sectionTitle}>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{sectionTitle}</h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {fields.map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] truncate" title={value}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Family tab — children
// ============================================================
function EmployeeFamilyTab({ emp }: { emp: EmployeeSummary }) {
  const [children, setChildren] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    api.getEmployeeChildren(emp.id).then(setChildren).catch(console.error);
  }, [emp.id]);

  if (!children) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Enfants ({children.length})</h4>
      {children.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun enfant enregistré</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Prénom</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Date de naissance</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Scolarisé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {children.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{String(c.prenom ?? "—")}</td>
                  <td className="px-3 py-2 text-gray-600">{String(c.nais_date ?? "—")}</td>
                  <td className="px-3 py-2 text-gray-600">{String(c.scolarise ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Leave tab — leave history
// ============================================================
function EmployeeLeaveTab({ matricule }: { matricule: string }) {
  const [leaves, setLeaves] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmployeeLeaveHistory(matricule, 200).then(setLeaves).catch(console.error).finally(() => setLoading(false));
  }, [matricule]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!leaves || leaves.length === 0) return <p className="text-sm text-gray-400">Aucun congé enregistré</p>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Historique des congés ({leaves.length} affichés)</h4>
      <div className="max-h-[50vh] overflow-y-auto overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Mois</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Libellé</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Jours</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Cotisable</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Imposable</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Sens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leaves.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-700 font-mono">{String(l.date ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.mois ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-700">{String(l.libelle ?? "—")}</td>
                <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{Number(l.jours ?? 0).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{Number(l.cotisable ?? 0).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{Number(l.imposable ?? 0).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${String(l.sens ?? "") === "+" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {String(l.sens ?? "—")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Loans tab — employee loans
// ============================================================
function EmployeeLoansTab({ matricule }: { matricule: string }) {
  const [loans, setLoans] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmployeeLoans(matricule).then(setLoans).catch(console.error).finally(() => setLoading(false));
  }, [matricule]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!loans || loans.length === 0) return <p className="text-sm text-gray-400">Aucun prêt enregistré</p>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Prêts ({loans.length})</h4>
      <div className="max-h-[50vh] overflow-y-auto overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">N° Prêt</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Code Rub</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Libellé</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Mois</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Montant</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Sens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loans.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-700 font-mono">{String(l.no_pret ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.code_rub ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-700">{String(l.libelle ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.mois ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.date ?? "—")}</td>
                <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{formatCurrency(Number(l.montant ?? 0))}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${String(l.sens ?? "") === "+" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {String(l.sens ?? "—")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Events tab — career events
// ============================================================
function EmployeeEventsTab({ matricule }: { matricule: string }) {
  const [events, setEvents] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmployeeEvents(matricule).then(setEvents).catch(console.error).finally(() => setLoading(false));
  }, [matricule]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!events || events.length === 0) return <p className="text-sm text-gray-400">Aucun événement de carrière enregistré</p>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Événements de carrière ({events.length})</h4>
      <div className="space-y-2">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600">
              <span className="text-[10px] font-medium">{String(e.date ?? "—").substring(0, 2)}</span>
              <span className="text-[10px]">{String(e.date ?? "—").substring(2, 5)}</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{String(e.libelle ?? "—")}</div>
              <div className="text-xs text-gray-500">{String(e.alibelle ?? "—")} · {String(e.heure ?? "—")} · Code: {String(e.codop ?? "—")}</div>
            </div>
            <span className="text-xs text-gray-400 font-mono">{String(e.date ?? "—")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
