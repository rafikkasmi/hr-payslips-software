import { useSalaryContext } from "./SalaryContext";
import { Calendar, Clock, History, Calculator, FileText, Check } from "lucide-react";

type StepKey = "period" | "overtime" | "precalc" | "calculate" | "payslip";
type StepState = "pending" | "done" | "skip";

interface Step {
  key: StepKey;
  label: string;
  icon: typeof Calendar;
  badge?: string;
  action: () => void;
}

export function WorkflowStepper() {
  const ctx = useSalaryContext();
  const { stepStatus, overtimeCount, preCalcEditCount, appCount, selectedPeriod } = ctx;

  if (!selectedPeriod) return null;

  const steps: Step[] = [
    {
      key: "period",
      label: "Période",
      icon: Calendar,
      badge: selectedPeriod,
      action: () => {},
    },
    {
      key: "overtime",
      label: "Heures supp.",
      icon: Clock,
      badge: overtimeCount > 0 ? `${overtimeCount} emp.` : undefined,
      action: () => ctx.setShowOvertimeModal(true),
    },
    {
      key: "precalc",
      label: "Pré-calcul",
      icon: History,
      badge: preCalcEditCount > 0 ? `${preCalcEditCount} modif.` : undefined,
      action: () => {
        if (!ctx.showPreCalcModal) ctx.loadPreCalcReview();
        ctx.setShowPreCalcModal(true);
      },
    },
    {
      key: "calculate",
      label: "Calculer",
      icon: Calculator,
      badge: appCount > 0 ? `${appCount} résultats` : undefined,
      action: () => ctx.handleCalculateAll(),
    },
    {
      key: "payslip",
      label: "Bulletin",
      icon: FileText,
      badge: undefined,
      action: () => {},
    },
  ];

  const stateFor = (key: StepKey): StepState => stepStatus[key];

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((step, idx) => {
          const state = stateFor(step.key);
          const Icon = step.icon;
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.key} className="flex items-center flex-shrink-0">
              <button
                onClick={step.action}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  state === "done"
                    ? "bg-green-50 text-green-700"
                    : state === "skip"
                    ? "bg-gray-50 text-gray-500"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  state === "done"
                    ? "bg-green-600 text-white"
                    : state === "skip"
                    ? "bg-gray-300 text-white"
                    : "bg-blue-600 text-white"
                }`}>
                  {state === "done" ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <Icon className={`h-4 w-4 ${state === "pending" ? "animate-pulse" : ""}`} />
                <span className="font-medium whitespace-nowrap">{step.label}</span>
                {step.badge && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    state === "done" ? "bg-green-200 text-green-800" : "bg-blue-200 text-blue-800"
                  }`}>
                    {step.badge}
                  </span>
                )}
              </button>
              {!isLast && (
                <div className={`h-px w-6 ${state === "done" ? "bg-green-300" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
