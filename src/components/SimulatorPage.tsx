import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api, type CalcResult, type CalcLine, type EmployeeSummary } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { PayslipPDF } from "./PayslipPDF";
import { EmployeePickerModal } from "./EmployeePickerModal";
import {
  Calculator, Search, Loader2, RotateCcw, FileText,
  ChevronDown, ChevronRight, Trash2, Zap, ArrowRight, Users, X,
} from "lucide-react";

interface RubInput {
  code: string;
  libelle: string;
  montant: number;
  nombre: number;
  classe: number;
  formule: string | null;
  calcul: number;
}

interface RubriqueMeta {
  code: string;
  libelle: string;
  classe: number;
  init_val: number;
  formule: string | null;
  calcul: number; // 0 = manuelle/saisissable, 1 = calculée
}

export function SimulatorPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [loadingEmps, setLoadingEmps] = useState(true);

  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [allRubriques, setAllRubriques] = useState<RubriqueMeta[]>([]);
  const [rubSearch, setRubSearch] = useState("");
  const [rubFilterClasse, setRubFilterClasse] = useState<string>("");

  const [simRubriques, setSimRubriques] = useState<RubInput[]>([]);

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [showPayslip, setShowPayslip] = useState(false);
  const [showTValues, setShowTValues] = useState(false);
  const [showCalcChain, setShowCalcChain] = useState(false);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Column widths (percentages) for 2-panel layout (sim | result)
  const [colWidths, setColWidths] = useState({ sim: 40, result: 60 });
  const dragRef = useRef<{ startX: number; startWidths: typeof colWidths } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidths: { ...colWidths } };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const delta = ((e.clientX - dragRef.current.startX) / containerWidth) * 100;
      const { startWidths } = dragRef.current;
      const newSim = Math.max(25, Math.min(60, startWidths.sim + delta));
      setColWidths({ sim: newSim, result: 100 - newSim });
    };
    const handleUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

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

  useEffect(() => {
    (async () => {
      try {
        const rubs = await api.getRubriques();
        const mapped: RubriqueMeta[] = rubs.map((r: Record<string, unknown>) => ({
          code: String(r.code ?? "").padStart(3, "0"),
          libelle: String(r.libelle ?? "(sans libellé)"),
          classe: Number(r.classe ?? 0),
          init_val: Number(r.init_val ?? 0),
          formule: (r.formule as string | null) ?? null,
          calcul: Number(r.calcul ?? 0),
        }));
        setAllRubriques(mapped);
      } catch (e) {
        console.error("Failed to load rubriques:", e);
      }
    })();
  }, []);

  const selectedEmp = useMemo(
    () => employees.find(e => e.id === selectedEmpId),
    [employees, selectedEmpId]
  );

  // Auto-load rubriques from employee's profile (poste) when selected
  // Only load SAISSISSABLE rubriques (manuelle=1 or no formula) — not calculated ones
  const loadProfileRubriques = useCallback(async (empId: number) => {
    try {
      const summary = await api.getPreCalcSummary(empId, period);
      const rubs = (Array.isArray(summary.rubriques) ? summary.rubriques : []) as Record<string, unknown>[];
      const inputs: RubInput[] = rubs
        .map(r => {
          const code = String(r.code ?? "").replace(/^R/, "").padStart(3, "0");
          const meta = allRubriques.find(m => m.code === code);
          return {
            code,
            libelle: String(r.libelle ?? meta?.libelle ?? "(sans libellé)"),
            montant: Number(r.value ?? meta?.init_val ?? 0),
            nombre: 0,
            classe: meta?.classe ?? 0,
            formule: meta?.formule ?? null,
            calcul: meta?.calcul ?? 0,
          };
        })
        // Filter: only rubriques with calcul=0 (manuelles/saisissables) AND with a libellé
        .filter(r => r.calcul === 0 && r.libelle && r.libelle.trim() !== "" && r.libelle !== "(sans libellé)");
      setSimRubriques(inputs);
    } catch (e) {
      console.error("Failed to load profile rubriques:", e);
      setSimRubriques([]);
    }
  }, [allRubriques, period]);

  // When employee is selected, auto-fill the sim table with their profile rubriques
  useEffect(() => {
    if (selectedEmpId) {
      loadProfileRubriques(selectedEmpId);
    } else {
      setSimRubriques([]);
      setCalcResult(null);
    }
  }, [selectedEmpId, loadProfileRubriques]);

  const filteredCatalog = useMemo(() => {
    const s = rubSearch.trim().toLowerCase();
    return allRubriques.filter(r => {
      if (rubFilterClasse && String(r.classe) !== rubFilterClasse) return false;
      if (!s) return true;
      return r.code.includes(s) || r.libelle.toLowerCase().includes(s);
    });
  }, [allRubriques, rubSearch, rubFilterClasse]);

  const simCodes = useMemo(() => new Set(simRubriques.map(r => r.code)), [simRubriques]);

  const addToSim = (rub: RubriqueMeta) => {
    if (simCodes.has(rub.code)) return;
    setSimRubriques(prev => [...prev, {
      code: rub.code,
      libelle: rub.libelle,
      montant: rub.init_val,
      nombre: 0,
      classe: rub.classe,
      formule: rub.formule,
      calcul: rub.calcul,
    }]);
  };

  const removeFromSim = (code: string) => {
    setSimRubriques(prev => prev.filter(r => r.code !== code));
  };

  const updateSimValue = (code: string, field: "montant" | "nombre", value: number) => {
    setSimRubriques(prev => prev.map(r =>
      r.code === code ? { ...r, [field]: value } : r
    ));
  };

  const clearSim = () => {
    setSimRubriques([]);
    setCalcResult(null);
  };

  // Scénarios pré-configurés
  const applyScenario = (scenario: "full" | "absence3" | "conge10" | "maladie5" | "hs20") => {
    setSimRubriques(prev => prev.map(r => {
      if (["033", "089", "099", "110", "120", "127"].includes(r.code)) {
        let val = 0;
        if (scenario === "absence3" && r.code === "033") val = 3;
        if (scenario === "conge10" && r.code === "099") val = 10;
        if (scenario === "maladie5" && r.code === "089") val = 5;
        if (scenario === "hs20" && r.code === "110") val = 20;
        return { ...r, nombre: val };
      }
      return r;
    }));
  };

  const recalculate = useCallback(async (empId: number, per: string, inputs: RubInput[]) => {
    setCalculating(true);
    setCalcError(null);
    try {
      const inputValues: Record<string, [number, number]> = {};
      for (const r of inputs) {
        inputValues[r.code] = [r.montant, r.nombre];
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
    if (!selectedEmpId || simRubriques.length === 0) {
      setCalcResult(null);
      setCalcError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      recalculate(selectedEmpId, period, simRubriques);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedEmpId, period, simRubriques, recalculate]);

  const gains = useMemo(() =>
    calcResult?.lines.filter(l => l.amount !== 0 && l.classe === 1 && l.amount > 0) ?? [],
    [calcResult]
  );
  const retenues = useMemo(() =>
    calcResult?.lines.filter(l => l.amount !== 0 && (l.classe === 2 || (l.classe === 1 && l.amount < 0))) ?? [],
    [calcResult]
  );
  const taux = useMemo(() =>
    calcResult?.lines.filter(l => l.amount !== 0 && l.classe === 5) ?? [],
    [calcResult]
  );
  const compteurs = useMemo(() =>
    calcResult?.lines.filter(l => l.amount !== 0 && (l.classe === 7 || l.classe === 0)) ?? [],
    [calcResult]
  );
  const infos = useMemo(() => {
    if (!calcResult) return [];
    const keyCodes = ["763", "765", "767", "770", "807", "817", "819", "824"];
    return calcResult.lines.filter(l => keyCodes.includes(l.code) && l.amount !== 0);
  }, [calcResult]);

  const classeLabels: Record<number, string> = {
    0: "Info/Totaux",
    1: "Gains",
    2: "Retenues",
    3: "Nombre",
    5: "Taux",
    7: "Compteur",
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Simulateur de Paie</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Catalogue button — opens modal */}
          <button
            onClick={() => setShowCatalogModal(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
          >
            <Search className="h-4 w-4" />
            Catalogue Rubriques
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{allRubriques.length}</span>
          </button>
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
      </div>

      {/* Employee + period bar */}
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
        <button
          onClick={() => setShowEmpModal(true)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
        >
          <Users className="h-4 w-4" />
          {selectedEmp ? (
            <span>
              {selectedEmp.nom} {selectedEmp.prenom} <span className="font-mono text-xs text-gray-400">({selectedEmp.matricule})</span>
            </span>
          ) : (
            <span className="text-gray-500">Sélectionner un employé...</span>
          )}
        </button>
        {selectedEmp && (
          <button
            onClick={() => { setSelectedEmpId(null); setSimRubriques([]); setCalcResult(null); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Changer d'employé"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        {selectedEmp?.poste_name && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            Profil: {selectedEmp.poste_name}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">Période</span>
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {!selectedEmpId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700">
          Sélectionnez un employé → sa table de simulation se remplit automatiquement avec les rubriques de son profil
        </div>
      )}

      {/* 2 panels side-by-side: Simulation | Résultat */}
      <div ref={containerRef} className="flex flex-1 gap-0 overflow-hidden">
        {/* Panel 1: Table de Simulation */}
        <div style={{ width: `${colWidths.sim}%` }} className="flex flex-col overflow-hidden rounded-l-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Table de Simulation
              {simRubriques.length > 0 && <span className="ml-1 text-xs text-gray-400">({simRubriques.length})</span>}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCatalogModal(true)}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
              >
                <Search className="h-3 w-3" /> Ajouter
              </button>
              {simRubriques.length > 0 && (
                <button onClick={clearSim} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-red-600">
                  <RotateCcw className="h-3 w-3" /> Vider
                </button>
              )}
            </div>
          </div>
          {simRubriques.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-300">
              <Calculator className="mb-2 h-10 w-10" />
              <p className="text-sm">Sélectionnez un employé</p>
              <p className="text-xs">pour charger son profil de paie</p>
              <p className="mt-2 text-xs text-gray-400">ou cliquez « Ajouter » pour des rubriques</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-400">
                  <tr>
                    <th className="px-2 py-1 text-left font-normal w-10">Code</th>
                    <th className="px-2 py-1 text-left font-normal">Libellé</th>
                    <th className="px-2 py-1 text-right font-normal w-24">Montant</th>
                    <th className="px-2 py-1 text-right font-normal w-20">Nombre</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {simRubriques.map(r => (
                    <tr key={r.code} className="border-b border-gray-50 hover:bg-blue-50/30">
                      <td className="px-2 py-1 font-mono text-gray-400">{r.code}</td>
                      <td className="px-2 py-1 text-gray-700">{r.libelle}</td>
                      <td className="px-1 py-1">
                        <input type="number" value={r.montant || ""} onChange={e => updateSimValue(r.code, "montant", parseFloat(e.target.value) || 0)} className="w-full rounded border border-gray-200 px-1 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300" placeholder="0" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" value={r.nombre || ""} onChange={e => updateSimValue(r.code, "nombre", parseFloat(e.target.value) || 0)} className="w-full rounded border border-gray-200 px-1 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300" placeholder="0" />
                      </td>
                      <td className="px-1 py-1">
                        <button onClick={() => removeFromSim(r.code)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!selectedEmpId && simRubriques.length > 0 && (
            <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">⚠ Sélectionnez un employé pour calculer</div>
          )}
        </div>

        {/* Drag handle between sim and result */}
        <div
          onMouseDown={(e) => startDrag(e)}
          className="flex w-1.5 cursor-col-resize items-center justify-center bg-gray-200 hover:bg-blue-400 transition-colors"
        >
          <div className="h-8 w-0.5 rounded bg-gray-400" />
        </div>

        {/* Panel 2: Résultat — 4 colonnes par catégorie */}
        <div style={{ width: `${colWidths.result}%` }} className="flex flex-col overflow-hidden rounded-r-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-700">Résultat</h3>
            {calculating && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />Calcul...</div>
            )}
            {!calculating && calcResult && (
              <div className="flex items-center gap-1.5 text-xs text-green-600"><Zap className="h-3.5 w-3.5" />Calculé</div>
            )}
          </div>

          {!selectedEmpId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <Calculator className="mb-2 h-10 w-10" />
              <p className="text-sm">Sélectionnez un employé</p>
            </div>
          ) : simRubriques.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <Calculator className="mb-2 h-10 w-10" />
              <p className="text-sm">Sélectionnez un employé pour charger son profil</p>
              <p className="text-xs mt-1">ou ajoutez des rubriques manuellement</p>
            </div>
          ) : calcError ? (
            <div className="flex flex-1 flex-col items-center justify-center text-red-500">
              <p className="text-sm font-medium">Erreur de calcul</p>
              <p className="mt-1 max-w-md text-center text-xs">{calcError}</p>
            </div>
          ) : !calcResult ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              {calculating ? <Loader2 className="h-8 w-8 animate-spin" /> : <p className="text-sm">En attente du calcul...</p>}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              {/* Net à payer + totaux — barre de synthèse */}
              <div className="mb-3 flex items-center gap-2">
                <div className="flex items-center justify-between rounded-lg border-2 border-green-600 bg-green-50 px-4 py-2 flex-1">
                  <span className="text-sm font-bold text-gray-900">NET À PAYER</span>
                  <span className="text-xl font-bold text-green-700">{formatCurrency(calcResult.net_payer)}</span>
                </div>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500">Brut</p>
                  <p className="text-xs font-bold text-gray-900">{formatCurrency(calcResult.total_brut)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500">Cotisable</p>
                  <p className="text-xs font-bold text-gray-900">{formatCurrency(calcResult.base_cotisable)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500">Imposable</p>
                  <p className="text-xs font-bold text-gray-900">{formatCurrency(calcResult.base_imposable)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500">Retenues</p>
                  <p className="text-xs font-bold text-red-600">{formatCurrency(calcResult.total_retenues)}</p>
                </div>
              </div>

              {/* Scénarios */}
              {simRubriques.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-gray-400 mr-1">Scénarios:</span>
                  {[
                    { key: "full", label: "Mois complet" },
                    { key: "absence3", label: "Absence 3j" },
                    { key: "conge10", label: "Congé 10j" },
                    { key: "maladie5", label: "Maladie 5j" },
                    { key: "hs20", label: "HS 20h" },
                  ].map(s => (
                    <button
                      key={s.key}
                      onClick={() => applyScenario(s.key as "full" | "absence3" | "conge10" | "maladie5" | "hs20")}
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-blue-100 hover:text-blue-700"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Légende */}
              <div className="mb-2 flex items-center gap-3 text-[9px] text-gray-400">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-blue-200" /> Saisi</span>
                <span className="flex items-center gap-1"><span className="text-blue-500">✎</span> modifiable</span>
                <span>Survol = formule</span>
              </div>

              {/* 4 colonnes : Gains | Retenues | Taux | Compteurs */}
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {/* Colonne 1: Gains */}
                <div className="rounded-lg border border-green-200 bg-green-50/30">
                  <h4 className="rounded-t bg-green-100/60 px-2 py-1 text-[10px] font-bold text-green-800 border-b border-green-200">
                    GAINS ({gains.length})
                  </h4>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <tbody>
                        {gains.map(l => (
                          <tr key={l.code} className={`border-b border-green-50 ${l.is_input ? "bg-blue-50/40" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-1 py-0.5 font-mono text-gray-400 w-7">{l.code}</td>
                            <td className="px-1 py-0.5 text-gray-700 truncate max-w-[80px]">
                              {l.libelle}
                              {l.is_input && <span className="ml-0.5 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-1 py-0.5 text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(l.amount)}</td>
                          </tr>
                        ))}
                        {gains.length === 0 && <tr><td colSpan={3} className="py-2 text-center text-gray-300">Aucun gain</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {gains.length > 0 && (
                    <div className="border-t border-green-200 px-2 py-1 text-[10px] font-bold text-green-800 text-right">
                      {formatCurrency(gains.reduce((s, l) => s + l.amount, 0))}
                    </div>
                  )}
                </div>

                {/* Colonne 2: Retenues */}
                <div className="rounded-lg border border-red-200 bg-red-50/30">
                  <h4 className="rounded-t bg-red-100/60 px-2 py-1 text-[10px] font-bold text-red-800 border-b border-red-200">
                    RETENUES ({retenues.length})
                  </h4>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <tbody>
                        {retenues.map(l => (
                          <tr key={l.code} className={`border-b border-red-50 ${l.is_input ? "bg-blue-50/40" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-1 py-0.5 font-mono text-gray-400 w-7">{l.code}</td>
                            <td className="px-1 py-0.5 text-gray-700 truncate max-w-[80px]">
                              {l.libelle}
                              {l.is_input && <span className="ml-0.5 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-1 py-0.5 text-right font-medium text-red-600 whitespace-nowrap">{formatCurrency(Math.abs(l.amount))}</td>
                          </tr>
                        ))}
                        {retenues.length === 0 && <tr><td colSpan={3} className="py-2 text-center text-gray-300">Aucune retenue</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {retenues.length > 0 && (
                    <div className="border-t border-red-200 px-2 py-1 text-[10px] font-bold text-red-800 text-right">
                      {formatCurrency(retenues.reduce((s, l) => s + Math.abs(l.amount), 0))}
                    </div>
                  )}
                </div>

                {/* Colonne 3: Taux & Paramètres */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/30">
                  <h4 className="rounded-t bg-amber-100/60 px-2 py-1 text-[10px] font-bold text-amber-800 border-b border-amber-200">
                    TAUX ({taux.length})
                  </h4>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <tbody>
                        {taux.map(l => (
                          <tr key={l.code} className="border-b border-amber-50" title={l.formule || ""}>
                            <td className="px-1 py-0.5 font-mono text-gray-400 w-7">{l.code}</td>
                            <td className="px-1 py-0.5 text-gray-700 truncate max-w-[80px]">{l.libelle}</td>
                            <td className="px-1 py-0.5 text-right font-medium text-amber-700 whitespace-nowrap">
                              {Number.isInteger(l.amount) ? l.amount : l.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {taux.length === 0 && <tr><td colSpan={3} className="py-2 text-center text-gray-300">Aucun taux</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Colonne 4: Compteurs & Infos */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/30">
                  <h4 className="rounded-t bg-blue-100/60 px-2 py-1 text-[10px] font-bold text-blue-800 border-b border-blue-200">
                    COMPTEURS ({compteurs.length})
                  </h4>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <tbody>
                        {compteurs.map(l => (
                          <tr key={l.code} className={`border-b border-blue-50 ${l.is_input ? "bg-blue-100/40" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-1 py-0.5 font-mono text-gray-400 w-7">{l.code}</td>
                            <td className="px-1 py-0.5 text-gray-700 truncate max-w-[80px]">
                              {l.libelle}
                              {l.is_input && <span className="ml-0.5 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-1 py-0.5 text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(l.amount)}</td>
                          </tr>
                        ))}
                        {compteurs.length === 0 && <tr><td colSpan={3} className="py-2 text-center text-gray-300">Aucun compteur</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Sections collapsibles */}
              <div className="mt-3 space-y-2">
                {calcResult.t_values && Object.keys(calcResult.t_values).length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowTValues(!showTValues)}
                      className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700"
                    >
                      {showTValues ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      Variables T[] ({Object.keys(calcResult.t_values).length})
                    </button>
                    {showTValues && <TValuesDisplay tValues={calcResult.t_values} />}
                  </div>
                )}
                <div>
                  <button
                    onClick={() => setShowCalcChain(!showCalcChain)}
                    className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700"
                  >
                    {showCalcChain ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Chaîne de calcul
                  </button>
                  {showCalcChain && <CalcChainDisplay lines={calcResult.lines} />}
                </div>
                <AllLinesCollapse lines={calcResult.lines} />
              </div>
            </div>
          )}
        </div>
      </div>

      {showPayslip && calcResult && (
        <PayslipPDF result={calcResult} onClose={() => setShowPayslip(false)} />
      )}

      {/* Catalogue Modal */}
      {showCatalogModal && (
        <CatalogModal
          rubriques={allRubriques}
          simCodes={simCodes}
          onAdd={addToSim}
          onClose={() => setShowCatalogModal(false)}
        />
      )}

      <EmployeePickerModal
        open={showEmpModal}
        onClose={() => setShowEmpModal(false)}
        onSelect={(emp) => setSelectedEmpId(emp.id)}
        selectedEmpId={selectedEmpId}
      />
    </div>
  );
}

// ============================================================
// CatalogModal — Modale du catalogue de rubriques (filtres + sélection)
// ============================================================

function CatalogModal({
  rubriques,
  simCodes,
  onAdd,
  onClose,
}: {
  rubriques: RubriqueMeta[];
  simCodes: Set<string>;
  onAdd: (rub: RubriqueMeta) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterClasse, setFilterClasse] = useState<string>("");
  const [filterCalcul, setFilterCalcul] = useState<string>(""); // "" = all, "0" = manuelle, "1" = calculée
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const classeLabels: Record<number, string> = {
    0: "Info/Totaux",
    1: "Gains",
    2: "Retenues",
    3: "Nombre",
    5: "Taux",
    7: "Compteur",
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rubriques.filter(r => {
      if (filterClasse && String(r.classe) !== filterClasse) return false;
      if (filterCalcul && String(r.calcul) !== filterCalcul) return false;
      if (!s) return true;
      return r.code.includes(s) || r.libelle.toLowerCase().includes(s);
    });
  }, [rubriques, search, filterClasse, filterCalcul]);

  const toggleSelect = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const addSelected = () => {
    for (const code of selectedCodes) {
      const rub = rubriques.find(r => r.code === code);
      if (rub && !simCodes.has(code)) onAdd(rub);
    }
    setSelectedCodes(new Set());
  };

  const addAllFiltered = () => {
    for (const rub of filtered) {
      if (!simCodes.has(rub.code)) onAdd(rub);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-[900px] max-w-[95vw] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Catalogue des Rubriques</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{rubriques.length}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filtres */}
        <div className="border-b border-gray-100 px-5 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Recherche par code ou libellé..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtre par classe */}
            <span className="text-xs text-gray-400">Classe:</span>
            <button onClick={() => setFilterClasse("")} className={`rounded px-2 py-0.5 text-xs ${!filterClasse ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Toutes</button>
            {[0, 1, 2, 3, 5, 7].map(c => (
              <button key={c} onClick={() => setFilterClasse(String(c))} className={`rounded px-2 py-0.5 text-xs ${filterClasse === String(c) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {classeLabels[c] || `Cl.${c}`}
              </button>
            ))}
            {/* Filtre par type */}
            <span className="ml-3 text-xs text-gray-400">Type:</span>
            <button onClick={() => setFilterCalcul("")} className={`rounded px-2 py-0.5 text-xs ${!filterCalcul ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Tous</button>
            <button onClick={() => setFilterCalcul("0")} className={`rounded px-2 py-0.5 text-xs ${filterCalcul === "0" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Manuelles</button>
            <button onClick={() => setFilterCalcul("1")} className={`rounded px-2 py-0.5 text-xs ${filterCalcul === "1" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Calculées</button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{filtered.length} rubrique(s) trouvée(s)</span>
            <div className="flex items-center gap-2">
              <button
                onClick={addAllFiltered}
                className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Tout ajouter ({filtered.filter(r => !simCodes.has(r.code)).length})
              </button>
              {selectedCodes.size > 0 && (
                <button
                  onClick={addSelected}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Ajouter ({selectedCodes.size})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tableau des rubriques */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-gray-400 text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-normal w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(r => selectedCodes.has(r.code))}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedCodes(new Set(filtered.map(r => r.code)));
                      } else {
                        setSelectedCodes(new Set());
                      }
                    }}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 text-left font-normal w-12">Code</th>
                <th className="px-3 py-2 text-left font-normal">Libellé</th>
                <th className="px-3 py-2 text-left font-normal w-20">Classe</th>
                <th className="px-3 py-2 text-left font-normal w-20">Type</th>
                <th className="px-3 py-2 text-left font-normal w-32">Formule</th>
                <th className="px-3 py-2 text-center font-normal w-16">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(rub => {
                const inSim = simCodes.has(rub.code);
                const isSelected = selectedCodes.has(rub.code);
                return (
                  <tr
                    key={rub.code}
                    className={`border-b border-gray-50 hover:bg-blue-50/30 ${isSelected ? "bg-blue-50/50" : ""} ${inSim ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(rub.code)}
                        disabled={inSim}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-gray-500">{rub.code}</td>
                    <td className="px-3 py-1.5 text-gray-700">{rub.libelle}</td>
                    <td className="px-3 py-1.5">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                        {classeLabels[rub.classe] || `Cl.${rub.classe}`}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${rub.calcul === 1 ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {rub.calcul === 1 ? "Calculée" : "Manuelle"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-gray-400 truncate max-w-[120px]" title={rub.formule || ""}>
                      {rub.formule || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {inSim ? (
                        <span className="text-[10px] text-green-600 font-medium">✓ Dans sim</span>
                      ) : (
                        <button
                          onClick={() => onAdd(rub)}
                          className="rounded px-2 py-0.5 text-[10px] text-blue-600 hover:bg-blue-100"
                        >
                          + Ajouter
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">Aucune rubrique trouvée</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AllLinesCollapse({ lines }: { lines: CalcLine[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...lines].filter(l => l.amount !== 0).sort((a, b) => Number(a.code) - Number(b.code));
  return (
    <div className="mt-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700">
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

// ============================================================
// TValuesDisplay — Affiche les variables système T[]
// ============================================================

const tLabels: Record<string, string> = {
  "1": "Cotisable (mensuel)",
  "3": "Total gains",
  "4": "Total retenues",
  "7": "Salaire base (R001)",
  "9": "Jours/mois",
  "10": "Heures/mois",
  "15": "Ratio travail normal",
  "16": "Ratio heures supp",
  "17": "Ratio nuit/weekend",
  "40": "Flag exonération IRG",
  "41": "Imposable régul",
  "43": "Imposable mensuel",
  "47": "Mutuelle multiplier",
  "51": "Imposable 10%",
  "52": "Salaire brut",
  "53": "Cotisable 10%",
  "57": "Cotisable régul",
  "58": "Cotisable pour IRG",
  "76": "Prorata cotisable",
  "77": "CACOBATH coefficient",
  "78": "Heures/jour",
};

function TValuesDisplay({ tValues }: { tValues: Record<string, number> }) {
  const sorted = Object.entries(tValues).sort((a, b) => Number(a[0]) - Number(b[0]));
  return (
    <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {sorted.map(([key, val]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-gray-500">
              <span className="font-mono text-gray-400">T[{key}]</span>
              {" "}
              <span className="text-[10px]">{tLabels[key] || ""}</span>
            </span>
            <span className={`font-semibold ${key === "52" || key === "1" || key === "43" ? "text-gray-900" : "text-gray-600"}`}>
              {Number.isInteger(val) ? val : val.toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CalcChainDisplay — Affiche la chaîne de calcul avec formules résolues
// ============================================================

function CalcChainDisplay({ lines }: { lines: CalcLine[] }) {
  // Only show lines with non-zero amount OR input lines with a value
  // Exclude classe 5 (taux/paramètres de calcul) and classe 7 (infos système) from the chain
  // to keep the display focused on gains and retenues
  const sorted = [...lines]
    .filter(l => l.amount !== 0 && l.classe !== 5 && l.classe !== 7)
    .sort((a, b) => Number(a.code) - Number(b.code));

  // Group by category
  const gains = sorted.filter(l => l.classe === 1 && l.amount > 0);
  const retenues = sorted.filter(l => l.classe === 2 || (l.classe === 1 && l.amount < 0));
  const autres = sorted.filter(l => l.classe === 0 || l.classe === 3 || l.classe === 4);

  const renderRow = (l: CalcLine) => {
    const typeLabel = l.is_input
      ? "SAISI"
      : l.formule
        ? "CALCULÉ"
        : "MANUEL";
    const typeColor = l.is_input
      ? "text-blue-600 bg-blue-50"
      : l.formule
        ? "text-gray-500 bg-gray-100"
        : "text-purple-600 bg-purple-50";
    return (
      <tr key={l.code} className="border-b border-gray-50 hover:bg-blue-50/30">
        <td className="px-2 py-0.5 font-mono text-gray-400">R{l.code}</td>
        <td className="px-2 py-0.5 text-gray-700 truncate max-w-[120px]">{l.libelle}</td>
        <td className="px-2 py-0.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeColor}`}>
            {typeLabel}
          </span>
        </td>
        <td className="px-2 py-0.5 font-mono text-[10px] text-gray-400 truncate max-w-[200px]">
          {l.formule || "—"}
        </td>
        <td className="px-2 py-0.5 text-right font-medium text-gray-900">
          {formatCurrency(l.amount)}
        </td>
      </tr>
    );
  };

  return (
    <div className="mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-50 text-gray-400">
          <tr>
            <th className="px-2 py-1 text-left font-normal w-10">Code</th>
            <th className="px-2 py-1 text-left font-normal">Libellé</th>
            <th className="px-2 py-1 text-left font-normal w-32">Type</th>
            <th className="px-2 py-1 text-left font-normal">Formule</th>
            <th className="px-2 py-1 text-right font-normal w-24">Montant</th>
          </tr>
        </thead>
        <tbody>
          {gains.length > 0 && (
            <>
              <tr><td colSpan={5} className="bg-green-50/50 px-2 py-1 text-[10px] font-bold text-green-700 uppercase">Gains ({gains.length})</td></tr>
              {gains.map(renderRow)}
            </>
          )}
          {retenues.length > 0 && (
            <>
              <tr><td colSpan={5} className="bg-red-50/50 px-2 py-1 text-[10px] font-bold text-red-700 uppercase">Retenues ({retenues.length})</td></tr>
              {retenues.map(renderRow)}
            </>
          )}
          {autres.length > 0 && (
            <>
              <tr><td colSpan={5} className="bg-gray-50 px-2 py-1 text-[10px] font-bold text-gray-600 uppercase">Autres ({autres.length})</td></tr>
              {autres.map(renderRow)}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
