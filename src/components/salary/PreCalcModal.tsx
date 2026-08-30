import { useSalaryContext } from "./SalaryContext";
import { Modal } from "../ui/Modal";
import { formatCurrency } from "../../lib/utils";
import { History, Calculator, Search, ChevronDown, ChevronRight, Loader2, CalendarOff, AlertTriangle } from "lucide-react";

const leaveTypeLabels: Record<string, string> = {
  annual: "Congé annuel",
  sick: "Maladie",
  unpaid: "Sans solde",
  maternity: "Maternité",
  special: "Congé spécial",
};

const leaveStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Approuvé", className: "bg-green-100 text-green-700" },
  rejected: { label: "Refusé", className: "bg-red-100 text-red-700" },
};

export function PreCalcModal() {
  const ctx = useSalaryContext();
  const {
    showPreCalcModal, setShowPreCalcModal, selectedPeriod,
    loadPreCalcReview, loadingPreCalc,
    preCalcSearch, setPreCalcSearch,
    preCalcData, employees, expandedPreCalc, togglePreCalcExpand,
    rubOverrides, updateRubOverride,
    handleCalculateAll,
  } = ctx;

  return (
    <Modal
      open={showPreCalcModal}
      onClose={() => setShowPreCalcModal(false)}
      title="Pré-calcul"
      subtitle={`Révision avant calcul — ${selectedPeriod}`}
      icon={<History className="h-5 w-5" />}
      size="xl"
      footer={
        <>
          <button onClick={() => loadPreCalcReview()} className="text-sm text-blue-600 hover:text-blue-700">Actualiser</button>
          <button onClick={() => { setShowPreCalcModal(false); handleCalculateAll(); }} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            <Calculator className="h-4 w-4" /> Calculer
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-gray-400" />
        <input value={preCalcSearch} onChange={e => setPreCalcSearch(e.target.value)} placeholder="Rechercher employé..." className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
      </div>
      {!loadingPreCalc && Object.keys(preCalcData).length > 0 ? (
        <div className="space-y-1">
          {employees.filter(e => {
            if (!e.actif) return false;
            if (!preCalcData[e.id]) return false;
            if (preCalcSearch) { const q = preCalcSearch.toLowerCase(); if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false; }
            return true;
          }).map(emp => {
            const data = preCalcData[emp.id];
            const isExpanded = expandedPreCalc.has(emp.id);
            const overrides = rubOverrides[emp.id] ?? {};
            const hasEdits = data.rubriques.some(r => { const code = String(r.code ?? ""); return overrides[code] !== Number(r.value ?? 0); });
            return (
              <div key={emp.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => togglePreCalcExpand(emp.id)}>
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="font-mono text-xs text-gray-500 w-16">{emp.matricule}</span>
                  <span className="text-sm font-medium flex-1">{emp.nom} {emp.prenom}</span>
                  <span className="text-xs text-gray-500">{data.attendanceDays} j. présence</span>
                  {data.overtime && <span className="text-xs text-gray-500">HS: {Number(data.overtime.hours_50 ?? 0)}h + {Number(data.overtime.hours_100 ?? 0)}h</span>}
                  <span className="text-xs text-gray-500">{data.bonuses.length} primes</span>
                  {data.pendingLeaveCount && data.pendingLeaveCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium">
                      <AlertTriangle className="h-3 w-3" /> {data.pendingLeaveCount} congé(s) en attente
                    </span>
                  )}
                  {hasEdits && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium">Modifié</span>}
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                    {data.bonuses.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">Primes à appliquer :</div>
                        <div className="flex flex-wrap gap-1">
                          {data.bonuses.map((b, i) => (<span key={i} className={`rounded-full px-2 py-0.5 text-xs ${String(b.bonus_type) === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{String(b.title)} — {b.is_percentage ? `${b.amount}%` : formatCurrency(Number(b.amount))}</span>))}
                        </div>
                      </div>
                    )}
                    {(data.leaves && data.leaves.length > 0) || (data.congeDays ?? 0) > 0 || (data.sickDays ?? 0) > 0 || (data.absentDays ?? 0) > 0 ? (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                          <CalendarOff className="h-3 w-3" /> Congés & Absences :
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {(data.congeDays ?? 0) > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">Congé: {data.congeDays} j</span>}
                          {(data.sickDays ?? 0) > 0 && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700">Maladie: {data.sickDays} j</span>}
                          {(data.absentDays ?? 0) > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Absence: {data.absentDays} j</span>}
                          {(data.workingDays ?? 0) > 0 && <span className="text-gray-500">Jours ouvrables: {data.workingDays}</span>}
                        </div>
                        {data.leaves && data.leaves.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {data.leaves.map((l) => {
                              const sc = leaveStatusConfig[l.status] ?? leaveStatusConfig.pending;
                              return (
                                <div key={l.id} className="flex items-center gap-2 text-xs text-gray-600">
                                  <span className={`rounded-full px-2 py-0.5 font-medium ${sc.className}`}>{sc.label}</span>
                                  <span>{leaveTypeLabels[l.leave_type] ?? l.leave_type}</span>
                                  <span className="text-gray-400">{l.start_date} → {l.end_date}</span>
                                  <span className="font-medium">{l.days_count} j</span>
                                  {l.reason && <span className="text-gray-400 italic">({l.reason})</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {data.rubriques.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1 flex items-center justify-between">
                          <span>Rubriques (modifier avant le calcul) :</span>
                          {hasEdits && <button onClick={(e) => { e.stopPropagation(); const reset: Record<string, number> = {}; for (const r of data.rubriques) { const code = String(r.code ?? ""); reset[code] = Number(r.value ?? 0); } ctx.rubOverrides[emp.id] = reset; updateRubOverride(emp.id, "", 0); }} className="text-xs text-blue-600 hover:text-blue-700">Reset</button>}
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
                                <input type="number" step="0.01" value={current} onChange={(e) => updateRubOverride(emp.id, code, parseFloat(e.target.value) || 0)} onClick={(e) => e.stopPropagation()} className={`w-20 rounded border px-1.5 py-1 text-right font-medium ${changed ? "border-amber-400 bg-amber-50" : "border-gray-300"}`} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {data.rubriques.length === 0 && data.bonuses.length === 0 && <p className="text-xs text-gray-400">Aucune donnée modifiable.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !loadingPreCalc ? (
        <p className="text-sm text-gray-500 text-center py-8">Aucune donnée. Cliquez sur Actualiser.</p>
      ) : (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      )}
    </Modal>
  );
}
