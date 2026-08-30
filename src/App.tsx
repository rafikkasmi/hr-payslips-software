import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { api, type AppStatus } from "./lib/api";
import { SetupWizard } from "./components/SetupWizard";
import { Sidebar, type Page } from "./components/Sidebar";
import { ToastProvider } from "./components/ui/Toast";

const EmployeesPage = lazy(() => import("./components/EmployeesPage").then(m => ({ default: m.EmployeesPage })));
const ShiftsPage = lazy(() => import("./components/ShiftsPage").then(m => ({ default: m.ShiftsPage })));
const PointeusePage = lazy(() => import("./components/PointeusePage").then(m => ({ default: m.PointeusePage })));
const LeavesPage = lazy(() => import("./components/LeavesPage").then(m => ({ default: m.LeavesPage })));
const BonusesPage = lazy(() => import("./components/BonusesPage").then(m => ({ default: m.BonusesPage })));
const SalaryPage = lazy(() => import("./components/SalaryPage").then(m => ({ default: m.SalaryPage })));
const AttendancePage = lazy(() => import("./components/AttendancePage").then(m => ({ default: m.AttendancePage })));
const DashboardPage = lazy(() => import("./components/DashboardPage").then(m => ({ default: m.DashboardPage })));
const PostesPage = lazy(() => import("./components/PostesPage").then(m => ({ default: m.PostesPage })));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
    </div>
  );
}

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
    <ToastProvider>
    <div className="flex h-screen bg-gray-50">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-auto">
        <Suspense fallback={<PageLoader />}>
          {page === "dashboard" && <DashboardPage status={status} />}
          {page === "employees" && <EmployeesPage />}
          {page === "postes" && <PostesPage />}
          {page === "shifts" && <ShiftsPage />}
          {page === "pointeuse" && <PointeusePage />}
          {page === "attendance" && <AttendancePage />}
          {page === "leaves" && <LeavesPage />}
          {page === "bonuses" && <BonusesPage />}
          {page === "salary" && <SalaryPage onNavigate={setPage} />}
        </Suspense>
      </main>
    </div>
    </ToastProvider>
  );
}

export default App;
