import type { CalcResult } from "../lib/api";
import { formatCurrency } from "../lib/utils";

interface PayslipPDFProps {
  result: CalcResult;
  companyName?: string;
  onClose: () => void;
}

export function PayslipPDF({ result, companyName = "HAMTECH", onClose }: PayslipPDFProps) {
  const handlePrint = () => { window.print(); };

  const periodFormatted = result.period
    ? new Date(parseInt(result.period.slice(0, 4)), parseInt(result.period.slice(5, 7)) - 1)
        .toLocaleDateString("fr-FR", { year: "numeric", month: "long" })
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
          <h2 className="text-base font-bold text-gray-900">Aperçu Bulletin de Paie</h2>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Imprimer / PDF</button>
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Fermer</button>
          </div>
        </div>

        {/* Printable payslip */}
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
                <tbody>
                  {gains.map((line) => (
                    <tr key={line.code} className="border-b border-gray-100">
                      <td className="py-0.5 font-mono text-gray-400 w-10">{line.code}</td>
                      <td className="py-0.5 text-gray-700">{line.libelle}</td>
                      <td className="py-0.5 text-right font-medium text-gray-900 w-24">{formatCurrency(line.amount)}</td>
                    </tr>
                  ))}
                  {bonusGains.map((b) => (
                    <tr key={`bg-${b.id}`} className="border-b border-gray-100 bg-green-50/30">
                      <td className="py-0.5 font-mono text-gray-400 w-10">{b.rubrique_code ?? "—"}</td>
                      <td className="py-0.5 text-gray-700 italic">{b.title}</td>
                      <td className="py-0.5 text-right font-medium text-green-700 w-24">{formatCurrency(b.computed_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Retenues column */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 mb-1 pb-0.5 border-b border-gray-300 bg-red-50/50 px-2 py-1 rounded-t">Retenues</h3>
              <table className="w-full text-xs">
                <tbody>
                  {retenues.map((line) => (
                    <tr key={line.code} className="border-b border-gray-100">
                      <td className="py-0.5 font-mono text-gray-400 w-10">{line.code}</td>
                      <td className="py-0.5 text-gray-700">{line.libelle}</td>
                      <td className="py-0.5 text-right font-medium text-red-600 w-24">{formatCurrency(Math.abs(line.amount))}</td>
                    </tr>
                  ))}
                  {bonusRetenues.map((b) => (
                    <tr key={`br-${b.id}`} className="border-b border-gray-100 bg-red-50/30">
                      <td className="py-0.5 font-mono text-gray-400 w-10">{b.rubrique_code ?? "—"}</td>
                      <td className="py-0.5 text-gray-700 italic">{b.title}</td>
                      <td className="py-0.5 text-right font-medium text-red-600 w-24">{formatCurrency(Math.abs(b.computed_amount))}</td>
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
      </div>
    </div>
  );
}
