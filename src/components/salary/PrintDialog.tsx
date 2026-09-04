import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Printer, FolderDown, FileStack, X } from "lucide-react";
import type { CalcResult } from "../../lib/api";
import { api } from "../../lib/api";
import { generatePayslipHTML, sanitizeFilename } from "../../lib/payslipHtml";

interface PrintDialogProps {
  items: { employee_id: number; matricule: string; nom: string; prenom: string; period: string; source: string; id: number }[];
  calcResults: Record<string, CalcResult>;
  selectedPeriod: string;
  onClose: () => void;
  setPayslipPreview: (r: CalcResult | null) => void;
}

export function PrintDialog({ items, calcResults, selectedPeriod, onClose, setPayslipPreview }: PrintDialogProps) {
  const [mode, setMode] = useState<"choice" | "printing">("choice");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [savedFolder, setSavedFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const printDirectly = async () => {
    setMode("printing");
    setProgress({ done: 0, total: items.length });
    for (let i = 0; i < items.length; i++) {
      const h = items[i];
      const key = `${h.source}-${h.id}`;
      let result: CalcResult | null = calcResults[key] ?? null;
      if (!result && h.employee_id && h.source === "app") {
        try {
          result = await api.getSavedCalculation(h.employee_id, h.period ?? selectedPeriod);
        } catch (e) { console.error(`Fetch failed for ${key}:`, e); }
      }
      if (result) {
        setPayslipPreview(result);
        await new Promise(r => setTimeout(r, 500));
        window.print();
        await new Promise(r => setTimeout(r, 300));
      }
      setProgress({ done: i + 1, total: items.length });
    }
    setPayslipPreview(null);
    setMode("choice");
    onClose();
  };

  const saveToFolder = async () => {
    try {
      const folder = await open({ directory: true, multiple: false, title: "Choisir le dossier d'enregistrement" });
      if (!folder) return;
      setSavedFolder(folder as string);
      setMode("printing");
      setProgress({ done: 0, total: items.length });
      for (let i = 0; i < items.length; i++) {
        const h = items[i];
        const key = `${h.source}-${h.id}`;
        let result: CalcResult | null = calcResults[key] ?? null;
        if (!result && h.employee_id && h.source === "app") {
          try {
            result = await api.getSavedCalculation(h.employee_id, h.period ?? selectedPeriod);
          } catch (e) { console.error(`Fetch failed for ${key}:`, e); }
        }
        if (result) {
          const name = `${sanitizeFilename(h.matricule || "unk")}_${sanitizeFilename(`${h.nom}_${h.prenom}`)}_${h.period ?? selectedPeriod}.html`;
          const html = generatePayslipHTML(result);
          const filePath = `${folder}/${name}`;
          await writeTextFile(filePath, html);
        }
        setProgress({ done: i + 1, total: items.length });
      }
      setMode("choice");
      onClose();
    } catch (e) {
      setError(String(e));
      setMode("choice");
    }
  };

  const printOneByOne = async () => {
    setMode("printing");
    setProgress({ done: 0, total: items.length });
    for (let i = 0; i < items.length; i++) {
      const h = items[i];
      const key = `${h.source}-${h.id}`;
      let result: CalcResult | null = calcResults[key] ?? null;
      if (!result && h.employee_id && h.source === "app") {
        try {
          result = await api.getSavedCalculation(h.employee_id, h.period ?? selectedPeriod);
        } catch (e) { console.error(`Fetch failed for ${key}:`, e); }
      }
      if (result) {
        setPayslipPreview(result);
        await new Promise(r => setTimeout(r, 600));
        window.print();
        await new Promise(r => setTimeout(r, 500));
      }
      setProgress({ done: i + 1, total: items.length });
    }
    setPayslipPreview(null);
    setMode("choice");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {mode === "choice" && (
          <>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-base font-bold text-gray-900">Impression des bulletins</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
              <p className="text-sm text-gray-600">{items.length} bulletin(s) à imprimer. Choisissez le mode:</p>
              <button onClick={printDirectly} className="w-full flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-left hover:bg-blue-50 hover:border-blue-300 transition">
                <Printer className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div><p className="text-sm font-medium text-gray-900">Imprimer directement</p><p className="text-xs text-gray-500">Ouvre le dialogue d'impression natif pour chaque bulletin</p></div>
              </button>
              <button onClick={saveToFolder} className="w-full flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-left hover:bg-green-50 hover:border-green-300 transition">
                <FolderDown className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div><p className="text-sm font-medium text-gray-900">Enregistrer dans un dossier</p><p className="text-xs text-gray-500">Choisir un dossier et sauvegarder chaque bulletin en HTML</p></div>
              </button>
              <button onClick={printOneByOne} className="w-full flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-left hover:bg-purple-50 hover:border-purple-300 transition">
                <FileStack className="h-5 w-5 text-purple-600 flex-shrink-0" />
                <div><p className="text-sm font-medium text-gray-900">Imprimer un par un</p><p className="text-xs text-gray-500">Aperçu puis impression de chaque bulletin individuellement</p></div>
              </button>
            </div>
          </>
        )}
        {mode === "printing" && (
          <div className="p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Impression en cours...</h2>
            <div className="mb-2 flex justify-between text-sm text-gray-600">
              <span>{savedFolder ? `Enregistrement dans ${savedFolder}` : "Impression"}</span>
              <span className="font-medium">{progress.done}/{progress.total}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="mt-3 text-xs text-gray-400">Veuillez patienter, ne fermez pas la fenêtre...</p>
          </div>
        )}
      </div>
    </div>
  );
}
