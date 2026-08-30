import { useState } from "react";
import { useSalaryContext } from "./SalaryContext";
import { Users, ChevronDown, ChevronRight } from "lucide-react";

export function EmployeeSelector() {
  const ctx = useSalaryContext();
  const {
    selectedPeriod, employees, calcSelectedIds,
    toggleCalcSelect, selectAllCalc, clearCalcSelect,
  } = ctx;

  const [expanded, setExpanded] = useState(false);

  if (!selectedPeriod) return null;

  const activeCount = employees.filter(e => e.actif).length;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          <Users className="h-4 w-4 text-gray-500" />
          Calculer pour: {calcSelectedIds.size > 0 ? `${calcSelectedIds.size} employé(s) sélectionné(s)` : `Tous les employés actifs (${activeCount})`}
        </h2>
        <span className="text-xs text-gray-400">{expanded ? "Masquer" : "Afficher"}</span>
      </button>

      {expanded && (
        <>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-gray-400">Aucune sélection = calculer pour tous les employés actifs</span>
            <div className="flex items-center gap-2">
              <button onClick={selectAllCalc} className="text-blue-600 hover:text-blue-700 font-medium">Tout sélectionner</button>
              <span className="text-gray-300">|</span>
              <button onClick={clearCalcSelect} className="text-gray-500 hover:text-gray-700 font-medium">Effacer</button>
            </div>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 p-2">
              {employees.filter(e => e.actif).map(emp => {
                const checked = calcSelectedIds.has(emp.id);
                return (
                  <label key={emp.id} className={`flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer ${checked ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleCalcSelect(emp.id)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    <span className="font-mono text-gray-500">{emp.matricule}</span>
                    <span className="truncate">{emp.nom} {emp.prenom}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
