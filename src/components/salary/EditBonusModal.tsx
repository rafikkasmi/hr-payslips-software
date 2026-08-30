import { useSalaryContext } from "./SalaryContext";
import { Modal } from "../ui/Modal";
import { Pencil, Loader2, Search, Pause, Play } from "lucide-react";

export function EditBonusModal() {
  const ctx = useSalaryContext();
  const {
    showEditBonusModal, cancelEditBonus, handleSaveEditBonus, savingEdit,
    editTitle, handleEditTitleChange, editType, setEditType,
    editDescription, setEditDescription,
    editAmount, setEditAmount, editIsPercent, setEditIsPercent,
    editRubCode, setEditRubCode, editRubMatch,
    editRecurrence, setEditRecurrence, editRecurrenceCount, setEditRecurrenceCount,
    editPayPeriod, setEditPayPeriod,
    editIsImposable, setEditIsImposable, editIsCotisable, setEditIsCotisable,
    editingBonusId, toggleSkipBonus, skippedBonusIds,
    editTarget, setEditTarget, setEditSelectedEmpIds,
    setEditFilterSection, setEditFilterStructure, setEditFilterAffectatio,
    editSelectedEmpIds, toggleEditEmp, editEmpSearch, setEditEmpSearch,
    editFilterSection, editFilterStructure, editFilterAffectatio,
    editTargetValue, sections, structures, affectatios,
    employees, rubriques,
  } = ctx;

  return (
    <Modal
      open={showEditBonusModal}
      onClose={cancelEditBonus}
      title="Modifier la prime / retenue"
      icon={<Pencil className="h-5 w-5" />}
      size="lg"
      footer={
        <>
          <button onClick={cancelEditBonus} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
          <button onClick={handleSaveEditBonus} disabled={!editTitle.trim() || savingEdit || (editTarget === "individual" && editSelectedEmpIds.size === 0)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Libellé</label>
          <input value={editTitle} onChange={e => handleEditTitleChange(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {editRubMatch && editRubMatch.similarity >= 0.3 && editRubCode !== editRubMatch.code && (
            <div className={`mt-1.5 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${editRubMatch.similarity >= 0.7 ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
              <span className="font-bold">{editRubMatch.similarity >= 0.7 ? "🎯" : "💡"}</span>
              <span>Rubrique similaire: <strong>R{editRubMatch.code}</strong> — {editRubMatch.libelle}</span>
              <button onClick={() => setEditRubCode(editRubMatch.code)} className="ml-auto rounded bg-white px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50 border border-blue-200">Choisir</button>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="bonus">Prime (gain)</option>
            <option value="deduction">Retenue (déduction)</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description optionnelle..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Montant</label>
          <div className="flex gap-2">
            <input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(parseFloat(e.target.value) || 0)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap"><input type="checkbox" checked={editIsPercent} onChange={e => setEditIsPercent(e.target.checked)} /> % du brut</label>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rubrique</label>
          <select value={editRubCode} onChange={e => setEditRubCode(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">— Auto / Aucune —</option>
            {rubriques.filter(r => {
              const classe = Number(r.classe ?? 0);
              const isManual = Number(r.manuelle ?? 0) === 1 || !String(r.formule ?? "").trim();
              const hasLabel = String(r.libelle ?? "").trim().length > 0;
              if (!hasLabel || !isManual) return false;
              if (editType === "bonus") return classe === 1;
              if (editType === "deduction") return classe === 2;
              return true;
            }).map(r => <option key={String(r.code)} value={String(r.code)}>R{String(r.code)} — {String(r.libelle ?? "—")}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Récurrence</label>
          <select value={editRecurrence} onChange={e => setEditRecurrence(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="one_time">Une fois</option>
            <option value="recurring">Récurrent (N périodes)</option>
            <option value="permanent">Permanent</option>
          </select>
        </div>
        {editRecurrence === "recurring" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre de périodes</label>
            <input type="number" min="1" value={editRecurrenceCount} onChange={e => setEditRecurrenceCount(parseInt(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Période de début</label>
          <input type="month" value={editPayPeriod ?? ""} onChange={e => setEditPayPeriod(e.target.value || null)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <p className="mt-0.5 text-xs text-gray-400">Vide = toutes les périodes</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={editIsImposable} onChange={e => setEditIsImposable(e.target.checked)} /> Imposable (IRG)</label>
          <label className="flex items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={editIsCotisable} onChange={e => setEditIsCotisable(e.target.checked)} /> Cotisable (SS)</label>
        </div>
        {editingBonusId !== null && (
          <div className="flex items-center gap-2">
            <button onClick={() => toggleSkipBonus(editingBonusId)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${skippedBonusIds.has(editingBonusId) ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}>
              {skippedBonusIds.has(editingBonusId) ? <><Play className="h-3 w-3" /> Reprendre</> : <><Pause className="h-3 w-3" /> Pause</>}
            </button>
          </div>
        )}
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Destinataires</label>
          <div className="flex gap-2 flex-wrap">
            {["all", "individual", "section", "structure", "affectatio"].map(t => (
              <button key={t} onClick={() => { setEditTarget(t); setEditSelectedEmpIds(new Set()); setEditFilterSection(""); setEditFilterStructure(""); setEditFilterAffectatio(""); }} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${editTarget === t ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                {t === "all" ? "Tout le monde" : t === "individual" ? "Employé(s)" : `Par ${t}`}
              </button>
            ))}
          </div>
        </div>
        {editTarget === "individual" && (
          <div className="col-span-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input value={editEmpSearch} onChange={e => setEditEmpSearch(e.target.value)} placeholder="Rechercher..." className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex gap-2 mb-2 flex-wrap">
              <select value={editFilterSection} onChange={e => setEditFilterSection(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"><option value="">Toutes sections</option>{sections.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <select value={editFilterStructure} onChange={e => setEditFilterStructure(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"><option value="">Toutes structures</option>{structures.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <select value={editFilterAffectatio} onChange={e => setEditFilterAffectatio(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"><option value="">Toutes affectatios</option>{affectatios.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {employees.filter(e => {
                if (!e.actif) return false;
                if (editFilterSection && e.section !== editFilterSection) return false;
                if (editFilterStructure && e.structure !== editFilterStructure) return false;
                if (editFilterAffectatio && e.affectatio !== editFilterAffectatio) return false;
                if (editEmpSearch) { const q = editEmpSearch.toLowerCase(); if (!(`${e.nom} ${e.prenom} ${e.matricule}`).toLowerCase().includes(q)) return false; }
                return true;
              }).map(emp => (
                <label key={emp.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white cursor-pointer">
                  <input type="checkbox" checked={editSelectedEmpIds.has(emp.id)} onChange={() => toggleEditEmp(emp.id)} />
                  <span className="font-mono text-gray-500 w-16">{emp.matricule}</span>
                  <span className="flex-1">{emp.nom} {emp.prenom}</span>
                </label>
              ))}
            </div>
            {editSelectedEmpIds.size > 0 && <p className="mt-2 text-xs text-blue-600">{editSelectedEmpIds.size} employé(s)</p>}
          </div>
        )}
        {editTarget === "section" && (
          <div className="col-span-2"><select value={editFilterSection || editTargetValue} onChange={e => setEditFilterSection(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choisir...</option>{sections.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        )}
        {editTarget === "structure" && (
          <div className="col-span-2"><select value={editFilterStructure || editTargetValue} onChange={e => setEditFilterStructure(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choisir...</option>{structures.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        )}
        {editTarget === "affectatio" && (
          <div className="col-span-2"><select value={editFilterAffectatio || editTargetValue} onChange={e => setEditFilterAffectatio(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choisir...</option>{affectatios.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        )}
      </div>
    </Modal>
  );
}
