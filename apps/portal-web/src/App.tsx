import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { tenantLabelFromHost } from "@lifeos-portal/shared";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./components/AppShell";
import { WelcomePage } from "./pages/Welcome";
import { LoginPage } from "./pages/Login";
import { CallbackPage } from "./pages/Callback";
import { ChooseLanePage } from "./pages/ChooseLane";
import { PersonalOsPage } from "./pages/PersonalOs";
import { Marketplace } from "./pages/Marketplace";
import { ProvisioningWizard } from "./pages/ProvisioningWizard";
import { BillingPage } from "./pages/Billing";
import { InstallVerticalPage } from "./pages/InstallVertical";
import { InstallsPage } from "./pages/Installs";
import { InstallDetailPage } from "./pages/InstallDetail";
import { OrganizationsPage } from "./pages/Organizations";
import { ProfilePage } from "./pages/Profile";
import { TenantApp } from "./pages/TenantApp";

function tenantFromPath() {
  const match = window.location.pathname.match(/^\/t\/([^/]+)/);
  return match?.[1]?.toLowerCase();
}

export function App() {
  const hostTenant = tenantLabelFromHost(window.location.hostname);
  const pathTenant = tenantFromPath();
  const subdomain = hostTenant || pathTenant;
  if (subdomain) {
    return <TenantApp subdomain={subdomain} basename={hostTenant ? "/" : `/t/${subdomain}`} />;
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/dashboard" element={<Navigate to="/app" replace />} />
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<ChooseLanePage />} />
              <Route path="personal" element={<PersonalOsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="business" element={<Marketplace />} />
              <Route path="business/:osId" element={<ProvisioningWizard />} />
              <Route path="business/:osId/:verticalId/billing" element={<BillingPage />} />
              <Route path="business/:osId/:verticalId/install" element={<InstallVerticalPage />} />
              <Route path="installs" element={<InstallsPage />} />
              <Route path="installs/:id" element={<InstallDetailPage />} />
              <Route path="organizations" element={<OrganizationsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
