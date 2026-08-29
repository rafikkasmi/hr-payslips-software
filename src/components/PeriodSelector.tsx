import { useMemo, useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

interface PeriodSelectorProps {
  value: string; // YYYY-MM
  onChange: (period: string) => void;
  availablePeriods?: string[]; // periods with historical salary data
  minYear?: number;
  maxYear?: number;
  label?: string;
  placeholder?: string;
}

const MONTHS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

export function PeriodSelector({
  value,
  onChange,
  availablePeriods = [],
  minYear,
  maxYear,
  label,
  placeholder = "Sélectionner une période",
}: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => {
    const parts = value?.split("-");
    return parseInt(parts?.[0] ?? String(new Date().getFullYear()), 10);
  });
  const ref = useRef<HTMLDivElement>(null);

  const [year, month] = useMemo(() => {
    const parts = value?.split("-");
    return [
      parseInt(parts?.[0] ?? String(new Date().getFullYear()), 10),
      parseInt(parts?.[1] ?? "1", 10),
    ];
  }, [value]);

  // Sync picker year when value changes externally
  useEffect(() => {
    setPickerYear(year);
  }, [year]);

  const availableSet = useMemo(() => new Set(availablePeriods), [availablePeriods]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const min = minYear ?? 2000;
    const max = maxYear ?? now;
    const list: number[] = [];
    for (let y = max; y >= min; y--) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const isAvailable = (m: number) => availableSet.has(`${pickerYear}-${String(m).padStart(2, "0")}`);

  const handleMonth = (m: number) => {
    onChange(`${pickerYear}-${String(m).padStart(2, "0")}`);
    setOpen(false);
  };

  const changeYear = (delta: number) => {
    const newYear = pickerYear + delta;
    if (years.includes(newYear)) {
      setPickerYear(newYear);
    }
  };

  const display = useMemo(() => {
    if (!value) return placeholder;
    const [y, m] = [year, month];
    return `${MONTHS[m - 1]} ${y}`;
  }, [value, year, month, placeholder]);

  // Close popover when clicking outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      {label && <p className="mb-1 text-xs font-medium text-gray-600">{label}</p>}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:border-blue-500 focus:outline-none"
      >
        <Calendar className="h-4 w-4 text-gray-400" />
        <span>{display}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => changeYear(-1)}
              disabled={pickerYear <= (years[years.length - 1] ?? 2000)}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={pickerYear}
              onChange={(e) => setPickerYear(parseInt(e.target.value, 10))}
              className="rounded border border-gray-300 px-2 py-1 text-sm font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => changeYear(1)}
              disabled={pickerYear >= (years[0] ?? new Date().getFullYear())}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((name, idx) => {
              const m = idx + 1;
              const active = m === month;
              const available = isAvailable(m);
              return (
                <button
                  key={name}
                  onClick={() => handleMonth(m)}
                  className={`
                    rounded-md py-1.5 text-xs font-medium transition-colors
                    ${active
                      ? "ring-2 ring-blue-500 ring-offset-1"
                      : ""
                    }
                    ${available
                      ? active
                        ? "bg-gray-900 text-white"
                        : "bg-gray-800 text-white hover:bg-gray-700"
                      : active
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }
                  `}
                  title={available ? "Salaire historique disponible" : "Aucun salaire historique"}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gray-800" /> Avec historique</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gray-100" /> Sans historique</span>
          </div>
        </div>
      )}
    </div>
  );
}
