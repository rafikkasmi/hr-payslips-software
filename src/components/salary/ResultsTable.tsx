import { Fragment, useState } from "react";
import { useSalaryContext } from "./SalaryContext";
import { SummaryCards } from "./SummaryCards";
import { PrintDialog } from "./PrintDialog";
import { exportToCSV, exportToExcel } from "./export";
import { formatCurrency } from "../../lib/utils";
import type { CalcResult, SalaryHistoryEntry } from "../../lib/api";
import { api } from "../../lib/api";
import { Calculator, ChevronDown, ChevronRight, DollarSign, History, Loader2, FileText, Search, Download, Printer, X } from "lucide-react";

export function ResultsTable() {
  const ctx = useSalaryContext();
  const {
    selectedPeriod, displayHistory, filteredHistory, loading, calculating,
    expandedRows, toggleRow, calcResults, historicalPayslips,
    setPayslipPreview, appCount, pcpaieCount,
    resultsSearch, setResultsSearch, resultsFilterSource, setResultsFilterSource,
    resultsSortBy, setResultsSortBy,
    resultsSelectedRows, toggleResultRowSelection, selectAllResultRows, clearResultRowSelection,
  } = ctx;

  const [showPrintDialog, setShowPrintDialog] = useState(false);

  if (!selectedPeriod) return null;

  const selectedKeys = resultsSelectedRows;
  const selectedHistory = filteredHistory.filter(h => selectedKeys.has(`${h.source}-${h.id}`));

  const handleBatchPrint = () => {
    const toPrint = selectedHistory.length > 0 ? selectedHistory : filteredHistory;
    if (toPrint.length === 0) return;
    setShowPrintDialog(true);
  };

  const handleExportCSV = () => {
    const data = selectedHistory.length > 0 ? selectedHistory : filteredHistory;
    exportToCSV(data, selectedPeriod);
  };

  const handleExportExcel = () => {
    const data = selectedHistory.length > 0 ? selectedHistory : filteredHistory;
    exportToExcel(data, selectedPeriod);
  };

  return (
    <div className="mt-6 space-y-6">
      <SummaryCards history={displayHistory} appCount={appCount} pcpaieCount={pcpaieCount} />

      {displayHistory.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-600" />
                {selectedPeriod} — {filteredHistory.length} enregistrements
                {filteredHistory.length !== displayHistory.length && (
                  <span className="text-xs text-gray-400 font-normal">(sur {displayHistory.length})</span>
                )}
              </h2>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {appCount > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> App ({appCount})</span>}
                {pcpaieCount > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" /> Historique ({pcpaieCount})</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-48">
                <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <input
                  value={resultsSearch}
                  onChange={e => setResultsSearch(e.target.value)}
                  placeholder="Rechercher par nom ou matricule..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                />
                {resultsSearch && (
                  <button onClick={() => setResultsSearch("")} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <select value={resultsFilterSource} onChange={e => setResultsFilterSource(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
                <option value="">Toutes sources</option>
                <option value="app">App uniquement</option>
                <option value="pcpaie">Historique uniquement</option>
              </select>
              <select value={resultsSortBy} onChange={e => setResultsSortBy(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
                <option value="name">Trier par nom</option>
                <option value="brut_desc">Brut décroissant</option>
                <option value="brut_asc">Brut croissant</option>
                <option value="net_desc">Net décroissant</option>
                <option value="net_asc">Net croissant</option>
              </select>
              <div className="h-5 w-px bg-gray-200" />
              <button onClick={handleExportCSV} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              <button onClick={handleExportExcel} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <button
                onClick={handleBatchPrint}
                disabled={filteredHistory.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" />
                {selectedKeys.size > 0 ? `Imprimer (${selectedKeys.size})` : "Imprimer tout"}
              </button>
            </div>

            {selectedKeys.size > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-blue-600 font-medium">{selectedKeys.size} sélectionné(s)</span>
                <button onClick={selectAllResultRows} className="text-blue-600 hover:text-blue-700">Tout sélectionner</button>
                <span className="text-gray-300">|</span>
                <button onClick={clearResultRowSelection} className="text-gray-500 hover:text-gray-700">Effacer</button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selectedKeys.size === filteredHistory.length && filteredHistory.length > 0}
                      onChange={() => selectedKeys.size === filteredHistory.length ? clearResultRowSelection() : selectAllResultRows()}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600"></th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Matricule</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Employé</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Brut</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Cotisable</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Imposable</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">IRG</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Retenues</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Net</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHistory.map((h) => {
                  const key = `${h.source}-${h.id}`;
                  const expanded = expandedRows.has(key);
                  const result = calcResults[key];
                  const histPayslip = historicalPayslips[key];
                  const isLegacy = h.source === "pcpaie";
                  const isSelected = selectedKeys.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className={`hover:bg-gray-50 ${isLegacy ? "bg-gray-50/50" : ""} ${isSelected ? "bg-blue-50/40" : ""}`}>
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleResultRowSelection(key)} className="h-3.5 w-3.5 rounded border-gray-300" />
                        </td>
                        <td className="px-4 py-2 cursor-pointer" onClick={() => toggleRow(h)}>
                          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{h.matricule}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {h.nom} {h.prenom}
                          {isLegacy && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                              <History className="h-3 w-3" /> Hist.
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrency(h.total_brut ?? 0)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(h.base_cotisable ?? 0)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(h.base_imposable ?? 0)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(h.irg ?? 0)}</td>
                        <td className="px-4 py-2 text-right text-red-600">{formatCurrency(h.total_retenues ?? 0)}</td>
                        <td className="px-4 py-2 text-right font-bold text-green-700">{formatCurrency(h.net_payer ?? 0)}</td>
                        <td className="px-4 py-2 text-right">
                          <BulletinButton h={h} calcResults={calcResults} selectedPeriod={selectedPeriod} setPayslipPreview={setPayslipPreview} />
                        </td>
                      </tr>
                      {expanded && result && (
                        <tr className="bg-gray-50">
                          <td colSpan={11} className="px-8 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 mb-2">GAINS</h4>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {result.lines.filter(l => l.amount > 0).map((line) => (
                                    <div key={line.code} className="flex justify-between text-xs">
                                      <span className="font-mono text-gray-500 w-10">{line.code}</span>
                                      <span className="text-gray-700 flex-1 ml-2">{line.libelle}</span>
                                      <span className="font-medium text-gray-900">{formatCurrency(line.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 mb-2">RETENUES</h4>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {result.lines.filter(l => l.amount < 0).map((line) => (
                                    <div key={line.code} className="flex justify-between text-xs">
                                      <span className="font-mono text-gray-500 w-10">{line.code}</span>
                                      <span className="text-gray-700 flex-1 ml-2">{line.libelle}</span>
                                      <span className="font-medium text-red-600">{formatCurrency(line.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {result.applied_bonuses && result.applied_bonuses.length > 0 && (
                              <div className="mt-3 border-t border-gray-200 pt-2">
                                <h4 className="text-xs font-semibold text-gray-500 mb-2">PRIMES & DEDUCTIONS APPLIQUÉES</h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {result.applied_bonuses.map((b) => (
                                    <span key={b.id} className={`rounded-full px-2.5 py-1 text-xs ${b.computed_amount < 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                      {b.title}: {formatCurrency(b.computed_amount)}
                                    </span>
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
                                Bulletin de Paie
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {expanded && histPayslip && (
                        <tr className="bg-gray-50">
                          <td colSpan={11} className="px-8 py-4">
                            <h4 className="text-xs font-semibold text-gray-500 mb-2">DÉTAIL HISTORIQUE (LECTURE SEULE)</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-semibold text-gray-400 mb-1">GAINS</h4>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {histPayslip.lines.filter(l => l.amount > 0).map((line) => (
                                    <div key={line.code} className="flex justify-between text-xs">
                                      <span className="font-mono text-gray-500 w-10">{line.code}</span>
                                      <span className="text-gray-700 flex-1 ml-2">{line.code}</span>
                                      <span className="font-medium text-gray-900">{formatCurrency(line.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-gray-400 mb-1">RETENUES</h4>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {histPayslip.lines.filter(l => l.amount < 0).map((line) => (
                                    <div key={line.code} className="flex justify-between text-xs">
                                      <span className="font-mono text-gray-500 w-10">{line.code}</span>
                                      <span className="text-gray-700 flex-1 ml-2">{line.code}</span>
                                      <span className="font-medium text-red-600">{formatCurrency(line.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <button
                                onClick={() => setPayslipPreview({
                                  employee_id: h.employee_id ?? 0,
                                  matricule: h.matricule ?? "",
                                  employee_name: `${h.nom ?? ""} ${h.prenom ?? ""}`.trim(),
                                  period: h.period ?? "",
                                  lines: histPayslip.lines.map(l => ({
                                    code: l.code,
                                    libelle: l.code,
                                    classe: l.amount > 0 ? 1 : 2,
                                    amount: l.amount,
                                    is_input: false,
                                    formula: null,
                                    evaluated_formula: null,
                                  })),
                                  total_brut: histPayslip.total_brut,
                                  total_gains: histPayslip.total_brut,
                                  total_retenues: histPayslip.total_retenues,
                                  net_payer: histPayslip.net_payer,
                                  base_cotisable: histPayslip.base_cotisable,
                                  base_imposable: histPayslip.base_imposable,
                                  irg: histPayslip.irg,
                                  applied_bonuses: [],
                                  debug_log: [],
                                } as CalcResult)}
                                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Bulletin de Paie
                              </button>
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
                  <td colSpan={4} className="px-4 py-2 text-right">TOTAUX</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(filteredHistory.reduce((s, h) => s + (h.total_brut ?? 0), 0))}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(filteredHistory.reduce((s, h) => s + (h.base_cotisable ?? 0), 0))}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(filteredHistory.reduce((s, h) => s + (h.base_imposable ?? 0), 0))}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(filteredHistory.reduce((s, h) => s + (h.irg ?? 0), 0))}</td>
                  <td className="px-4 py-2 text-right text-red-600">{formatCurrency(filteredHistory.reduce((s, h) => s + (h.total_retenues ?? 0), 0))}</td>
                  <td className="px-4 py-2 text-right text-green-700">{formatCurrency(filteredHistory.reduce((s, h) => s + (h.net_payer ?? 0), 0))}</td>
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

      {!loading && displayHistory.length === 0 && !calculating && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">Aucune donnée pour {selectedPeriod}</p>
          <p className="mt-1 text-xs text-gray-400">Cliquez sur « Calculer tout » pour générer les salaires</p>
        </div>
      )}

      {showPrintDialog && (
        <PrintDialog
          items={(selectedHistory.length > 0 ? selectedHistory : filteredHistory).map(h => ({
            employee_id: h.employee_id ?? 0,
            matricule: h.matricule ?? "",
            nom: h.nom ?? "",
            prenom: h.prenom ?? "",
            period: h.period ?? selectedPeriod,
            source: h.source,
            id: h.id,
          }))}
          calcResults={calcResults}
          selectedPeriod={selectedPeriod}
          onClose={() => setShowPrintDialog(false)}
          setPayslipPreview={setPayslipPreview}
        />
      )}
    </div>
  );
}

function BulletinButton({ h, calcResults, selectedPeriod, setPayslipPreview }: {
  h: SalaryHistoryEntry;
  calcResults: Record<string, CalcResult>;
  selectedPeriod: string;
  setPayslipPreview: (r: CalcResult | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    const key = `${h.source}-${h.id}`;
    let r = calcResults[key];

    if (r) {
      setPayslipPreview(r);
      return;
    }

    if (!h.employee_id) {
      setError("Pas d'employee_id");
      return;
    }

    setLoading(true);
    try {
      if (h.source === "app") {
        r = await api.getSavedCalculation(h.employee_id, h.period ?? selectedPeriod);
        if (!r) {
          setError("Aucun calcul trouvé");
        } else {
          setPayslipPreview(r);
        }
      } else if (h.source === "pcpaie") {
        const hp = await api.getHistoricalPayslip(h.employee_id, h.period ?? selectedPeriod);
        setPayslipPreview({
          employee_id: h.employee_id,
          matricule: h.matricule ?? "",
          employee_name: `${h.nom ?? ""} ${h.prenom ?? ""}`.trim(),
          period: h.period ?? selectedPeriod,
          lines: hp.lines.map((l) => ({ code: l.code, libelle: l.code, classe: l.amount > 0 ? 1 : 2, amount: l.amount, is_input: false })),
          total_brut: hp.total_brut,
          total_gains: hp.total_brut,
          total_retenues: hp.total_retenues,
          net_payer: hp.net_payer,
          base_cotisable: hp.base_cotisable,
          base_imposable: hp.base_imposable,
          irg: hp.irg,
          applied_bonuses: [],
          debug_log: [],
        } as CalcResult);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
        Bulletin
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
