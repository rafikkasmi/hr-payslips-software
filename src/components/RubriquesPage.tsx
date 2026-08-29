import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import {
  Search, Save, X, Edit2, Trash2, Loader2, Calculator,
  Plus, FlaskConical, AlertCircle, CheckCircle2,
} from "lucide-react";

const classeLabels: Record<number, { label: string; color: string }> = {
  0: { label: "Info/Totaux", color: "bg-gray-100 text-gray-600" },
  1: { label: "Gains", color: "bg-green-100 text-green-700" },
  2: { label: "Retenues", color: "bg-red-100 text-red-700" },
  3: { label: "Cotisations", color: "bg-purple-100 text-purple-700" },
  4: { label: "Net", color: "bg-blue-100 text-blue-700" },
  5: { label: "Heures supp.", color: "bg-orange-100 text-orange-700" },
  7: { label: "Calcul/Info", color: "bg-cyan-100 text-cyan-700" },
};

interface Rubrique {
  code: string;
  libelle: string | null;
  formule: string | null;
  classe: number | null;
  is_brut: number | null;
  is_impos: number | null;
  is_secu_s: number | null;
  is_total: number | null;
  is_imp: number | null;
  manuelle: number | null;
  init_val: number | null;
  ord_clc: number | null;
}

export function RubriquesPage() {
  const [rubriques, setRubriques] = useState<Rubrique[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClasse, setFilterClasse] = useState<number | null>(null);
  const [filterOnlyWithFormula, setFilterOnlyWithFormula] = useState(false);
  const [filterOnlyActive, setFilterOnlyActive] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editLibelle, setEditLibelle] = useState("");
  const [editFormule, setEditFormule] = useState("");
  const [editClasse, setEditClasse] = useState<number>(0);
  const [editIsBrut, setEditIsBrut] = useState(false);
  const [editIsImpos, setEditIsImpos] = useState(false);
  const [editIsSecuS, setEditIsSecuS] = useState(false);
  const [editIsTotal, setEditIsTotal] = useState(false);
  const [editInitVal, setEditInitVal] = useState(0);
  const [editOrdClc, setEditOrdClc] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ code: string; success: boolean; value?: number; error?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLibelle, setNewLibelle] = useState("");
  const [newClasse, setNewClasse] = useState(1);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadRubriques = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getRubriques();
      setRubriques(r as Rubrique[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRubriques(); }, [loadRubriques]);

  const filtered = useMemo(() => {
    return rubriques.filter((r) => {
      if (filterOnlyActive && !r.libelle?.trim()) return false;
      if (filterOnlyWithFormula && !r.formule?.trim()) return false;
      if (filterClasse !== null && (r.classe ?? 0) !== filterClasse) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const match = r.code.toLowerCase().includes(s)
          || (r.libelle ?? "").toLowerCase().includes(s)
          || (r.formule ?? "").toLowerCase().includes(s);
        if (!match) return false;
      }
      return true;
    });
  }, [rubriques, search, filterClasse, filterOnlyWithFormula, filterOnlyActive]);

  const startEdit = (r: Rubrique) => {
    setEditingCode(r.code);
    setEditLibelle(r.libelle ?? "");
    setEditFormule(r.formule ?? "");
    setEditClasse(r.classe ?? 0);
    setEditIsBrut(r.is_brut === 1);
    setEditIsImpos(r.is_impos === 1);
    setEditIsSecuS(r.is_secu_s === 1);
    setEditIsTotal(r.is_total === 1);
    setEditInitVal(r.init_val ?? 0);
    setEditOrdClc(r.ord_clc ?? 0);
    setTestResult(null);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!editingCode) return;
    setSaving(true);
    try {
      await api.updateRubrique(editingCode, {
        libelle: editLibelle,
        formule: editFormule,
        classe: editClasse,
        is_brut: editIsBrut ? 1 : 0,
        is_impos: editIsImpos ? 1 : 0,
        is_secu_s: editIsSecuS ? 1 : 0,
        is_total: editIsTotal ? 1 : 0,
        init_val: editInitVal,
        ord_clc: editOrdClc,
      });
      setMessage({ type: "success", text: `Rubrique R${editingCode} mise à jour` });
      setEditingCode(null);
      await loadRubriques();
    } catch (e) {
      setMessage({ type: "error", text: `Erreur: ${e}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (code: string, formule: string) => {
    setTesting(code);
    setTestResult(null);
    try {
      const result = await api.testRubriqueFormula(code, formule);
      setTestResult({ code, ...result });
    } catch (e) {
      setTestResult({ code, success: false, error: String(e) });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(`Supprimer la rubrique R${code} ?`)) return;
    try {
      await api.deleteRubrique(code);
      setMessage({ type: "success", text: `Rubrique R${code} supprimée` });
      await loadRubriques();
    } catch (e) {
      setMessage({ type: "error", text: `Erreur: ${e}` });
    }
  };

  const handleCreate = async () => {
    if (!newLibelle.trim()) return;
    setCreating(true);
    try {
      const code = await api.createRubrique(newLibelle.trim(), newClasse);
      setMessage({ type: "success", text: `Rubrique R${code} créée` });
      setNewLibelle("");
      await loadRubriques();
    } catch (e) {
      setMessage({ type: "error", text: `Erreur: ${e}` });
    } finally {
      setCreating(false);
    }
  };

  // Clear message after 3s
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const classeCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const r of rubriques) {
      const c = r.classe ?? 0;
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [rubriques]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rubriques de Paie</h1>
          <p className="text-sm text-gray-500">{rubriques.length} rubriques au total — {filtered.length} affichées</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nouvelle rubrique
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${
          message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par code, libellé ou formule..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterClasse ?? ""}
          onChange={(e) => setFilterClasse(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Toutes classes</option>
          {Object.entries(classeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({classeCounts[Number(k)] ?? 0})</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={filterOnlyWithFormula} onChange={(e) => setFilterOnlyWithFormula(e.target.checked)} className="rounded border-gray-300" />
          Avec formule
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={filterOnlyActive} onChange={(e) => setFilterOnlyActive(e.target.checked)} className="rounded border-gray-300" />
          Actives seulement
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Chargement...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Code</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Libellé</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Classe</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Formule</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Flags</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Ordre</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((r) => {
                const cl = r.classe ?? 0;
                const clInfo = classeLabels[cl] ?? { label: `Classe ${cl}`, color: "bg-gray-100 text-gray-600" };
                const isEditing = editingCode === r.code;
                return (
                  <tr key={r.code} className={isEditing ? "bg-blue-50" : "hover:bg-gray-50"}>
                    <td className="px-3 py-2 text-sm font-mono font-medium text-gray-900">R{r.code}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {isEditing ? (
                        <input type="text" value={editLibelle} onChange={(e) => setEditLibelle(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                      ) : (
                        r.libelle || <span className="text-gray-400 italic">(vide)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select value={editClasse} onChange={(e) => setEditClasse(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm">
                          {Object.entries(classeLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${clInfo.color}`}>{clInfo.label}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm font-mono text-gray-600 max-w-[300px]">
                      {isEditing ? (
                        <textarea value={editFormule} onChange={(e) => setEditFormule(e.target.value)} rows={2} className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono" placeholder="ex: R[001]*1.5" />
                      ) : (
                        <div className="truncate" title={r.formule ?? ""}>{r.formule || <span className="text-gray-400 italic">—</span>}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {isEditing ? (
                          <>
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={editIsBrut} onChange={(e) => setEditIsBrut(e.target.checked)} /> Brut</label>
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={editIsImpos} onChange={(e) => setEditIsImpos(e.target.checked)} /> Impos</label>
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={editIsSecuS} onChange={(e) => setEditIsSecuS(e.target.checked)} /> Secu</label>
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={editIsTotal} onChange={(e) => setEditIsTotal(e.target.checked)} /> Total</label>
                          </>
                        ) : (
                          <>
                            {r.is_brut === 1 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">B</span>}
                            {r.is_impos === 1 && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">I</span>}
                            {r.is_secu_s === 1 && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">S</span>}
                            {r.is_total === 1 && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">T</span>}
                            {r.manuelle === 1 && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">M</span>}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-gray-500">
                      {isEditing ? (
                        <input type="number" value={editOrdClc} onChange={(e) => setEditOrdClc(Number(e.target.value))} className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                      ) : (
                        r.ord_clc ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={handleSave} disabled={saving} className="rounded p-1 text-green-600 hover:bg-green-100" title="Enregistrer">
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            </button>
                            <button onClick={cancelEdit} className="rounded p-1 text-gray-500 hover:bg-gray-100" title="Annuler">
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(r)} className="rounded p-1 text-blue-600 hover:bg-blue-100" title="Modifier">
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {r.formule && (
                              <button onClick={() => handleTest(r.code, r.formule!)} disabled={testing === r.code} className="rounded p-1 text-purple-600 hover:bg-purple-100" title="Tester la formule">
                                {testing === r.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                              </button>
                            )}
                            <button onClick={() => handleDelete(r.code)} className="rounded p-1 text-red-600 hover:bg-red-100" title="Supprimer">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div className={`rounded-lg p-4 ${testResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            {testResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
            <span className="font-semibold text-sm">
              Test R{testResult.code}: {testResult.success ? `${testResult.value?.toFixed(2)} DA` : "Erreur"}
            </span>
          </div>
          {!testResult.success && <p className="text-sm text-red-600 ml-7">{testResult.error}</p>}
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCreating(false)}>
          <div className="rounded-xl bg-white p-6 shadow-xl w-96" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Nouvelle rubrique</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Libellé</label>
                <input type="text" value={newLibelle} onChange={(e) => setNewLibelle(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="ex: Indemnité de transport" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Classe</label>
                <select value={newClasse} onChange={(e) => setNewClasse(Number(e.target.value))} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm">
                  {Object.entries(classeLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Annuler</button>
              <button onClick={handleCreate} disabled={!newLibelle.trim() || creating} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
