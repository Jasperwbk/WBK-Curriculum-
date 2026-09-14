import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { LogActivityPage } from "./pages/LogActivityPage";
import { PlanDayPage } from "./pages/PlanDayPage";
import { PlacementTestPage } from "./pages/PlacementTestPage";
import { CheckInPage } from "./pages/CheckInPage";
import { UploadPage } from "./pages/UploadPage";
import { StudentPlaceholderPage } from "./pages/StudentPlaceholderPage";

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
        <Route path="*" element={<StudentPlaceholderPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<TeacherDashboardPage />} />
      <Route path="/log" element={<LogActivityPage />} />
      <Route path="/plan" element={<PlanDayPage />} />
      <Route path="/placement" element={<PlacementTestPage />} />
      <Route path="/checkin" element={<CheckInPage />} />
      <Route path="/upload" element={<UploadPage />} />
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
