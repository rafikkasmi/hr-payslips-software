import { useState } from "react";
import { api, type ImportResult } from "../lib/api";
import { Database, Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<"select" | "importing" | "done" | "error">("select");
  const [pcpaiePath, setPcpaiePath] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handlePickFile = async () => {
    try {
      const selected = await api.pickFile([
        { name: "PCPAIE Database", extensions: ["db", "sqlite", "sqlite3"] },
      ]);
      if (selected && typeof selected === "string") {
        setPcpaiePath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImport = async () => {
    if (!pcpaiePath) return;
    setStep("importing");
    setError("");
    try {
      const res = await api.importPcpaie(pcpaiePath);
      setResult(res);
      setStep("done");
    } catch (e) {
      setError(String(e));
      setStep("error");
    }
  };

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
              <p className="text-sm text-gray-500">Salary Management System</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          {step === "select" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Welcome!</h2>
                <p className="mt-1 text-sm text-gray-600">
                  To get started, specify the path to your PCPAIE database file
                  (<code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">pcpaie_reconstructed.db</code>).
                  This will import all employees, rubriques, and payroll history.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PCPAIE Database Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pcpaiePath}
                    onChange={(e) => setPcpaiePath(e.target.value)}
                    placeholder="/path/to/pcpaie_reconstructed.db"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handlePickFile}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 p-4">
                <div className="flex gap-3">
                  <Database className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium">What will be imported:</p>
                    <ul className="mt-2 space-y-1 text-blue-700">
                      <li>• All employees from PERS0 (personal info, matricule, etc.)</li>
                      <li>• Payroll rubriques with formulas (999 calculation rules)</li>
                      <li>• Payroll history from PAIES (all past months)</li>
                      <li>• Employee rubrique assignments from PERS1</li>
                      <li>• Lookup values (functions, departments, etc.)</li>
                      <li>• Company information from DOSSIER</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={handleImport}
                disabled={!pcpaiePath}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Import PCPAIE Data
              </button>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="mt-4 text-sm font-medium text-gray-700">Importing PCPAIE data...</p>
              <p className="mt-1 text-xs text-gray-500">This may take a minute for large datasets</p>
              <div className="mt-6 w-full max-w-sm space-y-2">
                {[
                  "Reading rubriques & formulas...",
                  "Importing employee records...",
                  "Importing employee rubrique assignments...",
                  "Importing payroll history...",
                  "Importing lookup values...",
                  "Importing company info...",
                ].map((label, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                    <div
                      className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"
                      style={{ animationDelay: `${i * 300}ms` }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Import Complete!</h2>
                  <p className="text-sm text-gray-600">Your data has been successfully imported.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-2xl font-bold text-gray-900">{result.employees}</p>
                  <p className="text-sm text-gray-500">Employees</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-2xl font-bold text-gray-900">{result.rubriques}</p>
                  <p className="text-sm text-gray-500">Rubriques</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-2xl font-bold text-gray-900">{result.paies}</p>
                  <p className="text-sm text-gray-500">Payroll Records</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-2xl font-bold text-gray-900">{result.lookups}</p>
                  <p className="text-sm text-gray-500">Lookup Values</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-lg bg-yellow-50 p-4">
                  <p className="text-sm font-medium text-yellow-800">Some warnings:</p>
                  <ul className="mt-1 text-xs text-yellow-700">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={onComplete}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Continue to Dashboard
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-red-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Import Failed</h2>
                  <p className="text-sm text-gray-600">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setStep("select")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
