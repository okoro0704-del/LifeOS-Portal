import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { Marketplace } from "../src/pages/Marketplace";
import { EcommerceSoftwarePage } from "../src/pages/EcommerceSoftware";
import { ProvisioningWizard } from "../src/components/ProvisioningWizard";

function renderCommerceFlow() {
  return render(
    <MemoryRouter initialEntries={["/app/business"]}>
      <Routes>
        <Route path="/app/business" element={<Marketplace />} />
        <Route path="/app/business/commerce" element={<EcommerceSoftwarePage />} />
        <Route path="/app/business/:osId" element={<ProvisioningWizard />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function continueFromCommerce(user: ReturnType<typeof userEvent.setup>, productName: string) {
  expect(screen.getByRole("heading", { name: productName })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: new RegExp(`Continue with ${productName}`, "i") }));
}

describe("portal ecommerce install wizard", () => {
  test("selecting Physical Store opens ecommerceos with shop fields", async () => {
    const user = userEvent.setup();
    renderCommerceFlow();

    const retailCard = document.querySelector('[data-vertical-id="physical_retail"]') as HTMLElement;
    expect(retailCard).toBeTruthy();
    expect(within(retailCard).getByRole("heading", { name: "Physical Store" })).toBeTruthy();
    await user.click(within(retailCard).getByRole("button", { name: "Install Vertical" }));
    await continueFromCommerce(user, "Physical Store");

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

  test("Online Store uses the same store modules and skips shop address", async () => {
    const user = userEvent.setup();
    renderCommerceFlow();

    const onlineCard = document.querySelector('[data-vertical-id="ecommerce_delivery"]') as HTMLElement;
    expect(onlineCard).toBeTruthy();
    expect(within(onlineCard).getByRole("heading", { name: "Online Store" })).toBeTruthy();
    await user.click(within(onlineCard).getByRole("button", { name: "Install Vertical" }));
    await continueFromCommerce(user, "Online Store");

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

  test("EcommerceOS marketplace shows six customer verticals and hides Marketplace purchase", async () => {
    renderCommerceFlow();
    const ecoCards = [...document.querySelectorAll('[data-testid="vertical-card"]')].filter((el) =>
      el.textContent?.includes("ecommerceos"),
    );
    const names = ecoCards.map((el) => el.querySelector("h2")?.textContent);
    expect(names).toEqual([
      "Physical Store",
      "Online Store",
      "Supermarket",
      "Shopping Centre",
      "Wholesaler",
      "Shopping Mall",
    ]);
    expect(names).not.toContain("Marketplace");
    expect(document.querySelector('[data-vertical-id="marketplace"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Retail with a physical address");
    expect(document.body.textContent).not.toContain("Retail without a physical address");
  });

  test("Supermarket and Shopping Centre open distinct EcommerceOS wizards", async () => {
    const user = userEvent.setup();
    renderCommerceFlow();

    const supermarket = document.querySelector('[data-vertical-id="supermarket"]') as HTMLElement;
    expect(within(supermarket).getByRole("heading", { name: "Supermarket" })).toBeTruthy();
    await user.click(within(supermarket).getByRole("button", { name: "Install Vertical" }));
    await continueFromCommerce(user, "Supermarket");
    expect(screen.getByTestId("wizard-app-id")).toHaveTextContent("ecommerceos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("departments");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("promotions");
    expect(screen.getByTestId("wizard-store-address")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to marketplace" }));
    const centre = document.querySelector('[data-vertical-id="shopping_centre"]') as HTMLElement;
    expect(within(centre).getByRole("heading", { name: "Shopping Centre" })).toBeTruthy();
    await user.click(within(centre).getByRole("button", { name: "Install Vertical" }));
    await continueFromCommerce(user, "Shopping Centre");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("directory");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("units");
    expect(screen.getByTestId("wizard-modules")).not.toHaveTextContent("departments");
    expect(screen.getByTestId("wizard-modules")).not.toHaveTextContent("checkout");
  });
});
