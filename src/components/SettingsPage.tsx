import { useState, useEffect } from "react";
import {
  api,
  type FieldMapping,
  type LookupTablePreview,
} from "../lib/api";
import {
  Settings, Database, SlidersHorizontal, Download, Upload,
  Loader2, Save, Check, AlertCircle, Eye, EyeOff,
  Table2, ChevronDown, ChevronRight, Search, RefreshCw, HardDrive,
} from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

type Tab = "mapping" | "preferences" | "data" | "import";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("mapping");
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [lookupTables, setLookupTables] = useState<string[]>([]);
  const [empColumns, setEmpColumns] = useState<string[]>([]);
  const [allLookupPreview, setAllLookupPreview] = useState<Record<string, LookupTablePreview> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    setLoading(true);
    try {
      const [m, lt, ec, preview] = await Promise.all([
        api.getFieldMappings(),
        api.getAvailableLookupTables(),
        api.getAvailableEmployeeColumns(),
        api.getAllLookupTablesPreview(),
      ]);
      setMappings(m);
      setLookupTables(lt);
      setEmpColumns(ec);
      setAllLookupPreview(preview);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (m: FieldMapping) => {
    setSaving(m.id);
    setError(null);
    try {
      await api.updateFieldMapping({
        id: m.id,
        display_label: m.display_label,
        employee_column: m.employee_column,
        lookup_table: m.lookup_table,
        section: m.section,
        is_visible: m.is_visible,
      });
      setSaved(m.id);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  const updateMapping = (id: number, field: keyof FieldMapping, value: string | boolean | null) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
    { id: "mapping", label: "Mapping PCPAIE", icon: Database },
    { id: "preferences", label: "Préférences", icon: SlidersHorizontal },
    { id: "data", label: "Données", icon: Database },
    { id: "import", label: "Import/Export", icon: Download },
  ];

  const sections = [...new Set(mappings.map(m => m.section))];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3">
        <Settings className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
          <p className="text-sm text-gray-500">Configuration de l'application et mapping des données PCPAIE</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Content */}
      <div className="mt-6">
        {tab === "mapping" && (
          <MappingTab
            mappings={mappings}
            sections={sections}
            lookupTables={lookupTables}
            empColumns={empColumns}
            allLookupPreview={allLookupPreview}
            loading={loading}
            saving={saving}
            saved={saved}
            onUpdate={updateMapping}
            onSave={handleSave}
          />
        )}
        {tab === "preferences" && <PreferencesTab />}
        {tab === "data" && <DataTab />}
        {tab === "import" && <ImportExportTab />}
      </div>
    </div>
  );
}

