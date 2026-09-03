import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/Login";
import { CallbackPage } from "./pages/Callback";
import { TenantsPage } from "./pages/Tenants";
import { RoutingPage } from "./pages/Routing";
import { GatewayPage } from "./pages/Gateway";
import { DataZoneKeysPage } from "./pages/DataZoneKeys";
import { DataZoneRevocationPage } from "./pages/DataZoneRevocation";
import { DataZoneProvenancePage } from "./pages/DataZoneProvenance";

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
              <Route path="/admin/routing" element={<RoutingPage />} />
              <Route path="/admin/gateway" element={<GatewayPage />} />
              <Route path="/admin/datazone/keys" element={<DataZoneKeysPage />} />
              <Route path="/admin/datazone/revocation" element={<DataZoneRevocationPage />} />
              <Route path="/admin/datazone/provenance" element={<DataZoneProvenancePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/admin/tenants" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
