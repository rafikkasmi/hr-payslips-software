import { useSalaryContext } from "./SalaryContext";
import { Calendar, Play, Calculator, Loader2, History, Gift, Clock, Tag, Trash2 } from "lucide-react";

export function ActionBar() {
  const ctx = useSalaryContext();
  const {
    periods, selectedPeriod, setSelectedPeriod,
    handleStartNewMonth, handleCalculateAll, calculating,
    calcSelectedIds, showPreCalcModal, setShowPreCalcModal, loadPreCalcReview,
    setShowBonusModal, setShowOvertimeModal, setShowRubFlagsModal,
    periodBonuses, handleDeleteMonth, loading,
    message, calcProgress,
  } = ctx;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gray-400" />
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
          >
            {periods.length === 0 && <option value="">Aucune période</option>}
            {periods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <button
          onClick={handleStartNewMonth}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Play className="h-4 w-4" /> Nouveau mois
        </button>

        {selectedPeriod && (
          <>
            <div className="h-6 w-px bg-gray-200" />

            <button
              onClick={handleCalculateAll}
              disabled={calculating}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              {calcSelectedIds.size > 0 ? `Calculer (${calcSelectedIds.size})` : `Calculer tout`}
            </button>

            <button
              onClick={() => {
                if (!showPreCalcModal) loadPreCalcReview();
                setShowPreCalcModal(!showPreCalcModal);
              }}
              className="flex items-center gap-2 rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              <History className="h-4 w-4" /> Pré-calcul
            </button>

            <div className="h-6 w-px bg-gray-200" />

            <button
              onClick={() => setShowBonusModal(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Gift className="h-4 w-4" /> Primes & Retenues
              {periodBonuses.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 font-medium">{periodBonuses.length}</span>
              )}
            </button>

            <button
              onClick={() => setShowOvertimeModal(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Clock className="h-4 w-4" /> Heures supp.
            </button>

            <button
              onClick={() => setShowRubFlagsModal(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Tag className="h-4 w-4" /> Rubriques
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleDeleteMonth}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {message && (
        <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{message}</div>
      )}

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
  );
}
