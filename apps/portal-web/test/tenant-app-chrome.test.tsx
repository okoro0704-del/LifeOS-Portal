import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { TenantAppChrome } from "../src/components/TenantAppChrome";

function renderChrome(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TenantAppChrome
        brand="Harbor Dining"
        accent="#7c3aed"
        titles={{ "/": "Dining room", "/menu": "Menu", "/admin": "Staff" }}
        tabs={[
          { to: "/", label: "Home", icon: "home" },
          { to: "/menu", label: "Menu", icon: "food" },
          { to: "/admin", label: "Staff", icon: "staff" },
        ]}
      >
        <Routes>
          <Route path="/" element={<p>Home body</p>} />
          <Route path="/menu" element={<p>Menu body</p>} />
          <Route path="/admin" element={<p>Staff body</p>} />
        </Routes>
      </TenantAppChrome>
    </MemoryRouter>,
  );
}

describe("tenant app chrome", () => {
  test("home has a centered title and no back button", () => {
    renderChrome("/");
    expect(screen.getByRole("heading", { name: "Dining room" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getByText("Home body")).toBeInTheDocument();
    expect(screen.getByRole("navigation").querySelectorAll("a")).toHaveLength(3);
  });

  test("inner pages show a back button and keep the header centered", async () => {
    const user = userEvent.setup();
    renderChrome("/menu");
    expect(screen.getByRole("heading", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /staff/i }));
    expect(screen.getByRole("heading", { name: "Staff" })).toBeInTheDocument();
    expect(screen.getByText("Staff body")).toBeInTheDocument();
  });
});
