import { useState, useEffect } from "react";
import { api, type PosteSummary, type PosteDetail } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import {
  Briefcase, Plus, Trash2, Edit2, Save, X, Users, Loader2,
} from "lucide-react";

export function PostesPage() {
  const [postes, setPostes] = useState<PosteSummary[]>([]);
  const [selectedPosteId, setSelectedPosteId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PosteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editingRubrique, setEditingRubrique] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    loadPostes();
  }, []);

  const loadPostes = async () => {
    setLoading(true);
    try {
      const p = await api.getPostes();
      setPostes(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadDetail = async (id: number) => {
    setLoading(true);
    try {
      const d = await api.getPosteDetail(id);
      setDetail(d as unknown as PosteDetail);
      setSelectedPosteId(id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await api.createPoste(newName.trim(), newDesc.trim() || null);
      setNewName("");
      setNewDesc("");
      setCreating(false);
      await loadPostes();
    } catch (e) { console.error(e); }
  };

  const handleSaveEdit = async () => {
    if (!selectedPosteId || !editName.trim()) return;
    try {
      await api.updatePoste(selectedPosteId, editName.trim(), editDesc.trim() || null);
      setEditingName(false);
      await loadPostes();
      await loadDetail(selectedPosteId);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    if (!selectedPosteId) return;
    if (!confirm("Delete this poste? Employees will be unassigned.")) return;
    try {
      await api.deletePoste(selectedPosteId);
      setSelectedPosteId(null);
      setDetail(null);
      await loadPostes();
    } catch (e) { console.error(e); }
  };

  const handleSaveRubrique = async (code: string) => {
    if (!selectedPosteId) return;
    const val = parseFloat(editValue) || 0;
    try {
      await api.updatePosteRubrique(selectedPosteId, code, val);
      setEditingRubrique(null);
      await loadDetail(selectedPosteId);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Postes</h1>
      <p className="mt-1 text-sm text-gray-500">Manage job roles and their default rubrique values</p>

      <div className="mt-6 flex gap-6">
        {/* Poste list */}
        <div className="w-72 space-y-2">
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> New Poste
          </button>

          {creating && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <input
                type="text"
                placeholder="Poste name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                autoFocus
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <div className="flex gap-2">
                <button onClick={handleCreate} className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">Save</button>
                <button onClick={() => setCreating(false)} className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          )}

          {loading && postes.length === 0 && (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          )}

          {postes.map((p) => (
            <div
              key={p.id}
              onClick={() => loadDetail(p.id)}
              className={`rounded-lg border p-3 cursor-pointer transition ${selectedPosteId === p.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{p.name}</span>
                </div>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Users className="h-3 w-3" /> {p.employee_count}
                </span>
              </div>
              {p.description && <p className="mt-1 text-xs text-gray-500">{p.description}</p>}
            </div>
          ))}
        </div>

        {/* Poste detail */}
        {detail && (
          <div className="flex-1 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              {editingName ? (
                <div className="space-y-2">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-1 text-lg font-bold" />
                  <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" className="w-full rounded border border-gray-300 px-3 py-1 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"><Save className="h-3 w-3" /> Save</button>
                    <button onClick={() => setEditingName(false)} className="flex items-center gap-1 rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300"><X className="h-3 w-3" /> Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{detail.poste.name}</h2>
                    {detail.poste.description && <p className="text-sm text-gray-500">{detail.poste.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditName(detail.poste.name); setEditDesc(detail.poste.description ?? ""); setEditingName(true); }}
                      className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rubriques */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Default Rubriques ({detail.rubriques.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Code</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Libelle</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Classe</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Default Value</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.rubriques.map((r) => (
                      <tr key={r.rubrique_code} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs">{r.rubrique_code}</td>
                        <td className="px-4 py-2 text-gray-700">{r.libelle ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-600">{r.classe ?? "—"}</td>
                        <td className="px-4 py-2 text-right">
                          {editingRubrique === r.rubrique_code ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-28 rounded border border-gray-300 px-2 py-0.5 text-right text-sm"
                              autoFocus
                            />
                          ) : (
                            formatCurrency(r.default_value)
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {editingRubrique === r.rubrique_code ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => handleSaveRubrique(r.rubrique_code)} className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700">Save</button>
                              <button onClick={() => setEditingRubrique(null)} className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-300">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingRubrique(r.rubrique_code); setEditValue(String(r.default_value)); }}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Employees */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Employees ({detail.employees.length})</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {detail.employees.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
                    <span className="font-mono text-xs text-gray-500">{e.matricule}</span>
                    <span className="text-sm font-medium text-gray-900">{e.nom} {e.prenom}</span>
                    {!e.actif && <span className="text-xs text-red-500">Inactive</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!detail && !loading && (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-sm">Select a poste to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
