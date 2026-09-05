import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { AdminSiteShell } from "../src/components/AdminSiteShell";

describe("admin site shell", () => {
  test("opens a profile menu with logout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <AdminSiteShell
        brand="Splash Hotels"
        accent="#0d7a6f"
        staff={{ name: "Owner Ada", email: "owner@splashhotels.getlifeos.app", role: "owner" }}
        nav={[{ id: "today", label: "Today" }, { id: "brand", label: "Brand" }]}
        active="today"
        onNav={() => undefined}
        onLogout={onLogout}
      >
        <p>Today board</p>
      </AdminSiteShell>,
    );
    expect(screen.getByTestId("admin-site")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /,\s*Owner/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /,\s*Owner/ }));
    expect(screen.getByTestId("admin-profile-menu")).toBeInTheDocument();
    expect(screen.getByText("owner@splashhotels.getlifeos.app")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalled();
  });
});
