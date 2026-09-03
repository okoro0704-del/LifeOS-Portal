import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/Login";
import { CallbackPage } from "./pages/Callback";
import { DomainsPage } from "./pages/Domains";
import { VerticalsPage } from "./pages/Verticals";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard/domains" element={<DomainsPage />} />
              <Route path="/dashboard/verticals" element={<VerticalsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard/domains" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
