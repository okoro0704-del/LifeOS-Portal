import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/Login";
import { CallbackPage } from "./pages/Callback";
import { TenantsPage } from "./pages/Tenants";
import { TenantDetailPage } from "./pages/TenantDetail";
import { BillingsPage } from "./pages/Billings";
import { VerticalsPage } from "./pages/Verticals";
import { AccountsPage } from "./pages/Accounts";
import { RoutingPage } from "./pages/Routing";
import { InstallHealthPage } from "./pages/InstallHealth";
import { OrganizationsPage } from "./pages/Organizations";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/admin/tenants" element={<TenantsPage />} />
              <Route path="/admin/tenants/:tenantId" element={<TenantDetailPage />} />
              <Route path="/admin/billings" element={<BillingsPage />} />
              <Route path="/admin/verticals" element={<VerticalsPage />} />
              <Route path="/admin/accounts" element={<AccountsPage />} />
              <Route path="/admin/domains" element={<RoutingPage />} />
              <Route path="/admin/health" element={<InstallHealthPage />} />
              <Route path="/admin/organizations" element={<OrganizationsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/admin/tenants" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
