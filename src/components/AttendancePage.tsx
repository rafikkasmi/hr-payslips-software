import { useState, useEffect } from "react";
import { api, type AttendanceDay, type EmployeeSummary } from "../lib/api";
import {
  Clock, Users, Loader2, ChevronLeft, ChevronRight,
  Fingerprint, Search, Timer, Save, CheckCircle,
} from "lucide-react";

const statusColors: Record<string, string> = {
  working: "bg-green-500 text-white",
  absent: "bg-red-500 text-white",
  leave: "bg-blue-400 text-white",
  sick_leave: "bg-purple-500 text-white",
  unpaid_leave: "bg-orange-400 text-white",
  maternity_leave: "bg-pink-400 text-white",
  weekend: "bg-gray-200 text-gray-500",
  normal: "bg-gray-100 text-gray-400",
};

const statusLabels: Record<string, string> = {
  working: "Working",
  absent: "Absent",
  leave: "Leave",
  sick_leave: "Sick",
  unpaid_leave: "Unpaid",
  maternity_leave: "Maternity",
  weekend: "Weekend",
  normal: "—",
};

export function AttendancePage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [calendar, setCalendar] = useState<AttendanceDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [rawAttendance, setRawAttendance] = useState<Record<string, unknown>[]>([]);
  const [otHours50, setOtHours50] = useState(0);
  const [otHours100, setOtHours100] = useState(0);
  const [otStatus, setOtStatus] = useState<string>("draft");
  const [otLoading, setOtLoading] = useState(false);
  const [otSaving, setOtSaving] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmpId) {
      loadCalendar();
      loadRawAttendance();
      loadOvertime();
    }
  }, [selectedEmpId, year, month]);

  const loadEmployees = async () => {
    try {
      const emps = await api.getEmployees();
      setEmployees(emps);
    } catch (e) { console.error(e); }
  };

  const loadCalendar = async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    try {
      const cal = await api.getAttendanceCalendar(selectedEmpId, year, month);
      setCalendar(cal);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadRawAttendance = async () => {
    if (!selectedEmpId) return;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    try {
      const att = await api.getAttendance(selectedEmpId, startDate, endDate);
      setRawAttendance(att);
    } catch (e) { console.error(e); }
  };

  const loadOvertime = async () => {
    if (!selectedEmpId) return;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    setOtLoading(true);
    try {
      const ot = await api.getOvertime(selectedEmpId, period) as Record<string, unknown>;
      const monthly = ot.monthly as Record<string, unknown> | null;
      if (monthly) {
        setOtHours50(Number(monthly.total_hours_50 ?? 0));
        setOtHours100(Number(monthly.total_hours_100 ?? 0));
        setOtStatus(String(monthly.status ?? "draft"));
      } else {
        setOtHours50(0);
        setOtHours100(0);
        setOtStatus("draft");
      }
    } catch (e) { console.error(e); }
    finally { setOtLoading(false); }
  };

  const handleSaveOvertime = async () => {
    if (!selectedEmpId) return;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    setOtSaving(true);
    try {
      await api.saveOvertimeMonthly(selectedEmpId, period, otHours50, otHours100, "manual");
      setOtStatus("draft");
      await loadOvertime();
    } catch (e) { console.error(e); }
    finally { setOtSaving(false); }
  };

  const handleConfirmOvertime = async () => {
    if (!selectedEmpId) return;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    try {
      await api.saveOvertimeMonthly(selectedEmpId, period, otHours50, otHours100, "manual");
      await api.confirmOvertimeMonthly(selectedEmpId, period);
      await loadOvertime();
    } catch (e) { console.error(e); }
  };

  const filteredEmployees = employees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.nom.toLowerCase().includes(q) || e.prenom.toLowerCase().includes(q) || e.matricule.includes(q);
  });

  const selectedEmp = employees.find(e => e.id === selectedEmpId);

  const attendanceByDate: Record<string, Record<string, unknown>[]> = {};
  rawAttendance.forEach(a => {
    const dt = String(a.punch_datetime ?? "").split(" ")[0] ?? "";
    if (!attendanceByDate[dt]) attendanceByDate[dt] = [];
    attendanceByDate[dt].push(a);
  });

  const stats = calendar.reduce((acc, day) => {
    if (day.status in acc) acc[day.status]++;
    return acc;
  }, {} as Record<string, number>);

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });

  return (
    <div className="flex h-full">
      {/* Employee list sidebar */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="border-b border-gray-200 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredEmployees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setSelectedEmpId(emp.id)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 ${
                selectedEmpId === emp.id ? "bg-blue-50 border-l-4 border-blue-600" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{emp.nom} {emp.prenom}</div>
                <div className="text-xs text-gray-500">{emp.matricule} {emp.pointeuse_pin ? `· PIN ${emp.pointeuse_pin}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedEmpId ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Users className="h-16 w-16 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">Select an employee to view attendance</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{selectedEmp?.nom} {selectedEmp?.prenom}</h1>
                <p className="text-sm text-gray-500">Matricule: {selectedEmp?.matricule} · PIN: {selectedEmp?.pointeuse_pin ?? "—"}</p>
              </div>
            </div>

            {/* Month navigator */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }}
                className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold min-w-[140px] text-center">{monthName}</span>
              <button
                onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }}
                className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Stats bar */}
            <div className="mt-4 flex flex-wrap gap-3">
              {Object.entries(statusLabels).filter(([k]) => k !== "normal").map(([key, label]) => {
                const count = stats[key] ?? 0;
                if (count === 0 && key !== "working") return null;
                return (
                  <div key={key} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
                    <div className={`h-3 w-3 rounded ${statusColors[key]}`} />
                    <span className="text-gray-600">{label}</span>
                    <span className="font-bold text-gray-900">{count}</span>
                  </div>
                );
              })}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <>
                {/* Calendar grid */}
                <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="grid grid-cols-7 gap-1.5">
                    {["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => (
                      <div key={d} className="text-center text-xs font-semibold text-gray-400 pb-2">{d}</div>
                    ))}
                    {(() => {
                      // Add leading empty cells to align day 1 with correct weekday column
                      const weekdayOrder = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                      const firstWeekday = calendar.length > 0 ? calendar[0].weekday : "Saturday";
                      const leadCount = weekdayOrder.indexOf(firstWeekday);
                      const blanks = Array.from({ length: leadCount }, (_, i) => (
                        <div key={`blank-${i}`} className="min-h-[60px]" />
                      ));
                      return blanks;
                    })()}
                    {calendar.map((day) => (
                      <div
                        key={day.date}
                        className={`relative rounded-lg p-2 min-h-[60px] ${statusColors[day.status] ?? "bg-gray-100"}`}
                        title={`${day.date} — ${statusLabels[day.status] ?? day.status}${day.punches ? ` (${day.punches} punches)` : ""}`}
                      >
                        <div className="text-xs font-bold">{day.day}</div>
                        {day.punches > 0 && (
                          <div className="text-[10px] mt-1 opacity-80">{day.punches} punches</div>
                        )}
                        {day.leave_type && (
                          <div className="text-[10px] mt-0.5 opacity-80">{day.leave_type}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                  {Object.entries(statusLabels).filter(([k]) => k !== "normal").map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <div className={`h-3 w-3 rounded ${statusColors[key]}`} />
                      {label}
                    </div>
                  ))}
                </div>

                {/* Raw attendance log */}
                {Object.keys(attendanceByDate).length > 0 && (
                  <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-gray-400" />
                      Punch Log — {monthName}
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {Object.entries(attendanceByDate).sort(([a], [b]) => b.localeCompare(a)).map(([date, punches]) => (
                        <div key={date} className="flex items-start gap-3 border-b border-gray-100 pb-2">
                          <div className="text-xs font-mono text-gray-500 w-24">{date}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {punches.map((p, i) => (
                              <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                {String(p.punch_datetime ?? "").split(" ")[1] ?? "—"}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(attendanceByDate).length === 0 && !loading && (
                  <div className="mt-6 rounded-xl border border-gray-200 bg-white p-8 text-center">
                    <Fingerprint className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-3 text-sm text-gray-500">No punch data for this month</p>
                  </div>
                )}

                {/* Overtime section */}
                <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Timer className="h-4 w-4 text-gray-400" />
                      Overtime — {monthName}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${otStatus === "confirmed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {otStatus}
                    </span>
                  </div>
                  {otLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Hours at 50% rate</label>
                          <input
                            type="number"
                            step="0.5"
                            value={otHours50}
                            onChange={(e) => setOtHours50(parseFloat(e.target.value) || 0)}
                            disabled={otStatus === "confirmed"}
                            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-100"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Hours at 100% rate</label>
                          <input
                            type="number"
                            step="0.5"
                            value={otHours100}
                            onChange={(e) => setOtHours100(parseFloat(e.target.value) || 0)}
                            disabled={otStatus === "confirmed"}
                            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-100"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveOvertime}
                          disabled={otSaving || otStatus === "confirmed"}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" /> Save
                        </button>
                        {otStatus !== "confirmed" && (
                          <button
                            onClick={handleConfirmOvertime}
                            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Confirm
                          </button>
                        )}
                      </div>
                      {otStatus === "confirmed" && (
                        <p className="text-xs text-green-600">Overtime confirmed — will be injected into salary calculation for this period.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
