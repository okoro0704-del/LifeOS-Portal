import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BusinessHome } from "../components/BusinessHome";
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
              <BusinessHome
                name={name}
                story={`${name} is a living business — a house with a story, a board, and a way for patrons to come back.`}
                primaryCta={{ to: "/", label: "See the house" }}
                quotesEyebrow="From people who already visited"
                testimonials={[
                  { name: "Ada K.", quote: `${name} felt like a real house, not a placeholder page.`, visit: "First visit" },
                  { name: "Musa O.", quote: "I found the story, then I knew where to come back.", visit: "Walk-in" },
                  { name: "Chioma B.", quote: "Clear, warm, and easy to share with someone else.", visit: "Repeat guest" },
                ]}
              />
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
