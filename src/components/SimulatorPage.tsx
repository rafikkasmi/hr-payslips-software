import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api, type CalcResult, type CalcLine, type EmployeeSummary } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { PayslipPDF } from "./PayslipPDF";
import {
  Calculator, Search, Loader2, Play, RotateCcw, FileText,
  ChevronDown, ChevronRight, Plus, Trash2, Zap,
} from "lucide-react";

interface RubInput {
  code: string;
  libelle: string;
  montant: number;
  nombre: number;
  classe: number;
  is_input: boolean;
}

export function SimulatorPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [loadingEmps, setLoadingEmps] = useState(true);

  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [rubInputs, setRubInputs] = useState<RubInput[]>([]);
  const [loadingRubriques, setLoadingRubriques] = useState(false);

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const [showPayslip, setShowPayslip] = useState(false);
  const [showAddRub, setShowAddRub] = useState(false);
  const [addRubCode, setAddRubCode] = useState("");
  const [allRubriques, setAllRubriques] = useState<Record<string, unknown>[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load employees
  useEffect(() => {
    (async () => {
      setLoadingEmps(true);
      try {
        const emps = await api.getEmployees({ actifOnly: true, pageSize: 500 });
        setEmployees(emps);
      } catch (e) {
        console.error("Failed to load employees:", e);
      } finally {
        setLoadingEmps(false);
      }
    })();
  }, []);

  // Load all rubriques for the "add rubrique" picker
  useEffect(() => {
    (async () => {
      try {
        const rubs = await api.getRubriques();
        setAllRubriques(rubs);
      } catch (e) {
        console.error("Failed to load rubriques:", e);
      }
    })();
  }, []);

  const filteredEmployees = useMemo(() => {
    const s = empSearch.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter(e =>
      `${e.nom} ${e.prenom}`.toLowerCase().includes(s) ||
      e.matricule?.toLowerCase().includes(s)
    );
  }, [employees, empSearch]);

  const selectedEmp = useMemo(
    () => employees.find(e => e.id === selectedEmpId),
    [employees, selectedEmpId]
  );

  // Load rubriques for selected employee + period
  const loadEmployeeRubriques = useCallback(async (empId: number, per: string) => {
    setLoadingRubriques(true);
    setCalcError(null);
    try {
      const summary = await api.getPreCalcSummary(empId, per);
      const rubs = (Array.isArray(summary.rubriques) ? summary.rubriques : []) as Record<string, unknown>[];
      const inputs: RubInput[] = rubs.map(r => ({
        code: String(r.code ?? "").replace(/^R/, "").padStart(3, "0"),
        libelle: String(r.libelle ?? "(sans libellé)"),
        montant: 0,
        nombre: Number(r.value ?? 0),
        classe: 0,
        is_input: true,
      }));
      // Also load rubrique metadata (classe, libelle) from allRubriques
      for (const inp of inputs) {
        const meta = allRubriques.find((m: Record<string, unknown>) =>
          String(m.code ?? "").padStart(3, "0") === inp.code
        ) as Record<string, unknown> | undefined;
        if (meta) {
          inp.libelle = String(meta.libelle ?? inp.libelle);
          inp.classe = Number(meta.classe ?? 0);
          inp.montant = Number(meta.init_val ?? 0);
        }
      }
      setRubInputs(inputs);
    } catch (e) {
      console.error("Failed to load rubriques:", e);
      setRubInputs([]);
    } finally {
      setLoadingRubriques(false);
    }
  }, [allRubriques]);

  // Load rubriques when employee or period changes
  useEffect(() => {
    if (selectedEmpId && period) {
      loadEmployeeRubriques(selectedEmpId, period);
      setCalcResult(null);
    }
  }, [selectedEmpId, period, loadEmployeeRubriques]);

  // Auto-calculate (debounced) when rubInputs change
  const recalculate = useCallback(async (empId: number, per: string, inputs: RubInput[]) => {
    setCalculating(true);
    setCalcError(null);
    try {
      const inputValues: Record<string, [number, number]> = {};
      for (const r of inputs) {
        if (r.montant !== 0 || r.nombre !== 0) {
          inputValues[r.code] = [r.montant, r.nombre];
        }
      }
      const result = await api.calculateSalary(empId, per, inputValues);
      setCalcResult(result);
    } catch (e) {
      console.error("Calc error:", e);
      setCalcError(String(e));
      setCalcResult(null);
    } finally {
      setCalculating(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEmpId || rubInputs.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      recalculate(selectedEmpId, period, rubInputs);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedEmpId, period, rubInputs, recalculate]);

  const updateRubInput = (code: string, field: "montant" | "nombre", value: number) => {
    setRubInputs(prev => prev.map(r =>
      r.code === code ? { ...r, [field]: value } : r
    ));
  };

  const removeRubInput = (code: string) => {
    setRubInputs(prev => prev.filter(r => r.code !== code));
  };

  const addRubInput = () => {
    const code = addRubCode.replace(/^R/, "").padStart(3, "0");
    if (!code || rubInputs.some(r => r.code === code)) {
      setShowAddRub(false);
      setAddRubCode("");
      return;
    }
    const meta = allRubriques.find((m: Record<string, unknown>) =>
      String(m.code ?? "").padStart(3, "0") === code
    ) as Record<string, unknown> | undefined;
    setRubInputs(prev => [...prev, {
      code,
      libelle: String(meta?.libelle ?? "(nouvelle)"),
      montant: 0,
      nombre: Number(meta?.init_val ?? 0),
      classe: Number(meta?.classe ?? 0),
      is_input: true,
    }]);
    setShowAddRub(false);
    setAddRubCode("");
  };

  const resetInputs = () => {
    if (selectedEmpId) {
      loadEmployeeRubriques(selectedEmpId, period);
    }
  };

  // Group calc lines by classe
  const gains = useMemo(() =>
    calcResult?.lines.filter(l => l.amount !== 0 && l.classe === 1 && l.amount > 0) ?? [],
    [calcResult]
  );
  const retenues = useMemo(() =>
    calcResult?.lines.filter(l => l.amount !== 0 && (l.classe === 2 || (l.classe === 1 && l.amount < 0))) ?? [],
    [calcResult]
  );
  const infos = useMemo(() => {
    if (!calcResult) return [];
    const keyCodes = ["763", "765", "767", "770", "807", "817", "819", "824"];
    return calcResult.lines.filter(l => keyCodes.includes(l.code) && l.amount !== 0);
  }, [calcResult]);

  const availableToAdd = useMemo(() => {
    const existing = new Set(rubInputs.map(r => r.code));
    return allRubriques.filter((r: Record<string, unknown>) => {
      const c = String(r.code ?? "").padStart(3, "0");
      return !existing.has(c);
    }) as Record<string, unknown>[];
  }, [allRubriques, rubInputs]);

  return (
    <div className="flex h-full flex-col p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Simulateur de Paie</h1>
        </div>
        {calcResult && (
          <button
            onClick={() => setShowPayslip(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <FileText className="h-4 w-4" />
            Aperçu Bulletin
          </button>
        )}
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left panel: Employee + Rubriques */}
        <div className="flex w-[420px] flex-col gap-3 overflow-hidden">
          {/* Employee selector */}
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher employé..."
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={period}
                onChange={e => setPeriod(e.target.value.replace("-", "-"))}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400">Période</span>
            </div>
            {loadingEmps ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-gray-100">
                {filteredEmployees.slice(0, 50).map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmpId(emp.id)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${
                      selectedEmpId === emp.id ? "bg-blue-100 font-medium" : ""
                    }`}
                  >
                    <span>{emp.nom} {emp.prenom}</span>
                    <span className="font-mono text-xs text-gray-400">{emp.matricule}</span>
                  </button>
                ))}
                {filteredEmployees.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">Aucun employé</p>
                )}
              </div>
            )}
          </div>

          {/* Rubriques editor */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Rubriques {selectedEmp && `— ${selectedEmp.nom} ${selectedEmp.prenom}`}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={resetInputs}
                  title="Réinitialiser"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowAddRub(true)}
                  title="Ajouter une rubrique"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {loadingRubriques ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : !selectedEmpId ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Calculator className="mb-2 h-8 w-8" />
                <p className="text-sm">Sélectionnez un employé</p>
              </div>
            ) : rubInputs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <p className="text-sm">Aucune rubrique pour cet employé</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-400">
                    <tr>
                      <th className="px-2 py-1 text-left font-normal">Code</th>
                      <th className="px-2 py-1 text-left font-normal">Libellé</th>
                      <th className="px-2 py-1 text-right font-normal w-20">Montant</th>
                      <th className="px-2 py-1 text-right font-normal w-16">Nombre</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rubInputs.map(r => (
                      <tr key={r.code} className="border-b border-gray-50 hover:bg-blue-50/30">
                        <td className="px-2 py-1 font-mono text-gray-400">{r.code}</td>
                        <td className="px-2 py-1 text-gray-700">{r.libelle}</td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            value={r.montant || ""}
                            onChange={e => updateRubInput(r.code, "montant", parseFloat(e.target.value) || 0)}
                            className="w-full rounded border border-gray-200 px-1 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            value={r.nombre || ""}
                            onChange={e => updateRubInput(r.code, "nombre", parseFloat(e.target.value) || 0)}
                            className="w-full rounded border border-gray-200 px-1 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            onClick={() => removeRubInput(r.code)}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add rubrique picker */}
            {showAddRub && (
              <div className="border-t border-gray-200 bg-gray-50 p-2">
                <select
                  value={addRubCode}
                  onChange={e => setAddRubCode(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">— Sélectionner une rubrique —</option>
                  {availableToAdd.slice(0, 200).map((r: Record<string, unknown>) => {
                    const c = String(r.code ?? "").padStart(3, "0");
                    return (
                      <option key={c} value={c}>
                        R{c} — {String(r.libelle ?? "")}
                      </option>
                    );
                  })}
                </select>
                <div className="mt-1 flex gap-1">
                  <button
                    onClick={addRubInput}
                    disabled={!addRubCode}
                    className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                  <button
                    onClick={() => { setShowAddRub(false); setAddRubCode(""); }}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Results */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-700">Résultat du calcul</h3>
            {calculating && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Calcul...
              </div>
            )}
            {!calculating && calcResult && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <Zap className="h-3.5 w-3.5" />
                Calculé
              </div>
            )}
          </div>

          {!selectedEmpId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <Calculator className="mb-2 h-10 w-10" />
              <p className="text-sm">Sélectionnez un employé pour voir le calcul</p>
            </div>
          ) : calcError ? (
            <div className="flex flex-1 flex-col items-center justify-center text-red-500">
              <p className="text-sm font-medium">Erreur de calcul</p>
              <p className="mt-1 max-w-md text-center text-xs">{calcError}</p>
            </div>
          ) : !calcResult ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              {calculating ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <>
                  <Play className="mb-2 h-8 w-8" />
                  <p className="text-sm">Modifiez une valeur pour lancer le calcul</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {/* Totals bar */}
              <div className="mb-4 grid grid-cols-4 gap-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Brut</p>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(calcResult.total_brut)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Cotisable</p>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(calcResult.base_cotisable)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Imposable</p>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(calcResult.base_imposable)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Retenues</p>
                  <p className="text-sm font-bold text-red-600">{formatCurrency(calcResult.total_retenues)}</p>
                </div>
              </div>

              {/* Net à payer */}
              <div className="mb-4 flex items-center justify-between rounded-lg border-2 border-green-600 bg-green-50 px-4 py-3">
                <span className="text-sm font-bold text-gray-900">NET À PAYER</span>
                <span className="text-2xl font-bold text-green-700">{formatCurrency(calcResult.net_payer)}</span>
              </div>

              {/* Gains / Retenues */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="mb-1 rounded-t bg-green-50/50 px-2 py-1 text-xs font-bold text-gray-700 border-b border-gray-300">
                    Gains & Primes
                  </h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 text-[10px]">
                        <th className="py-0.5 text-left font-normal w-8">Code</th>
                        <th className="py-0.5 text-left font-normal">Libellé</th>
                        <th className="py-0.5 text-right font-normal w-16">Base</th>
                        <th className="py-0.5 text-right font-normal w-12">Taux</th>
                        <th className="py-0.5 text-right font-normal w-20">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gains.map(l => (
                        <tr key={l.code} className="border-b border-gray-50">
                          <td className="py-0.5 font-mono text-gray-400">{l.code}</td>
                          <td className="py-0.5 text-gray-700">{l.libelle}</td>
                          <td className="py-0.5 text-right text-gray-400">{l.base_value != null && l.base_value !== 0 ? formatCurrency(l.base_value) : "—"}</td>
                          <td className="py-0.5 text-right text-gray-400">{l.taux_value != null && l.taux_value !== 0 ? l.taux_value : "—"}</td>
                          <td className="py-0.5 text-right font-medium text-gray-900">{formatCurrency(l.amount)}</td>
                        </tr>
                      ))}
                      {gains.length === 0 && (
                        <tr><td colSpan={5} className="py-2 text-center text-gray-300">Aucun gain</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h4 className="mb-1 rounded-t bg-red-50/50 px-2 py-1 text-xs font-bold text-gray-700 border-b border-gray-300">
                    Retenues
                  </h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 text-[10px]">
                        <th className="py-0.5 text-left font-normal w-8">Code</th>
                        <th className="py-0.5 text-left font-normal">Libellé</th>
                        <th className="py-0.5 text-right font-normal w-16">Base</th>
                        <th className="py-0.5 text-right font-normal w-12">Taux</th>
                        <th className="py-0.5 text-right font-normal w-20">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retenues.map(l => (
                        <tr key={l.code} className="border-b border-gray-50">
                          <td className="py-0.5 font-mono text-gray-400">{l.code}</td>
                          <td className="py-0.5 text-gray-700">{l.libelle}</td>
                          <td className="py-0.5 text-right text-gray-400">{l.base_value != null && l.base_value !== 0 ? formatCurrency(l.base_value) : "—"}</td>
                          <td className="py-0.5 text-right text-gray-400">{l.taux_value != null && l.taux_value !== 0 ? l.taux_value : "—"}</td>
                          <td className="py-0.5 text-right font-medium text-red-600">{formatCurrency(Math.abs(l.amount))}</td>
                        </tr>
                      ))}
                      {retenues.length === 0 && (
                        <tr><td colSpan={5} className="py-2 text-center text-gray-300">Aucune retenue</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Key info lines */}
              {infos.length > 0 && (
                <div className="mt-4 rounded bg-gray-50 px-3 py-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {infos.map(l => (
                      <span key={l.code} className="text-gray-600">
                        <span className="font-medium">{l.libelle}:</span>{" "}
                        <span className="font-semibold text-gray-900">{formatCurrency(l.amount)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* All lines (collapsible) */}
              <AllLinesCollapse lines={calcResult.lines} />
            </div>
          )}
        </div>
      </div>

      {/* Payslip preview modal */}
      {showPayslip && calcResult && (
        <PayslipPDF result={calcResult} onClose={() => setShowPayslip(false)} />
      )}
    </div>
  );
}

function AllLinesCollapse({ lines }: { lines: CalcLine[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...lines].filter(l => l.amount !== 0).sort((a, b) => Number(a.code) - Number(b.code));
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Toutes les lignes ({sorted.length})
      </button>
      {open && (
        <div className="mt-1 max-h-60 overflow-y-auto rounded border border-gray-100">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-gray-400">
              <tr>
                <th className="px-2 py-1 text-left font-normal">Code</th>
                <th className="px-2 py-1 text-left font-normal">Libellé</th>
                <th className="px-2 py-1 text-right font-normal">Classe</th>
                <th className="px-2 py-1 text-right font-normal">Montant</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(l => (
                <tr key={l.code} className="border-b border-gray-50">
                  <td className="px-2 py-0.5 font-mono text-gray-400">{l.code}</td>
                  <td className="px-2 py-0.5 text-gray-700">{l.libelle}</td>
                  <td className="px-2 py-0.5 text-right text-gray-400">{l.classe}</td>
                  <td className="px-2 py-0.5 text-right font-medium text-gray-900">{formatCurrency(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
