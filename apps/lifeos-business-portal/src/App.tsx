import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/Login";
import { CallbackPage } from "./pages/Callback";
import { AcceptHandoffPage } from "./pages/AcceptHandoff";
import { DomainsPage } from "./pages/Domains";
import { VerticalsPage } from "./pages/Verticals";
import { DomainsHomePage } from "./pages/infrastructure/DomainsHome";
import { DomainPurchasePage } from "./pages/infrastructure/DomainPurchase";
import { DomainManagePage } from "./pages/infrastructure/DomainManage";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/auth/accept" element={<AcceptHandoffPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard/domains" element={<DomainsPage />} />
              <Route path="/dashboard/verticals" element={<VerticalsPage />} />
              <Route path="/infrastructure/domains" element={<DomainsHomePage />} />
              <Route path="/infrastructure/domains/buy/:quoteId" element={<DomainPurchasePage />} />
              <Route path="/infrastructure/domains/:id" element={<DomainManagePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard/domains" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
