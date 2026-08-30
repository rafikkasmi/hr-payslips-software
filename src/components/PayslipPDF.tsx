import { useState, useEffect } from "react";
import type { CalcResult, HistoricalPayslip } from "../lib/api";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/utils";

interface PayslipPDFProps {
  result: CalcResult;
  companyName?: string;
  onClose: () => void;
}

export function PayslipPDF({ result, companyName = "HAMTECH", onClose }: PayslipPDFProps) {
  const [activeTab, setActiveTab] = useState<"bulletin" | "details" | "pcpaie">("bulletin");
  const [historical, setHistorical] = useState<HistoricalPayslip | null | undefined>(undefined);
  const handlePrint = () => { window.print(); };

  useEffect(() => {
    if (activeTab === "pcpaie" && historical === undefined) {
      api.getHistoricalPayslip(result.employee_id, result.period)
        .then(data => setHistorical(data))
        .catch(() => setHistorical(null));
    }
  }, [activeTab, result.employee_id, result.period, historical]);

  // Reset historical data when employee or period changes
  useEffect(() => {
    setHistorical(undefined);
  }, [result.employee_id, result.period]);

  const periodFormatted = result.period
    ? (() => {
        const parts = result.period.split('-');
        let year: number, month: number;
        if (parts[0].length === 4) {
          year = parseInt(parts[0]); month = parseInt(parts[1]);
        } else {
          month = parseInt(parts[0]); year = parseInt(parts[1]);
        }
        return new Date(year, month - 1).toLocaleDateString("fr-FR", { year: "numeric", month: "long" });
      })()
    : result.period;

  // Only non-zero lines, split into gains vs retenues
  const activeLines = result.lines.filter(l => l.amount !== 0);
  const gains = activeLines.filter(l => l.classe === 1 && l.amount > 0);
  const retenues = activeLines.filter(l => l.classe === 2 || (l.classe === 1 && l.amount < 0));
  // Key info lines only (brut, cotisable, imposable, net — skip rates/coefficients)
  const keyInfoCodes = ["763", "765", "767", "770", "807", "817", "819", "824"];
  const keyInfos = activeLines.filter(l => keyInfoCodes.includes(l.code));

  // Only show applied bonuses WITHOUT a rubrique_code — those with one are already in the calc lines
  const bonusGains = (result.applied_bonuses ?? []).filter(b => b.computed_amount > 0 && !b.rubrique_code);
  const bonusRetenues = (result.applied_bonuses ?? []).filter(b => b.computed_amount < 0 && !b.rubrique_code);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:bg-white print:p-0 print:block">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:rounded-none print:max-w-none">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-3 border-b print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-gray-900">Aperçu Bulletin de Paie</h2>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => setActiveTab("bulletin")} className={`px-3 py-1 text-xs font-medium ${activeTab === "bulletin" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Bulletin</button>
              <button onClick={() => setActiveTab("details")} className={`px-3 py-1 text-xs font-medium ${activeTab === "details" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Détails</button>
              <button onClick={() => setActiveTab("pcpaie")} className={`px-3 py-1 text-xs font-medium ${activeTab === "pcpaie" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>PCPAIE</button>
            </div>
          </div>
          <div className="flex gap-2">
            {activeTab === "bulletin" && <button onClick={handlePrint} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Imprimer / PDF</button>}
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Fermer</button>
          </div>
        </div>

        {/* Printable payslip */}
        {activeTab === "bulletin" && (
        <div className="p-5 print:p-4" id="payslip-print-area">
          {/* Compact header */}
          <div className="flex justify-between items-center mb-3 pb-2 border-b-2 border-gray-800">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{companyName}</h1>
              <p className="text-xs text-gray-500">Bulletin de Paie</p>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold text-gray-900">{periodFormatted}</p>
              <p className="text-xs text-gray-500">{result.period}</p>
            </div>
          </div>

          {/* Employee + key figures in one row */}
          <div className="flex items-center justify-between mb-3 rounded bg-gray-50 px-3 py-2">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-gray-500">Employé: </span>
                <span className="text-sm font-semibold text-gray-900">{result.employee_name}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Matricule: </span>
                <span className="text-sm font-semibold font-mono text-gray-900">{result.matricule}</span>
              </div>
            </div>
          </div>

          {/* Two-column gains/retenues */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Gains column */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 mb-1 pb-0.5 border-b border-gray-300 bg-green-50/50 px-2 py-1 rounded-t">Gains & Primes</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 text-[10px]">
                    <th className="py-0.5 text-left font-normal w-8">Code</th>
                    <th className="py-0.5 text-left font-normal">Libellé</th>
                    <th className="py-0.5 text-right font-normal w-16">Base</th>
                    <th className="py-0.5 text-right font-normal w-14">Taux</th>
                    <th className="py-0.5 text-right font-normal w-20">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {gains.map((line) => (
                    <tr key={line.code} className="border-b border-gray-100">
                      <td className="py-0.5 font-mono text-gray-400 w-8">{line.code}</td>
                      <td className="py-0.5 text-gray-700">{line.libelle}</td>
                      <td className="py-0.5 text-right text-gray-500 w-16">{line.base_value != null && line.base_value !== 0 ? formatCurrency(line.base_value) : "—"}</td>
                      <td className="py-0.5 text-right text-gray-500 w-14">{line.taux_value != null && line.taux_value !== 0 ? (line.taux_value < 1 ? line.taux_value.toFixed(2) : line.taux_value.toFixed(0)) : "—"}</td>
                      <td className="py-0.5 text-right font-medium text-gray-900 w-20">{formatCurrency(line.amount)}</td>
                    </tr>
                  ))}
                  {bonusGains.map((b) => (
                    <tr key={`bg-${b.id}`} className="border-b border-gray-100 bg-green-50/30">
                      <td className="py-0.5 font-mono text-gray-400 w-8">{b.rubrique_code ?? "—"}</td>
                      <td className="py-0.5 text-gray-700 italic">{b.title}</td>
                      <td className="py-0.5 text-right text-gray-300 w-16">—</td>
                      <td className="py-0.5 text-right text-gray-300 w-14">—</td>
                      <td className="py-0.5 text-right font-medium text-green-700 w-20">{formatCurrency(b.computed_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Retenues column */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 mb-1 pb-0.5 border-b border-gray-300 bg-red-50/50 px-2 py-1 rounded-t">Retenues</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 text-[10px]">
                    <th className="py-0.5 text-left font-normal w-8">Code</th>
                    <th className="py-0.5 text-left font-normal">Libellé</th>
                    <th className="py-0.5 text-right font-normal w-16">Base</th>
                    <th className="py-0.5 text-right font-normal w-14">Taux</th>
                    <th className="py-0.5 text-right font-normal w-20">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {retenues.map((line) => (
                    <tr key={line.code} className="border-b border-gray-100">
                      <td className="py-0.5 font-mono text-gray-400 w-8">{line.code}</td>
                      <td className="py-0.5 text-gray-700">{line.libelle}</td>
                      <td className="py-0.5 text-right text-gray-500 w-16">{line.base_value != null && line.base_value !== 0 ? formatCurrency(line.base_value) : "—"}</td>
                      <td className="py-0.5 text-right text-gray-500 w-14">{line.taux_value != null && line.taux_value !== 0 ? (line.taux_value < 1 ? line.taux_value.toFixed(2) : line.taux_value.toFixed(0)) : "—"}</td>
                      <td className="py-0.5 text-right font-medium text-red-600 w-20">{formatCurrency(Math.abs(line.amount))}</td>
                    </tr>
                  ))}
                  {bonusRetenues.map((b) => (
                    <tr key={`br-${b.id}`} className="border-b border-gray-100 bg-red-50/30">
                      <td className="py-0.5 font-mono text-gray-400 w-8">{b.rubrique_code ?? "—"}</td>
                      <td className="py-0.5 text-gray-700 italic">{b.title}</td>
                      <td className="py-0.5 text-right text-gray-300 w-16">—</td>
                      <td className="py-0.5 text-right text-gray-300 w-14">—</td>
                      <td className="py-0.5 text-right font-medium text-red-600 w-20">{formatCurrency(Math.abs(b.computed_amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Compact totals bar */}
          <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
            <div className="rounded border border-gray-200 px-2 py-1.5 text-center">
              <p className="text-gray-500">Brut</p>
              <p className="font-bold text-gray-900">{formatCurrency(result.total_brut)}</p>
            </div>
            <div className="rounded border border-gray-200 px-2 py-1.5 text-center">
              <p className="text-gray-500">Cotisable</p>
              <p className="font-bold text-gray-900">{formatCurrency(result.base_cotisable)}</p>
            </div>
            <div className="rounded border border-gray-200 px-2 py-1.5 text-center">
              <p className="text-gray-500">Imposable</p>
              <p className="font-bold text-gray-900">{formatCurrency(result.base_imposable)}</p>
            </div>
            <div className="rounded border border-gray-200 px-2 py-1.5 text-center">
              <p className="text-gray-500">Retenues</p>
              <p className="font-bold text-red-600">{formatCurrency(result.total_retenues)}</p>
            </div>
          </div>

          {/* Key info lines (CNAS etc.) - compact single row */}
          {keyInfos.length > 0 && (
            <div className="mb-3 rounded bg-gray-50 px-2 py-1.5">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {keyInfos.map((line) => (
                  <span key={line.code} className="text-gray-600">
                    <span className="font-medium">{line.libelle}:</span>{" "}
                    <span className="font-semibold text-gray-900">{formatCurrency(line.amount)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Net à payer - prominent single bar */}
          <div className="flex items-center justify-between rounded-lg border-2 border-green-600 bg-green-50 px-4 py-2 mb-2">
            <span className="text-sm font-bold text-gray-900">NET À PAYER</span>
            <span className="text-xl font-bold text-green-700">{formatCurrency(result.net_payer)}</span>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-gray-400 pt-1">
            Bulletin généré le {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} · {companyName}
          </div>
        </div>
        )}

        {/* Details tab: formula breakdown + debug log */}
        {activeTab === "details" && (
          <div className="p-5 space-y-4">
            {/* Formula breakdown */}
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">Détail des formules</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-600">Code</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-600">Libellé</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-600">Montant</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-600">Formule</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-600">Évaluée</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.lines.filter(l => l.formula || l.is_input || l.amount !== 0).map((line) => (
                      <tr key={line.code} className={line.is_input ? "bg-blue-50/30" : ""}>
                        <td className="px-2 py-1 font-mono text-gray-500">{line.code}</td>
                        <td className="px-2 py-1 text-gray-700">{line.libelle}</td>
                        <td className="px-2 py-1 text-right font-medium text-gray-900">{formatCurrency(line.amount)}</td>
                        <td className="px-2 py-1 font-mono text-gray-500 text-[10px]">{line.formula ?? (line.is_input ? "(saisie)" : "—")}</td>
                        <td className="px-2 py-1 font-mono text-gray-600 text-[10px]">{line.evaluated_formula ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Applied bonuses detail */}
            {(result.applied_bonuses ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Primes appliquées</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Prime</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Rubrique</th>
                        <th className="px-2 py-1.5 text-right font-medium text-gray-600">Montant base</th>
                        <th className="px-2 py-1.5 text-right font-medium text-gray-600">Montant calculé</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(result.applied_bonuses ?? []).map((b) => (
                        <tr key={b.id}>
                          <td className="px-2 py-1 text-gray-700">{b.title}</td>
                          <td className="px-2 py-1 font-mono text-gray-500">{b.rubrique_code ?? "—"}</td>
                          <td className="px-2 py-1 text-right text-gray-600">{b.is_percentage ? `${b.amount}%` : formatCurrency(b.amount)}</td>
                          <td className="px-2 py-1 text-right font-medium text-gray-900">{formatCurrency(b.computed_amount)}</td>
                          <td className="px-2 py-1">
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${b.bonus_type === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{b.bonus_type === "bonus" ? "Prime" : "Retenue"}</span>
                            {b.is_percentage && <span className="ml-1 text-[10px] text-gray-500">%</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Debug log */}
            {(result.debug_log ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Journal de calcul</h3>
                <div className="max-h-60 overflow-y-auto rounded border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Étape</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Code</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Description</th>
                        <th className="px-2 py-1.5 text-right font-medium text-gray-600">Valeur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(result.debug_log ?? []).map((entry, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-2 py-1 text-gray-500">{entry.step}</td>
                          <td className="px-2 py-1 font-mono text-gray-500">{entry.code}</td>
                          <td className="px-2 py-1 text-gray-700">{entry.description}</td>
                          <td className="px-2 py-1 text-right font-medium text-gray-900">{formatCurrency(entry.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PCPAIE comparison tab */}
        {activeTab === "pcpaie" && (
          <div className="p-5 space-y-4">
            {historical === undefined ? (
              <div className="flex items-center justify-center py-8 text-sm text-gray-400">Chargement...</div>
            ) : historical === null ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">Aucune donnée PCPAIE trouvée pour cette période.</p>
                <p className="text-xs text-gray-400 mt-1">Période: {result.period}</p>
              </div>
            ) : (
              <>
                {/* Totals comparison */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Comparaison des totaux</h3>
                  <table className="w-full text-xs">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium text-gray-600">Rubrique</th>
                        <th className="px-3 py-1.5 text-right font-medium text-gray-600">Calculé</th>
                        <th className="px-3 py-1.5 text-right font-medium text-gray-600">PCPAIE</th>
                        <th className="px-3 py-1.5 text-right font-medium text-gray-600">Écart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        { label: "Brut (R763)", calc: result.total_brut, pcp: historical.total_brut },
                        { label: "Net à payer (R770)", calc: result.net_payer, pcp: historical.net_payer },
                        { label: "IRG (R660)", calc: result.irg, pcp: historical.irg },
                        { label: "Retenues (R767)", calc: result.total_retenues, pcp: historical.total_retenues },
                        { label: "Cotisable (R807)", calc: result.base_cotisable, pcp: historical.base_cotisable },
                        { label: "Imposable (R652)", calc: result.base_imposable, pcp: historical.base_imposable },
                      ].map(row => {
                        const diff = row.calc - row.pcp;
                        const hasDiff = Math.abs(diff) > 0.01;
                        return (
                          <tr key={row.label} className={hasDiff ? "bg-amber-50" : ""}>
                            <td className="px-3 py-1.5 text-gray-700 font-medium">{row.label}</td>
                            <td className="px-3 py-1.5 text-right text-gray-900">{formatCurrency(row.calc)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-900">{formatCurrency(row.pcp)}</td>
                            <td className={`px-3 py-1.5 text-right font-medium ${hasDiff ? (diff > 0 ? "text-green-600" : "text-red-600") : "text-gray-400"}`}>
                              {hasDiff ? `${diff > 0 ? "+" : ""}${formatCurrency(diff)}` : "✓"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Per-rubrique comparison */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Comparaison par rubrique</h3>
                  <div className="max-h-80 overflow-y-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Code</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Libellé</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600">Calculé</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600">PCPAIE</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600">Écart</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(() => {
                          const pcpMap = new Map(historical.lines.map(l => [l.code, l.amount]));
                          const calcMap = new Map(result.lines.filter(l => l.amount !== 0).map(l => [l.code, l]));
                          const allCodes = new Set([...pcpMap.keys(), ...calcMap.keys()]);
                          return Array.from(allCodes).sort().map(code => {
                            const calcLine = calcMap.get(code);
                            const calcAmt = calcLine?.amount ?? 0;
                            const pcpAmt = pcpMap.get(code) ?? 0;
                            const diff = calcAmt - pcpAmt;
                            const hasDiff = Math.abs(diff) > 0.01;
                            if (!hasDiff && calcAmt === 0 && pcpAmt === 0) return null;
                            return (
                              <tr key={code} className={hasDiff ? "bg-amber-50" : ""}>
                                <td className="px-2 py-1 font-mono text-gray-500">{code}</td>
                                <td className="px-2 py-1 text-gray-700">{calcLine?.libelle ?? "—"}</td>
                                <td className="px-2 py-1 text-right text-gray-900">{calcAmt !== 0 ? formatCurrency(calcAmt) : "—"}</td>
                                <td className="px-2 py-1 text-right text-gray-900">{pcpAmt !== 0 ? formatCurrency(pcpAmt) : "—"}</td>
                                <td className={`px-2 py-1 text-right font-medium ${hasDiff ? (diff > 0 ? "text-green-600" : "text-red-600") : "text-gray-400"}`}>
                                  {hasDiff ? `${diff > 0 ? "+" : ""}${formatCurrency(diff)}` : "✓"}
                                </td>
                              </tr>
                            );
                          }).filter(Boolean);
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
