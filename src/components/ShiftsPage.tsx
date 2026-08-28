import { useState, useEffect } from "react";
import { api, type Shift } from "../lib/api";
import { Plus, Clock } from "lucide-react";

const shiftTypes = [
  { value: "standard", label: "Standard (fixed days + weekends)" },
  { value: "rotation", label: "Rotation (work N days, rest N days)" },
  { value: "night", label: "Night Shift" },
  { value: "3x8", label: "3x8 (three 8-hour shifts)" },
  { value: "part_time", label: "Part Time" },
];

const defaultConfigs: Record<string, string> = {
  standard: JSON.stringify({ work_days: [1, 2, 3, 4, 5], weekend_days: [6, 7], start_time: "08:00", end_time: "17:00" }),
  rotation: JSON.stringify({ work_days: 3, rest_days: 3, start_time: "08:00", end_time: "17:00" }),
  night: JSON.stringify({ work_days: [1, 2, 3, 4, 5], start_time: "22:00", end_time: "06:00" }),
  "3x8": JSON.stringify({ shifts: [{ start: "06:00", end: "14:00" }, { start: "14:00", end: "22:00" }, { start: "22:00", end: "06:00" }] }),
  part_time: JSON.stringify({ work_days: [1, 2, 3, 4, 5], start_time: "08:00", end_time: "12:00" }),
};

export function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shiftType, setShiftType] = useState("standard");
  const [config, setConfig] = useState(defaultConfigs["standard"]);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [monthlyHours, setMonthlyHours] = useState(173.33);

  const loadShifts = async () => {
    try {
      setShifts(await api.getShifts());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadShifts(); }, []);

  const handleCreate = async () => {
    try {
      await api.createShift(name, description || null, shiftType, config, hourlyRate, monthlyHours);
      setName(""); setDescription(""); setShowForm(false);
      loadShifts();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
          <p className="mt-1 text-sm text-gray-500">Configure work schedules for employees</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Shift
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Create Shift</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard 5/2" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={shiftType} onChange={(e) => { setShiftType(e.target.value); setConfig(defaultConfigs[e.target.value] || "{}"); }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {shiftTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Configuration (JSON)</label>
              <textarea value={config} onChange={(e) => setConfig(e.target.value)} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (DZD)</label>
              <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Hours</label>
              <input type="number" step="0.01" value={monthlyHours} onChange={(e) => setMonthlyHours(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} disabled={!name} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Create</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {shifts.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No shifts configured yet. Create one to assign to employees.</p>
          </div>
        ) : (
          shifts.map((shift) => (
            <div key={shift.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{shift.name}</h3>
                  <p className="text-sm text-gray-500">{shift.description || "—"}</p>
                </div>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">{shift.shift_type}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-gray-500">Hourly Rate:</span> <span className="font-medium text-gray-900">{shift.hourly_rate} DZD</span></div>
                <div><span className="text-gray-500">Monthly Hours:</span> <span className="font-medium text-gray-900">{shift.monthly_hours}</span></div>
                <div><span className="text-gray-500">Config:</span> <code className="text-xs text-gray-700">{shift.config}</code></div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
