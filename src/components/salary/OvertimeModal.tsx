import { useSalaryContext } from "./SalaryContext";
import { Modal } from "../ui/Modal";
import { Clock, Calculator, Loader2, Search } from "lucide-react";

export function OvertimeModal() {
  const ctx = useSalaryContext();
  const {
    showOvertimeModal, setShowOvertimeModal, selectedPeriod,
    overtimeEmpSearch, setOvertimeEmpSearch,
    loadingOvertime, computingOvertime,
    employees, overtimeEntries, setOvertimeEntries,
    overtimePreview, showOvertimePreview, toggleOvertimePreview,
    handleComputeOvertimeFromAttendance, handleComputeAllOvertime,
    handleSaveOvertime,
  } = ctx;

  return (
    <Modal
      open={showOvertimeModal}
      onClose={() => setShowOvertimeModal(false)}
      title="Heures supplémentaires"
      subtitle={selectedPeriod}
      icon={<Clock className="h-5 w-5" />}
      size="lg"
      footer={
        <button
          onClick={handleComputeAllOvertime}
          disabled={computingOvertime}
          className="flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {computingOvertime ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          Calculer depuis pointeuse
        </button>
      }
    >
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-gray-400" />
        <input value={overtimeEmpSearch} onChange={e => setOvertimeEmpSearch(e.target.value)} placeholder="Rechercher employé..." className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
      </div>
      <div className="max-h-96 overflow-y-auto space-y-1">
        {loadingOvertime ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>
        ) : employees.filter(e => {
          if (!e.actif) return false;
          if (overtimeEmpSearch) { const q = overtimeEmpSearch.toLowerCase(); if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false; }
          return true;
        }).map(emp => {
          const ot = overtimeEntries[emp.id];
          const preview = overtimePreview[emp.id];
          const showPreview = showOvertimePreview.has(emp.id);
          return (
            <div key={emp.id} className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-gray-500 w-16">{emp.matricule}</span>
                <span className="flex-1">{emp.nom} {emp.prenom}</span>
                <label className="flex items-center gap-1 text-gray-600">HS 50%:<input type="number" step="0.5" value={ot?.hours_50 ?? 0} onChange={e => { const v = parseFloat(e.target.value) || 0; setOvertimeEntries(prev => ({ ...prev, [emp.id]: { hours_50: v, hours_100: ot?.hours_100 ?? 0, status: ot?.status ?? "pending" } })); }} className="w-16 rounded border border-gray-300 px-1.5 py-1 text-right" /></label>
                <label className="flex items-center gap-1 text-gray-600">HS 100%:<input type="number" step="0.5" value={ot?.hours_100 ?? 0} onChange={e => { const v = parseFloat(e.target.value) || 0; setOvertimeEntries(prev => ({ ...prev, [emp.id]: { hours_50: ot?.hours_50 ?? 0, hours_100: v, status: ot?.status ?? "pending" } })); }} className="w-16 rounded border border-gray-300 px-1.5 py-1 text-right" /></label>
                <button onClick={() => handleComputeOvertimeFromAttendance(emp.id)} disabled={computingOvertime} className="rounded bg-gray-100 px-2 py-1 text-gray-600 font-medium hover:bg-gray-200 disabled:opacity-50" title="Calculer depuis pointeuse">{computingOvertime ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pointeuse"}</button>
                {(ot?.hours_50 || ot?.hours_100) && <button onClick={() => handleSaveOvertime(emp.id)} className="rounded bg-blue-600 px-2 py-1 text-white font-medium hover:bg-blue-700">OK</button>}
              </div>
              {preview && (
                <div className="mt-1">
                  <button onClick={() => toggleOvertimePreview(emp.id)} className="text-blue-600 hover:text-blue-700 text-xs">{showPreview ? "Masquer" : "Voir"} détails ({preview.daily_details.length} jours)</button>
                  {showPreview && (
                    <div className="mt-1 max-h-32 overflow-y-auto rounded bg-gray-50 p-2">
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-500"><th className="text-left py-0.5">Date</th><th className="text-left py-0.5">Jour</th><th className="text-right py-0.5">Heures</th><th className="text-right py-0.5">HS 50%</th><th className="text-right py-0.5">HS 100%</th></tr></thead>
                        <tbody>{preview.daily_details.map((d, i) => (<tr key={i} className="border-t border-gray-100"><td className="py-0.5 font-mono">{String(d.day)}</td><td className="py-0.5 text-gray-500">{String(d.weekday)}</td><td className="py-0.5 text-right">{Number(d.worked_hours).toFixed(2)}h</td><td className="py-0.5 text-right">{Number(d.overtime_50).toFixed(2)}h</td><td className="py-0.5 text-right">{Number(d.overtime_100).toFixed(2)}h</td></tr>))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
