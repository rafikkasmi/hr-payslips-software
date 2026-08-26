import { useState, useEffect } from "react";
import { api, type PointeuseImportResult, type FuzzyMatchResult } from "../lib/api";
import {
  Fingerprint, Upload, CheckCircle, Link2, Loader2,
  Trash2, Zap, CheckSquare, Square, Save, FolderOpen,
} from "lucide-react";

export function PointeusePage() {
  const [userDatPath, setUserDatPath] = useState("");
  const [attlogPaths, setAttlogPaths] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<PointeuseImportResult | null>(null);
  const [matches, setMatches] = useState<FuzzyMatchResult[]>([]);
  const [error, setError] = useState("");
  const [selectedPins, setSelectedPins] = useState<Set<number>>(new Set());
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<string>("");
  const [clearing, setClearing] = useState(false);
  const [savedPaths, setSavedPaths] = useState<{ userDat: string | null; attlogDir: string | null }>({ userDat: null, attlogDir: null });
  const [savingPaths, setSavingPaths] = useState(false);
  const [attlogDir, setAttlogDir] = useState("");

  useEffect(() => {
    loadSavedSettings();
  }, []);

  const loadSavedSettings = async () => {
    try {
      const s = await api.getImportSettings() as Record<string, unknown>;
      const ud = (s.user_dat_path as string) ?? null;
      const ad = (s.attlog_dir as string) ?? null;
      setSavedPaths({ userDat: ud, attlogDir: ad });
      if (ud && !userDatPath) setUserDatPath(ud);
      if (ad && !attlogDir) setAttlogDir(ad);
    } catch (e) { console.error(e); }
  };

  const handleSavePaths = async () => {
    setSavingPaths(true);
    try {
      await api.saveImportSettings(userDatPath || null, attlogDir || null, null);
      await loadSavedSettings();
    } catch (e) { console.error(e); }
    finally { setSavingPaths(false); }
  };

  const pickAttlogDir = async () => {
    try {
      const selected = await api.pickDirectory();
      if (selected && typeof selected === "string") setAttlogDir(selected);
    } catch (e) { console.error(e); }
  };

  const handleQuickReimport = async () => {
    if (!savedPaths.userDat) return;
    setImporting(true);
    setError("");
    try {
      let paths = attlogPaths;
      if (savedPaths.attlogDir) {
        const scanned = await api.scanAttlogDir(savedPaths.attlogDir);
        if (scanned.length > 0) paths = scanned;
      }
      const result = await api.importPointeuse(savedPaths.userDat, paths);
      setImportResult(result);
      const m = await api.getFuzzyMatches();
      setMatches(m);
      setSelectedPins(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const pickUserDat = async () => {
    try {
      const selected = await api.pickFile([{ name: "user.dat", extensions: ["dat"] }]);
      if (selected && typeof selected === "string") setUserDatPath(selected);
    } catch (e) { console.error(e); }
  };

  const pickAttlogs = async () => {
    try {
      const selected = await api.pickFiles([{ name: "attlog files", extensions: ["dat"] }]);
      if (Array.isArray(selected)) {
        setAttlogPaths(selected.filter((s): s is string => typeof s === "string"));
      }
    } catch (e) { console.error(e); }
  };

  const handleImport = async () => {
    if (!userDatPath) return;
    setImporting(true);
    setError("");
    setAutoMatchResult("");
    try {
      const result = await api.importPointeuse(userDatPath, attlogPaths);
      setImportResult(result);
      const m = await api.getFuzzyMatches();
      setMatches(m);
      setSelectedPins(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleLink = async (pin: number, employeeId: number | null) => {
    if (!employeeId) return;
    try {
      await api.linkUserToEmployee(pin, employeeId);
      setMatches(await api.getFuzzyMatches());
    } catch (e) { console.error(e); }
  };

  const handleAutoMatch = async () => {
    setAutoMatching(true);
    setAutoMatchResult("");
    try {
      const count = await api.autoMatchAll(60.0);
      setAutoMatchResult(`Auto-linked ${count} users to employees.`);
      setMatches(await api.getFuzzyMatches());
      setSelectedPins(new Set());
    } catch (e) {
      setAutoMatchResult(`Error: ${e}`);
    } finally {
      setAutoMatching(false);
    }
  };

  const handleClearData = async () => {
    if (!confirm("Are you sure? This will delete ALL pointeuse users, attendance records, and clear employee PINs.")) return;
    setClearing(true);
    try {
      await api.clearPointeuseData();
      setMatches([]);
      setImportResult(null);
      setAutoMatchResult("");
      setSelectedPins(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setClearing(false);
    }
  };

  const togglePin = (pin: number) => {
    setSelectedPins(prev => {
      const next = new Set(prev);
      if (next.has(pin)) next.delete(pin);
      else next.add(pin);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPins(new Set(matches.filter(m => m.best_employee_id).map(m => m.pin)));
  };

  const selectNone = () => {
    setSelectedPins(new Set());
  };

  const handleBulkLink = async () => {
    const links: [number, number][] = [];
    for (const m of matches) {
      if (selectedPins.has(m.pin) && m.best_employee_id) {
        links.push([m.pin, m.best_employee_id]);
      }
    }
    if (links.length === 0) return;
    try {
      await api.bulkLinkUsers(links);
      setMatches(await api.getFuzzyMatches());
      setSelectedPins(new Set());
    } catch (e) { console.error(e); }
  };

  const linkedCount = matches.filter(m => m.confirmed).length;
  const unlinkedMatches = matches.filter(m => !m.confirmed && m.best_employee_id);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pointeuse</h1>
          <p className="mt-1 text-sm text-gray-500">Import biometric time clock data and match users to employees</p>
        </div>
        {matches.length > 0 && (
          <button
            onClick={handleClearData}
            disabled={clearing}
            className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear All Pointeuse Data
          </button>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Import Pointeuse Data</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">user.dat file</label>
            <div className="flex gap-2">
              <input value={userDatPath} onChange={(e) => setUserDatPath(e.target.value)} placeholder="Path to user.dat" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={pickUserDat} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Browse</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">attlog files (one or more)</label>
            <div className="flex gap-2">
              <input
                value={attlogPaths.join(", ")}
                readOnly
                placeholder="Select attlog .dat files"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button onClick={pickAttlogs} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Browse Files</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Or select attlog directory (for Quick Re-import)</label>
            <div className="flex gap-2">
              <input value={attlogDir} onChange={(e) => setAttlogDir(e.target.value)} placeholder="Path to attlog directory" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={pickAttlogDir} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Browse</button>
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              disabled={!userDatPath || importing}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import & Match
            </button>
            <button
              onClick={handleSavePaths}
              disabled={!userDatPath || savingPaths}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {savingPaths ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Path
            </button>
            {savedPaths.userDat && (
              <button
                onClick={handleQuickReimport}
                disabled={importing}
                className="flex items-center gap-2 rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                Quick Re-import
              </button>
            )}
          </div>
          {(savedPaths.userDat || savedPaths.attlogDir) && (
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-0.5">
              {savedPaths.userDat && <div><strong>user.dat:</strong> {savedPaths.userDat}</div>}
              {savedPaths.attlogDir && <div><strong>attlog dir:</strong> {savedPaths.attlogDir}</div>}
            </div>
          )}
        </div>

        {importResult && (
          <div className="mt-4 rounded-lg bg-green-50 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-900">Import complete!</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
              <div><span className="text-green-700">Users:</span> <strong>{importResult.users_imported}</strong></div>
              <div><span className="text-green-700">Attendance entries:</span> <strong>{importResult.attlog_entries}</strong></div>
              <div><span className="text-green-700">Unmatched PINs:</span> <strong>{importResult.unmatched_pins.length}</strong></div>
              <div>
                <span className="text-green-700">Date range:</span>{" "}
                <strong>
                  {importResult.date_range_start && importResult.date_range_end
                    ? `${importResult.date_range_start} → ${importResult.date_range_end}`
                    : "—"}
                </strong>
              </div>
            </div>
            {importResult.per_user_counts && importResult.per_user_counts.length > 0 && (
              <div className="mt-3 border-t border-green-200 pt-2">
                <h4 className="text-xs font-semibold text-green-800 mb-1">PUNCHES PER USER (top 10)</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-h-40 overflow-y-auto">
                  {importResult.per_user_counts.slice(0, 10).map(([pin, name, count]) => (
                    <div key={pin} className="flex justify-between text-xs">
                      <span className="text-gray-700 truncate">{name}</span>
                      <span className="font-medium text-gray-900 ml-2">{count}</span>
                    </div>
                  ))}
                </div>
                {importResult.per_user_counts.length > 10 && (
                  <p className="text-xs text-gray-500 mt-1">+ {importResult.per_user_counts.length - 10} more users</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {matches.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Fuzzy Name Matching</h2>
              <p className="mt-1 text-sm text-gray-500">
                {linkedCount} linked / {matches.length} total — {unlinkedMatches.length} pending
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAutoMatch}
                disabled={autoMatching}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {autoMatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Auto-Match All (score ≥ 60%)
              </button>
            </div>
          </div>

          {autoMatchResult && (
            <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
            {autoMatchResult}
            </div>
          )}

          {/* Bulk actions bar */}
          <div className="mt-4 flex items-center gap-3 border-b border-gray-200 pb-3">
            <button onClick={selectAll} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
              <CheckSquare className="h-4 w-4" /> Select All Pending
            </button>
            <button onClick={selectNone} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
              <Square className="h-4 w-4" /> Deselect All
            </button>
            {selectedPins.size > 0 && (
              <button
                onClick={handleBulkLink}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Link2 className="h-3 w-3" /> Link Selected ({selectedPins.size})
              </button>
            )}
          </div>

          {/* Match list */}
          <div className="mt-3 max-h-[500px] overflow-y-auto space-y-1.5">
            {matches.map((m) => {
              const isSelected = selectedPins.has(m.pin);
              const isLinked = m.confirmed;
              const scoreColor = m.best_score >= 80 ? "text-green-600" : m.best_score >= 60 ? "text-yellow-600" : "text-red-600";

              return (
                <div
                  key={m.pin}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                    isLinked ? "border-green-200 bg-green-50" : isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  {!isLinked && m.best_employee_id && (
                    <button onClick={() => togglePin(m.pin)} className="flex-shrink-0">
                      {isSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-gray-400" />}
                    </button>
                  )}
                  <Fingerprint className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      PIN {m.pin}: {m.pointeuse_name}
                      {isLinked && <span className="ml-2 text-xs text-green-600 font-medium">✓ Linked</span>}
                    </div>
                    {m.best_employee_id ? (
                      <div className="text-xs text-gray-500">
                        → {m.best_nom} {m.best_prenom} (mat={m.best_matricule}) — <span className={scoreColor}>Score: {m.best_score.toFixed(1)}%</span>
                      </div>
                    ) : (
                      <div className="text-xs text-red-500">No match found</div>
                    )}
                  </div>
                  {!isLinked && m.best_employee_id && (
                    <button
                      onClick={() => handleLink(m.pin, m.best_employee_id)}
                      className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <Link2 className="h-3 w-3" /> Link
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
