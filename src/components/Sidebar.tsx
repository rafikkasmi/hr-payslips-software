import { useRef } from "react";
import { LayoutDashboard, Users, Clock, Fingerprint, CalendarOff, CalendarPlus, Gift, Calculator, Settings, Briefcase, ListChecks, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import { DossierSwitcher, type DossierSwitcherHandle } from "./DossierSwitcher";

export type Page = "dashboard" | "employees" | "postes" | "rubriques" | "simulator" | "shifts" | "pointeuse" | "attendance" | "leaves" | "bonuses" | "salary" | "settings" | "dossiers";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onDossierSwitch?: () => void;
}

const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { page: "employees", label: "Employés", icon: Users },
  { page: "postes", label: "Profils de paie", icon: Briefcase },
  { page: "rubriques", label: "Rubriques", icon: ListChecks },
  { page: "simulator", label: "Simulateur", icon: Zap },
  { page: "shifts", label: "Horaires", icon: Clock },
  { page: "pointeuse", label: "Pointeuse", icon: Fingerprint },
  { page: "attendance", label: "Présence", icon: CalendarOff },
  { page: "leaves", label: "Congés", icon: CalendarPlus },
  { page: "bonuses", label: "Primes", icon: Gift },
  { page: "salary", label: "Paie", icon: Calculator },
];

export function Sidebar({ currentPage, onNavigate, onDossierSwitch }: SidebarProps) {
  const switcherRef = useRef<DossierSwitcherHandle>(null);

  const handleDossierSwitch = () => {
    // Refresh the switcher to show the new active dossier
    switcherRef.current?.refresh();
    // Notify parent (App.tsx) to refresh status
    onDossierSwitch?.();
  };

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
          HP
        </div>
        <span className="font-semibold text-gray-900">HAMTECH Paie</span>
      </div>
      {onDossierSwitch && (
        <div className="border-b border-gray-200 px-2 py-2 bg-gray-50/50">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Dossier actif
          </div>
          <DossierSwitcher
            ref={switcherRef}
            onSwitch={handleDossierSwitch}
          />
        </div>
      )}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                currentPage === item.page
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 p-3">
        <button
          onClick={() => onNavigate("settings")}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            currentPage === "settings"
              ? "bg-blue-50 text-blue-700"
              : "text-gray-700 hover:bg-gray-100"
          )}
        >
          <Settings className="h-5 w-5" />
          Paramètres
        </button>
      </div>
    </aside>
  );
}
