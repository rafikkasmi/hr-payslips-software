import { useState, useEffect, useMemo, useCallback } from "react";
import { api, type EmployeeSummary, type EmployeeFilterOptions } from "../lib/api";
import {
  Search, X, Users, ChevronLeft, ChevronRight, Loader2,
  Filter, UserCheck,
} from "lucide-react";

const PAGE_SIZE = 12;

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (emp: EmployeeSummary) => void;
  selectedEmpId?: number | null;
}

export function EmployeePickerModal({ open, onClose, onSelect, selectedEmpId }: Props) {
  const [allEmployees, setAllEmployees] = useState<EmployeeSummary[]>([]);
  const [filterOptions, setFilterOptions] = useState<EmployeeFilterOptions | null>(null);
  const [loading, setLoading] = useState(false);

  // Search & filters
  const [search, setSearch] = useState("");
  const [fPoste, setFPoste] = useState<number | null>(null);
  const [fSection, setFSection] = useState<string | null>(null);
  const [fStructure, setFStructure] = useState<string | null>(null);
  const [fUnite, setFUnite] = useState<string | null>(null);
  const [fCategorie, setFCategorie] = useState<string | null>(null);
  const [fSexe, setFSexe] = useState<string | null>(null);
  const [fActifOnly, setFActifOnly] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  // Load filter options once
  useEffect(() => {
    if (!open || filterOptions) return;
    (async () => {
      try {
        const opts = await api.getEmployeeFilterOptions();
        setFilterOptions(opts);
      } catch (e) { console.error(e); }
    })();
  }, [open, filterOptions]);

  // Load employees with server-side filters
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const emps = await api.getEmployees({
        search: search || null,
        actif_only: fActifOnly,
        poste_id: fPoste,
        section: fSection,
        structure: fStructure,
        unite: fUnite,
        categorie: fCategorie,
        sexe: fSexe,
      });
      setAllEmployees(emps);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, [search, fActifOnly, fPoste, fSection, fStructure, fUnite, fCategorie, fSexe]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { loadEmployees(); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [open, loadEmployees]);

  // Load on open
  useEffect(() => {
    if (open) loadEmployees();
  }, [open]); // eslint-disable-line

  const hasActiveFilters = !!(fPoste || fSection || fStructure || fUnite || fCategorie || fSexe || !fActifOnly);

  const resetFilters = () => {
    setFPoste(null); setFSection(null); setFStructure(null);
    setFUnite(null); setFCategorie(null); setFSexe(null);
    setFActifOnly(true); setSearch("");
  };

  const totalPages = Math.max(1, Math.ceil(allEmployees.length / PAGE_SIZE));
  const paged = allEmployees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-[900px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Sélectionner un employé</h2>
            <span className="text-xs text-gray-400">({allEmployees.length} trouvés)</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par nom, prénom, matricule..."
                className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${showFilters || hasActiveFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              <Filter className="h-4 w-4" />
              Filtres
              {hasActiveFilters && <span className="ml-0.5 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">!</span>}
            </button>
            {(hasActiveFilters || search) && (
              <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700 underline">
                Réinitialiser
              </button>
            )}
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-4">
              <div>
                <label className="text-xs text-gray-500">Fonction / Poste</label>
                <select value={fPoste != null ? String(fPoste) : ""} onChange={e => setFPoste(e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Tous</option>
                  {filterOptions?.postes.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
              {filterOptions?.sections && filterOptions.sections.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500">Section</label>
                  <select value={fSection ?? ""} onChange={e => setFSection(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="">Toutes</option>
                    {filterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {filterOptions?.structures && filterOptions.structures.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500">Structure</label>
                  <select value={fStructure ?? ""} onChange={e => setFStructure(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="">Toutes</option>
                    {filterOptions.structures.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {filterOptions?.unites && filterOptions.unites.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500">Unité</label>
                  <select value={fUnite ?? ""} onChange={e => setFUnite(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="">Toutes</option>
                    {filterOptions.unites.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
              {filterOptions?.categories && filterOptions.categories.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500">Catégorie</label>
                  <select value={fCategorie ?? ""} onChange={e => setFCategorie(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="">Toutes</option>
                    {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500">Sexe</label>
                <select value={fSexe ?? ""} onChange={e => setFSexe(e.target.value || null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Tous</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={fActifOnly} onChange={e => setFActifOnly(e.target.checked)} className="h-3.5 w-3.5" />
                  Actifs seulement
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Results table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : paged.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Aucun employé trouvé. Ajustez votre recherche ou vos filtres.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Matricule</th>
                  <th className="px-4 py-2 text-left font-medium">Nom</th>
                  <th className="px-4 py-2 text-left font-medium">Poste</th>
                  <th className="px-4 py-2 text-left font-medium">Section</th>
                  <th className="px-4 py-2 text-left font-medium">Statut</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map(emp => (
                  <tr
                    key={emp.id}
                    className={`hover:bg-blue-50 ${selectedEmpId === emp.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{emp.matricule}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{emp.nom} {emp.prenom}</div>
                      {emp.fnc_code && <div className="text-[10px] text-gray-400">FNC: {emp.fnc_code}</div>}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{emp.poste_name ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{emp.section ?? "—"}</td>
                    <td className="px-4 py-2">
                      {emp.actif
                        ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">Actif</span>
                        : <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">Inactif</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => { onSelect(emp); onClose(); }}
                        className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Sélectionner
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {allEmployees.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-2 text-xs text-gray-500">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, allEmployees.length)} sur {allEmployees.length}
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
    </div>
  );
}
