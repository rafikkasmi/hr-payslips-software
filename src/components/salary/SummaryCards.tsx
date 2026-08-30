import type { SalaryHistoryEntry } from "./types";
import { formatCurrency } from "../../lib/utils";
import { TrendingUp, TrendingDown, Wallet, Users } from "lucide-react";

interface Props {
  history: SalaryHistoryEntry[];
  appCount: number;
  pcpaieCount: number;
}

export function SummaryCards({ history, appCount, pcpaieCount }: Props) {
  if (history.length === 0) return null;

  const totalBrut = history.reduce((s, h) => s + (h.total_brut ?? 0), 0);
  const totalRetenues = history.reduce((s, h) => s + (h.total_retenues ?? 0), 0);
  const totalNet = history.reduce((s, h) => s + (h.net_payer ?? 0), 0);

  const cards = [
    { label: "Brut total", value: formatCurrency(totalBrut), icon: TrendingUp, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
    { label: "Retenues totales", value: formatCurrency(totalRetenues), icon: TrendingDown, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
    { label: "Net total", value: formatCurrency(totalNet), icon: Wallet, color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
    { label: "Employés", value: `${history.length}`, sub: `${appCount} App · ${pcpaieCount} Hist.`, icon: Users, color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <div key={c.label} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500">{c.label}</span>
              <Icon className={`h-4 w-4 ${c.color}`} />
            </div>
            <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
            {c.sub && <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
