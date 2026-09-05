import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BusinessHome } from "../components/BusinessHome";
import { TenantAppChrome } from "../components/TenantAppChrome";

export function TenantFallbackApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const name = subdomain.replaceAll("-", " ");
  const hostname = `${subdomain}.getlifeos.app`;
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
                hostname={hostname}
                accent="#5eead4"
                story={`${name} is a living business on getlifeos.app — a house with a story, a board, and a way for patrons to come back.`}
                primaryCta={{ to: "/", label: "See the house" }}
                secondaryCta={{ to: "/", label: "Talk to us" }}
                quotesEyebrow="From people who already visited"
                testimonials={[
                  { name: "Ada K.", quote: `${name} felt like a real house, not a placeholder page.`, visit: "First visit" },
                  { name: "Musa O.", quote: "I found the story, then I knew where to come back.", visit: "Walk-in" },
                  { name: "Chioma B.", quote: "Clear, warm, and easy to share with someone else.", visit: "Repeat guest" },
                ]}
                links={[
                  { to: "/", eyebrow: "House", title: "About", copy: "This page is the front door. The guest board attaches next." },
                  { to: "/", eyebrow: "Board", title: "Services", copy: "Food, rooms, or tickets land here when the vertical is live." },
                  { to: "/", eyebrow: "You", title: "Visit", copy: "Patrons start on Home, then move into the working tabs." },
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
