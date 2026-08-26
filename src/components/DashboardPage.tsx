import { type AppStatus } from "../lib/api";
import { Users, FileText, Calculator, Database } from "lucide-react";

interface DashboardPageProps {
  status: AppStatus;
}

export function DashboardPage({ status }: DashboardPageProps) {
  const cards = [
    { label: "Employees", value: status.employee_count, icon: Users, color: "blue" },
    { label: "Rubriques", value: status.rubrique_count, icon: FileText, color: "purple" },
    { label: "Payroll Records", value: status.paie_count, icon: Calculator, color: "green" },
    { label: "PCPAIE Source", value: status.pcpaie_path ? "Connected" : "Not set", icon: Database, color: "orange" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Overview of your payroll system</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${card.color}-100`}>
                  <Icon className={`h-5 w-5 text-${card.color}-600`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Getting Started</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
            <span className="text-sm text-gray-700">Import PCPAIE data — <span className="text-green-600 font-medium">Done</span></span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">2</span>
            <span className="text-sm text-gray-700">Configure shifts for employees</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">3</span>
            <span className="text-sm text-gray-700">Import pointeuse (user.dat + attlog) and match users</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">4</span>
            <span className="text-sm text-gray-700">Set up leaves and bonuses</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white">5</span>
            <span className="text-sm text-gray-700">Calculate monthly salaries</span>
          </div>
        </div>
      </div>
    </div>
  );
}
