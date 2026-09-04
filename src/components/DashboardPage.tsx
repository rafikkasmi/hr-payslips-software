import { type AppStatus } from "../lib/api";
import { Users, FileText, Calculator, Database } from "lucide-react";
import { cn } from "../lib/utils";

interface DashboardPageProps {
  status: AppStatus;
  onNavigate?: (page: "dossiers") => void;
}

export function DashboardPage({ status, onNavigate }: DashboardPageProps) {
  const cards = [
    { label: "Employés", value: status.employee_count, icon: Users, color: "blue", clickable: false },
    { label: "Rubriques", value: status.rubrique_count, icon: FileText, color: "purple", clickable: false },
    { label: "Bulletins de paie", value: status.paie_count, icon: Calculator, color: "green", clickable: false },
    { label: "Base de données", value: status.pcpaie_path ? "Connectée" : "Non définie", icon: Database, color: "orange", clickable: true },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
      <p className="mt-1 text-sm text-gray-500">Vue d'ensemble de votre système de paie</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const cardContent = (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${card.color}-100`}>
                  <Icon className={`h-5 w-5 text-${card.color}-600`} />
                </div>
              </div>
              {card.clickable && (
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-orange-600">
                  <Database className="h-3 w-3" />
                  Gérer les dossiers →
                </div>
              )}
            </>
          );

          if (card.clickable && onNavigate) {
            return (
              <button
                key={card.label}
                onClick={() => onNavigate("dossiers")}
                className={cn(
                  "rounded-xl border border-gray-200 bg-white p-5 text-left transition-all hover:border-orange-300 hover:shadow-md"
                )}
              >
                {cardContent}
              </button>
            );
          }

          return (
            <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-5">
              {cardContent}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Pour commencer</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
            <span className="text-sm text-gray-700">Importer les données PCPAIE — <span className="text-green-600 font-medium">Terminé</span></span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">2</span>
            <span className="text-sm text-gray-700">Configurer les horaires pour les employés</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">3</span>
            <span className="text-sm text-gray-700">Importer la pointeuse (user.dat + attlog) et associer les utilisateurs</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">4</span>
            <span className="text-sm text-gray-700">Configurer les congés et les primes</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">5</span>
            <span className="text-sm text-gray-700">Calculer les salaires mensuels</span>
          </div>
        </div>
      </div>
    </div>
  );
}
