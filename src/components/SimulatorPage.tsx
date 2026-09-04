import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api, type CalcResult, type EmployeeSummary, type PosteSummary } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { PayslipPDF } from "./PayslipPDF";
import { EmployeePickerModal } from "./EmployeePickerModal";
import { CatalogModal } from "./simulator/CatalogModal";
import { AllLinesCollapse } from "./simulator/AllLinesCollapse";
import { TValuesDisplay } from "./simulator/TValuesDisplay";
import { CalcChainDisplay } from "./simulator/CalcChainDisplay";
import { SaveProfileModal } from "./simulator/SaveProfileModal";
import type { RubInput, RubriqueMeta } from "./simulator/types";
import {
  Calculator, Search, Loader2, RotateCcw, FileText,
  ChevronDown, ChevronRight, Trash2, Zap, Users,
  Save,
} from "lucide-react";

export function SimulatorPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [_loadingEmps, setLoadingEmps] = useState(true);

  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [allRubriques, setAllRubriques] = useState<RubriqueMeta[]>([]);

  const [simRubriques, setSimRubriques] = useState<RubInput[]>([]);

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [showPayslip, setShowPayslip] = useState(false);
  const [showTValues, setShowTValues] = useState(false);
  const [showCalcChain, setShowCalcChain] = useState(false);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [postes, setPostes] = useState<PosteSummary[]>([]);

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
        const emps = await api.getEmployees({ actif_only: true, page_size: 500 });
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
          const val = Number(r.value ?? meta?.init_val ?? 0);
          const cl = meta?.classe ?? 0;
          // classe 3 (Nombre), 4 (Compteur), 7 (Paramètre): value goes in nombre
          // classe 1 (Gain), 2 (Retenue), 5 (Taux): value goes in montant
          const isNombre = cl === 3 || cl === 4 || cl === 7;
          return {
            code,
            libelle: String(r.libelle ?? meta?.libelle ?? "(sans libellé)"),
            montant: isNombre ? 0 : val,
            nombre: isNombre ? val : 0,
            classe: cl,
            formule: meta?.formule ?? null,
            calcul: meta?.calcul ?? 0,
          };
        })
        // Filter: only rubriques with a libellé (show both manual AND calculated)
        .filter(r => r.libelle && r.libelle.trim() !== "" && r.libelle !== "(sans libellé)");
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

  // Load postes list for save modal
  const loadPostes = useCallback(async () => {
    try {
      const p = await api.getPostes();
      setPostes(p);
    } catch (e) { console.error(e); }
  }, []);

  // Save rubriques to a poste profile
  const saveToPoste = async (posteId: number) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      for (const r of simRubriques) {
        const val = (r.classe === 3 || r.classe === 4 || r.classe === 7) ? r.nombre : r.montant;
        await api.updatePosteRubrique(posteId, `R${r.code}`, val);
      }
      setSaveMsg(`Profil mis à  jour avec ${simRubriques.length} rubriques.`);
    } catch (e) {
      setSaveMsg(`Erreur: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  // Save rubriques as employee overrides
  const saveToEmployee = async (employeeId: number) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      for (const r of simRubriques) {
        const val = (r.classe === 3 || r.classe === 4 || r.classe === 7) ? r.nombre : r.montant;
        await api.updateEmployeeRubrique(employeeId, `R${r.code}`, val, "Sauvegarde simulateur");
      }
      setSaveMsg(`Rubriques employé mises à  jour (${simRubriques.length}).`);
    } catch (e) {
      setSaveMsg(`Erreur: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  // Save as new poste profile
  const saveAsNewPoste = async (name: string, description: string) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const newId = await api.createPoste(name, description || null);
      for (const r of simRubriques) {
        const val = (r.classe === 3 || r.classe === 4 || r.classe === 7) ? r.nombre : r.montant;
        await api.updatePosteRubrique(newId, `R${r.code}`, val);
      }
      setSaveMsg(`Nouveau profil "${name}" créé avec ${simRubriques.length} rubriques.`);
      await loadPostes();
    } catch (e) {
      setSaveMsg(`Erreur: ${e}`);
    } finally {
      setSaving(false);
    }
  };

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

  // Segment lines by nature (PCPAIE logic)
  const segments = useMemo(() => {
    if (!calcResult) return null;
    const lines = calcResult.lines.filter(l => l.amount !== 0);
    // Gains cotisables (classe=1, is_secu_s=1, amount>0)
    const gainsCotisables = lines.filter(l => l.classe === 1 && l.amount > 0 && l.is_secu_s);
    // Gains imposables non cotisables (classe=1, is_secu_s=0, is_impos=1, amount>0)
    const gainsImpNonCot = lines.filter(l => l.classe === 1 && l.amount > 0 && !l.is_secu_s && l.is_impos);
    // Gains exonérés (classe=1, is_secu_s=0, is_impos=0, amount>0)
    const gainsExoneres = lines.filter(l => l.classe === 1 && l.amount > 0 && !l.is_secu_s && !l.is_impos);
    // Retenues cotisables (classe=2, is_secu_s=1)
    const retenuesCotisables = lines.filter(l => l.classe === 2 && l.is_secu_s);
    // Retenues imposables non cotisables (classe=2, is_secu_s=0, is_impos=1)
    const retenuesImpNonCot = lines.filter(l => l.classe === 2 && !l.is_secu_s && l.is_impos);
    // Retenues non cotisables non imposables (classe=2, is_secu_s=0, is_impos=0) — CNAS, IRG, acomptes
    const retenuesDiverses = lines.filter(l => l.classe === 2 && !l.is_secu_s && !l.is_impos);
    // CNAS 9% (R510) and IRG (R660) are in retenuesDiverses
    const cnas = lines.find(l => l.code === "510");
    const irg = lines.find(l => l.code === "660");
    // Totaux from calcResult
    return {
      gainsCotisables,
      gainsImpNonCot,
      gainsExoneres,
      retenuesCotisables,
      retenuesImpNonCot,
      retenuesDiverses,
      cnas,
      irg,
      baseCotisable: calcResult.base_cotisable,
      totalBrut: calcResult.total_brut,
      baseImposable: calcResult.base_imposable,
      totalRetenues: calcResult.total_retenues,
      netPayer: calcResult.net_payer,
    };
  }, [calcResult]);

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
          {simRubriques.length > 0 && selectedEmp && (
            <button
              onClick={() => { loadPostes(); setShowSaveModal(true); setSaveMsg(null); }}
              className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
            >
              <Save className="h-4 w-4" />
              Sauvegarder
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
                    <th className="px-2 py-1 text-right font-normal w-28">Valeur</th>
                    <th className="px-2 py-1 text-center font-normal w-12">Type</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const gainsRetenues = simRubriques.filter(r => r.classe === 1 || r.classe === 2);
                    const params = simRubriques.filter(r => r.classe !== 1 && r.classe !== 2);
                    // Determine value type based on classe:
                    // classe 1/2 → M (montant), classe 3/4 → N (nombre), classe 5 → T (taux, stocké en montant), classe 7 → N (nombre)
                    const getValueType = (classe: number): "M" | "N" | "T" => {
                      if (classe === 1 || classe === 2) return "M";
                      if (classe === 5) return "T";
                      return "N"; // classe 3, 4, 7
                    };
                    const valueTypeColor: Record<string, string> = {
                      M: "text-blue-600 bg-blue-50",
                      N: "text-amber-600 bg-amber-50",
                      T: "text-purple-600 bg-purple-50",
                    };
                    const renderRow = (r: typeof simRubriques[0], isParam: boolean) => {
                      const vtype = getValueType(r.classe);
                      // classe 1/2/5 → montant (M), classe 3/4/7 → nombre (N)
                      const field = (vtype === "M" || vtype === "T") ? "montant" : "nombre";
                      const value = r[field] || "";
                      const isCalc = r.calcul === 1;
                      return (
                        <tr key={r.code} className={`border-b border-gray-50 hover:bg-blue-50/30 ${isParam ? "bg-gray-50/30" : r.classe === 2 ? "bg-red-50/20" : ""} ${isCalc ? "opacity-60" : ""}`}>
                          <td className="px-2 py-1 font-mono text-gray-400">{r.code}</td>
                          <td className="px-2 py-1 text-gray-700">
                            {r.libelle}
                            {r.classe === 2 && <span className="ml-1 text-[8px] text-red-400">retenue</span>}
                            {isCalc && <span className="ml-1 text-[8px] text-amber-500">auto</span>}
                          </td>
                          <td className="px-1 py-1">
                            {isCalc ? (
                              <input
                                type="text"
                                value="— calcul —"
                                disabled
                                className="w-full rounded border border-gray-200 bg-gray-100 px-1 py-0.5 text-right text-xs text-gray-400 italic"
                              />
                            ) : (
                              <input
                                type="number"
                                value={value}
                                onChange={e => updateSimValue(r.code, field, parseFloat(e.target.value) || 0)}
                                className={`w-full rounded border px-1 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300 ${isParam ? "border-gray-200 bg-gray-50/50" : "border-gray-200"}`}
                                placeholder="0"
                              />
                            )}
                          </td>
                          <td className="px-1 py-1 text-center">
                            <span className={`rounded px-1 py-0.5 text-[8px] font-medium ${isCalc ? "bg-amber-100 text-amber-600" : valueTypeColor[vtype]}`}>
                              {isCalc ? "auto" : vtype}
                            </span>
                          </td>
                          <td className="px-1 py-1">
                            <button onClick={() => removeFromSim(r.code)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                          </td>
                        </tr>
                      );
                    };
                    return (
                      <>
                        {gainsRetenues.length > 0 && (
                          <>
                            <tr className="bg-blue-50/50 border-y border-blue-200">
                              <td colSpan={5} className="px-2 py-1 text-[10px] font-bold text-blue-800">
                                GAINS & RETENUES ({gainsRetenues.length}) — saisie en Montant (M)
                              </td>
                            </tr>
                            {gainsRetenues.map(r => renderRow(r, false))}
                          </>
                        )}
                        {params.length > 0 && (
                          <>
                            <tr className="bg-gray-100 border-y border-gray-300">
                              <td colSpan={5} className="px-2 py-1 text-[10px] font-bold text-gray-500">
                                PARAMÈTRES DE CALCUL ({params.length}) — saisie en Nombre (N) ou Taux (T)
                              </td>
                            </tr>
                            {params.map(r => renderRow(r, true))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
          {!selectedEmpId && simRubriques.length > 0 && (
            <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">⚠  Sélectionnez un employé pour calculer</div>
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

              {/* Tableau segmenté par nature — de haut en bas */}
              {segments && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-gray-400 text-[9px] border-b border-gray-200">
                      <th className="px-2 py-1 text-left font-normal w-10">Code</th>
                      <th className="px-2 py-1 text-left font-normal">Libellé</th>
                      <th className="px-2 py-1 text-right font-normal w-24">Montant</th>
                      <th className="px-2 py-1 text-center font-normal w-12">Nature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* === SEGMENT 1 : GAINS COTISABLES === */}
                    {segments.gainsCotisables.length > 0 && (
                      <>
                        <tr className="bg-blue-50 border-y border-blue-200">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-blue-800">
                            ①  GAINS SOUMIS À COTISATION CNAS ({segments.gainsCotisables.length})
                          </td>
                        </tr>
                        {segments.gainsCotisables.map(l => (
                          <tr key={l.code} className={`border-b border-gray-50 ${l.is_input ? "bg-blue-50/30" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-2 py-0.5 font-mono text-gray-400">{l.code}</td>
                            <td className="px-2 py-0.5 text-gray-700">
                              {l.libelle}
                              {l.is_input && <span className="ml-1 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-2 py-0.5 text-right font-medium text-gray-900">{formatCurrency(l.amount)}</td>
                            <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" title="Cotisable + Imposable" /></td>
                          </tr>
                        ))}
                        <tr className="bg-blue-100/50 border-b border-blue-200">
                          <td colSpan={2} className="px-2 py-1 text-[10px] font-bold text-blue-900 text-right">SOUS-TOTAL GAINS COTISABLES →</td>
                          <td className="px-2 py-1 text-right font-bold text-blue-900">{formatCurrency(segments.gainsCotisables.reduce((s, l) => s + l.amount, 0))}</td>
                          <td></td>
                        </tr>
                      </>
                    )}

                    {/* === SEGMENT 2 : RETENUES COTISABLES (absences, congés...) === */}
                    {segments.retenuesCotisables.length > 0 && (
                      <>
                        <tr className="bg-blue-50 border-y border-blue-300">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-blue-800">
                            ② RETENUES COTISABLES ({segments.retenuesCotisables.length}) — absences, congés, heures
                          </td>
                        </tr>
                        {segments.retenuesCotisables.map(l => (
                          <tr key={l.code} className={`border-b border-gray-50 ${l.is_input ? "bg-blue-50/30" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-2 py-0.5 font-mono text-gray-400">{l.code}</td>
                            <td className="px-2 py-0.5 text-gray-700">
                              {l.libelle}
                              {l.is_input && <span className="ml-1 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-2 py-0.5 text-right font-medium text-red-600">-{formatCurrency(Math.abs(l.amount))}</td>
                            <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-blue-400" title="Retenue cotisable" /></td>
                          </tr>
                        ))}
                        <tr className="bg-blue-100/30 border-b border-blue-200">
                          <td colSpan={2} className="px-2 py-1 text-[10px] font-bold text-blue-800 text-right">SOUS-TOTAL RETENUES COTISABLES →</td>
                          <td className="px-2 py-1 text-right font-bold text-red-600">-{formatCurrency(segments.retenuesCotisables.reduce((s, l) => s + Math.abs(l.amount), 0))}</td>
                          <td></td>
                        </tr>
                      </>
                    )}

                    {/* === SOUS-TOTAL : BASE COTISABLE NETTE === */}
                    <tr className="bg-gray-100 border-y-2 border-gray-300">
                      <td colSpan={2} className="px-2 py-1.5 text-[10px] font-bold text-gray-900 text-right">BASE COTISABLE (T[01]) →</td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">{formatCurrency(segments.baseCotisable)}</td>
                      <td></td>
                    </tr>

                    {/* === SEGMENT 3 : COTISATION CNAS 9% === */}
                    {segments.cnas && (
                      <>
                        <tr className="bg-red-50 border-y border-red-200">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-red-800">
                            ③ COTISATION CNAS 9% (sécurité sociale salarié)
                          </td>
                        </tr>
                        <tr className="border-b border-red-50" title={segments.cnas.formule || ""}>
                          <td className="px-2 py-0.5 font-mono text-gray-400">{segments.cnas.code}</td>
                          <td className="px-2 py-0.5 text-gray-700">{segments.cnas.libelle}</td>
                          <td className="px-2 py-0.5 text-right font-medium text-red-600">-{formatCurrency(Math.abs(segments.cnas.amount))}</td>
                          <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-red-500" title="Retenue CNAS" /></td>
                        </tr>
                      </>
                    )}

                    {/* === SEGMENT 4 : GAINS IMPOSABLES NON COTISABLES === */}
                    {segments.gainsImpNonCot.length > 0 && (
                      <>
                        <tr className="bg-amber-50 border-y border-amber-200">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-amber-800">
                            ④ GAINS IMPOSABLES NON COTISABLES ({segments.gainsImpNonCot.length}) — panier, transport
                          </td>
                        </tr>
                        {segments.gainsImpNonCot.map(l => (
                          <tr key={l.code} className={`border-b border-gray-50 ${l.is_input ? "bg-blue-50/30" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-2 py-0.5 font-mono text-gray-400">{l.code}</td>
                            <td className="px-2 py-0.5 text-gray-700">
                              {l.libelle}
                              {l.is_input && <span className="ml-1 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-2 py-0.5 text-right font-medium text-gray-900">{formatCurrency(l.amount)}</td>
                            <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" title="Imposable seulement" /></td>
                          </tr>
                        ))}
                        <tr className="bg-amber-100/50 border-b border-amber-200">
                          <td colSpan={2} className="px-2 py-1 text-[10px] font-bold text-amber-900 text-right">SOUS-TOTAL IMPOSABLE NON COT →</td>
                          <td className="px-2 py-1 text-right font-bold text-amber-900">{formatCurrency(segments.gainsImpNonCot.reduce((s, l) => s + l.amount, 0))}</td>
                          <td></td>
                        </tr>
                      </>
                    )}

                    {/* === SEGMENT 5 : RETENUES IMPOSABLES NON COTISABLES === */}
                    {segments.retenuesImpNonCot.length > 0 && (
                      <>
                        <tr className="bg-amber-50 border-y border-amber-300">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-amber-800">
                            ⑤ RETENUES IMPOSABLES NON COTISABLES ({segments.retenuesImpNonCot.length}) — mutuelle, intempéries
                          </td>
                        </tr>
                        {segments.retenuesImpNonCot.map(l => (
                          <tr key={l.code} className={`border-b border-gray-50 ${l.is_input ? "bg-blue-50/30" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-2 py-0.5 font-mono text-gray-400">{l.code}</td>
                            <td className="px-2 py-0.5 text-gray-700">
                              {l.libelle}
                              {l.is_input && <span className="ml-1 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-2 py-0.5 text-right font-medium text-red-600">-{formatCurrency(Math.abs(l.amount))}</td>
                            <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" title="Retenue imposable non cotisable" /></td>
                          </tr>
                        ))}
                        <tr className="bg-amber-100/30 border-b border-amber-200">
                          <td colSpan={2} className="px-2 py-1 text-[10px] font-bold text-amber-800 text-right">SOUS-TOTAL RETENUES IMP. NON COT →</td>
                          <td className="px-2 py-1 text-right font-bold text-red-600">-{formatCurrency(segments.retenuesImpNonCot.reduce((s, l) => s + Math.abs(l.amount), 0))}</td>
                          <td></td>
                        </tr>
                      </>
                    )}

                    {/* === SOUS-TOTAL : BASE IMPOSABLE === */}
                    <tr className="bg-gray-100 border-y-2 border-gray-300">
                      <td colSpan={2} className="px-2 py-1.5 text-[10px] font-bold text-gray-900 text-right">BASE IMPOSABLE (T[43]) →</td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">{formatCurrency(segments.baseImposable)}</td>
                      <td></td>
                    </tr>

                    {/* === SEGMENT 6 : RETENUE IRG === */}
                    {segments.irg && (
                      <>
                        <tr className="bg-red-50 border-y border-red-200">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-red-800">
                            ⑥ RETENUE IRG (impôt sur le revenu — barème)
                          </td>
                        </tr>
                        <tr className="border-b border-red-50" title={segments.irg.formule || ""}>
                          <td className="px-2 py-0.5 font-mono text-gray-400">{segments.irg.code}</td>
                          <td className="px-2 py-0.5 text-gray-700">{segments.irg.libelle}</td>
                          <td className="px-2 py-0.5 text-right font-medium text-red-600">-{formatCurrency(Math.abs(segments.irg.amount))}</td>
                          <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-red-600" title="Retenue IRG" /></td>
                        </tr>
                      </>
                    )}

                    {/* === SEGMENT 7 : GAINS EXONÉRÉS === */}
                    {segments.gainsExoneres.length > 0 && (
                      <>
                        <tr className="bg-green-50 border-y border-green-200">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-green-800">
                            ⑦ GAINS NON COTISABLES NON IMPOSABLES ({segments.gainsExoneres.length}) — alloc. familiale, frais
                          </td>
                        </tr>
                        {segments.gainsExoneres.map(l => (
                          <tr key={l.code} className={`border-b border-gray-50 ${l.is_input ? "bg-blue-50/30" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-2 py-0.5 font-mono text-gray-400">{l.code}</td>
                            <td className="px-2 py-0.5 text-gray-700">
                              {l.libelle}
                              {l.is_input && <span className="ml-1 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-2 py-0.5 text-right font-medium text-gray-900">{formatCurrency(l.amount)}</td>
                            <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Exonéré" /></td>
                          </tr>
                        ))}
                        <tr className="bg-green-100/50 border-b border-green-200">
                          <td colSpan={2} className="px-2 py-1 text-[10px] font-bold text-green-900 text-right">SOUS-TOTAL EXONÉRÉ →</td>
                          <td className="px-2 py-1 text-right font-bold text-green-900">{formatCurrency(segments.gainsExoneres.reduce((s, l) => s + l.amount, 0))}</td>
                          <td></td>
                        </tr>
                      </>
                    )}

                    {/* === SEGMENT 8 : RETENUES DIVERSES === */}
                    {segments.retenuesDiverses.filter(l => l.code !== "510" && l.code !== "660").length > 0 && (
                      <>
                        <tr className="bg-orange-50 border-y border-orange-200">
                          <td colSpan={4} className="px-2 py-1 text-[10px] font-bold text-orange-800">
                            ⑧ AUTRES RETENUES (acomptes, prêts, etc.)
                          </td>
                        </tr>
                        {segments.retenuesDiverses.filter(l => l.code !== "510" && l.code !== "660").map(l => (
                          <tr key={l.code} className={`border-b border-gray-50 ${l.is_input ? "bg-blue-50/30" : ""}`} title={l.formule || (l.is_input ? "Saisi manuellement" : "")}>
                            <td className="px-2 py-0.5 font-mono text-gray-400">{l.code}</td>
                            <td className="px-2 py-0.5 text-gray-700">
                              {l.libelle}
                              {l.is_input && <span className="ml-1 text-[8px] text-blue-500">✎</span>}
                            </td>
                            <td className="px-2 py-0.5 text-right font-medium text-red-600">-{formatCurrency(Math.abs(l.amount))}</td>
                            <td className="px-2 py-0.5 text-center"><span className="inline-block h-2 w-2 rounded-full bg-orange-500" title="Retenue diverse" /></td>
                          </tr>
                        ))}
                      </>
                    )}

                    {/* === TOTAUX FINAUX === */}
                    <tr className="bg-gray-100 border-y-2 border-gray-300">
                      <td colSpan={2} className="px-2 py-1.5 text-[10px] font-bold text-gray-900 text-right">TOTAL GAINS (T[03]) →</td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">{formatCurrency(segments.totalBrut)}</td>
                      <td></td>
                    </tr>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <td colSpan={2} className="px-2 py-1.5 text-[10px] font-bold text-gray-900 text-right">TOTAL RETENUES (T[04]) →</td>
                      <td className="px-2 py-1.5 text-right font-bold text-red-600">-{formatCurrency(segments.totalRetenues)}</td>
                      <td></td>
                    </tr>
                    <tr className="bg-green-100 border-y-2 border-green-600">
                      <td colSpan={2} className="px-2 py-2 text-sm font-bold text-green-900 text-right">NET À PAYER →</td>
                      <td className="px-2 py-2 text-right text-base font-bold text-green-700">{formatCurrency(segments.netPayer)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}

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

      {/* Save Modal */}
      {showSaveModal && (
        <SaveProfileModal
          simRubriques={simRubriques}
          selectedEmp={selectedEmp ?? null}
          postes={postes}
          saving={saving}
          saveMsg={saveMsg}
          onSaveToPoste={saveToPoste}
          onSaveToEmployee={saveToEmployee}
          onSaveAsNewPoste={saveAsNewPoste}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}
