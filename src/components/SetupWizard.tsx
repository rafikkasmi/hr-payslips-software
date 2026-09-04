import { useState, useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  api,
  type PcpaieFolderScan,
  type FolderImportResult,
} from "../lib/api";
import {
  Database,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  FolderOpen,
  FileText,
  Users,
  Clock,
  HardDrive,
} from "lucide-react";

interface SetupWizardProps {
  onComplete: () => void;
  onGoToDossiers?: () => void;
}

/** Progress event from the backend during import */
interface ImportProgressEvent {
  step: string;
  current: number;
  total: number;
  message: string;
  overall_percent: number;
}

/** Step metadata for display */
const STEP_LABELS: Record<string, { label: string; icon: typeof Database }> = {
  rubriques: { label: "Rubriques & formules (RUBRIQUEX.DTA)", icon: Database },
  employees: { label: "Employés (PERS0.DTA)", icon: Users },
  pers2: { label: "Adresses & contacts (PERS2.DTA)", icon: FileText },
  pers1: { label: "Affectations rubriques (PERS1.DTA)", icon: FileText },
  paies: { label: "Historique de paie (PAIES.DTA) — chunks parallèles", icon: HardDrive },
  lookups: { label: "Valeurs de lookup (VALEURS.DTA)", icon: FileText },
  company: { label: "Infos entreprise (DOSSIER.DTA)", icon: Database },
  postes: { label: "Génération des postes", icon: Users },
  pointeuse: { label: "Données pointeuse", icon: Clock },
  finalizing: { label: "Finalisation", icon: CheckCircle },
  done: { label: "Terminé", icon: CheckCircle },
};

/** Phases for the timeline — shows parallel execution */
const PHASES = [
  {
    name: "Phase 1 — Parallèle (3 threads)",
    steps: ["rubriques", "lookups", "company"],
    color: "blue",
  },
  {
    name: "Phase 2 — Séquentiel",
    steps: ["employees"],
    color: "blue",
  },
  {
    name: "Phase 3 — Parallèle (2 threads)",
    steps: ["pers1", "pers2"],
    color: "blue",
  },
  {
    name: "Phase 4 — Chunks parallèles (rayon)",
    steps: ["paies"],
    color: "purple",
  },
  {
    name: "Phase 5 — Post-traitement",
    steps: ["postes", "finalizing"],
    color: "blue",
  },
];