function MappingTab({
  mappings, sections, lookupTables, empColumns, allLookupPreview,
  loading, saving, saved, onUpdate, onSave,
}: {
  mappings: FieldMapping[];
  sections: string[];
  lookupTables: string[];
  empColumns: string[];
  allLookupPreview: Record<string, LookupTablePreview> | null;
  loading: boolean;
  saving: number | null;
  saved: number | null;
  onUpdate: (id: number, field: keyof FieldMapping, value: string | boolean | null) => void;
  onSave: (m: FieldMapping) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [savedAll, setSavedAll] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const handleUpdate = (id: number, field: keyof FieldMapping, value: string | boolean | null) => {
    onUpdate(id, field, value);
    setDirtyIds(prev => new Set([...prev, id]));
  };

  const handleSaveOne = async (m: FieldMapping) => {
    await onSave(m);
    setDirtyIds(prev => { const n = new Set(prev); n.delete(m.id); return n; });
  };

  const handleSaveAll = async () => {
    setSavingAll(true);
    for (const m of mappings) {
      if (dirtyIds.has(m.id)) {
        await onSave(m);
      }
    }
    setDirtyIds(new Set());
    setSavingAll(false);
    setSavedAll(true);
    setTimeout(() => setSavedAll(false), 2000);
  };

  return (
    <div>
      <div className="mb-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold">Mapping des données PCPAIE</p>
        <p className="mt-1">
          Configurez comment les champs de la base SQL correspondent aux tables de lookup PCPAIE.
          Chaque champ définit: le libellé affiché, la colonne employee, et la table de lookup pour traduire le code.
        </p>
      </div>

      {/* Toggle for lookup preview panel + Save all */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Table2 className="h-4 w-4" />
          {showPreview ? "Masquer" : "Afficher"} les tables de lookup
        </button>
        {allLookupPreview && (
          <span className="text-xs text-gray-500">
            {Object.keys(allLookupPreview).length} tables · {Object.values(allLookupPreview).reduce((s, t) => s + t.total, 0)} valeurs au total
          </span>
        )}
        {dirtyIds.size > 0 && (
          <button
            onClick={handleSaveAll}
            disabled={savingAll}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAll ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Tout sauvegarder ({dirtyIds.size})
          </button>
        )}
      </div>

      {/* Lookup preview panel */}
      {showPreview && allLookupPreview && (
        <LookupPreviewPanel
          preview={allLookupPreview}
          expandedTable={expandedTable}
          setExpandedTable={setExpandedTable}
          search={previewSearch}
          setSearch={setPreviewSearch}
        />
      )}

      {sections.map(section => (
        <div key={section} className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{section}</h3>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Libellé affiché</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Colonne employee</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Table lookup</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Visible</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mappings.filter(m => m.section === section).map(m => (
                  <tr key={m.id} className={`hover:bg-gray-50 ${dirtyIds.has(m.id) ? "bg-yellow-50" : ""}`}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={m.display_label}
                        onChange={(e) => handleUpdate(m.id, "display_label", e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={m.employee_column}
                        onChange={(e) => handleUpdate(m.id, "employee_column", e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        {empColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={m.lookup_table ?? ""}
                        onChange={(e) => handleUpdate(m.id, "lookup_table", e.target.value || null)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">(aucune — valeur brute)</option>
                        {lookupTables.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleUpdate(m.id, "is_visible", !m.is_visible)}
                        className="rounded p-1 hover:bg-gray-100"
                      >
                        {m.is_visible
                          ? <Eye className="h-4 w-4 text-green-600" />
                          : <EyeOff className="h-4 w-4 text-gray-400" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleSaveOne(m)}
                        disabled={saving === m.id}
                        className="rounded p-1 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {saving === m.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        ) : saved === m.id ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Save className="h-4 w-4 text-blue-600" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreferencesTab() {
  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700">Préférences de l'application</h3>
      <p className="mt-2 text-sm text-gray-500">
        Les préférences (langue, thème, format de date, format de devise) seront disponibles ici.
      </p>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <span className="text-sm text-gray-700">Langue de l'interface</span>
          <span className="text-sm text-gray-400">Français (à venir)</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <span className="text-sm text-gray-700">Format de devise</span>
          <span className="text-sm text-gray-400">DZD (à venir)</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <span className="text-sm text-gray-700">Thème</span>
          <span className="text-sm text-gray-400">Clair (à venir)</span>
        </div>
      </div>
    </div>
  );
}

function DataTab() {
  const [action, setAction] = useState<"recompute" | "sync" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api.getDatabaseStats().then(setStats).catch(() => {});
  }, []);

  const handleRecompute = async () => {
    setAction("recompute"); setResult(null); setError(null);
    try {
      await api.recomputePosteStats();
      setResult("Statistiques recalculées avec succès");
    } catch (e) { setError(String(e)); }
    finally { setAction(null); }
  };

  const handleSync = async () => {
    setAction("sync"); setResult(null); setError(null);
    try {
      await api.syncPostesFromFnc();
      setResult("Profils de paie synchronisés avec succès");
    } catch (e) { setError(String(e)); }
    finally { setAction(null); }
  };

  return (
    <div className="space-y-4">
      {/* Database stats */}
      {stats && (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">État de la base de données</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(stats).map(([key, val]) => (
              <div key={key} className="rounded bg-gray-50 p-2 text-center">
                <p className="text-lg font-bold text-gray-800">
                  {key === "db_size_bytes" ? `${(val / 1024 / 1024).toFixed(1)} MB` : val}
                </p>
                <p className="text-xs text-gray-500">{key === "db_size_bytes" ? "Taille DB" : key}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700">Gestion des données</h3>
        <p className="mt-2 text-sm text-gray-500">
          Réinitialiser, purger ou réparer les données de l'application.
        </p>

        {result && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <Check className="h-4 w-4" /> {result}
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Recalculer les statistiques des postes</p>
              <p className="text-xs text-gray-500">Masse salariale, ancienneté, effectifs</p>
            </div>
            <button
              onClick={handleRecompute}
              disabled={action !== null}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {action === "recompute" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Recalculer
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Synchroniser les profils de paie depuis FNC</p>
              <p className="text-xs text-gray-500">Recréer les postes depuis les codes FNC</p>
            </div>
            <button
              onClick={handleSync}
              disabled={action !== null}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {action === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Synchroniser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportExportTab() {
  const [action, setAction] = useState<"export" | "import" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setAction("export"); setResult(null); setError(null);
    try {
      const destPath = await saveDialog({
        defaultPath: `hamtech_paie_backup_${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!destPath) { setAction(null); return; }
      const saved = await api.exportDatabase(destPath);
      setResult(`Base exportée vers: ${saved}`);
    } catch (e) { setError(String(e)); }
    finally { setAction(null); }
  };

  const handleImport = async () => {
    setAction("import"); setResult(null); setError(null);
    try {
      const folder = await openDialog({ directory: true });
      if (!folder || Array.isArray(folder)) { setAction(null); return; }
      const folderPath = typeof folder === "string" ? folder : (folder as { path?: string }).path;
      if (!folderPath) { setAction(null); return; }
      await api.importPcpaieFolder(folderPath);
      setResult("Dossier PCPAIE importé avec succès");
    } catch (e) { setError(String(e)); }
    finally { setAction(null); }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700">Import / Export</h3>
      <p className="mt-2 text-sm text-gray-500">
        Exporter ou importer les données de l'application.
      </p>

      {result && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <Check className="h-4 w-4" /> {result}
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Exporter la base de données</p>
            <p className="text-xs text-gray-500">Sauvegarde complète au format SQLite</p>
          </div>
          <button
            onClick={handleExport}
            disabled={action !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {action === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exporter
          </button>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Importer un dossier PCPAIE</p>
            <p className="text-xs text-gray-500">Réimporter depuis un dossier .DTA</p>
          </div>
          <button
            onClick={handleImport}
            disabled={action !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {action === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Importer
          </button>
        </div>
      </div>
    </div>
  );
}

function LookupPreviewPanel({
  preview,
  expandedTable,
  setExpandedTable,
  search,
  setSearch,
}: {
  preview: Record<string, LookupTablePreview>;
  expandedTable: string | null;
  setExpandedTable: (t: string | null) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const tableNames = Object.keys(preview).sort();
  const q = search.toLowerCase();

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white">
      {/* Header with search */}
      <div className="border-b border-gray-200 p-3">
        <div className="flex items-center gap-3">
          <Table2 className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Aperçu des tables de lookup PCPAIE</h3>
          <div className="relative ml-auto w-64">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans les valeurs..."
              className="w-full rounded border border-gray-300 py-1 pl-7 pr-2 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Tables list */}
      <div className="max-h-96 overflow-y-auto">
        {tableNames.map(tableName => {
          const data = preview[tableName];
          const isExpanded = expandedTable === tableName;
          const filteredValues = q
            ? data.values.filter(v =>
                v.code.toLowerCase().includes(q) ||
                v.libelle.toLowerCase().includes(q)
              )
            : data.values;
          const matchCount = q ? filteredValues.length : data.total;

          return (
            <div key={tableName} className="border-b border-gray-100 last:border-0">
              <button
                onClick={() => setExpandedTable(isExpanded ? null : tableName)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-gray-400" />
                  : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <span className="font-mono font-semibold text-gray-700">{tableName}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {matchCount} valeur{matchCount > 1 ? "s" : ""}
                </span>
                {/* Show first 3 libelles as preview when collapsed */}
                {!isExpanded && !q && (
                  <span className="ml-2 truncate text-xs text-gray-400">
                    {data.values.slice(0, 3).map(v => v.libelle).join(" · ")}
                    {data.total > 3 && ` · +${data.total - 3}`}
                  </span>
                )}
              </button>
              {isExpanded && (
                <div className="bg-gray-50 px-3 pb-2">
                  <div className="grid max-h-60 grid-cols-1 gap-x-4 gap-y-0.5 overflow-y-auto py-2 sm:grid-cols-2">
                    {filteredValues.map(v => (
                      <div key={v.code} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white">
                        <span className="font-mono font-semibold text-blue-700">{v.code}</span>
                        <span className="text-gray-600">{v.libelle}</span>
                      </div>
                    ))}
                    {filteredValues.length === 0 && (
                      <div className="col-span-2 py-2 text-center text-xs text-gray-400">
                        Aucune valeur ne correspond à "{search}"
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* When searching, show inline results even for collapsed tables with matches */}
              {!isExpanded && q && filteredValues.length > 0 && filteredValues.length <= 5 && (
                <div className="bg-yellow-50 px-6 pb-2">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    {filteredValues.map(v => (
                      <div key={v.code} className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-700">{v.code}</span>
                        <span className="text-gray-600">{v.libelle}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
