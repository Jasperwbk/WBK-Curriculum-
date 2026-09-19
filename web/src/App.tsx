import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { LogActivityPage } from "./pages/LogActivityPage";
import { PlanDayPage } from "./pages/PlanDayPage";
import { ProposedDaysPage } from "./pages/ProposedDaysPage";
import { EndOfDayClosingPage } from "./pages/EndOfDayClosingPage";
import { PlacementTestPage } from "./pages/PlacementTestPage";
import { CheckInPage } from "./pages/CheckInPage";
import { UploadPage } from "./pages/UploadPage";
import { StudentHomePage } from "./pages/StudentHomePage";
import { StudentPlacementPage } from "./pages/StudentPlacementPage";
import { HelpRequestsPage } from "./pages/HelpRequestsPage";
import { IdentitySetupPage } from "./pages/IdentitySetupPage";
import { CurriculumQualityPage } from "./pages/CurriculumQualityPage";
import { AccountAdministrationPage } from "./pages/AccountAdministrationPage";

function Gate() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--page)" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  if (profile?.role === "student") {
    return (
      <Routes>
        <Route path="/" element={<StudentHomePage />} />
        <Route path="/placement" element={<StudentPlacementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<TeacherDashboardPage />} />
      <Route path="/log" element={<LogActivityPage />} />
      <Route path="/plan" element={<PlanDayPage />} />
      <Route path="/proposed-days" element={<ProposedDaysPage />} />
      <Route path="/closeout" element={<EndOfDayClosingPage />} />
      <Route path="/placement" element={<PlacementTestPage />} />
      <Route path="/checkin" element={<CheckInPage />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/help-requests" element={<HelpRequestsPage />} />
      <Route path="/identity" element={<IdentitySetupPage />} />
      <Route path="/quality" element={<CurriculumQualityPage />} />
      {profile?.systemRole === "owner" && (
        <Route path="/account-admin" element={<AccountAdministrationPage />} />
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
