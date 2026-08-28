import { useState, useEffect } from "react";
import { api, type EmployeeSummary, type Shift, type AttendanceDay, type CalcResult, type EmployeeRubrique, type RubriqueHistoryEntry } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import {
  Search, X, Clock, Calculator, History, ChevronLeft, ChevronRight,
  Loader2, DollarSign, Edit2, Save,
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
  working: "Working", absent: "Absent", leave: "Leave",
  sick_leave: "Sick", unpaid_leave: "Unpaid", maternity_leave: "Maternity",
  weekend: "Weekend", normal: "—",
};

export function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "attendance" | "salary" | "primes" | "family" | "leave" | "loans" | "events">("info");
  const [calendar, setCalendar] = useState<AttendanceDay[]>([]);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [salaryHistory, setSalaryHistory] = useState<Record<string, unknown>[]>([]);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcPeriod, setCalcPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [calculating, setCalculating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [calcCalendar, setCalcCalendar] = useState<AttendanceDay[]>([]);
  const [empRubriques, setEmpRubriques] = useState<EmployeeRubrique[]>([]);
  const [editingRub, setEditingRub] = useState<string | null>(null);
  const [editRubValue, setEditRubValue] = useState("");
  const [rubHistory, setRubHistory] = useState<RubriqueHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [preCalc, setPreCalc] = useState<Record<string, unknown> | null>(null);
  const [loadingPreCalc, setLoadingPreCalc] = useState(false);
  const [rubInputs, setRubInputs] = useState<Record<string, number>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [emps, shfts] = await Promise.all([api.getEmployees(), api.getShifts()]);
      setEmployees(emps);
      setShifts(shfts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (selectedEmp && detailTab === "attendance") {
      loadCalendar();
    }
    if (selectedEmp && detailTab === "salary") {
      loadSalaryHistory();
    }
    if (selectedEmp && detailTab === "primes") {
      loadEmpRubriques();
    }
  }, [selectedEmp, detailTab, calYear, calMonth]);

  const loadCalendar = async () => {
    if (!selectedEmp) return;
    setDetailLoading(true);
    try {
      const cal = await api.getAttendanceCalendar(selectedEmp.id, calYear, calMonth);
      setCalendar(cal);
    } catch (e) { console.error(e); }
    finally { setDetailLoading(false); }
  };

  const loadSalaryHistory = async () => {
    if (!selectedEmp) return;
    try {
      const h = await api.getSalaryHistory(selectedEmp.id);
      setSalaryHistory(h);
    } catch (e) { console.error(e); }
  };

  const handleCalculate = async () => {
    if (!selectedEmp) return;
    setCalculating(true);
    try {
      // Convert rubInputs to the format expected by the API: code -> [M, N]
      const inputValues: Record<string, [number, number]> = {};
      for (const [code, value] of Object.entries(rubInputs)) {
        const numericCode = code.replace(/^R+/, "");
        inputValues[numericCode] = [value, 0];
      }
      const result = await api.calculateSalary(selectedEmp.id, calcPeriod, inputValues);
      setCalcResult(result);
      await api.saveSalaryCalculation(result);
      await loadSalaryHistory();
      // Load attendance calendar for the calc period
      const [yr, mo] = calcPeriod.split("-").map(Number);
      try {
        const cal = await api.getAttendanceCalendar(selectedEmp.id, yr, mo);
        setCalcCalendar(cal);
      } catch (e) { console.error(e); }
    } catch (e) { console.error(e); }
    finally { setCalculating(false); }
  };

  const loadEmpRubriques = async () => {
    if (!selectedEmp) return;
    try {
      const r = await api.getEmployeeCurrentRubriques(selectedEmp.id);
      setEmpRubriques(r);
    } catch (e) { console.error(e); }
  };

  const handleSaveRubrique = async (code: string) => {
    if (!selectedEmp) return;
    const val = parseFloat(editRubValue) || 0;
    try {
      await api.updateEmployeeRubrique(selectedEmp.id, code, val, null);
      setEditingRub(null);
      await loadEmpRubriques();
    } catch (e) { console.error(e); }
  };

  const loadRubHistory = async (code?: string) => {
    if (!selectedEmp) return;
    try {
      const h = await api.getEmployeeRubriqueHistory(selectedEmp.id, code);
      setRubHistory(h);
      setShowHistory(true);
    } catch (e) { console.error(e); }
  };

  const handleLoadPreCalc = async () => {
    if (!selectedEmp) return;
    setLoadingPreCalc(true);
    try {
      const summary = await api.getPreCalcSummary(selectedEmp.id, calcPeriod);
      setPreCalc(summary as Record<string, unknown>);
      // Load rubrique inputs into editable state
      if (Array.isArray(summary.rubriques)) {
        const inputs: Record<string, number> = {};
        for (const r of summary.rubriques as Record<string, unknown>[]) {
          const code = String(r.code ?? "");
          const value = Number(r.value ?? 0);
          if (code) inputs[code] = value;
        }
        setRubInputs(inputs);
      }
    } catch (e) { console.error(e); }
    finally { setLoadingPreCalc(false); }
  };

  const handleAssignShift = async (empId: number, shiftId: number) => {
    try {
      await api.assignShift(empId, shiftId);
      loadData();
    } catch (e) { console.error(e); }
  };

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return e.nom.toLowerCase().includes(q) ||
      e.prenom.toLowerCase().includes(q) ||
      e.matricule.toLowerCase().includes(q);
  });

  const monthName = new Date(calYear, calMonth - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
      <p className="mt-1 text-sm text-gray-500">{employees.length} employees imported from PCPAIE</p>

      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or matricule..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-center text-sm text-gray-500">Loading...</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Matricule</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Section</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Pointeuse</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Shift</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedEmp(emp); setPreCalc(null); setCalcResult(null); setRubInputs({}); }}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{emp.matricule}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{emp.nom} {emp.prenom}</td>
                  <td className="px-4 py-3 text-gray-600">{emp.section || "—"}</td>
                  <td className="px-4 py-3">
                    {emp.pointeuse_pin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        PIN {emp.pointeuse_pin}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={emp.shift_name || ""}
                      onChange={(e) => {
                        const shift = shifts.find((s) => s.name === e.target.value);
                        if (shift) handleAssignShift(emp.id, shift.id);
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="">No shift</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex h-2 w-2 rounded-full ${emp.actif ? "bg-green-500" : "bg-gray-300"}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs font-medium text-blue-600 hover:text-blue-800">View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee detail modal */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSelectedEmp(null)}>
          <div className="max-h-[90vh] w-[900px] max-w-[95vw] overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedEmp.nom} {selectedEmp.prenom}</h2>
                <p className="text-sm text-gray-500">Matricule: {selectedEmp.matricule} · PIN: {selectedEmp.pointeuse_pin ?? "—"}</p>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="rounded-lg p-1.5 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-gray-200 px-6">
              {[
                { key: "info", label: "Info", icon: null },
                { key: "family", label: "Famille", icon: null },
                { key: "attendance", label: "Attendance", icon: Clock },
                { key: "salary", label: "Salary", icon: Calculator },
                { key: "primes", label: "Primes", icon: DollarSign },
                { key: "leave", label: "Congés", icon: null },
                { key: "loans", label: "Prêts", icon: null },
                { key: "events", label: "Événements", icon: null },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key as "info" | "attendance" | "salary" | "primes" | "family" | "leave" | "loans" | "events")}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 ${
                    detailTab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              {detailTab === "info" && <EmployeeInfoTab emp={selectedEmp} />}
              {detailTab === "family" && <EmployeeFamilyTab emp={selectedEmp} />}
              {detailTab === "leave" && <EmployeeLeaveTab matricule={selectedEmp.matricule} />}
              {detailTab === "loans" && <EmployeeLoansTab matricule={selectedEmp.matricule} />}
              {detailTab === "events" && <EmployeeEventsTab matricule={selectedEmp.matricule} />}
              {detailTab === "primes" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Rubrique Values</h3>
                    <button
                      onClick={() => loadRubHistory()}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <History className="h-3 w-3" /> View All History
                    </button>
                  </div>
                  <div className="space-y-1">
                    {empRubriques.length === 0 && (
                      <p className="text-sm text-gray-400">No rubriques assigned</p>
                    )}
                    {empRubriques.map((r) => (
                      <div key={r.rubrique_code} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
                        <span className="font-mono text-xs text-gray-500 w-16">{r.rubrique_code}</span>
                        <span className="text-sm text-gray-700 flex-1">{r.libelle ?? "—"}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.source === "override" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                          {r.source === "override" ? "Override" : "Poste"}
                        </span>
                        {editingRub === r.rubrique_code ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={editRubValue}
                              onChange={(e) => setEditRubValue(e.target.value)}
                              className="w-28 rounded border border-gray-300 px-2 py-0.5 text-right text-sm"
                              autoFocus
                            />
                            <button onClick={() => handleSaveRubrique(r.rubrique_code)} className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"><Save className="h-3 w-3" /></button>
                            <button onClick={() => setEditingRub(null)} className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-300">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 w-28 text-right">{formatCurrency(r.value)}</span>
                            <button
                              onClick={() => { setEditingRub(r.rubrique_code); setEditRubValue(String(r.value)); }}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => loadRubHistory(r.rubrique_code)}
                              className="text-gray-400 hover:text-gray-600"
                              title="History"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {showHistory && rubHistory.length > 0 && (
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-gray-600">Change History</h4>
                        <button onClick={() => setShowHistory(false)} className="text-xs text-gray-500 hover:text-gray-700">Close</button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {rubHistory.map((h) => (
                          <div key={h.id} className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-gray-500 w-16">{h.rubrique_code}</span>
                            <span className="text-gray-600">{formatCurrency(h.old_value ?? 0)} → {formatCurrency(h.new_value ?? 0)}</span>
                            <span className="text-gray-400 ml-auto">{h.change_date ?? "—"}</span>
                            {h.reason && <span className="text-gray-500">({h.reason})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {detailTab === "attendance" && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <button onClick={() => { if (calMonth === 1) { setCalMonth(12); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold min-w-[140px] text-center">{monthName}</span>
                    <button onClick={() => { if (calMonth === 12) { setCalMonth(1); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {detailLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                  ) : (
                    <>
                      <div className="grid grid-cols-7 gap-1">
                        {["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => (
                          <div key={d} className="text-center text-xs font-semibold text-gray-400 pb-1">{d}</div>
                        ))}
                        {(() => {
                          const weekdayOrder = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                          const firstWeekday = calendar.length > 0 ? calendar[0].weekday : "Saturday";
                          const leadCount = weekdayOrder.indexOf(firstWeekday);
                          return Array.from({ length: leadCount }, (_, i) => (
                            <div key={`blank-${i}`} className="min-h-[40px]" />
                          ));
                        })()}
                        {calendar.map((day) => (
                          <div
                            key={day.date}
                            className={`rounded p-1.5 min-h-[40px] ${statusColors[day.status] ?? "bg-gray-100"}`}
                            title={`${day.date} — ${statusLabels[day.status] ?? day.status}`}
                          >
                            <div className="text-[10px] font-bold">{day.day}</div>
                            {day.punches > 0 && <div className="text-[8px] opacity-80">{day.punches}p</div>}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                        {Object.entries(statusLabels).filter(([k]) => k !== "normal").map(([key, label]) => (
                          <div key={key} className="flex items-center gap-1">
                            <div className={`h-2.5 w-2.5 rounded ${statusColors[key]}`} />
                            {label}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {detailTab === "salary" && (
                <div>
                  <div className="rounded-lg border border-gray-200 p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="month"
                        value={calcPeriod}
                        onChange={(e) => setCalcPeriod(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={handleCalculate}
                        disabled={calculating}
                        className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                        Calculate
                      </button>
                      <button
                        onClick={handleLoadPreCalc}
                        disabled={loadingPreCalc}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {loadingPreCalc ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                        Pre-calc Summary
                      </button>
                    </div>

                    {preCalc && (
                      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-blue-900">Pre-calculation Summary — {String(preCalc.period ?? "")}</h4>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="rounded bg-white p-2">
                            <div className="text-xs text-gray-500">Jours de présence</div>
                            <div className="font-bold">{Number(preCalc.attendance_days ?? 0)}</div>
                          </div>
                          <div className="rounded bg-white p-2">
                            <div className="text-xs text-gray-500">Heures supplémentaires</div>
                            <div className="font-bold">{preCalc.overtime ? `${Number((preCalc.overtime as Record<string, unknown>).hours_50 ?? 0)}h (50%) + ${Number((preCalc.overtime as Record<string, unknown>).hours_100 ?? 0)}h (100%)` : "Aucune"}</div>
                          </div>
                          <div className="rounded bg-white p-2">
                            <div className="text-xs text-gray-500">Primes actives</div>
                            <div className="font-bold">{Array.isArray(preCalc.bonuses) ? (preCalc.bonuses as unknown[]).length : 0}</div>
                          </div>
                        </div>
                        {Array.isArray(preCalc.bonuses) && (preCalc.bonuses as unknown[]).length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-600">Primes à appliquer :</div>
                            {(preCalc.bonuses as Record<string, unknown>[]).map((b, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className={`rounded-full px-2 py-0.5 ${String(b.bonus_type) === "bonus" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{String(b.bonus_type)}</span>
                                <span className="font-medium">{String(b.title)}</span>
                                <span className="text-gray-500">{b.is_percentage ? `${b.amount}%` : formatCurrency(Number(b.amount))}</span>
                                {b.rubrique_code ? <span className="text-gray-400">→ R{String(b.rubrique_code)}</span> : null}
                              </div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(preCalc.rubriques) && (preCalc.rubriques as unknown[]).length > 0 && (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            <span className="text-xs font-semibold text-gray-600 flex items-center justify-between">
                              <span>Rubriques ({(preCalc.rubriques as unknown[]).length}) :</span>
                              <span className="text-gray-400 font-normal">Modifier les valeurs avant le calcul</span>
                            </span>
                            {(preCalc.rubriques as Record<string, unknown>[]).map((r, i) => {
                              const code = String(r.code ?? "");
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="font-mono text-gray-500 w-14">{code}</span>
                                  <span className="text-gray-700 flex-1 truncate">{String(r.libelle ?? "—")}</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={rubInputs[code] ?? 0}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value) || 0;
                                      setRubInputs(prev => ({ ...prev, [code]: v }));
                                    }}
                                    className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-xs font-medium"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {calcResult && (
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div className="rounded-lg bg-gray-50 p-3">
                            <div className="text-xs text-gray-500">Total Brut</div>
                            <div className="text-sm font-bold">{formatCurrency(calcResult.total_brut)}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-3">
                            <div className="text-xs text-gray-500">Cotisable</div>
                            <div className="text-sm font-bold">{formatCurrency(calcResult.base_cotisable)}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-3">
                            <div className="text-xs text-gray-500">IRG</div>
                            <div className="text-sm font-bold">{formatCurrency(calcResult.irg)}</div>
                          </div>
                          <div className="rounded-lg bg-green-50 p-3">
                            <div className="text-xs text-green-600">Net à Payer</div>
                            <div className="text-sm font-bold text-green-700">{formatCurrency(calcResult.net_payer)}</div>
                          </div>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-0.5">
                          {calcResult.lines.filter(l => l.amount !== 0).map((line) => (
                            <div key={line.code} className="flex justify-between text-xs py-0.5">
                              <span className="font-mono text-gray-500 w-10">{line.code}</span>
                              <span className="text-gray-700 flex-1 ml-2">{line.libelle}</span>
                              <span className={`font-medium ${line.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                                {formatCurrency(line.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {calcResult.applied_bonuses && calcResult.applied_bonuses.length > 0 && (
                          <div className="mt-2 border-t border-gray-200 pt-2">
                            <h4 className="text-xs font-semibold text-gray-500 mb-1">APPLIED BONUSES & DEDUCTIONS</h4>
                            <div className="space-y-0.5">
                              {calcResult.applied_bonuses.map((b) => (
                                <div key={b.id} className="flex justify-between text-xs py-0.5">
                                  <span className="text-gray-700 flex-1">
                                    {b.title}
                                    {b.is_percentage && <span className="text-gray-400 ml-1">({b.amount}%)</span>}
                                  </span>
                                  <span className={`font-medium ${b.computed_amount < 0 ? "text-red-600" : "text-green-700"}`}>
                                    {formatCurrency(b.computed_amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Attendance calendar grid */}
                        {calcCalendar.length > 0 && (
                          <div className="mt-4 border-t border-gray-200 pt-3">
                            <h4 className="text-xs font-semibold text-gray-500 mb-2">ATTENDANCE — {calcPeriod}</h4>
                            <div className="grid grid-cols-7 gap-1">
                              {["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map(d => (
                                <div key={d} className="text-center text-[10px] font-semibold text-gray-400 pb-1">{d}</div>
                              ))}
                              {(() => {
                                const weekdayOrder = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                                const firstWeekday = calcCalendar.length > 0 ? calcCalendar[0].weekday : "Saturday";
                                const leadCount = weekdayOrder.indexOf(firstWeekday);
                                return Array.from({ length: leadCount }, (_, i) => (
                                  <div key={`calc-blank-${i}`} className="min-h-[28px]" />
                                ));
                              })()}
                              {calcCalendar.map((day) => (
                                <div
                                  key={day.date}
                                  className={`rounded p-1 min-h-[28px] ${statusColors[day.status] ?? "bg-gray-100"}`}
                                  title={`${day.date} — ${statusLabels[day.status] ?? day.status}${day.punches ? ` (${day.punches} punches)` : ""}`}
                                >
                                  <div className="text-[9px] font-bold text-center">{day.day}</div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-600">
                              {Object.entries(statusLabels).filter(([k]) => k !== "normal").map(([key, label]) => (
                                <div key={key} className="flex items-center gap-1">
                                  <div className={`h-2 w-2 rounded ${statusColors[key]}`} />
                                  {label}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                      <History className="h-3 w-3" /> SALARY HISTORY
                    </h4>
                    {salaryHistory.length === 0 ? (
                      <p className="text-sm text-gray-400">No salary history yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {salaryHistory.map((h, i) => (
                          <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-gray-500">{String(h.period ?? "—")}</span>
                              <span className="text-gray-700">Net: {formatCurrency(Number(h.net_payer ?? 0))}</span>
                            </div>
                            <div className="flex gap-3 text-xs text-gray-500">
                              <span>Brut: {formatCurrency(Number(h.total_brut ?? 0))}</span>
                              <span>IRG: {formatCurrency(Number(h.irg ?? 0))}</span>
                              <span className="text-gray-400">{String(h.calculated_at ?? "").split(" ")[0]}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeInfoTab({ emp }: { emp: EmployeeSummary }) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.getEmployeeDetail(emp.id).then(setDetail).catch(console.error);
  }, [emp.id]);

  if (!detail) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;

  const withLabel = (code: unknown, libelle: unknown): string => {
    const label = libelle != null ? String(libelle).trim() : "";
    const raw = code != null ? String(code).trim() : "";
    if (label && label !== "") return label;
    if (raw && raw !== "") return raw;
    return "—";
  };

  const val = (k: string): string => {
    const v = detail[k];
    if (v == null) return "—";
    const s = String(v).trim();
    return s === "" ? "—" : s;
  };

  const sections: [string, [string, string][]][] = [
    ["Identité", [
      ["Matricule", val("matricule")],
      ["Nom", val("nom")],
      ["Prénom", val("prenom")],
      ["Sexe", val("sexe")],
      ["Date de naissance", val("naiss_date")],
      ["Lieu de naissance", val("naiss_lieu")],
      ["Acte de naissance", val("n_act_nais")],
      ["Commune de naissance", val("comun_nais")],
      ["Nationalité", val("cnationalt")],
      ["Sit. Famille", val("sit_fam")],
      ["Enfants à charge", val("nbre_enf")],
      ["Enfants < 10 ans (M)", String(detail.nbr_enfp10 ?? "—")],
      ["Enfants < 10 ans (F)", String(detail.nbr_enfm10 ?? "—")],
    ]],
    ["Filiation", [
      ["Filiation", val("filiation")],
      ["Prénom du père", val("fil_p_pere")],
      ["Nom de la mère", val("fil_n_mere")],
      ["Prénom de la mère", val("fil_p_mere")],
    ]],
    ["Conjoint", [
      ["Nom du conjoint", val("conj_nom")],
      ["Prénom du conjoint", val("nom_p_conj")],
      ["Date mariage", val("conj_datem")],
      ["Conjoint travaille", val("conj_trav")],
    ]],
    ["Documents", [
      ["N° ID National", val("n_id_nat")],
      ["CIN N°", val("cin_no")],
      ["CIN délivrée le", val("cin_d_le")],
      ["CIN à", val("cin_d_a")],
      ["Passeport N°", val("pass_no")],
      ["Passeport délivré le", val("pass_d_le")],
      ["Passeport à", val("pass_d_a")],
      ["Permis conduite N°", val("pc_no")],
      ["PC délivré le", val("pc_d_le")],
      ["PC à", val("pc_d_a")],
    ]],
    ["Contact", [
      ["Téléphone", val("telephone")],
      ["Email", val("e_mail")],
      ["Adresse", val("adresse")],
      ["Adresse 2", val("adresse2")],
      ["Code postal", val("code_post")],
    ]],
    ["Professionnel", [
      ["Date entrée", val("dte_entree")],
      ["Date sortie", val("dte_sortie")],
      ["Motif sortie", val("motif_sort")],
      ["Contrat du", val("dte_cont_d")],
      ["Contrat au", val("dte_cont_f")],
      ["Date reprise", val("dte_repris")],
      ["Catégorie", withLabel(detail.categorie, detail.categorie_libelle)],
      ["Section", withLabel(detail.section, detail.section_libelle)],
      ["Échelon", val("echelon")],
      ["Classe", val("classe")],
      ["Structure", withLabel(detail.structure, detail.structure_libelle)],
      ["Unité", withLabel(detail.unite, detail.unite_libelle)],
      ["Affectation", withLabel(detail.affectatio, detail.affectatio_libelle)],
      ["Contrat", withLabel(detail.contrat, detail.contrat_libelle)],
      ["Catégorie spéciale", val("categ_sp")],
      ["Diplôme", val("diplome")],
      ["Grille", val("no_grille")],
      ["Code grille", val("code_grill")],
      ["Attribut 1", val("attrib1")],
      ["Attribut 2", val("attrib2")],
      ["Attribut 3", val("attrib3")],
    ]],
    ["Sécurité sociale", [
      ["N° SS", val("n_secu_sle")],
      ["N° CNAS", val("no_cnas")],
      ["Code CNAS", val("code_cnas")],
      ["Code IRG", val("code_irg")],
      ["N° Compte", val("no_compte")],
      ["Mutuelle", val("no_mutuel")],
      ["Mutuelle depuis", val("mutu_dted")],
      ["Mutuelle jusqu'à", val("mutu_dtef")],
      ["Org. payeur", val("org_payeur")],
      ["Org. employeur", val("org_pemploy")],
      ["Code règlement", val("cod_regl")],
    ]],
    ["Dates de carrière", [
      ["Date fonction", val("date_fnc")],
      ["Date section", val("date_sec")],
      ["Date DAS", val("date_das")],
      ["Date unité", val("date_unt")],
      ["Date affectation", val("date_aff")],
      ["Date diplôme", val("date_dip")],
      ["Date catégorie", val("date_cat")],
      ["Date emploi", val("date_emp")],
      ["Date AT1", val("date_at1")],
      ["Date AT2", val("date_at2")],
      ["Date AT3", val("date_at3")],
    ]],
    ["Congés (PERS1)", [
      ["Congé dû (jours)", val("conge_du_j")],
      ["Congé dû (cotisable)", val("conge_du_c")],
      ["Congé dû (imposable)", val("conge_du_i")],
      ["Congé pris (jours)", val("conge_pr_j")],
      ["Congé pris (cotisable)", val("conge_pr_c")],
      ["Congé pris (imposable)", val("conge_pr_i")],
      ["Congé add. (jours)", val("conge_ad_j")],
      ["Congé add. (cotisable)", val("conge_ad_c")],
      ["Congé add. (imposable)", val("conge_ad_i")],
      ["Congé validé", String(detail.conge_ok === 1 ? "Oui" : "Non")],
      ["Jours ouvrables", val("nbr_jr_ouv")],
      ["Heures ouvrables", val("nbr_hr_ouv")],
    ]],
    ["Notes", [
      ["Note fonction", val("note_fnc")],
      ["Note section", val("note_sec")],
      ["Note DAS", val("note_das")],
      ["Note unité", val("note_unt")],
      ["Note affectation", val("note_aff")],
      ["Note diplôme", val("note_dip")],
      ["Note catégorie", val("note_cat")],
      ["Note emploi", val("note_emp")],
      ["Note AT1", val("note_at1")],
      ["Note AT2", val("note_at2")],
      ["Note AT3", val("note_at3")],
      ["Note contrat", val("note_con")],
      ["Note motif", val("note_mtf")],
      ["Note de paie", val("notep")],
      ["Note paie (AR)", val("anotep")],
      ["Mémoire 1", val("memoire1")],
      ["Mémoire 2", val("memoire2")],
    ]],
    ["Divers", [
      ["Remarque", val("remarque")],
      ["Groupage", val("groupage")],
      ["Gestion", String(detail.gestion ?? "—")],
      ["N° profil", val("no_profil")],
      ["Enfants à charge", val("nbr_enf_af")],
      ["Personnes à charge", val("nbr_prs_ch")],
      ["Enfants +10 ans", val("nbr_enfp10")],
      ["Enfants -10 ans", val("nbr_enfm10")],
      ["Conjoint travaille", val("conj_trav")],
      ["Intempérie", String(detail.ok_intemp === 1 ? "Oui" : "Non")],
      ["Nationalité étrangère", String(detail.ok_nat_etr === 1 ? "Oui" : "Non")],
      ["Verrouillage valeurs", String(detail.lock_val ?? "—")],
      ["Congé (flag)", String(detail.conge ?? "—")],
      ["Sorti (flag)", String(detail.sorti ?? "—")],
      ["Obs. prêt 1", val("pret_obs1")],
      ["Obs. prêt 2", val("pret_obs2")],
      ["Enfants (table)", String(detail.child_count ?? "0")],
    ]],
  ];

  return (
    <div className="space-y-4">
      {sections.map(([sectionTitle, fields]) => (
        <div key={sectionTitle}>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{sectionTitle}</h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {fields.map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] truncate" title={value}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Family tab — children
// ============================================================
function EmployeeFamilyTab({ emp }: { emp: EmployeeSummary }) {
  const [children, setChildren] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    api.getEmployeeChildren(emp.id).then(setChildren).catch(console.error);
  }, [emp.id]);

  if (!children) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Enfants ({children.length})</h4>
      {children.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun enfant enregistré</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Prénom</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Date de naissance</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Scolarisé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {children.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{String(c.prenom ?? "—")}</td>
                  <td className="px-3 py-2 text-gray-600">{String(c.nais_date ?? "—")}</td>
                  <td className="px-3 py-2 text-gray-600">{String(c.scolarise ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Leave tab — leave history
// ============================================================
function EmployeeLeaveTab({ matricule }: { matricule: string }) {
  const [leaves, setLeaves] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmployeeLeaveHistory(matricule, 200).then(setLeaves).catch(console.error).finally(() => setLoading(false));
  }, [matricule]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!leaves || leaves.length === 0) return <p className="text-sm text-gray-400">Aucun congé enregistré</p>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Historique des congés ({leaves.length} affichés)</h4>
      <div className="max-h-[50vh] overflow-y-auto overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Mois</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Libellé</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Jours</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Cotisable</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Imposable</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Sens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leaves.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-700 font-mono">{String(l.date ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.mois ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-700">{String(l.libelle ?? "—")}</td>
                <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{Number(l.jours ?? 0).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{Number(l.cotisable ?? 0).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{Number(l.imposable ?? 0).toFixed(2)}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${String(l.sens ?? "") === "+" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {String(l.sens ?? "—")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Loans tab — employee loans
// ============================================================
function EmployeeLoansTab({ matricule }: { matricule: string }) {
  const [loans, setLoans] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmployeeLoans(matricule).then(setLoans).catch(console.error).finally(() => setLoading(false));
  }, [matricule]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!loans || loans.length === 0) return <p className="text-sm text-gray-400">Aucun prêt enregistré</p>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Prêts ({loans.length})</h4>
      <div className="max-h-[50vh] overflow-y-auto overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">N° Prêt</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Code Rub</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Libellé</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Mois</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Montant</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Sens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loans.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-700 font-mono">{String(l.no_pret ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.code_rub ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-700">{String(l.libelle ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.mois ?? "—")}</td>
                <td className="px-3 py-1.5 text-gray-600 font-mono">{String(l.date ?? "—")}</td>
                <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{formatCurrency(Number(l.montant ?? 0))}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${String(l.sens ?? "") === "+" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {String(l.sens ?? "—")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Events tab — career events
// ============================================================
function EmployeeEventsTab({ matricule }: { matricule: string }) {
  const [events, setEvents] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmployeeEvents(matricule).then(setEvents).catch(console.error).finally(() => setLoading(false));
  }, [matricule]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!events || events.length === 0) return <p className="text-sm text-gray-400">Aucun événement de carrière enregistré</p>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Événements de carrière ({events.length})</h4>
      <div className="space-y-2">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600">
              <span className="text-[10px] font-medium">{String(e.date ?? "—").substring(0, 2)}</span>
              <span className="text-[10px]">{String(e.date ?? "—").substring(2, 5)}</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{String(e.libelle ?? "—")}</div>
              <div className="text-xs text-gray-500">{String(e.alibelle ?? "—")} · {String(e.heure ?? "—")} · Code: {String(e.codop ?? "—")}</div>
            </div>
            <span className="text-xs text-gray-400 font-mono">{String(e.date ?? "—")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
