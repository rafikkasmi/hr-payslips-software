import { type DossierConflictCheck } from "../lib/api";
import { Building2, GitMerge, Split, RefreshCw, AlertTriangle } from "lucide-react";

export type ImportMode = "separate" | "merge" | "replace";

interface DossierConflictDialogProps {
  conflict: DossierConflictCheck;
  onChoose: (mode: ImportMode) => void;
  onCancel: () => void;
}

export function DossierConflictDialog({ conflict, onChoose, onCancel }: DossierConflictDialogProps) {
  const { scanned_doss_nom, active_doss_nom } = conflict;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              Nouveau dossier détecté
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Le dossier que vous voulez importer est différent de celui actuellement actif.
              Comment souhaitez-vous le gérer ?
            </p>
          </div>
        </div>

        {/* Comparison */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Dossier actuel
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900">{active_doss_nom || "—"}</span>
            </div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              Dossier à importer
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-900">{scanned_doss_nom || "—"}</span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="mt-5 space-y-2">
          <button
            onClick={() => onChoose("separate")}
            className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            <Split className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <div className="font-medium text-gray-900">Gérer séparément</div>
              <div className="text-sm text-gray-500">
                Créer une nouvelle base de données pour ce dossier. Vous pourrez basculer
                entre les dossiers via le sélecteur.
              </div>
            </div>
          </button>

          <button
            onClick={() => onChoose("merge")}
            className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
          >
            <GitMerge className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <div className="font-medium text-gray-900">Fusionner avec le dossier actuel</div>
              <div className="text-sm text-gray-500">
                Importer les données dans la base actuelle. Les employés avec le même
                matricule seront écrasés, les nouveaux seront ajoutés.
              </div>
            </div>
          </button>

          <button
            onClick={() => onChoose("replace")}
            className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-red-300 hover:bg-red-50"
          >
            <RefreshCw className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <div className="font-medium text-gray-900">Remplacer les données actuelles</div>
              <div className="text-sm text-gray-500">
                Effacer toute la base actuelle et importer le nouveau dossier. Cette action
                est irréversible.
              </div>
            </div>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
