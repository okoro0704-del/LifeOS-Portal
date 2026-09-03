import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { Marketplace } from "../src/pages/Marketplace";
import { ProvisioningWizard } from "../src/components/ProvisioningWizard";

function renderMarketplace() {
  return render(
    <MemoryRouter initialEntries={["/app/business"]}>
      <Routes>
        <Route path="/app/business" element={<Marketplace />} />
        <Route path="/app/business/:osId" element={<ProvisioningWizard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("portal ecommerce install wizard", () => {
  test("selecting retail with a physical address opens ecommerceos with shop fields and delivery", async () => {
    const user = userEvent.setup();
    renderMarketplace();

    const retailCard = document.querySelector('[data-vertical-id="retail_store"]') as HTMLElement;
    expect(retailCard).toBeTruthy();
    await user.click(within(retailCard).getByRole("button", { name: "Install Vertical" }));

    expect(screen.getByTestId("provisioning-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-app-id")).toHaveTextContent("ecommerceos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("catalog");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("pos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("checkout");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("logisticsBridge");
    expect(screen.getByTestId("wizard-store-name")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-store-address")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-wallet-payout")).toBeInTheDocument();

    await user.clear(screen.getByTestId("wizard-store-name"));
    await user.type(screen.getByTestId("wizard-store-name"), "Harbor Market");
    await user.clear(screen.getByTestId("wizard-subdomain"));
    await user.type(screen.getByTestId("wizard-subdomain"), "harbor-market");
    await user.type(screen.getByTestId("wizard-store-address"), "12 Marina");
    await user.type(screen.getByTestId("wizard-store-city"), "Lagos");
    await user.type(screen.getByTestId("wizard-wallet-payout"), "wallet_harbor");

    expect(screen.getByRole("button", { name: "Continue to billing" })).toBeEnabled();
  });

  test("retail without a physical address uses the same modules and skips shop address", async () => {
    const user = userEvent.setup();
    renderMarketplace();

    const onlineCard = document.querySelector('[data-vertical-id="ecommerce_delivery"]') as HTMLElement;
    expect(onlineCard).toBeTruthy();
    await user.click(within(onlineCard).getByRole("button", { name: "Install Vertical" }));

    expect(screen.getByTestId("wizard-app-id")).toHaveTextContent("ecommerceos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("catalog");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("checkout");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("logisticsBridge");
    expect(screen.queryByTestId("wizard-store-address")).not.toBeInTheDocument();

    await user.clear(screen.getByTestId("wizard-store-name"));
    await user.type(screen.getByTestId("wizard-store-name"), "Night Market");
    await user.clear(screen.getByTestId("wizard-subdomain"));
    await user.type(screen.getByTestId("wizard-subdomain"), "night-market");

    expect(screen.getByRole("button", { name: "Continue to billing" })).toBeEnabled();
  });
});
