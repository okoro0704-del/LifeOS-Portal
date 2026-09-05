import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TenantAppChrome } from "../components/TenantAppChrome";

export function TenantFallbackApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const name = subdomain.replaceAll("-", " ");
  return (
    <BrowserRouter basename={basename}>
      <TenantAppChrome
        brand={name}
        accent="#5eead4"
        titles={{ "/": "Home", "/admin": "Admin", "/staff": "Staff" }}
        tabs={[{ to: "/", label: "Home", icon: "home" }]}
      >
        <Routes>
          <Route
            path="/"
            element={
              <div>
                <p className="tap-hero">{name} is live on getlifeos.app.</p>
                <p className="lead">Guest ordering for this vertical is wired next. Staff login is on the Staff tab.</p>
              </div>
            }
          />
          <Route
            path="/admin"
            element={
              <div>
                <p className="lead">Owner and department boards attach when this vertical’s ops pack is enabled.</p>
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TenantAppChrome>
    </BrowserRouter>
  );
}
