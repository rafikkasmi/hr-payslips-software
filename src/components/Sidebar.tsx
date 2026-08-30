import { LayoutDashboard, Users, Clock, Fingerprint, CalendarOff, Gift, Calculator, Settings, Briefcase } from "lucide-react";
import { cn } from "../lib/utils";

export type Page = "dashboard" | "employees" | "postes" | "shifts" | "pointeuse" | "attendance" | "leaves" | "bonuses" | "salary";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { page: "employees", label: "Employés", icon: Users },
  { page: "postes", label: "Postes", icon: Briefcase },
  { page: "shifts", label: "Horaires", icon: Clock },
  { page: "pointeuse", label: "Pointeuse", icon: Fingerprint },
  { page: "attendance", label: "Présences", icon: CalendarOff },
  { page: "leaves", label: "Congés", icon: CalendarOff },
  { page: "bonuses", label: "Primes", icon: Gift },
  { page: "salary", label: "Paie", icon: Calculator },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
          HP
        </div>
        <span className="font-semibold text-gray-900">HAMTECH Paie</span>
      </div>
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
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
          <Settings className="h-5 w-5" />
          Paramètres
        </button>
      </div>
    </aside>
  );
}
