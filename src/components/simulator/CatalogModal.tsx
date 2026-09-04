import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import type { RubriqueMeta } from "./types";

const classeLabels: Record<number, string> = {
  0: "Info/Totaux",
  1: "Gains",
  2: "Retenues",
  3: "Nombre",
  5: "Taux",
  7: "Compteur",
};

export function CatalogModal({
  rubriques,
  simCodes,
  onAdd,
  onClose,
}: {
  rubriques: RubriqueMeta[];
  simCodes: Set<string>;
  onAdd: (rub: RubriqueMeta) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterClasse, setFilterClasse] = useState<string>("");
  const [filterCalcul, setFilterCalcul] = useState<string>(""); // "" = all, "0" = manuelle, "1" = calculée
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rubriques.filter(r => {
      if (filterClasse && String(r.classe) !== filterClasse) return false;
      if (filterCalcul && String(r.calcul) !== filterCalcul) return false;
      if (!s) return true;
      return r.code.includes(s) || r.libelle.toLowerCase().includes(s);
    });
  }, [rubriques, search, filterClasse, filterCalcul]);

  const toggleSelect = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const addSelected = () => {
    for (const code of selectedCodes) {
      const rub = rubriques.find(r => r.code === code);
      if (rub && !simCodes.has(code)) onAdd(rub);
    }
    setSelectedCodes(new Set());
  };

  const addAllFiltered = () => {
    for (const rub of filtered) {
      if (!simCodes.has(rub.code)) onAdd(rub);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-[900px] max-w-[95vw] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Catalogue des Rubriques</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{rubriques.length}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filtres */}
        <div className="border-b border-gray-100 px-5 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Recherche par code ou libellé..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtre par classe */}
            <span className="text-xs text-gray-400">Classe:</span>
            <button onClick={() => setFilterClasse("")} className={`rounded px-2 py-0.5 text-xs ${!filterClasse ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Toutes</button>
            {[0, 1, 2, 3, 5, 7].map(c => (
              <button key={c} onClick={() => setFilterClasse(String(c))} className={`rounded px-2 py-0.5 text-xs ${filterClasse === String(c) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {classeLabels[c] || `Cl.${c}`}
              </button>
            ))}
            {/* Filtre par type */}
            <span className="ml-3 text-xs text-gray-400">Type:</span>
            <button onClick={() => setFilterCalcul("")} className={`rounded px-2 py-0.5 text-xs ${!filterCalcul ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Tous</button>
            <button onClick={() => setFilterCalcul("0")} className={`rounded px-2 py-0.5 text-xs ${filterCalcul === "0" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Manuelles</button>
            <button onClick={() => setFilterCalcul("1")} className={`rounded px-2 py-0.5 text-xs ${filterCalcul === "1" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Calculées</button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{filtered.length} rubrique(s) trouvée(s)</span>
            <div className="flex items-center gap-2">
              <button
                onClick={addAllFiltered}
                className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Tout ajouter ({filtered.filter(r => !simCodes.has(r.code)).length})
              </button>
              {selectedCodes.size > 0 && (
                <button
                  onClick={addSelected}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Ajouter ({selectedCodes.size})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tableau des rubriques */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-gray-400 text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-normal w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(r => selectedCodes.has(r.code))}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedCodes(new Set(filtered.map(r => r.code)));
                      } else {
                        setSelectedCodes(new Set());
                      }
                    }}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 text-left font-normal w-12">Code</th>
                <th className="px-3 py-2 text-left font-normal">Libellé</th>
                <th className="px-3 py-2 text-left font-normal w-20">Classe</th>
                <th className="px-3 py-2 text-left font-normal w-20">Type</th>
                <th className="px-3 py-2 text-left font-normal w-32">Formule</th>
                <th className="px-3 py-2 text-center font-normal w-16">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(rub => {
                const inSim = simCodes.has(rub.code);
                const isSelected = selectedCodes.has(rub.code);
                return (
                  <tr
                    key={rub.code}
                    className={`border-b border-gray-50 hover:bg-blue-50/30 ${isSelected ? "bg-blue-50/50" : ""} ${inSim ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(rub.code)}
                        disabled={inSim}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-gray-500">{rub.code}</td>
                    <td className="px-3 py-1.5 text-gray-700">{rub.libelle}</td>
                    <td className="px-3 py-1.5">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                        {classeLabels[rub.classe] || `Cl.${rub.classe}`}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${rub.calcul === 1 ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {rub.calcul === 1 ? "Calculée" : "Manuelle"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-gray-400 truncate max-w-[120px]" title={rub.formule || ""}>
                      {rub.formule || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {inSim ? (
                        <span className="text-[10px] text-green-600 font-medium">✓ Dans sim</span>
                      ) : (
                        <button
                          onClick={() => onAdd(rub)}
                          className="rounded px-2 py-0.5 text-[10px] text-blue-600 hover:bg-blue-100"
                        >
                          + Ajouter
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">Aucune rubrique trouvée</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
