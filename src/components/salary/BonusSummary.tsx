import { useSalaryContext } from "./SalaryContext";
import { formatCurrency } from "../../lib/utils";
import { Gift, Pause, Pencil } from "lucide-react";

export function BonusSummary() {
  const ctx = useSalaryContext();
  const { selectedPeriod, periodBonuses, skippedBonusIds, startEditBonus, setShowBonusModal } = ctx;

  if (!selectedPeriod || periodBonuses.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Gift className="h-4 w-4 text-gray-500" />
          Primes & Retenues — {selectedPeriod}
        </h2>
        <button
          onClick={() => setShowBonusModal(true)}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          Gérer →
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {periodBonuses.map(b => {
          const isPaused = skippedBonusIds.has(b.id);
          return (
            <div key={b.id} className={`rounded-lg border px-3 py-1.5 text-xs ${isPaused ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-100"}`}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 font-medium ${b.bonus_type === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {b.bonus_type === "bonus" ? "+" : "−"}
                </span>
                <span className={`font-medium ${isPaused ? "text-gray-400 line-through" : "text-gray-900"}`}>{b.title}</span>
                <span className="text-gray-500">{b.is_percentage ? `${b.amount}%` : formatCurrency(b.amount)}</span>
                {b.rubrique_code && <span className="font-mono text-gray-400">R{b.rubrique_code}</span>}
                {isPaused && <Pause className="h-3 w-3 text-gray-400" />}
                <button onClick={() => startEditBonus(b)} className="text-blue-500 hover:text-blue-700 ml-1">
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
