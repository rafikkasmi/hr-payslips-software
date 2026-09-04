import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { api, type DossierRegistry, type DossierInfo } from "../lib/api";
import { Building2, ChevronDown, Check, RefreshCw, Users } from "lucide-react";
import { cn } from "../lib/utils";

interface DossierSwitcherProps {
  onSwitch: () => void;
}

export interface DossierSwitcherHandle {
  refresh: () => void;
}

export const DossierSwitcher = forwardRef<DossierSwitcherHandle, DossierSwitcherProps>(
  function DossierSwitcher({ onSwitch }, ref) {
    const [registry, setRegistry] = useState<DossierRegistry | null>(null);
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState<number | null>(null);
    const refDiv = useRef<HTMLDivElement>(null);

    const loadRegistry = useCallback(async () => {
      try {
        const reg = await api.getDossiers();
        setRegistry(reg);
      } catch (e) {
        console.error("Failed to load dossiers:", e);
      }
    }, []);

    // Load on mount
    useEffect(() => {
      loadRegistry();
    }, [loadRegistry]);

    // Expose refresh to parent
    useImperativeHandle(ref, () => ({
      refresh: loadRegistry,
    }), [loadRegistry]);

    // Close dropdown on outside click
    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (refDiv.current && !refDiv.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const activeDossier = registry?.dossiers.find(
      (d) => d.id === registry.active_dossier_id
    );

    const handleSwitch = async (id: number) => {
      if (id === registry?.active_dossier_id) {
        setOpen(false);
        return;
      }
      setSwitching(id);
      try {
        await api.switchDossier(id);
        // Reload registry to reflect the change
        const updated = await api.getDossiers();
        setRegistry(updated);
        setOpen(false);
        onSwitch();
      } catch (e) {
        console.error("Failed to switch dossier:", e);
      } finally {
        setSwitching(null);
      }
    };

    if (!registry || registry.dossiers.length === 0) {
      return null;
    }

    return (
      <div ref={refDiv} className="relative">
        {/* Always a clickable button — even with 1 dossier */}
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
            open
              ? "bg-blue-50 text-blue-700"
              : "text-gray-700 hover:bg-gray-100"
          )}
        >
          <Building2 className={cn("h-4 w-4 shrink-0", open ? "text-blue-600" : "text-blue-500")} />
          <span className="flex-1 truncate text-left font-medium">
            {activeDossier?.doss_nom || "Sélectionner un dossier"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>

        {/* Dropdown — opens downward */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg z-50">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
              Dossiers PCPAIE ({registry.dossiers.length})
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {registry.dossiers.map((d: DossierInfo) => {
                const isActive = d.id === registry.active_dossier_id;
                return (
                  <button
                    key={d.id}
                    onClick={() => handleSwitch(d.id)}
                    disabled={switching !== null}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50",
                      switching !== null && switching !== d.id && "opacity-50"
                    )}
                  >
                    <Building2 className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-600" : "text-gray-400")} />
                    <div className="flex-1 text-left min-w-0">
                      <div className="truncate">{d.doss_nom}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Users className="h-3 w-3" />
                        {d.employee_count} employés
                      </div>
                    </div>
                    {switching === d.id && (
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                    )}
                    {isActive && switching !== d.id && (
                      <Check className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
);
