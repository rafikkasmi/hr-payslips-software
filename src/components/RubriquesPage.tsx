import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api } from "../lib/api";
import {
  Search, Save, X, Edit2, Trash2, Loader2,
  Plus, FlaskConical, AlertCircle, CheckCircle2, Settings, ListChecks,
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
  const [activeTab, setActiveTab] = useState<"rubriques" | "settings">("rubriques");

  const loadRubriques = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getRubriques();
      setRubriques(r as unknown as Rubrique[]);
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
      setTestResult({ ...result });
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
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("rubriques")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "rubriques" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ListChecks className="h-4 w-4" />
          Rubriques
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "settings" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Settings className="h-4 w-4" />
          Paramètres Salaires
        </button>
      </div>

      {activeTab === "settings" && <SalarySettingsPanel rubriques={rubriques} />}

      {activeTab === "rubriques" && (
      <>
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
      </>
      )}
    </div>
  );
}

// ============================================================
// Salary Settings Panel — Paramètres de calcul des salaires
// ============================================================

interface RubriqueRef {
  code: string;
  libelle: string | null;
  classe: number | null;
  is_brut: number | null;
  is_impos: number | null;
  is_secu_s: number | null;
  is_total: number | null;
}

function SalarySettingsPanel({ rubriques }: { rubriques: RubriqueRef[] }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getSalarySettings();
        setSettings(s);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const defaults: Record<string, string> = {
    cotisable_total_code: "500",
    imposable_total_code: "652",
    brut_total_code: "763",
    gains_total_code: "765",
    retenues_total_code: "767",
    net_payer_code: "770",
    cnas_employee_rate: "9",
    cnas_employer_rate: "26",
    irg_abattement_rate: "0.40",
    irg_abattement_min: "1000",
    irg_abattement_max: "1500",
    irg_exoneration_threshold: "30000",
    snmg: "24000",
    monthly_hours: "173.33",
    monthly_days: "30",
    family_reduction: "1500",
  };

  const val = (key: string) => settings[key] ?? defaults[key] ?? "";

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Merge with defaults for any missing keys
      const toSave: Record<string, string> = {};
      for (const key of Object.keys(defaults)) {
        toSave[key] = val(key);
      }
      // Also save any extra keys
      for (const key of Object.keys(settings)) {
        if (!toSave[key]) toSave[key] = settings[key];
      }
      await api.setSalarySettings(toSave);
      setMessage({ type: "success", text: "Paramètres enregistrés avec succès" });
    } catch (e) {
      setMessage({ type: "error", text: `Erreur: ${e}` });
    } finally {
      setSaving(false);
    }
  };

  // Rubriques cotisables (is_secu_s = 1)
  const cotisables = rubriques.filter(r => r.is_secu_s === 1);
  // Rubriques imposables (is_impos = 1)
  const imposables = rubriques.filter(r => r.is_impos === 1);
  // Rubriques total (is_total = 1)
  const totals = rubriques.filter(r => r.is_total === 1);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Paramètres de Calcul des Salaires</h2>
          <p className="text-sm text-gray-500">Configuration globale appliquée à tous les calculs de paie</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </button>
      </div>

      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.type === "success" ? <CheckCircle2 className="inline h-4 w-4 mr-1" /> : <AlertCircle className="inline h-4 w-4 mr-1" />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section 1: Rubriques système (codes de totalisation) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-700 border-b pb-2">Rubriques Système — Codes de Totalisation</h3>
          <p className="mb-3 text-xs text-gray-400">Définissez quelles rubriques totalisent les bases de calcul</p>
          <div className="space-y-3">
            <SettingRubSelect label="Rubrique total cotisable" hint="Base pour CNAS (défaut: R500)" value={val("cotisable_total_code")} onChange={v => handleChange("cotisable_total_code", v)} rubriques={rubriques} />
            <SettingRubSelect label="Rubrique total imposable" hint="Base pour IRG (défaut: R652)" value={val("imposable_total_code")} onChange={v => handleChange("imposable_total_code", v)} rubriques={rubriques} />
            <SettingRubSelect label="Rubrique total brut" hint="Brut total (défaut: R763)" value={val("brut_total_code")} onChange={v => handleChange("brut_total_code", v)} rubriques={rubriques} />
            <SettingRubSelect label="Rubrique total gains" hint="Somme des gains (défaut: R765)" value={val("gains_total_code")} onChange={v => handleChange("gains_total_code", v)} rubriques={rubriques} />
            <SettingRubSelect label="Rubrique total retenues" hint="Somme des retenues (défaut: R767)" value={val("retenues_total_code")} onChange={v => handleChange("retenues_total_code", v)} rubriques={rubriques} />
            <SettingRubSelect label="Rubrique net à payer" hint="Net à payer (défaut: R770)" value={val("net_payer_code")} onChange={v => handleChange("net_payer_code", v)} rubriques={rubriques} />
          </div>
        </div>

        {/* Section 2: Taux et paramètres réglementaires */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-700 border-b pb-2">Taux et Paramètres Réglementaires</h3>
          <p className="mb-3 text-xs text-gray-400">Taux appliqués automatiquement dans les calculs</p>
          <div className="space-y-3">
            <SettingInput label="Taux CNAS salarié (%)" hint="Cotisation sécurité sociale salarié (défaut: 9%)" value={val("cnas_employee_rate")} onChange={v => handleChange("cnas_employee_rate", v)} type="number" />
            <SettingInput label="Taux CNAS employeur (%)" hint="Cotisation sécurité sociale employeur (défaut: 26%)" value={val("cnas_employer_rate")} onChange={v => handleChange("cnas_employer_rate", v)} type="number" />
            <SettingInput label="Taux abattement IRG" hint="Abattement IRG (défaut: 0.40 = 40%)" value={val("irg_abattement_rate")} onChange={v => handleChange("irg_abattement_rate", v)} type="number" />
            <SettingInput label="Abattement IRG min (DA)" hint="Plancher abattement (défaut: 1000)" value={val("irg_abattement_min")} onChange={v => handleChange("irg_abattement_min", v)} type="number" />
            <SettingInput label="Abattement IRG max (DA)" hint="Plafond abattement (défaut: 1500)" value={val("irg_abattement_max")} onChange={v => handleChange("irg_abattement_max", v)} type="number" />
            <SettingInput label="Seuil exonération IRG (DA)" hint="Exonération totale sous ce seuil (défaut: 30000)" value={val("irg_exoneration_threshold")} onChange={v => handleChange("irg_exoneration_threshold", v)} type="number" />
            <SettingInput label="SNMG (DA)" hint="Salaire national minimum garanti (défaut: 24000)" value={val("snmg")} onChange={v => handleChange("snmg", v)} type="number" />
            <SettingInput label="Heures mensuelles" hint="Heures légales par mois (défaut: 173.33)" value={val("monthly_hours")} onChange={v => handleChange("monthly_hours", v)} type="number" />
            <SettingInput label="Jours mensuels" hint="Jours par mois (défaut: 30)" value={val("monthly_days")} onChange={v => handleChange("monthly_days", v)} type="number" />
            <SettingInput label="Réduction familiale (DA/pers)" hint="Réduction IRG par personne à charge (défaut: 1500)" value={val("family_reduction")} onChange={v => handleChange("family_reduction", v)} type="number" />
          </div>
        </div>

        {/* Section 3: Rubriques cotisables (flags) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-700 border-b pb-2">Rubriques Cotisables ({cotisables.length})</h3>
          <p className="mb-3 text-xs text-gray-400">Rubriques avec flag <code className="bg-gray-100 px-1 rounded">is_secu_s</code> = participent à la base CNAS</p>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {cotisables.map(r => (
              <div key={r.code} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50">
                <span className="font-mono text-gray-400 w-10">R{r.code}</span>
                <span className="flex-1 text-gray-700">{r.libelle || "(sans libellé)"}</span>
                <span className="text-[10px] text-gray-400">cl{r.classe}</span>
              </div>
            ))}
            {cotisables.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Aucune rubrique cotisable</p>}
          </div>
        </div>

        {/* Section 4: Rubriques imposables */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-700 border-b pb-2">Rubriques Imposables ({imposables.length})</h3>
          <p className="mb-3 text-xs text-gray-400">Rubriques avec flag <code className="bg-gray-100 px-1 rounded">is_impos</code> = participent à la base IRG</p>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {imposables.map(r => (
              <div key={r.code} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50">
                <span className="font-mono text-gray-400 w-10">R{r.code}</span>
                <span className="flex-1 text-gray-700">{r.libelle || "(sans libellé)"}</span>
                <span className="text-[10px] text-gray-400">cl{r.classe}</span>
              </div>
            ))}
            {imposables.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Aucune rubrique imposable</p>}
          </div>
        </div>

        {/* Section 5: Ordre des rubriques */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-bold text-gray-700 border-b pb-2">Ordre de Calcul des Rubriques ({totals.length} rubriques de totalisation)</h3>
          <p className="mb-3 text-xs text-gray-400">L'ordre de calcul est défini par le champ <code className="bg-gray-100 px-1 rounded">ord_clc</code> de chaque rubrique. Les rubriques ci-dessous ont le flag <code className="bg-gray-100 px-1 rounded">is_total</code> et participent aux accumulations T[].</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-60 overflow-y-auto">
            {[...totals].sort((a, b) => (a.classe ?? 0) - (b.classe ?? 0) || a.code.localeCompare(b.code)).map(r => (
              <div key={r.code} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50">
                <span className="font-mono text-gray-400 w-10">R{r.code}</span>
                <span className="flex-1 truncate text-gray-700">{r.libelle || "(sans libellé)"}</span>
                <span className="text-[10px] text-gray-400">cl{r.classe}</span>
                {r.is_brut === 1 && <span className="text-[10px] text-blue-600">brut</span>}
                {r.is_secu_s === 1 && <span className="text-[10px] text-purple-600">cotis</span>}
                {r.is_impos === 1 && <span className="text-[10px] text-orange-600">impos</span>}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">Pour modifier l'ordre de calcul, éditez le champ <code className="bg-gray-100 px-1 rounded">ord_clc</code> d'une rubrique dans l'onglet "Rubriques".</p>
        </div>
      </div>
    </div>
  );
}

function SettingInput({ label, hint, value, onChange, type = "text" }: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        step={type === "number" ? "0.01" : undefined}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
      />
      {hint && <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function SettingRubSelect({ label, hint, value, onChange, rubriques }: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rubriques: RubriqueRef[];
}) {
  const [showModal, setShowModal] = useState(false);
  const selected = rubriques.find(r => r.code === value);
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none hover:bg-gray-50"
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? `R${selected.code} — ${selected.libelle || "(sans libellé)"}` : "— Sélectionner une rubrique —"}
        </span>
        <Search className="h-4 w-4 text-gray-400" />
      </button>
      {hint && <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>}
      {showModal && (
        <RubriquePickerModal
          rubriques={rubriques}
          selectedCode={value}
          onSelect={(code) => { onChange(code); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// RubriquePickerModal — Modal de sélection de rubrique avec recherche rapide
// ============================================================

export function RubriquePickerModal({ rubriques, selectedCode, onSelect, onClose }: {
  rubriques: { code: string; libelle: string | null; classe: number | null; is_brut?: number | null; is_impos?: number | null; is_secu_s?: number | null }[];
  selectedCode?: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rubriques;
    return rubriques.filter(r =>
      r.code.includes(s) ||
      (r.libelle ?? "").toLowerCase().includes(s)
    );
  }, [rubriques, search]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && filtered.length > 0) {
      onSelect(filtered[0].code);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-900">Sélectionner une rubrique</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-100 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-blue-500">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Tapez un code (ex: 500) ou un libellé (ex: salaire)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 text-sm focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] text-gray-400">{filtered.length} rubrique(s) trouvée(s) sur {rubriques.length} · Entrée = sélectionner la première · Échap = fermer</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune rubrique trouvée</p>
          ) : (
            filtered.map(r => {
              const isSelected = r.code === selectedCode;
              return (
                <button
                  key={r.code}
                  onClick={() => onSelect(r.code)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm border-b border-gray-50 transition-colors ${
                    isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-blue-50/50"
                  }`}
                >
                  <span className="font-mono text-gray-400 w-12">R{r.code}</span>
                  <span className="flex-1 truncate text-gray-700">{r.libelle || "(sans libellé)"}</span>
                  <span className="text-[10px] text-gray-400">cl{r.classe}</span>
                  {r.is_brut === 1 && <span className="text-[10px] text-blue-600">brut</span>}
                  {r.is_secu_s === 1 && <span className="text-[10px] text-purple-600">cotis</span>}
                  {r.is_impos === 1 && <span className="text-[10px] text-orange-600">impos</span>}
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
