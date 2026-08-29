import { useState, useEffect } from "react";
import { api, type Bonus, type EmployeeSummary } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { Plus, Trash2, Gift, Loader2, ChevronDown, ChevronUp, Search, Settings, Save } from "lucide-react";

export function BonusesPage() {
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<number>>(new Set());
  const [empSearch, setEmpSearch] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState(0);
  const [editIsImposable, setEditIsImposable] = useState(false);
  const [editIsCotisable, setEditIsCotisable] = useState(false);
  const [editRecurrence, setEditRecurrence] = useState("one_time");
  const [editRecurrenceCount, setEditRecurrenceCount] = useState(0);
  const [editPayPeriod, setEditPayPeriod] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bonusType, setBonusType] = useState("bonus");
  const [amount, setAmount] = useState(0);
  const [isPercentage, setIsPercentage] = useState(false);
  const [rubriqueCode, setRubriqueCode] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [targetValue, setTargetValue] = useState("");
  const [payPeriod, setPayPeriod] = useState("");
  const [isImposable, setIsImposable] = useState(false);
  const [isCotisable, setIsCotisable] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("one_time");
  const [recurrenceCount, setRecurrenceCount] = useState(0);
  const [isAbsenceDependent, setIsAbsenceDependent] = useState(false);
  const [absenceDivisor, setAbsenceDivisor] = useState(22);
  const [amountType, setAmountType] = useState("fixed");

  const loadBonuses = async () => {
    try { setBonuses(await api.getBonuses()); } catch (e) { console.error(e); }
  };

  const loadEmployees = async () => {
    try { setEmployees(await api.getEmployees()); } catch (e) { console.error(e); }
  };

  useEffect(() => { loadBonuses(); loadEmployees(); }, []);

  const toggleEmp = (id: number) => {
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setAmount(0); setRubriqueCode(""); setTargetValue(""); setPayPeriod("");
    setIsImposable(false); setIsCotisable(false); setRecurrenceType("one_time"); setRecurrenceCount(0);
    setIsAbsenceDependent(false); setAbsenceDivisor(22); setAmountType("fixed"); setIsPercentage(false);
    setBonusType("bonus"); setTargetType("all"); setSelectedEmpIds(new Set()); setEmpSearch("");
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await api.createEnhancedBonus(
        title.trim(), description || null, bonusType, amount, isPercentage,
        rubriqueCode || null, targetType, targetValue || null, payPeriod || null,
        targetType === "individual" ? Array.from(selectedEmpIds) : null,
        isImposable || null, isCotisable || null,
        recurrenceType || null, recurrenceCount || null,
        isAbsenceDependent || null, absenceDivisor || null,
        amountType || null, null, null, null,
      );
      setShowForm(false);
      resetForm();
      loadBonuses();
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this bonus?")) return;
    try { await api.deleteBonus(id); loadBonuses(); } catch (e) { console.error(e); }
  };

  const startEdit = (b: Bonus) => {
    setEditingId(b.id);
    setEditTitle(b.title);
    setEditAmount(b.amount);
    setEditIsImposable(b.is_imposable !== 0);
    setEditIsCotisable(b.is_cotisable !== 0);
    setEditRecurrence(b.recurrence_type ?? "one_time");
    setEditRecurrenceCount(b.recurrence_count ?? 0);
    setEditPayPeriod(b.pay_period ?? "");
  };

  const cancelEdit = () => { setEditingId(null); };

  const handleSaveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await api.updateBonus(editingId, {
        title: editTitle.trim(),
        amount: editAmount,
        is_imposable: editIsImposable,
        is_cotisable: editIsCotisable,
        recurrence_type: editRecurrence,
        recurrence_count: editRecurrenceCount || 0,
        pay_period: editPayPeriod || null,
      });
      setEditingId(null);
      loadBonuses();
    } catch (e) { console.error(e); }
    finally { setSavingEdit(false); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonuses & Deductions</h1>
          <p className="mt-1 text-sm text-gray-500">Add extra bonuses or deductions for employees</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Bonus/Deduction
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hard work bonus" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={bonusType} onChange={(e) => setBonusType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="bonus">Bonus (+)</option>
                <option value="deduction">Deduction (-)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Type</label>
              <select value={amountType} onChange={(e) => setAmountType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="fixed">Fixed amount</option>
                <option value="per_day">Per day worked</option>
                <option value="income_grid">Income grid based</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rubrique Code</label>
              <input value={rubriqueCode} onChange={(e) => setRubriqueCode(e.target.value)} placeholder="e.g. 100" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Type</label>
              <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="all">All Employees</option>
                <option value="individual">Individual</option>
                <option value="section">Section</option>
                <option value="structure">Structure</option>
                <option value="unite">Unité</option>
                <option value="affectatio">Affectation</option>
                <option value="contract">Contract Type</option>
              </select>
            </div>
            {targetType === "individual" && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Employees ({selectedEmpIds.size} selected)
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Search employees..."
                    className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  {employees
                    .filter(e => {
                      if (!empSearch) return true;
                      const q = empSearch.toLowerCase();
                      return e.nom.toLowerCase().includes(q) || e.prenom.toLowerCase().includes(q) || e.matricule.includes(q);
                    })
                    .map(e => (
                      <label
                        key={e.id}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmpIds.has(e.id)}
                          onChange={() => toggleEmp(e.id)}
                        />
                        <span className="text-sm">{e.nom} {e.prenom}</span>
                        <span className="text-xs text-gray-400">({e.matricule})</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
            {targetType !== "all" && targetType !== "individual" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
                <input value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="Section/structure name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period (optional)</label>
              <input type="month" value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
              <select value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="one_time">One time</option>
                <option value="recurring">Recurring (N times)</option>
                <option value="permanent">Permanent (until deleted)</option>
              </select>
            </div>
            {recurrenceType === "recurring" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence Count</label>
                <input type="number" value={recurrenceCount} onChange={(e) => setRecurrenceCount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isPercentage} onChange={(e) => setIsPercentage(e.target.checked)} />
                Percentage of base salary
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isImposable} onChange={(e) => setIsImposable(e.target.checked)} />
                Imposable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isCotisable} onChange={(e) => setIsCotisable(e.target.checked)} />
                Cotisable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isAbsenceDependent} onChange={(e) => setIsAbsenceDependent(e.target.checked)} />
                Absence-dependent (prorated)
              </label>
            </div>
            {isAbsenceDependent && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Absence Divisor</label>
                <input type="number" value={absenceDivisor} onChange={(e) => setAbsenceDivisor(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} disabled={!title.trim() || creating || (targetType === "individual" && selectedEmpIds.size === 0)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {bonuses.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <Gift className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No bonuses or deductions yet.</p>
          </div>
        ) : (
          bonuses.map((b) => (
            <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setExpandedId(expandedId === b.id ? null : b.id)} className="text-gray-400 hover:text-gray-600">
                    {expandedId === b.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div>
                    <h3 className="font-semibold text-gray-900">{b.title}</h3>
                    <p className="text-sm text-gray-500">{b.description || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${b.bonus_type === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {b.bonus_type === "bonus" ? "+" : "-"}{b.is_percentage ? `${b.amount}%` : formatCurrency(b.amount)}
                  </span>
                  <span className="text-xs text-gray-500">{b.target_type}</span>
                  <button onClick={() => startEdit(b)} className="text-blue-500 hover:text-blue-700"><Settings className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(b.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {expandedId === b.id && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-3">
                    <div><span className="font-medium text-gray-700">Rubrique:</span> {b.rubrique_code || "—"}</div>
                    <div><span className="font-medium text-gray-700">Period:</span> {b.pay_period || "all"}</div>
                    <div><span className="font-medium text-gray-700">Target:</span> {b.target_value || "all"}</div>
                    <div><span className="font-medium text-gray-700">Status:</span> {b.status}</div>
                    <div><span className="font-medium text-gray-700">Type:</span> {b.bonus_type}</div>
                    <div><span className="font-medium text-gray-700">Percentage:</span> {b.is_percentage ? "Yes" : "No"}</div>
                    <div><span className="font-medium text-gray-700">Recurrence:</span> {b.recurrence_type ?? "one_time"}{b.recurrence_count ? ` (${b.recurrence_count}x)` : ""}</div>
                    <div><span className="font-medium text-gray-700">Cotisable:</span> {b.is_cotisable ? "Yes" : "No"}</div>
                    <div><span className="font-medium text-gray-700">Imposable:</span> {b.is_imposable ? "Yes" : "No"}</div>
                  </div>

                  {editingId === b.id && (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Title</label>
                          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Amount</label>
                          <input type="number" value={editAmount} onChange={e => setEditAmount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Pay Period</label>
                          <input type="month" value={editPayPeriod} onChange={e => setEditPayPeriod(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Recurrence</label>
                          <select value={editRecurrence} onChange={e => setEditRecurrence(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                            <option value="one_time">One time</option>
                            <option value="recurring">Recurring (N times)</option>
                            <option value="permanent">Permanent</option>
                          </select>
                        </div>
                        {editRecurrence === "recurring" && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Recurrence Count</label>
                            <input type="number" value={editRecurrenceCount} onChange={e => setEditRecurrenceCount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                          </div>
                        )}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-gray-700">
                            <input type="checkbox" checked={editIsImposable} onChange={e => setEditIsImposable(e.target.checked)} />
                            Imposable (IRG)
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-700">
                            <input type="checkbox" checked={editIsCotisable} onChange={e => setEditIsCotisable(e.target.checked)} />
                            Cotisable (SS)
                          </label>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={handleSaveEdit} disabled={!editTitle.trim() || savingEdit} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                          {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                        <button onClick={cancelEdit} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
