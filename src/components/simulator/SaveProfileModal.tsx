import { useState, useMemo } from "react";
import { Search, X, Save, CopyPlus, FolderPlus, Check, Loader2 } from "lucide-react";
import type { RubInput, EmployeeSummary, PosteSummary } from "./types";

export function SaveProfileModal({
  simRubriques,
  selectedEmp,
  postes,
  saving,
  saveMsg,
  onSaveToPoste,
  onSaveToEmployee,
  onSaveAsNewPoste,
  onClose,
}: {
  simRubriques: RubInput[];
  selectedEmp: EmployeeSummary | null;
  postes: PosteSummary[];
  saving: boolean;
  saveMsg: string | null;
  onSaveToPoste: (posteId: number) => void;
  onSaveToEmployee: (employeeId: number) => void;
  onSaveAsNewPoste: (name: string, description: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"employee" | "poste" | "new">("employee");
  const [selectedPosteId, setSelectedPosteId] = useState<number | null>(
    selectedEmp?.poste_id ?? null
  );
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [posteSearch, setPosteSearch] = useState("");

  const filteredPostes = useMemo(() => {
    const s = posteSearch.trim().toLowerCase();
    let p = [...postes].sort((a, b) => a.name.localeCompare(b.name));
    if (s) p = p.filter(p => p.name.toLowerCase().includes(s));
    return p;
  }, [postes, posteSearch]);

  const currentPoste = postes.find(p => p.id === selectedPosteId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-[600px] flex-col rounded-xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">Sauvegarder la simulation</h3>
            <p className="text-xs text-gray-500">{simRubriques.length} rubriques à sauvegarder</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 px-5 pt-2">
          <button
            onClick={() => setTab("employee")}
            className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === "employee" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Save className="h-4 w-4" />
            Profil employé
          </button>
          <button
            onClick={() => setTab("poste")}
            className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === "poste" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            <CopyPlus className="h-4 w-4" />
            Profil de poste
          </button>
          <button
            onClick={() => setTab("new")}
            className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === "new" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            <FolderPlus className="h-4 w-4" />
            Nouveau profil
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "employee" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Sauvegarder les rubriques comme valeurs spécifiques à l'employé
                {selectedEmp && (
                  <span className="font-medium text-gray-900"> {selectedEmp.nom} {selectedEmp.prenom}</span>
                )}.
                Ces valeurs remplacent celles du profil de poste.
              </p>
              {selectedEmp ? (
                <button
                  onClick={() => onSaveToEmployee(selectedEmp.id)}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Sauvegarder pour {selectedEmp.nom} {selectedEmp.prenom}
                </button>
              ) : (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                  Aucun employé sélectionné.
                </p>
              )}
            </div>
          )}

          {tab === "poste" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Sauvegarder les rubriques dans un profil de poste. Tous les employés liés à ce poste utiliseront ces valeurs par défaut.
              </p>
              {selectedEmp?.poste_name && (
                <button
                  onClick={() => selectedEmp.poste_id && onSaveToPoste(selectedEmp.poste_id)}
                  disabled={saving || !selectedEmp.poste_id}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Profil actuel: {selectedEmp.poste_name}
                </button>
              )}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500 mb-2">Ou choisir un autre poste:</p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={posteSearch}
                    onChange={e => setPosteSearch(e.target.value)}
                    placeholder="Rechercher un poste..."
                    className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  {filteredPostes.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPosteId(p.id)}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-50 ${selectedPosteId === p.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    >
                      <span className="text-sm text-gray-700">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.employee_count} emp.</span>
                    </div>
                  ))}
                  {filteredPostes.length === 0 && (
                    <div className="py-4 text-center text-sm text-gray-400">Aucun poste trouvé</div>
                  )}
                </div>
                {selectedPosteId && currentPoste && (
                  <button
                    onClick={() => onSaveToPoste(selectedPosteId)}
                    disabled={saving}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Sauvegarder vers "{currentPoste.name}"
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "new" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Créer un nouveau profil de poste avec les rubriques actuelles de la simulation.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-500">Nom du profil *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="ex: CADRE DIRECTION, OUVRIER SPECIALISE..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Description (optionnel)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description du profil..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => newName.trim() && onSaveAsNewPoste(newName.trim(), newDesc.trim())}
                disabled={saving || !newName.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                Créer le profil "{newName || "..."}"
              </button>
            </div>
          )}

          {/* Message */}
          {saveMsg && (
            <div className={`mt-4 rounded-lg p-3 text-sm ${saveMsg.startsWith("Erreur") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {saveMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
