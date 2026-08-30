import { useState, useMemo } from "react";
import { useSalaryContext } from "./SalaryContext";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { formatCurrency } from "../../lib/utils";
import { Gift, Plus, Pause, Play, Trash2, Pencil, Loader2, Search, ArrowRight, ArrowLeft, Check, ExternalLink } from "lucide-react";

export function BonusModal() {
  const ctx = useSalaryContext();
  const {
    showBonusModal, setShowBonusModal, selectedPeriod,
    periodBonuses, loadingBonuses, skippedBonusIds,
    toggleSkipBonus, handleDeleteBonus, startEditBonus,
    bonusType, handleBonusTypeChange, bonusTitle, handleBonusTitleChange,
    rubSuggestion, rubMatch, bonusRubCode, setBonusRubCode,
    availableRubriques, showNewRubrique, setShowNewRubrique,
    newRubLibelle, setNewRubLibelle, newRubImposable, setNewRubImposable,
    newRubCotisable, setNewRubCotisable, creatingRubrique, handleCreateRubrique,
    bonusAmount, setBonusAmount, bonusIsPercent, setBonusIsPercent,
    bonusRecurrence, setBonusRecurrence, bonusRecurrenceCount, setBonusRecurrenceCount,
    bonusTarget, setBonusTarget, setBonusTargetValue, setSelectedEmpIds,
    setFilterSection, setFilterStructure, setFilterAffectatio,
    selectedEmpIds, toggleEmp, empSearch, setEmpSearch,
    filterSection, filterStructure, filterAffectatio,
    sections, structures, affectatios, filteredEmployees,
    creatingBonus, handleCreateBonus, resetBonusForm,
    bonusIsAbsenceDep, setBonusIsAbsenceDep, bonusAbsenceDiv, setBonusAbsenceDiv,
    bonusAmountType, setBonusAmountType, bonusIncomeMin, setBonusIncomeMin,
    bonusIncomeMax, setBonusIncomeMax, bonusContractTypes, setBonusContractTypes,
    navigateToBonuses,
  } = ctx;

  const [wizardStep, setWizardStep] = useState(0);
  const [bonusListSort, setBonusListSort] = useState("title");
  const [bonusListFilter, setBonusListFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const sortedBonuses = useMemo(() => {
    let result = [...periodBonuses];
    if (bonusListFilter) {
      const f = bonusListFilter.toLowerCase();
      result = result.filter(b => b.title.toLowerCase().includes(f) || (b.rubrique_code ?? "").toLowerCase().includes(f));
    }
    if (bonusListSort === "title") result.sort((a, b) => a.title.localeCompare(b.title));
    else if (bonusListSort === "amount_desc") result.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    else if (bonusListSort === "amount_asc") result.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
    else if (bonusListSort === "type") result.sort((a, b) => a.bonus_type.localeCompare(b.bonus_type));
    return result;
  }, [periodBonuses, bonusListSort, bonusListFilter]);

  const closeModal = () => { setShowBonusModal(false); setWizardStep(0); };
  const resetWizard = () => { resetBonusForm(); setWizardStep(0); };

  const canNext = wizardStep === 0 ? bonusTitle.trim().length > 0 : wizardStep === 1 ? bonusAmount > 0 || bonusIsPercent : bonusTarget === "all" || (bonusTarget === "individual" && selectedEmpIds.size > 0) || (["section", "structure", "affectatio"].includes(bonusTarget) && (filterSection || filterStructure || filterAffectatio));

  const handleCreate = () => {
    handleCreateBonus();
    setWizardStep(0);
  };

  const steps = ["Type & Libellé", "Montant", "Destinataires"];

  return (
    <>
      <Modal
        open={showBonusModal}
        onClose={closeModal}
        title="Primes & Retenues"
        subtitle={`Gestion des primes pour ${selectedPeriod}`}
        icon={<Gift className="h-5 w-5" />}
        size="lg"
      >
        {/* Existing bonuses list */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600">Primes existantes ({periodBonuses.length})</h3>
            <div className="flex items-center gap-2">
              <select value={bonusListSort} onChange={e => setBonusListSort(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
                <option value="title">Trier par titre</option>
                <option value="amount_desc">Montant décroissant</option>
                <option value="amount_asc">Montant croissant</option>
                <option value="type">Par type</option>
              </select>
              <select value={bonusListFilter} onChange={e => setBonusListFilter(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
                <option value="">Tous types</option>
                <option value="bonus">Primes seulement</option>
                <option value="deduction">Retenues seulement</option>
              </select>
            </div>
          </div>
          {loadingBonuses ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-3"><Loader2 className="h-3 w-3 animate-spin" /> Chargement...</div>
          ) : sortedBonuses.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">Aucune prime pour cette période.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {sortedBonuses.filter(b => !bonusListFilter || b.bonus_type === bonusListFilter).map(b => {
                const isPaused = skippedBonusIds.has(b.id);
                return (
                  <div key={b.id} className={`rounded-lg border px-3 py-2 text-xs ${isPaused ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-100"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${b.bonus_type === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {b.bonus_type === "bonus" ? "+" : "−"}
                      </span>
                      <span className={`font-medium ${isPaused ? "text-gray-400 line-through" : "text-gray-900"}`}>{b.title}</span>
                      <span className="text-gray-500">{b.is_percentage ? `${b.amount}%` : formatCurrency(b.amount)}</span>
                      {b.rubrique_code && <span className="font-mono text-gray-400">R{b.rubrique_code}</span>}
                      {b.recurrence_type && b.recurrence_type !== "one_time" && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 font-medium">
                          {b.recurrence_type === "recurring" ? `Récurrent (${b.recurrence_count ?? 0}x)` : "Permanent"}
                        </span>
                      )}
                      <span className="text-gray-400">
                        {b.target_type === "all" ? "Tous" : b.target_type === "individual" ? `${b.assigned_employees?.length ?? 0} emp.` : `${b.target_type}: ${b.target_value ?? ""}`}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => toggleSkipBonus(b.id)} title={isPaused ? "Reprendre" : "Pause"} className={isPaused ? "text-green-500 hover:text-green-700" : "text-amber-500 hover:text-amber-700"}>
                          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setDeleteTarget(b.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => startEditBonus(b)} className="text-blue-500 hover:text-blue-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {b.target_type === "individual" && b.assigned_employees && b.assigned_employees.length > 0 && (
                      <div className="mt-1 ml-6 flex flex-wrap gap-1">
                        {b.assigned_employees.map(([id, name]) => (
                          <span key={id} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {navigateToBonuses && (
            <button onClick={() => { closeModal(); navigateToBonuses(); }} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <ExternalLink className="h-3 w-3" /> Gestion avancée sur la page Primes →
            </button>
          )}
        </div>

        {/* Wizard */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-4">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === wizardStep ? "bg-blue-600 text-white" : i < wizardStep ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {i < wizardStep ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${i === wizardStep ? "text-blue-700" : "text-gray-500"}`}>{s}</span>
                {i < steps.length - 1 && <div className="h-px w-4 bg-gray-200" />}
              </div>
            ))}
          </div>

          {/* Step 0: Type & Libellé */}
          {wizardStep === 0 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <div className="flex gap-2">
                  <button onClick={() => handleBonusTypeChange("bonus")} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${bonusType === "bonus" ? "bg-green-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-green-50"}`}>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${bonusType === "bonus" ? "bg-green-700" : "bg-green-100 text-green-700"}`}>+</span>
                    Prime / Indemnité
                  </button>
                  <button onClick={() => handleBonusTypeChange("deduction")} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${bonusType === "deduction" ? "bg-red-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-red-50"}`}>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${bonusType === "deduction" ? "bg-red-700" : "bg-red-100 text-red-700"}`}>−</span>
                    Retenue
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
                <input value={bonusTitle} onChange={e => handleBonusTitleChange(e.target.value)} placeholder={bonusType === "bonus" ? "ex: Prime de rendement, Indemnité de transport..." : "ex: Retenue SS, Avance sur salaire..."} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" autoFocus />
                {rubSuggestion && (
                  <div className={`mt-1.5 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${rubSuggestion.similarity >= 0.8 ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                    <span className="font-bold">{rubSuggestion.similarity >= 0.8 ? "✓" : "≈"}</span>
                    <span>Similaire à « {rubSuggestion.title} »</span>
                    {rubSuggestion.code ? (
                      <button onClick={() => setBonusRubCode(rubSuggestion.code)} className="ml-auto rounded bg-white px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50 border border-blue-200">→ R{rubSuggestion.code}</button>
                    ) : <span className="ml-auto text-gray-500">(sans rubrique)</span>}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Rubrique de paie {bonusRubCode && <span className="text-green-600 font-medium">✓ R{bonusRubCode}</span>}
                </label>
                {rubMatch && rubMatch.similarity >= 0.3 && bonusRubCode !== rubMatch.code && (
                  <div className={`mb-2 rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${rubMatch.similarity >= 0.7 ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                    <span className="font-bold">{rubMatch.similarity >= 0.7 ? "🎯" : "💡"}</span>
                    <span>Rubrique similaire: <strong>R{rubMatch.code}</strong> — {rubMatch.libelle}</span>
                    <button onClick={() => setBonusRubCode(rubMatch.code)} className="ml-auto rounded bg-white px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-50 border border-blue-200">Choisir</button>
                  </div>
                )}
                <select value={bonusRubCode} onChange={e => { if (e.target.value === "__new__") { setShowNewRubrique(true); setNewRubLibelle(bonusTitle.trim()); } else { setBonusRubCode(e.target.value); setShowNewRubrique(false); } }} className={`w-full rounded-lg border px-3 py-2 text-sm ${bonusRubCode ? "border-green-300 bg-green-50/30" : "border-gray-300"}`}>
                  <option value="">— Choisir une rubrique —</option>
                  {availableRubriques.map(r => <option key={String(r.code)} value={String(r.code)}>R{String(r.code)} — {String(r.libelle ?? "—")}</option>)}
                  <option value="__new__">+ Créer une nouvelle rubrique...</option>
                </select>
                {showNewRubrique && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nouvelle rubrique ({bonusType === "bonus" ? "Gain" : "Retenue"})</label>
                    <input value={newRubLibelle} onChange={e => setNewRubLibelle(e.target.value)} placeholder="Libellé..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2" />
                    <div className="flex gap-4 mb-2">
                      <label className="flex items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={newRubImposable} onChange={e => setNewRubImposable(e.target.checked)} /> Imposable (IRG)</label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={newRubCotisable} onChange={e => setNewRubCotisable(e.target.checked)} /> Cotisable (SS)</label>
                    </div>
                    <button onClick={handleCreateRubrique} disabled={!newRubLibelle.trim() || creatingRubrique} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {creatingRubrique ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
                    </button>
                  </div>
                )}
                {!bonusRubCode && !showNewRubrique && (
                  <p className="mt-1 text-xs text-amber-600 flex items-center gap-1"><span>⚠</span> Sans rubrique, {bonusType === "bonus" ? "cette prime" : "cette retenue"} ne sera pas incluse dans le calcul</p>
                )}
              </div>
            </div>
          )}

          {/* Step 1: Montant & Récurrence */}
          {wizardStep === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Montant</label>
                <div className="flex gap-2">
                  <input type="number" step="0.01" value={bonusAmount} onChange={e => setBonusAmount(parseFloat(e.target.value) || 0)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" autoFocus />
                  <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap"><input type="checkbox" checked={bonusIsPercent} onChange={e => setBonusIsPercent(e.target.checked)} /> % du brut</label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Récurrence</label>
                <select value={bonusRecurrence} onChange={e => setBonusRecurrence(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="one_time">Une fois (ce mois)</option>
                  <option value="recurring">Récurrent (N mois)</option>
                  <option value="permanent">Permanent (toujours)</option>
                </select>
              </div>
              {bonusRecurrence === "recurring" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de mois</label>
                  <input type="number" min="1" value={bonusRecurrenceCount} onChange={e => setBonusRecurrenceCount(parseInt(e.target.value) || 0)} className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              )}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mode de calcul du montant</label>
                  <select value={bonusAmountType} onChange={e => setBonusAmountType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="fixed">Montant fixe (défaut)</option>
                    <option value="grid">Grille salariale (selon no_grille)</option>
                    <option value="scaled">Proportionnel (selon plafond salaire)</option>
                  </select>
                </div>
                {bonusAmountType === "scaled" && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Salaire min (DA)</label>
                      <input type="number" step="0.01" value={bonusIncomeMin ?? ""} onChange={e => setBonusIncomeMin(e.target.value ? parseFloat(e.target.value) : null)} placeholder="0" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Salaire max (DA)</label>
                      <input type="number" step="0.01" value={bonusIncomeMax ?? ""} onChange={e => setBonusIncomeMax(e.target.value ? parseFloat(e.target.value) : null)} placeholder="∞" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                    <input type="checkbox" checked={bonusIsAbsenceDep} onChange={e => setBonusIsAbsenceDep(e.target.checked)} />
                    Prorata selon absences
                  </label>
                  {bonusIsAbsenceDep && (
                    <div className="mt-1.5 ml-5">
                      <label className="block text-xs text-gray-500 mb-1">Diviseur d'absence (jours/mois)</label>
                      <input type="number" step="0.1" min="1" value={bonusAbsenceDiv} onChange={e => setBonusAbsenceDiv(parseFloat(e.target.value) || 22)} className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                      <p className="mt-1 text-xs text-gray-400">Montant × (jours travaillés ÷ diviseur)</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Types de contrat (optionnel)</label>
                  <input value={bonusContractTypes} onChange={e => setBonusContractTypes(e.target.value)} placeholder="ex: CDI,CDD (vide = tous)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <p className="mt-1 text-xs text-gray-400">Séparés par virgules. Laisse vide pour tous les contrats.</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Destinataires */}
          {wizardStep === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Destinataires</label>
                <div className="flex gap-2 flex-wrap">
                  {["all", "individual", "section", "structure", "affectatio"].map(t => (
                    <button key={t} onClick={() => { setBonusTarget(t); setBonusTargetValue(""); setSelectedEmpIds(new Set()); setFilterSection(""); setFilterStructure(""); setFilterAffectatio(""); }} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${bonusTarget === t ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                      {t === "all" ? "Tout le monde" : t === "individual" ? "Employé(s) spécifique(s)" : `Par ${t}`}
                    </button>
                  ))}
                </div>
              </div>
              {bonusTarget === "individual" && (
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="h-4 w-4 text-gray-400" />
                    <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Rechercher par nom ou matricule..." className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" autoFocus />
                  </div>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"><option value="">Toutes sections</option>{sections.map(s => <option key={s} value={s}>{s}</option>)}</select>
                    <select value={filterStructure} onChange={e => setFilterStructure(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"><option value="">Toutes structures</option>{structures.map(s => <option key={s} value={s}>{s}</option>)}</select>
                    <select value={filterAffectatio} onChange={e => setFilterAffectatio(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs"><option value="">Toutes affectatios</option>{affectatios.map(s => <option key={s} value={s}>{s}</option>)}</select>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {filteredEmployees.map(emp => (
                      <label key={emp.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white cursor-pointer">
                        <input type="checkbox" checked={selectedEmpIds.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                        <span className="font-mono text-gray-500 w-16">{emp.matricule}</span>
                        <span className="flex-1">{emp.nom} {emp.prenom}</span>
                        {emp.section && <span className="text-gray-400">{emp.section}</span>}
                      </label>
                    ))}
                  </div>
                  {selectedEmpIds.size > 0 && <p className="mt-2 text-xs text-blue-600 font-medium">{selectedEmpIds.size} employé(s) sélectionné(s)</p>}
                </div>
              )}
              {bonusTarget === "section" && (<div><select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choisir une section...</option>{sections.map(s => <option key={s} value={s}>{s}</option>)}</select></div>)}
              {bonusTarget === "structure" && (<div><select value={filterStructure} onChange={e => setFilterStructure(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choisir une structure...</option>{structures.map(s => <option key={s} value={s}>{s}</option>)}</select></div>)}
              {bonusTarget === "affectatio" && (<div><select value={filterAffectatio} onChange={e => setFilterAffectatio(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choisir une affectatio...</option>{affectatios.map(s => <option key={s} value={s}>{s}</option>)}</select></div>)}
              {/* Summary preview */}
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                <strong>Résumé:</strong> {bonusType === "bonus" ? "Prime" : "Retenue"} « {bonusTitle || "—"} » de {bonusIsPercent ? `${bonusAmount}%` : formatCurrency(bonusAmount)} {bonusTarget === "all" ? "pour tous les employés actifs" : bonusTarget === "individual" ? `pour ${selectedEmpIds.size} employé(s)` : `par ${bonusTarget}: ${filterSection || filterStructure || filterAffectatio || "—"}`}
              </div>
            </div>
          )}

          {/* Wizard navigation */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <button onClick={resetWizard} className="text-sm text-gray-500 hover:text-gray-700">Réinitialiser</button>
            <div className="flex items-center gap-2">
              {wizardStep > 0 && (
                <button onClick={() => setWizardStep(wizardStep - 1)} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <ArrowLeft className="h-4 w-4" /> Précédent
                </button>
              )}
              {wizardStep < 2 ? (
                <button onClick={() => canNext && setWizardStep(wizardStep + 1)} disabled={!canNext} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  Suivant <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={handleCreate} disabled={!canNext || creatingBonus} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${bonusType === "bonus" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                  {creatingBonus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer {bonusType === "bonus" ? "la prime" : "la retenue"}
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer la prime"
        message="Êtes-vous sûr de vouloir supprimer cette prime ? Cette action est irréversible."
        confirmLabel="Supprimer"
        onConfirm={() => { if (deleteTarget !== null) handleDeleteBonus(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
