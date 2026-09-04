import { formatCurrency } from "../../lib/utils";
import type { CalcLine } from "./types";

export function CalcChainDisplay({ lines }: { lines: CalcLine[] }) {
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
