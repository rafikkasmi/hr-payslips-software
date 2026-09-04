import { useEffect, useMemo, useState } from "react";
import { api, type SalaryHistory } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { Loader2, TrendingUp, Calendar, Filter, Download } from "lucide-react";

interface SalaryHistoryPanelProps {
  employeeId: number;
}

export function SalaryHistoryPanel({ employeeId }: SalaryHistoryPanelProps) {
  const [history, setHistory] = useState<SalaryHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyRealMonths, setOnlyRealMonths] = useState(true);
  const [selectedRubs, setSelectedRubs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadHistory();
  }, [employeeId, onlyRealMonths]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const h = await api.getEmployeeSalaryHistory(employeeId, onlyRealMonths);
      setHistory(h);
      // Auto-select top 5 rubriques with highest total
      const top = [...h.series]
        .map(s => ({
          ...s,
          total: s.data.reduce((a: number, b) => a + (b ?? 0), 0),
        }))
        .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
        .slice(0, 5)
        .map(s => s.code);
      setSelectedRubs(new Set(top));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleRub = (code: string) => {
    setSelectedRubs(prev => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  };

  const filteredSeries = useMemo(() =>
    history?.series.filter(s => selectedRubs.has(s.code)) ?? [],
    [history, selectedRubs]
  );

  const stats = useMemo(() => {
    if (!history) return [];
    return history.series.map(s => {
      const vals = s.data.filter(v => v != null) as number[];
      const total = vals.reduce((a, b) => a + b, 0);
      const avg = vals.length ? total / vals.length : 0;
      const min = vals.length ? Math.min(...vals) : 0;
      const max = vals.length ? Math.max(...vals) : 0;
      const last = vals.length ? vals[vals.length - 1] : null;
      return { code: s.code, libelle: s.libelle, count: vals.length, total, avg, min, max, last };
    }).sort((a, b) => b.total - a.total);
  }, [history]);

  const exportCsv = () => {
    if (!history) return;
    const header = ["Periode", ...history.rubriques.map(r => `${r.code} - ${r.libelle ?? ""}`)].join(";");
    const lines = [header];
    for (let i = 0; i < history.periods.length; i++) {
      const row = [history.periods[i], ...history.rubriques.map(r => {
        const s = history.series.find(x => x.code === r.code);
        return s?.data[i] == null ? "" : String(s.data[i]);
      })];
      lines.push(row.join(";"));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historique_salaire_${employeeId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }
  if (error) return <div className="py-4 text-sm text-red-600">{error}</div>;
  if (!history || history.count === 0) {
    return <div className="py-4 text-sm text-gray-500">Aucune paie trouvée pour cet employé.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="h-4 w-4" />
          {history.count} périodes · {history.rubriques.length} rubriques
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={onlyRealMonths}
              onChange={(e) => setOnlyRealMonths(e.target.checked)}
              className="rounded border-gray-300"
            />
            Mois réels uniquement
          </label>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Rubrique selector */}
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-600">
          <Filter className="h-3.5 w-3.5" />
          Rubriques à afficher
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.map(s => (
            <button
              key={s.code}
              onClick={() => toggleRub(s.code)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedRubs.has(s.code)
                  ? "bg-blue-100 text-blue-800 ring-1 ring-blue-300"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s.code} {s.libelle ? `— ${s.libelle}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {stats.filter(s => selectedRubs.has(s.code)).map(s => (
          <div key={s.code} className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{s.code}</p>
            <p className="text-sm font-semibold text-gray-900 truncate" title={s.libelle ?? undefined}>
              {s.libelle ?? s.code}
            </p>
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <p className="flex justify-between"><span>Total</span> <b className="text-gray-900">{formatCurrency(s.total)}</b></p>
              <p className="flex justify-between"><span>Moy</span> <b className="text-gray-900">{formatCurrency(s.avg)}</b></p>
              <p className="flex justify-between"><span>Min/Max</span> <b className="text-gray-900">{formatCurrency(s.min)} / {formatCurrency(s.max)}</b></p>
              <p className="flex justify-between"><span>Dernier</span> <b className="text-gray-900">{s.last != null ? formatCurrency(s.last) : "—"}</b></p>
            </div>
          </div>
        ))}
      </div>

      {/* History table */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Période</th>
                {filteredSeries.map(s => (
                  <th key={s.code} className="px-2 py-1.5 text-right font-medium text-gray-600">
                    {s.code} <span className="block font-normal text-gray-400">{s.libelle}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...history.periods].reverse().map((period, idx) => {
                const i = history.periods.length - 1 - idx;
                return (
                  <tr key={period} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 font-medium text-gray-700">{period}</td>
                    {filteredSeries.map(s => (
                      <td key={s.code} className="px-2 py-1.5 text-right text-gray-600">
                        {s.data[i] == null ? "—" : formatCurrency(s.data[i])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mini trend chart */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <TrendingUp className="h-4 w-4" />
          Évolution des rubriques sélectionnées
        </div>
        <SalaryHistoryChart periods={history.periods} series={filteredSeries} />
      </div>
    </div>
  );
}

function SalaryHistoryChart({
  periods,
  series,
}: {
  periods: string[];
  series: { code: string; libelle: string | null; data: (number | null)[] }[];
}) {
  if (series.length === 0) return null;

  const allValues = series.flatMap(s => s.data.filter((v): v is number => v != null));
  if (allValues.length === 0) return null;

  const max = Math.max(...allValues);
  const min = Math.min(...allValues);
  const range = max - min || 1;

  const colors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

  return (
    <div className="space-y-3">
      {series.map((s, si) => {
        const vals = s.data.map(v => (v == null ? null : v));
        return (
          <div key={s.code}>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium" style={{ color: colors[si % colors.length] }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[si % colors.length] }} />
              {s.code} {s.libelle ? `— ${s.libelle}` : ""}
            </div>
            <div className="flex h-10 items-end gap-0.5">
              {vals.map((v, i) => (
                <div
                  key={i}
                  className="relative min-w-[3px] flex-1 rounded-t"
                  style={{
                    backgroundColor: colors[si % colors.length],
                    height: v == null ? "0%" : `${Math.max(2, ((v - min) / range) * 100)}%`,
                    opacity: v == null ? 0.2 : 1,
                  }}
                  title={`${periods[i]}: ${v == null ? "—" : formatCurrency(v)}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>{periods[0]}</span>
              <span>{periods[periods.length - 1]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
