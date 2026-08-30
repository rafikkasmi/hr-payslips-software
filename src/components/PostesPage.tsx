import { useState, useEffect, useMemo } from "react";
import { api, type PosteSummary, type PosteDetail } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import {
  Briefcase, Plus, Trash2, Edit2, Save, X, Users, Loader2,
  RefreshCw, TrendingUp, Calendar, DollarSign, Building2, Shield,
  Search, ChevronLeft, ChevronRight, Filter,
} from "lucide-react";

const PAGE_SIZE = 10;

interface RubriqueCatalog {
  code: string;
  libelle: string;
  classe: number;
  init_val: number;
  formule: string | null;
}

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
  const [syncing, setSyncing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "effectif" | "masse">("name");
  const [page, setPage] = useState(1);

  // Rubrique picker
  const [showAddRub, setShowAddRub] = useState(false);
  const [catalog, setCatalog] = useState<RubriqueCatalog[]>([]);
  const [rubSearch, setRubSearch] = useState("");
  const [rubFilterClasse, setRubFilterClasse] = useState<string>("");
  const [newRubCode, setNewRubCode] = useState<string | null>(null);
  const [newRubValue, setNewRubValue] = useState("0");

  const loadPostes = async () => {
    setLoading(true);
    try {
      const p = await api.getPostes();
      setPostes(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPostes(); }, []);

  // Load rubrique catalog when picker opens
  useEffect(() => {
    if (!showAddRub && catalog.length > 0) return;
    if (!showAddRub) return;
    (async () => {
      try {
        const rows = await api.getRubriques();
        const items: RubriqueCatalog[] = (rows as Record<string, unknown>[]).map(r => ({
          code: String(r.code ?? "").replace(/^R/, "").padStart(3, "0"),
          libelle: String(r.libelle ?? ""),
          classe: Number(r.classe ?? 0),
          init_val: Number(r.init_val ?? r.value ?? 0),
          formule: (r.formule as string | null) ?? null,
        }));
        setCatalog(items);
      } catch (e) { console.error(e); }
    })();
  }, [showAddRub, catalog.length]);

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
    if (!confirm("Supprimer ce profil de paie ? Les employés seront désassignés.")) return;
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

  const handleDeleteRubrique = async (code: string, libelle: string) => {
    if (!selectedPosteId) return;
    if (!confirm(`Supprimer la rubrique ${code} (${libelle}) de ce profil ?`)) return;
    try {
      await api.deletePosteRubrique(selectedPosteId, code);
      await loadDetail(selectedPosteId);
    } catch (e) { console.error(e); }
  };

  const handleAddRubrique = async () => {
    if (!selectedPosteId || !newRubCode) return;
    const val = parseFloat(newRubValue) || 0;
    try {
      await api.updatePosteRubrique(selectedPosteId, newRubCode, val);
      setShowAddRub(false);
      setNewRubCode(null);
      setNewRubValue("0");
      setRubSearch("");
      setRubFilterClasse("");
      await loadDetail(selectedPosteId);
    } catch (e) { console.error(e); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.syncPostesFromFnc();
      await loadPostes();
      if (selectedPosteId) await loadDetail(selectedPosteId);
    } catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await api.recomputePosteStats();
      await loadPostes();
      if (selectedPosteId) await loadDetail(selectedPosteId);
    } catch (e) { console.error(e); }
    finally { setRecomputing(false); }
  };

  const filtered = useMemo(() => {
    let p = postes.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.fnc_code?.toLowerCase().includes(search.toLowerCase())
    );
    if (sortBy === "name") p = [...p].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "effectif") p = [...p].sort((a, b) => b.employee_count - a.employee_count);
    if (sortBy === "masse") p = [...p].sort((a, b) => b.total_brut - a.total_brut);
    return p;
  }, [postes, search, sortBy]);

  // Reset page when search/sort changes
  useEffect(() => { setPage(1); }, [search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalBrut = useMemo(() => postes.reduce((s, p) => s + p.total_brut, 0), [postes]);
  const totalEmployees = useMemo(() => postes.reduce((s, p) => s + p.employee_count, 0), [postes]);

  // Rubrique catalog filtered for picker
  const detailCodes = useMemo(() => new Set(detail?.rubriques.map(r => r.rubrique_code) ?? []), [detail]);
  const filteredCatalog = useMemo(() => {
    const s = rubSearch.trim().toLowerCase();
    return catalog
      .filter(r => !detailCodes.has(r.code))
      .filter(r => {
        if (rubFilterClasse && String(r.classe) !== rubFilterClasse) return false;
        if (!s) return true;
        return r.code.includes(s) || r.libelle.toLowerCase().includes(s);
      })
      .sort((a, b) => Number(a.code) - Number(b.code));
  }, [catalog, rubSearch, rubFilterClasse, detailCodes]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profils de paie</h1>
          <p className="mt-1 text-sm text-gray-500">
            {postes.length} profils · {totalEmployees} employés · masse salariale totale {formatCurrency(totalBrut)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Synchroniser FNC
          </button>
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <TrendingUp className={`h-4 w-4 ${recomputing ? "animate-spin" : ""}`} />
            Recalculer stats
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Nouveau profil
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou code FNC..."
            className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="name">Trier par nom</option>
          <option value="effectif">Trier par effectif</option>
          <option value="masse">Trier par masse salariale</option>
        </select>
      </div>

      <div className="mt-6 flex gap-6">
        {/* Poste list with pagination */}
        <div className="w-80 space-y-2">
          {creating && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <input
                type="text"
                placeholder="Nom du profil"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                autoFocus
              />
              <input
                type="text"
                placeholder="Description (optionnel)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <div className="flex gap-2">
                <button onClick={handleCreate} className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">Enregistrer</button>
                <button onClick={() => setCreating(false)} className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300">Annuler</button>
              </div>
            </div>
          )}

          {loading && postes.length === 0 && (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          )}

          {paged.map((p) => (
            <div
              key={p.id}
              onClick={() => loadDetail(p.id)}
              className={`rounded-lg border p-3 cursor-pointer transition ${selectedPosteId === p.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {p.is_manual ? <Briefcase className="h-4 w-4 text-gray-400" /> : <Building2 className="h-4 w-4 text-blue-500" />}
                  <span className="text-sm font-medium text-gray-900 line-clamp-1">{p.name}</span>
                </div>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Users className="h-3 w-3" /> {p.employee_count}
                </span>
              </div>
              {p.fnc_code && <p className="mt-1 text-[10px] text-gray-400">Code: {p.fnc_code}</p>}
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span className={p.is_manual ? "rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700" : "rounded bg-blue-100 px-1.5 py-0.5 text-blue-700"}>
                  {p.is_manual ? "Manuel" : "PCPAIE"}
                </span>
                <span className="font-medium text-gray-700">{formatCurrency(p.total_brut)}</span>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !loading && (
            <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
              Aucun profil trouvé
            </div>
          )}

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded border border-gray-200 p-1 hover:bg-gray-50 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 font-medium text-gray-700">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded border border-gray-200 p-1 hover:bg-gray-50 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
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
                    <button onClick={handleSaveEdit} className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"><Save className="h-3 w-3" /> Enregistrer</button>
                    <button onClick={() => setEditingName(false)} className="flex items-center gap-1 rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300"><X className="h-3 w-3" /> Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900">{detail.poste.name}</h2>
                      <span className={`rounded px-2 py-0.5 text-xs ${detail.poste.is_manual ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>
                        {detail.poste.is_manual ? "Manuel" : "PCPAIE"}
                      </span>
                    </div>
                    {detail.poste.fnc_code && <p className="text-xs text-gray-500">Code FNC: {detail.poste.fnc_code}</p>}
                    {detail.poste.description && <p className="text-sm text-gray-500">{detail.poste.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditName(detail.poste.name); setEditDesc(detail.poste.description ?? ""); setEditingName(true); }}
                      className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Edit2 className="h-3 w-3" /> Modifier
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> Supprimer
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500"><Users className="h-4 w-4" /><span className="text-xs font-medium">Effectif</span></div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{detail.stats.employee_count}</p>
                <p className="text-xs text-gray-500">{detail.stats.active_count} actifs</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500"><DollarSign className="h-4 w-4" /><span className="text-xs font-medium">Masse salariale</span></div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(detail.stats.total_brut)}</p>
                <p className="text-xs text-gray-500">brut total</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500"><TrendingUp className="h-4 w-4" /><span className="text-xs font-medium">Brut moyen</span></div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(detail.stats.avg_brut)}</p>
                <p className="text-xs text-gray-500">par employé</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500"><Calendar className="h-4 w-4" /><span className="text-xs font-medium">Ancienneté</span></div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{detail.stats.avg_seniority_years.toFixed(1)}</p>
                <p className="text-xs text-gray-500">années en moyenne</p>
              </div>
            </div>

            {/* Rubriques with add/delete */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Rubriques par défaut ({detail.rubriques.length})</h3>
                <button
                  onClick={() => setShowAddRub(true)}
                  className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter une rubrique
                </button>
              </div>

              {/* Add rubrique panel */}
              {showAddRub && (
                <div className="border-b border-gray-200 bg-blue-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">Sélectionner une rubrique à ajouter</h4>
                    <button onClick={() => { setShowAddRub(false); setNewRubCode(null); setRubSearch(""); setRubFilterClasse(""); }} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={rubSearch}
                        onChange={(e) => setRubSearch(e.target.value)}
                        placeholder="Rechercher par code ou libellé..."
                        className="w-full rounded border border-gray-300 pl-8 pr-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <select
                      value={rubFilterClasse}
                      onChange={(e) => setRubFilterClasse(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                    >
                      <option value="">Toutes classes</option>
                      <option value="0">0 — Base</option>
                      <option value="1">1 — Primes</option>
                      <option value="2">2 — Indemnités</option>
                      <option value="3">3 — Retenues</option>
                      <option value="4">4 — Cotisations</option>
                      <option value="5">5 — IRG</option>
                      <option value="6">6 — Infos</option>
                      <option value="7">7 — Paramètres</option>
                      <option value="8">8 — Totaux</option>
                    </select>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded border border-gray-200 bg-white">
                    {filteredCatalog.length === 0 && (
                      <div className="p-4 text-center text-xs text-gray-400">Aucune rubrique disponible</div>
                    )}
                    {filteredCatalog.map(r => (
                      <label
                        key={r.code}
                        className={`flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-blue-50 border-b border-gray-50 ${newRubCode === r.code ? "bg-blue-50" : ""}`}
                      >
                        <input
                          type="radio"
                          name="newRub"
                          checked={newRubCode === r.code}
                          onChange={() => { setNewRubCode(r.code); setNewRubValue(String(r.init_val)); }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-mono text-xs text-gray-500 w-12">{r.code}</span>
                        <span className="flex-1 text-xs text-gray-700 truncate">{r.libelle}</span>
                        <span className="text-[10px] text-gray-400">C{r.classe}</span>
                        {r.formule && <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">f()</span>}
                      </label>
                    ))}
                  </div>
                  {newRubCode && (
                    <div className="flex items-center gap-3 pt-1">
                      <label className="text-xs text-gray-600">Valeur par défaut:</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newRubValue}
                        onChange={(e) => setNewRubValue(e.target.value)}
                        className="w-32 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                      <button
                        onClick={handleAddRubrique}
                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                      >
                        Confirmer l'ajout
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Code</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Libelle</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Classe</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Valeur</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Actions</th>
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
                              <button onClick={() => handleSaveRubrique(r.rubrique_code)} className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700">OK</button>
                              <button onClick={() => setEditingRubrique(null)} className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-300">Annuler</button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setEditingRubrique(r.rubrique_code); setEditValue(String(r.default_value)); }}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Modifier
                              </button>
                              <button
                                onClick={() => handleDeleteRubrique(r.rubrique_code, r.libelle ?? "")}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                Supprimer
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {detail.rubriques.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-gray-400 text-sm">Aucune rubrique. Cliquez sur « Ajouter une rubrique ».</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Employees */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Employés ({detail.employees.length})</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                {detail.employees.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
                    <span className="font-mono text-xs text-gray-500">{e.matricule}</span>
                    <span className="text-sm font-medium text-gray-900">{e.nom} {e.prenom}</span>
                    {!e.actif && <span className="text-xs text-red-500">Inactif</span>}
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
              <p className="mt-4 text-sm">Sélectionnez un profil de paie pour voir les détails</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
