import { useState, useEffect } from "react";
import { api, type Leave, type EmployeeSummary } from "../lib/api";
import { Plus, Trash2, CalendarOff } from "lucide-react";

const leaveTypes = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "special", label: "Special Leave" },
];

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

  const loadLeaves = async () => {
    try { setLeaves(await api.getLeaves()); } catch (e) { console.error(e); }
  };

  const loadEmployees = async () => {
    try { setEmployees(await api.getEmployees()); } catch (e) { console.error(e); }
  };

  useEffect(() => { loadLeaves(); loadEmployees(); }, []);

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leaves & Sick Leaves</h1>
          <p className="mt-1 text-sm text-gray-500">Manage employee leave records</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Leave
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nom} {emp.prenom} ({emp.matricule})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {leaveTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Days Count</label>
              <input type="number" step="0.5" value={daysCount} onChange={(e) => setDaysCount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} disabled={!employeeId || !startDate || !endDate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Create</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {leaves.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarOff className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No leave records yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Employee</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Start</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">End</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Days</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Reason</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaves.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{employees.find(e => e.id === l.employee_id) ? `${employees.find(e => e.id === l.employee_id)?.nom} ${employees.find(e => e.id === l.employee_id)?.prenom}` : `#${l.employee_id}`}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{l.leave_type}</span></td>
                  <td className="px-4 py-3 text-gray-600">{l.start_date}</td>
                  <td className="px-4 py-3 text-gray-600">{l.end_date}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{l.days_count}</td>
                  <td className="px-4 py-3 text-gray-600">{l.reason || "—"}</td>
                  <td className="px-4 py-3"><button onClick={() => handleDelete(l.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
