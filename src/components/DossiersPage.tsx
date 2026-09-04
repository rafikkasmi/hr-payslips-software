import { useState, useEffect, useRef, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  api,
  type DossierRegistry,
  type DossierInfo,
  type DossierStats,
  type DossierConflictCheck,
  type BackupInfo,
} from "../lib/api";
import { DossierConflictDialog, type ImportMode } from "./DossierConflictDialog";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  Building2, Plus, Download, Trash2, Edit2, Check, X,
  Loader2, AlertCircle, RefreshCw, Users, FileText, Calculator, HardDrive,
  Search, Database, Archive, Table,
} from "lucide-react";
import { cn } from "../lib/utils";

interface DossiersPageProps {
  onNavigate?: (page: "dashboard") => void;
  onDossierChanged?: () => void;
}

interface ImportProgressEvent {
  step: string;
  current: number;
  total: number;
  message: string;
  overall_percent: number;
}

export function DossiersPage({ onDossierChanged }: DossiersPageProps) {
  const [registry, setRegistry] = useState<DossierRegistry | null>(null);
  const [statsMap, setStatsMap] = useState<Record<number, DossierStats>>({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DossierConflictCheck | null>(null);
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgressEvent | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DossierInfo | null>(null);
  const [deleteFile, setDeleteFile] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const loadRegistry = useCallback(async () => {
    try {
      const reg = await api.getDossiers();
      setRegistry(reg);
      const stats: Record<number, DossierStats> = {};
      for (const d of reg.dossiers) {
        try {
          stats[d.id] = await api.getDossierStats(d.id);
        } catch { /* ignore */ }
      }
      setStatsMap(stats);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      const list = await api.listBackups();
      setBackups(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadRegistry();
    loadBackups();
    // Trigger auto-backup check on page load
    api.autoBackupDossiers().catch(() => {});
  }, [loadRegistry, loadBackups]);

  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  // === Import flow ===
  const handleImport = async () => {
    setAction("import"); setError(null); setSuccess(null);
    try {
      const folder = await openDialog({ directory: true });
      if (!folder || Array.isArray(folder)) { setAction(null); return; }
      const folderPath = typeof folder === "string" ? folder : (folder as { path?: string }).path;
      if (!folderPath) { setAction(null); return; }

      const conflictCheck = await api.checkDossierConflict(folderPath);
      if (!conflictCheck.is_valid_pcpaie) {
        setError("Aucune donnée PCPAIE valide trouvée dans ce dossier.");
        setAction(null);
        return;
      }
      if (conflictCheck.existing_dossiers.length > 0 && conflictCheck.is_new_dossier) {
        setConflict(conflictCheck);
        setPendingFolder(folderPath);
        setAction(null);
        return;
      }
      await doImport(folderPath, "merge");
    } catch (e) {
      setError(String(e));
      setAction(null);
    }
  };

  const doImport = async (folderPath: string, mode: ImportMode) => {
    setConflict(null);
    setAction("import");
    setImportProgress(null);
    try {
      unlistenRef.current = await listen<ImportProgressEvent>("import-progress", (event) => {
        setImportProgress(event.payload);
      });
    } catch { /* ignore */ }
    try {
      await api.importPcpaieFolder(folderPath, mode);
      const modeLabel = mode === "separate" ? "créé séparément" :
                        mode === "replace" ? "remplacé" : "importé";
      setSuccess(`Dossier PCPAIE ${modeLabel} avec succès`);
      await loadRegistry();
      onDossierChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setAction(null);
      setPendingFolder(null);
      setImportProgress(null);
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    }
  };

  const handleConflictChoose = (mode: ImportMode) => {
    if (!pendingFolder) return;
    doImport(pendingFolder, mode);
  };

  // === Switch dossier ===
  const handleSwitch = async (id: number) => {
    if (id === registry?.active_dossier_id) return;
    setAction(`switch-${id}`);
    try {
      await api.switchDossier(id);
      await loadRegistry();
      onDossierChanged?.();
      setSuccess("Dossier activé");
    } catch (e) { setError(String(e)); }
    finally { setAction(null); }
  };

  // === Refresh (re-import) ===
  const handleRefresh = async (dossier: DossierInfo) => {
    try {
      const folder = await openDialog({ directory: true });
      if (!folder || Array.isArray(folder)) return;
      const folderPath = typeof folder === "string" ? folder : (folder as { path?: string }).path;
      if (!folderPath) return;

      setImportProgress(null);
      try {
        unlistenRef.current = await listen<ImportProgressEvent>("import-progress", (event) => {
          setImportProgress(event.payload);
        });
      } catch { /* ignore */ }

      setAction(`refresh-${dossier.id}`);
      await api.refreshDossier(dossier.id, folderPath);
      setSuccess(`Dossier « ${dossier.doss_nom} » rafraîchi avec succès`);
      await loadRegistry();
      onDossierChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setAction(null);
      setImportProgress(null);
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    }
  };

  // === Export ===
  const handleExport = async (dossier: DossierInfo) => {
    setAction(`export-${dossier.id}`);
    try {
      const destPath = await saveDialog({
        defaultPath: `${dossier.doss_nom.replace(/[^a-zA-Z0-9]/g, "_")}_backup.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!destPath) { setAction(null); return; }
      await api.backupDossier(dossier.id, destPath);
      setSuccess(`Base exportée vers: ${destPath}`);
    } catch (e) { setError(String(e)); }
    finally { setAction(null); }
  };

  // === Rename ===
  const handleRenameStart = (dossier: DossierInfo) => {
    setRenamingId(dossier.id);
    setRenameValue(dossier.doss_nom);
  };

  const handleRenameSave = async () => {
    if (renamingId === null || !renameValue.trim()) return;
    setAction(`rename-${renamingId}`);
    try {
      await api.renameDossier(renamingId, renameValue.trim());
      await loadRegistry();
      onDossierChanged?.();
      setSuccess("Dossier renommé");
    } catch (e) { setError(String(e)); }
    finally { setAction(null); setRenamingId(null); setRenameValue(""); }
  };

  const handleRenameCancel = () => { setRenamingId(null); setRenameValue(""); };

  // === Delete ===
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setAction(`delete-${deleteConfirm.id}`);
    try {
      await api.deleteDossier(deleteConfirm.id, deleteFile);
      await loadRegistry();
      onDossierChanged?.();
      setSuccess("Dossier supprimé");
    } catch (e) { setError(String(e)); }
    finally { setAction(null); setDeleteConfirm(null); }
  };

  // === Manual backup all ===
  const handleAutoBackup = async () => {
    setAction("backup");
    try {
      const created = await api.autoBackupDossiers();
      if (created.length > 0) {
        setSuccess(`${created.length} sauvegarde(s) créée(s) : ${created.join(", ")}`);
      } else {
        setSuccess("Sauvegardes de la semaine déjà à jour");
      }
      await loadBackups();
    } catch (e) { setError(String(e)); }
    finally { setAction(null); }
  };

  // === Helpers ===
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return iso; }
  };

  const filteredDossiers = registry?.dossiers.filter((d) =>
    d.doss_nom.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des dossiers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gérez vos dossiers PCPAIE : importer, basculer, rafraîchir, exporter, supprimer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoBackup}
            disabled={action !== null}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {action === "backup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Sauvegarde
          </button>
          <button
            onClick={handleImport}
            disabled={action !== null}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {action === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Importer un dossier
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <Check className="h-4 w-4 shrink-0" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Import progress */}
      {importProgress && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-blue-900">{importProgress.message}</span>
            <span className="text-blue-600">{importProgress.overall_percent.toFixed(0)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-200">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${importProgress.overall_percent}%` }} />
          </div>
          {importProgress.total > 0 && (
            <div className="mt-1 text-xs text-blue-500">{importProgress.current} / {importProgress.total}</div>
          )}
        </div>
      )}

      {/* Search + Compare toggle */}
      {(registry?.dossiers.length ?? 0) > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un dossier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowCompare(!showCompare)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              showCompare ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            <Table className="h-4 w-4" />
            Comparer
          </button>
        </div>
      )}

      {/* Comparative table */}
      {showCompare && (registry?.dossiers.length ?? 0) > 1 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Statistique</th>
                {filteredDossiers.map((d) => (
                  <th key={d.id} className="px-4 py-2 text-left font-semibold text-gray-600">
                    {d.doss_nom}
                    {d.id === registry?.active_dossier_id && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Actif</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-2 text-gray-500"><Users className="mr-2 inline h-4 w-4 text-blue-500" />Employés</td>
                {filteredDossiers.map((d) => (
                  <td key={d.id} className="px-4 py-2 font-medium text-gray-900">
                    {(statsMap[d.id]?.employee_count ?? 0).toLocaleString("fr-FR")}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-4 py-2 text-gray-500"><FileText className="mr-2 inline h-4 w-4 text-purple-500" />Rubriques</td>
                {filteredDossiers.map((d) => (
                  <td key={d.id} className="px-4 py-2 font-medium text-gray-900">
                    {(statsMap[d.id]?.rubrique_count ?? 0).toLocaleString("fr-FR")}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-500"><Calculator className="mr-2 inline h-4 w-4 text-green-500" />Bulletins</td>
                {filteredDossiers.map((d) => (
                  <td key={d.id} className="px-4 py-2 font-medium text-gray-900">
                    {(statsMap[d.id]?.paie_count ?? 0).toLocaleString("fr-FR")}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-4 py-2 text-gray-500"><HardDrive className="mr-2 inline h-4 w-4 text-orange-500" />Taille DB</td>
                {filteredDossiers.map((d) => (
                  <td key={d.id} className="px-4 py-2 font-medium text-gray-900">
                    {formatBytes(statsMap[d.id]?.db_size_bytes ?? 0)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-500">Dernière période</td>
                {filteredDossiers.map((d) => (
                  <td key={d.id} className="px-4 py-2 text-gray-700">
                    {statsMap[d.id]?.last_period ?? "—"}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50/50">
                <td className="px-4 py-2 text-gray-500">Importé le</td>
                {filteredDossiers.map((d) => (
                  <td key={d.id} className="px-4 py-2 text-gray-700">{formatDate(d.imported_at)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Dossier cards */}
      <div className="mt-6 space-y-3">
        {filteredDossiers.map((dossier) => {
          const stats = statsMap[dossier.id];
          const isActive = dossier.id === registry?.active_dossier_id;
          const isSwitching = action === `switch-${dossier.id}`;
          const isExporting = action === `export-${dossier.id}`;
          const isRenaming = action === `rename-${dossier.id}`;
          const isDeleting = action === `delete-${dossier.id}`;
          const isRefreshing = action === `refresh-${dossier.id}`;
          const isEditing = renamingId === dossier.id;

          return (
            <div
              key={dossier.id}
              className={cn(
                "rounded-xl border p-5 transition-colors",
                isActive ? "border-blue-300 bg-blue-50/50" : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", isActive ? "bg-blue-600" : "bg-gray-100")}>
                    <Building2 className={cn("h-5 w-5", isActive ? "text-white" : "text-gray-500")} />
                  </div>
                  <div>
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSave();
                            if (e.key === "Escape") handleRenameCancel();
                          }}
                          autoFocus
                          className="rounded-lg border border-blue-300 px-3 py-1 text-lg font-semibold text-gray-900 focus:border-blue-500 focus:outline-none"
                        />
                        <button onClick={handleRenameSave} disabled={isRenaming} className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-700">
                          {isRenaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button onClick={handleRenameCancel} className="rounded-lg bg-gray-200 p-1.5 text-gray-600 hover:bg-gray-300">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-lg font-semibold text-gray-900">{dossier.doss_nom}</h3>
                    )}
                    {!isEditing && (
                      <div className="mt-0.5 flex items-center gap-2">
                        {isActive && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Actif</span>}
                        <span className="text-xs text-gray-400">Importé le {formatDate(dossier.imported_at)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRefresh(dossier)}
                    disabled={action !== null}
                    title="Re-importer depuis PCPAIE (remplace les données)"
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Rafraîchir
                  </button>
                  {!isActive && (
                    <button
                      onClick={() => handleSwitch(dossier.id)}
                      disabled={action !== null}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      {isSwitching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Activer
                    </button>
                  )}
                  <button
                    onClick={() => handleExport(dossier)}
                    disabled={action !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Exporter
                  </button>
                  {!isEditing && (
                    <button
                      onClick={() => handleRenameStart(dossier)}
                      disabled={action !== null}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Renommer
                    </button>
                  )}
                  {registry && registry.dossiers.length > 1 && !isActive && (
                    <button
                      onClick={() => { setDeleteConfirm(dossier); setDeleteFile(true); }}
                      disabled={action !== null}
                      className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Supprimer
                    </button>
                  )}
                </div>
              </div>

              {/* Stats */}
              {stats && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5">
                    <Users className="h-4 w-4 text-blue-500" />
                    <div><div className="text-xs text-gray-400">Employés</div><div className="text-sm font-semibold text-gray-900">{stats.employee_count.toLocaleString("fr-FR")}</div></div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5">
                    <FileText className="h-4 w-4 text-purple-500" />
                    <div><div className="text-xs text-gray-400">Rubriques</div><div className="text-sm font-semibold text-gray-900">{stats.rubrique_count.toLocaleString("fr-FR")}</div></div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5">
                    <Calculator className="h-4 w-4 text-green-500" />
                    <div><div className="text-xs text-gray-400">Bulletins</div><div className="text-sm font-semibold text-gray-900">{stats.paie_count.toLocaleString("fr-FR")}</div></div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5">
                    <HardDrive className="h-4 w-4 text-orange-500" />
                    <div><div className="text-xs text-gray-400">Taille DB</div><div className="text-sm font-semibold text-gray-900">{formatBytes(stats.db_size_bytes)}</div></div>
                  </div>
                </div>
              )}
              {stats?.last_period && <div className="mt-2 text-xs text-gray-400">Dernière période de paie : {stats.last_period}</div>}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {registry?.dossiers.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">Aucun dossier importé. Cliquez sur « Importer un dossier » pour commencer.</p>
        </div>
      )}

      {/* No search results */}
      {registry && registry.dossiers.length > 0 && filteredDossiers.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">Aucun dossier trouvé pour « {searchQuery} »</p>
        </div>
      )}

      {/* Backups section */}
      {backups.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Sauvegardes automatiques ({backups.length})
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Sauvegardes hebdomadaires automatiques (conservées 4 semaines)
          </p>
          <div className="mt-3 space-y-1.5">
            {backups.slice(0, 10).map((b) => (
              <div key={b.path} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-700">{b.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>{formatBytes(b.size_bytes)}</span>
                  <span>{formatDate(b.modified)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflict dialog */}
      {conflict && (
        <DossierConflictDialog
          conflict={conflict}
          onChoose={handleConflictChoose}
          onCancel={() => { setConflict(null); setPendingFolder(null); }}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Supprimer le dossier</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Êtes-vous sûr de vouloir supprimer le dossier
                  <span className="font-semibold"> {deleteConfirm.doss_nom}</span> ? Cette action est irréversible.
                </p>
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={deleteFile} onChange={(e) => setDeleteFile(e.target.checked)} className="rounded border-gray-300" />
              Supprimer également le fichier de base de données
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100">Annuler</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
