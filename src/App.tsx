import { useState, useEffect, useCallback } from "react";
import { api, type AppStatus } from "./lib/api";
import { SetupWizard } from "./components/SetupWizard";
import { Sidebar, type Page } from "./components/Sidebar";
import { EmployeesPage } from "./components/EmployeesPage";
import { ShiftsPage } from "./components/ShiftsPage";
import { PointeusePage } from "./components/PointeusePage";
import { LeavesPage } from "./components/LeavesPage";
import { BonusesPage } from "./components/BonusesPage";
import { SalaryPage } from "./components/SalaryPage";
import { AttendancePage } from "./components/AttendancePage";
import { DashboardPage } from "./components/DashboardPage";
import { PostesPage } from "./components/PostesPage";
import { RubriquesPage } from "./components/RubriquesPage";
import { SettingsPage } from "./components/SettingsPage";

function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getAppStatus();
      setStatus(s);
    } catch (e) {
      console.error("Failed to get app status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
          <p className="mt-4 text-gray-600">Loading HAMTECH Paie...</p>
        </div>
      </div>
    );
  }

  if (!status?.initialized) {
    return <SetupWizard onComplete={refreshStatus} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-auto">
        {page === "dashboard" && <DashboardPage status={status} />}
        {page === "employees" && <EmployeesPage />}
        {page === "postes" && <PostesPage />}
        {page === "rubriques" && <RubriquesPage />}
        {page === "shifts" && <ShiftsPage />}
        {page === "pointeuse" && <PointeusePage />}
        {page === "attendance" && <AttendancePage />}
        {page === "leaves" && <LeavesPage />}
        {page === "bonuses" && <BonusesPage />}
        {page === "salary" && <SalaryPage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
