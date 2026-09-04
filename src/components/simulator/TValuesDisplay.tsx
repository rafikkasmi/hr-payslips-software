import { Fragment } from "react";

const tLabels: Record<string, string> = {
  "1": "Cotisable (mensuel)",
  "3": "Total gains",
  "4": "Total retenues",
  "7": "Salaire base (R001)",
  "9": "Jours/mois",
  "10": "Heures/mois",
  "15": "Ratio travail normal",
  "16": "Ratio heures supp",
  "17": "Ratio nuit/weekend",
  "40": "Flag exonération IRG",
  "41": "Imposable régul",
  "43": "Imposable mensuel",
  "47": "Mutuelle multiplier",
  "51": "Imposable 10%",
  "52": "Salaire brut",
  "53": "Cotisable 10%",
  "57": "Cotisable régul",
  "58": "Cotisable pour IRG",
  "76": "Prorata cotisable",
  "77": "CACOBATH coefficient",
  "78": "Heures/jour",
};

const tCategories: { title: string; keys: string[]; color: string }[] = [
  { title: "Bases de calcul", keys: ["1", "43", "52", "58"], color: "blue" },
  { title: "Totaux", keys: ["3", "4", "7"], color: "green" },
  { title: "Temps de travail", keys: ["9", "10", "15", "16", "17", "78"], color: "amber" },
  { title: "Cotisations & IRG", keys: ["40", "41", "47", "51", "53", "57", "76", "77"], color: "purple" },
];

export function TValuesDisplay({ tValues }: { tValues: Record<string, number> }) {
  const headerColorMap: Record<string, string> = {
    blue: "bg-blue-100/60 text-blue-800 border-blue-200",
    green: "bg-green-100/60 text-green-800 border-green-200",
    amber: "bg-amber-100/60 text-amber-800 border-amber-200",
    purple: "bg-purple-100/60 text-purple-800 border-purple-200",
  };
  // Collect all keys present in tValues
  const allKeys = Object.keys(tValues).sort((a, b) => Number(a) - Number(b));
  const categorizedKeys = new Set(tCategories.flatMap(c => c.keys));
  const uncategorized = allKeys.filter(k => !categorizedKeys.has(k));

  return (
    <div className="mt-1 rounded-lg border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-[10px]">
        <tbody>
          {tCategories.map(cat => {
            const present = cat.keys.filter(k => k in tValues);
            if (present.length === 0) return null;
            return (
              <Fragment key={cat.title}>
                <tr className={`border-y ${headerColorMap[cat.color]}`}>
                  <td colSpan={3} className="px-2 py-1 font-bold">
                    {cat.title}
                  </td>
                </tr>
                {present.map(key => (
                  <tr key={key} className="border-b border-gray-50">
                    <td className="px-2 py-0.5 font-mono text-gray-400 w-12">T[{key}]</td>
                    <td className="px-2 py-0.5 text-gray-600">{tLabels[key] || "—"}</td>
                    <td className="px-2 py-0.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {Number.isInteger(tValues[key]) ? tValues[key] : tValues[key].toFixed(4)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
          {uncategorized.length > 0 && (
            <Fragment>
              <tr className="border-y bg-gray-100 text-gray-600">
                <td colSpan={3} className="px-2 py-1 font-bold">Autres</td>
              </tr>
              {uncategorized.map(key => (
                <tr key={key} className="border-b border-gray-50">
                  <td className="px-2 py-0.5 font-mono text-gray-400 w-12">T[{key}]</td>
                  <td className="px-2 py-0.5 text-gray-600">{tLabels[key] || "—"}</td>
                  <td className="px-2 py-0.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                    {Number.isInteger(tValues[key]) ? tValues[key] : tValues[key].toFixed(4)}
                  </td>
                </tr>
              ))}
            </Fragment>
          )}
        </tbody>
      </table>
    </div>
  );
}