export function SetupWizard({ onComplete, onGoToDossiers }: SetupWizardProps) {
  const [step, setStep] = useState<
    "select" | "scanning" | "preview" | "importing" | "done" | "error"
  >("select");
  const [folderPath, setFolderPath] = useState("");
  const [scan, setScan] = useState<PcpaieFolderScan | null>(null);
  const [result, setResult] = useState<FolderImportResult | null>(null);
  const [error, setError] = useState("");

  // Import progress state
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Clean up event listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const handlePickFolder = async () => {
    try {
      const selected = await api.pickDirectory();
      if (selected && typeof selected === "string") {
        setFolderPath(selected);
        setStep("scanning");
        setError("");
        try {
          const scanResult = await api.scanPcpaieDir(selected);
          setScan(scanResult);
          setStep("preview");
        } catch (e) {
          setError(String(e));
          setStep("error");
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImport = async () => {
    if (!folderPath) return;
    setStep("importing");
    setError("");
    setProgress(null);
    setCompletedSteps(new Set());

    // Listen to import-progress events from the backend
    try {
      unlistenRef.current = await listen<ImportProgressEvent>(
        "import-progress",
        (event) => {
          const p = event.payload;
          setProgress(p);

          // Mark step as completed when current >= total
          if (p.total > 0 && p.current >= p.total) {
            setCompletedSteps((prev) => new Set(prev).add(p.step));
          }
          // Also mark "done" step
          if (p.step === "done") {
            setCompletedSteps((prev) => new Set(prev).add("done"));
          }
        }
      );
    } catch (e) {
      console.warn("Could not listen to import-progress events:", e);
    }

    try {
      const res = await api.importPcpaieFolder(folderPath, "merge");
      setResult(res);
      setStep("done");
      // Clean up listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    } catch (e) {
      setError(String(e));
      setStep("error");
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  };

  const handleReset = () => {
    setStep("select");
    setFolderPath("");
    setScan(null);
    setResult(null);
    setError("");
    setProgress(null);
    setCompletedSteps(new Set());
  };

  const hasPcpaieDb = scan?.pcpaie_db != null;
  const hasNativeFiles = scan?.has_native_files ?? false;
  const hasPcpaieData = hasPcpaieDb || hasNativeFiles;
  const hasPointeuse = scan?.user_dat != null && (scan?.attlog_files.length ?? 0) > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold">
              HP
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">HAMTECH Paie Setup</h1>
              <p className="text-sm text-gray-500">Système de Gestion de Paie</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          {step === "select" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Bienvenue !</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Pour commencer, sélectionnez le <strong>dossier PCPAIE</strong> contenant
                  vos données. L'application va scanner le dossier, détecter automatiquement
                  la base de données PCPAIE, les fichiers de pointeuse (user.dat, attlog*.dat),
                  puis importer toutes les données.
                </p>
              </div>

              <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-3 text-sm font-medium text-gray-700">
                  Sélectionner le dossier PCPAIE
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Le dossier doit contenir les fichiers natifs PCPAIE (.DTA) ou une
                  base SQLite, et optionnellement les fichiers de pointeuse
                </p>
                <button
                  onClick={handlePickFolder}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <FolderOpen className="h-4 w-4" />
                  Parcourir...
                </button>
              </div>

              <div className="rounded-lg bg-blue-50 p-4">
                <div className="flex gap-3">
                  <Database className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium">Ce qui sera importé :</p>
                    <ul className="mt-2 space-y-1 text-blue-700">
                      <li>• Base PCPAIE : employés (PERS0/PERS2), rubriques & formules, historique de paie, valeurs de lookup, infos entreprise</li>
                      <li>• Pointeuse (si présente) : utilisateurs (user.dat) et pointages (attlog*.dat)</li>
                      <li>• Génération automatique des postes depuis les données employés</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "scanning" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="mt-4 text-sm font-medium text-gray-700">
                Analyse du dossier en cours...
              </p>
              <p className="mt-1 text-xs text-gray-500 font-mono">{folderPath}</p>
            </div>
          )}

          {step === "preview" && scan && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Fichiers détectés</h2>
                <p className="mt-1 text-xs text-gray-500 font-mono break-all">{scan.folder_path}</p>
              </div>

              {/* PCPAIE SQLite Database (if found) */}
              {hasPcpaieDb && (
                <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 flex-shrink-0 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Base de données PCPAIE (SQLite)
                      </p>
                      <p className="text-xs text-green-700 font-mono break-all">
                        {scan.pcpaie_db}
                      </p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              )}

              {/* Native PCPAIE .DTA files (if found) */}
              {hasNativeFiles && (
                <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-5 w-5 flex-shrink-0 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Fichiers natifs PCPAIE (.DTA)
                      </p>
                      <p className="text-xs text-green-700">
                        {scan.native_dta_files.length} fichier(s) détecté(s) : {scan.native_dta_files.join(", ")}
                      </p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              )}

              {/* No PCPAIE data found at all */}
              {!hasPcpaieData && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Aucune donnée PCPAIE détectée
                      </p>
                      <p className="text-xs text-red-700">
                        Le dossier ne contient ni base SQLite PCPAIE ni fichiers natifs .DTA
                        (RUBRIQUEX.DTA, PERS0.DTA requis)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Pointeuse user.dat */}
              <div
                className={`rounded-lg border p-4 ${
                  scan.user_dat
                    ? "border-green-300 bg-green-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users
                    className={`h-5 w-5 flex-shrink-0 ${
                      scan.user_dat ? "text-green-600" : "text-gray-400"
                    }`}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Fichier pointeuse — user.dat
                    </p>
                    {scan.user_dat ? (
                      <p className="text-xs text-green-700 font-mono break-all">
                        {scan.user_dat}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">Non trouvé (optionnel)</p>
                    )}
                  </div>
                  {scan.user_dat && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                </div>
              </div>

              {/* Pointeuse attlog files */}
              <div
                className={`rounded-lg border p-4 ${
                  scan.attlog_files.length > 0
                    ? "border-green-300 bg-green-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Clock
                    className={`h-5 w-5 flex-shrink-0 ${
                      scan.attlog_files.length > 0 ? "text-green-600" : "text-gray-400"
                    }`}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Fichiers pointeuse — attlog*.dat
                    </p>
                    {scan.attlog_files.length > 0 ? (
                      <p className="text-xs text-green-700">
                        {scan.attlog_files.length} fichier(s) détecté(s)
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">Non trouvé (optionnel)</p>
                    )}
                  </div>
                  {scan.attlog_files.length > 0 && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                </div>
                {scan.attlog_files.length > 0 && (
                  <ul className="mt-2 ml-8 space-y-0.5">
                    {scan.attlog_files.map((f) => (
                      <li key={f} className="text-xs text-gray-600 font-mono break-all">
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Other files */}
              {scan.other_dbs.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-5 w-5 flex-shrink-0 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Autres fichiers SQLite ({scan.other_dbs.length})
                      </p>
                      <p className="text-xs text-gray-500">
                        Non reconnus comme bases PCPAIE — ignorés
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* All files summary */}
              <details className="rounded-lg border border-gray-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  <FileText className="inline h-4 w-4 mr-1" />
                  Tous les fichiers du dossier ({scan.all_files.length})
                </summary>
                <ul className="mt-2 space-y-0.5 pl-4">
                  {scan.all_files.map((f) => (
                    <li key={f} className="text-xs text-gray-600 font-mono">
                      {f}
                    </li>
                  ))}
                </ul>
              </details>

              {hasPointeuse && (
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-blue-800">
                    ✓ Pointeuse détectée — les utilisateurs et pointages seront importés
                    automatiquement avec les données PCPAIE.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Changer de dossier
                </button>
                <button
                  onClick={handleImport}
                  disabled={!hasPcpaieData}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Importer les données
                </button>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Importation en cours
                  </h2>
                  <p className="text-xs text-gray-500 font-mono break-all">{folderPath}</p>
                </div>
              </div>

              {/* Main progress bar — modern gradient with glow */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {progress?.message ?? "Initialisation..."}
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-blue-600">
                    {Math.round(progress?.overall_percent ?? 0)}%
                  </span>
                </div>
                <div className="relative h-4 overflow-hidden rounded-full bg-gray-200 shadow-inner">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-cyan-500 transition-all duration-500 ease-out"
                    style={{
                      width: `${progress?.overall_percent ?? 0}%`,
                      boxShadow: "0 0 12px rgba(59, 130, 246, 0.5)",
                    }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 animate-pulse rounded-full bg-white/20" />
                  </div>
                </div>
                {/* Current step detail */}
                {progress && progress.total > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-mono">
                      {progress.current.toLocaleString()} / {progress.total.toLocaleString()} enregistrements
                    </span>
                    <span className="font-mono">
                      {progress.total > 0 && progress.current > 0
                        ? `${Math.round((progress.current / progress.total) * 100)}% de l'étape`
                        : ""}
                    </span>
                  </div>
                )}
              </div>

              {/* Phase timeline — shows parallel execution */}
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Pipeline d'import — Concurrence Rust
                </p>
                {PHASES.map((phase, phaseIdx) => (
                  <div key={phaseIdx} className="space-y-1">
                    {/* Phase header */}
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${
                          phase.color === "purple" ? "bg-purple-500" : "bg-blue-500"
                        }`}
                      />
                      <span className="text-xs font-semibold text-gray-600">
                        {phase.name}
                      </span>
                    </div>
                    {/* Steps in this phase */}
                    <div className="ml-4 space-y-0.5">
                      {phase.steps.map((stepKey) => {
                        const meta = STEP_LABELS[stepKey];
                        if (!meta) return null;
                        const isCompleted = completedSteps.has(stepKey);
                        const isActive = progress?.step === stepKey && !isCompleted;

                        return (
                          <div
                            key={stepKey}
                            className={`flex items-center gap-2 rounded-md px-2 py-1 transition-colors ${
                              isActive
                                ? phase.color === "purple"
                                  ? "bg-purple-100"
                                  : "bg-blue-100"
                                : ""
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {isCompleted ? (
                                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                              ) : isActive ? (
                                <Loader2
                                  className={`h-3.5 w-3.5 animate-spin ${
                                    phase.color === "purple" ? "text-purple-600" : "text-blue-600"
                                  }`}
                                />
                              ) : (
                                <div className="flex h-3.5 w-3.5 items-center justify-center">
                                  <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                                </div>
                              )}
                            </div>
                            <span
                              className={`flex-1 text-xs ${
                                isCompleted
                                  ? "text-green-700"
                                  : isActive
                                  ? phase.color === "purple"
                                    ? "text-purple-900"
                                    : "text-blue-900"
                                  : "text-gray-400"
                              }`}
                            >
                              {meta.label}
                            </span>
                            {isActive && progress && progress.total > 0 && (
                              <span
                                className={`text-xs font-mono tabular-nums ${
                                  phase.color === "purple" ? "text-purple-600" : "text-blue-600"
                                }`}
                              >
                                {progress.current.toLocaleString()}/{progress.total.toLocaleString()}
                              </span>
                            )}
                            {isCompleted && (
                              <span className="text-xs text-green-600">✓</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* Pointeuse (conditional, outside phases) */}
                {hasPointeuse && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      <span className="text-xs font-semibold text-gray-600">
                        Pointeuse (optionnel)
                      </span>
                    </div>
                    <div className="ml-4">
                      <div
                        className={`flex items-center gap-2 rounded-md px-2 py-1 transition-colors ${
                          progress?.step === "pointeuse" ? "bg-blue-100" : ""
                        }`}
                      >
                        {completedSteps.has("pointeuse") ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        ) : progress?.step === "pointeuse" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                        ) : (
                          <div className="flex h-3.5 w-3.5 items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                          </div>
                        )}
                        <span
                          className={`flex-1 text-xs ${
                            completedSteps.has("pointeuse")
                              ? "text-green-700"
                              : progress?.step === "pointeuse"
                              ? "text-blue-900"
                              : "text-gray-400"
                          }`}
                        >
                          Données pointeuse (user.dat + attlog*.dat)
                        </span>
                        {completedSteps.has("pointeuse") && (
                          <span className="text-xs text-green-600">✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Info note */}
              <p className="text-center text-xs text-gray-400">
                Pipeline parallèle : 3 threads en Phase 1, 2 threads en Phase 3,
                chunks de 5000 records traités par rayon en Phase 4.
              </p>
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Import terminé !
                  </h2>
                  <p className="text-sm text-gray-600">
                    Vos données ont été importées avec succès.
                  </p>
                </div>
              </div>

              {/* PCPAIE import stats */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Base PCPAIE
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Employés" value={result.pcpaie.employees} />
                  <StatCard label="Rubriques" value={result.pcpaie.rubriques} />
                  <StatCard label="Bulletins de paie" value={result.pcpaie.paies} />
                  <StatCard label="Valeurs de lookup" value={result.pcpaie.lookups} />
                </div>
              </div>

              {/* Pointeuse import stats */}
              {result.pointeuse_imported && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Pointeuse
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard label="Utilisateurs pointeuse" value={result.pointeuse_users} />
                    <StatCard label="Entrées de pointage" value={result.pointeuse_entries} />
                  </div>
                </div>
              )}

              {/* Warnings */}
              {result.pcpaie.errors.length > 0 && (
                <div className="rounded-lg bg-yellow-50 p-4">
                  <p className="text-sm font-medium text-yellow-800">
                    Avertissements (PCPAIE) :
                  </p>
                  <ul className="mt-1 text-xs text-yellow-700">
                    {result.pcpaie.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.pointeuse_errors.length > 0 && (
                <div className="rounded-lg bg-yellow-50 p-4">
                  <p className="text-sm font-medium text-yellow-800">
                    Avertissements (Pointeuse) :
                  </p>
                  <ul className="mt-1 text-xs text-yellow-700">
                    {result.pointeuse_errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={onComplete}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Continuer vers le tableau de bord
                </button>
                {onGoToDossiers && (
                  <button
                    onClick={onGoToDossiers}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Database className="h-4 w-4" />
                    Importer un autre dossier PCPAIE
                  </button>
                )}
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-red-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Échec de l'import
                  </h2>
                  <p className="text-sm text-gray-600">{error}</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Réessayer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
