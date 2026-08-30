import { useState, useEffect } from "react";
import { api, type Leave, type EmployeeSummary } from "../lib/api";
import { Plus, Trash2, CalendarOff, Check, X, Wallet } from "lucide-react";

type LeaveBalance = { entitled: number; used: number; remaining: number; pending: number; year: string };

const leaveTypes = [
  { value: "annual", label: "Congé annuel" },
  { value: "sick", label: "Maladie" },
  { value: "unpaid", label: "Sans solde" },
  { value: "maternity", label: "Maternité" },
  { value: "special", label: "Congé spécial" },
];

const leaveTypeLabels: Record<string, string> = {
  annual: "Congé annuel",
  sick: "Maladie",
  unpaid: "Sans solde",
  maternity: "Maternité",
  special: "Congé spécial",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Approuvé", className: "bg-green-100 text-green-700" },
  rejected: { label: "Refusé", className: "bg-red-100 text-red-700" },
};

export function LeavesPage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daysCount, setDaysCount] = useState(0);
  const [reason, setReason] = useState("");
  const [balances, setBalances] = useState<Record<number, LeaveBalance>>({});
  const [showBalances, setShowBalances] = useState(false);

  const loadLeaves = async () => {
    try { setLeaves(await api.getLeaves()); } catch (e) { console.error(e); }
  };

  const loadEmployees = async () => {
    try { setEmployees(await api.getEmployees()); } catch (e) { console.error(e); }
  };

  useEffect(() => { loadLeaves(); loadEmployees(); }, []);

  const [balancesLoading, setBalancesLoading] = useState(false);

  const loadBalances = async () => {
    setBalancesLoading(true);
    try {
      const activeEmps = employees.filter(e => e.actif);
      const results = await Promise.all(
        activeEmps.map(async emp => {
          try {
            const bal = await api.getLeaveBalance(emp.id);
            return [emp.id, bal] as const;
          } catch { return null; }
        })
      );
      const map: Record<number, LeaveBalance> = {};
      for (const r of results) { if (r) map[r[0]] = r[1]; }
      setBalances(map);
      setShowBalances(true);
    } finally {
      setBalancesLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await api.createLeave(Number(employeeId), leaveType, startDate, endDate, daysCount, reason || null);
      setShowForm(false);
      setEmployeeId(""); setLeaveType("annual"); setStartDate(""); setEndDate(""); setDaysCount(0); setReason("");
      loadLeaves();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deleteLeave(id); loadLeaves(); } catch (e) { console.error(e); }
  };

  const handleApprove = async (id: number) => {
    try { await api.approveLeave(id); loadLeaves(); } catch (e) { console.error(e); }
  };

  const handleReject = async (id: number) => {
    try { await api.rejectLeave(id); loadLeaves(); } catch (e) { console.error(e); }
  };

  const empName = (id: number) => {
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.nom} ${emp.prenom}` : `#${id}`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Congés & Absences</h1>
          <p className="mt-1 text-sm text-gray-500">Gestion des congés et absences des employés</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadBalances()} disabled={balancesLoading} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Wallet className="h-4 w-4" /> {balancesLoading ? "Chargement..." : "Soldes congés"}
          </button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Nouveau congé
          </button>
        </div>
      </div>

      {showBalances && Object.keys(balances).length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700">Soldes congés annuels {balances[employees[0]?.id]?.year ?? ""}</h2>
            <button onClick={() => setShowBalances(false)} className="text-xs text-gray-400 hover:text-gray-600">Masquer</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {employees.filter(emp => emp.actif && balances[emp.id]).map(emp => {
              const bal = balances[emp.id];
              const pct = bal.entitled > 0 ? Math.min((bal.used / bal.entitled) * 100, 100) : 0;
              const color = bal.remaining > 5 ? "text-green-600" : bal.remaining > 0 ? "text-amber-600" : "text-red-600";
              return (
                <div key={emp.id} className="rounded-lg border border-gray-100 px-3 py-2">
                  <div className="text-xs font-medium text-gray-700 truncate">{emp.nom} {emp.prenom}</div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-500">Droit: <span className="font-medium text-gray-700">{bal.entitled}j</span></span>
                    <span className="text-gray-500">Pris: <span className="font-medium text-gray-700">{bal.used}j</span></span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`text-sm font-bold ${color}`}>Reste: {bal.remaining}j</span>
                    {bal.pending > 0 && <span className="text-xs text-amber-600">+{bal.pending}j en attente</span>}
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${pct > 80 ? "bg-red-400" : pct > 50 ? "bg-amber-400" : "bg-green-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employé</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Sélectionner...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nom} {emp.prenom} ({emp.matricule})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de congé</label>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {leaveTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de jours</label>
              <input type="number" step="0.5" value={daysCount} onChange={(e) => setDaysCount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Motif</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optionnel" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} disabled={!employeeId || !startDate || !endDate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Créer</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Annuler</button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {leaves.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarOff className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">Aucun congé enregistré.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Employé</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Début</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fin</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Jours</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Motif</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaves.map((l) => {
                const sc = statusConfig[l.status] ?? statusConfig.pending;
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{empName(l.employee_id)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{leaveTypeLabels[l.leave_type] ?? l.leave_type}</span></td>
                    <td className="px-4 py-3 text-gray-600">{l.start_date}</td>
                    <td className="px-4 py-3 text-gray-600">{l.end_date}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{l.days_count}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc.className}`}>{sc.label}</span></td>
                    <td className="px-4 py-3 text-gray-600">{l.reason || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {l.status === "pending" && (
                          <>
                            <button onClick={() => handleApprove(l.id)} title="Approuver" className="text-green-500 hover:text-green-700"><Check className="h-4 w-4" /></button>
                            <button onClick={() => handleReject(l.id)} title="Refuser" className="text-amber-500 hover:text-amber-700"><X className="h-4 w-4" /></button>
                          </>
                        )}
                        <button onClick={() => handleDelete(l.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
