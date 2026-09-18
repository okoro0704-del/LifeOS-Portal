import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import {
  digiconomyBucketFor,
  getEcommerceCommercialProduct,
  listInstallableDigiconomyEntries,
  listPortalIndustryGroups,
  portalIndustryGroupForEntry,
} from "@lifeos-portal/shared";
import { ChooseLanePage } from "../src/pages/ChooseLane";
import { EcommerceSoftwarePage } from "../src/pages/EcommerceSoftware";
import { Marketplace } from "../src/pages/Marketplace";
import { filterVerticalCatalog } from "../src/data/verticalCatalog";

describe("industry navigation hub", () => {
  test("renders five industry groups", () => {
    render(
      <MemoryRouter>
        <ChooseLanePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /what do you want to build/i })).toBeInTheDocument();
    for (const group of listPortalIndustryGroups()) {
      expect(screen.getByRole("heading", { name: group.label })).toBeInTheDocument();
    }
  });

  test("every available digiconomy entry maps to an industry without bucket mutation", () => {
    for (const entry of listInstallableDigiconomyEntries().filter((e) => e.available)) {
      expect(portalIndustryGroupForEntry(entry)).toBeTruthy();
      expect(entry.bucket).toBe(
        digiconomyBucketFor({ engine: entry.engine, verticalId: entry.verticalId }),
      );
    }
  });
});

describe("EcommerceOS commercial UI", () => {
  test("software/services toggle preserves supermarket selection and exact prices", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/app/business/commerce?product=supermarket"]}>
        <Routes>
          <Route path="/app/business/commerce" element={<EcommerceSoftwarePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Supermarket" })).toBeInTheDocument();
    expect(screen.getByText(/\$99 once/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /services — monthly/i }));
    expect(screen.getByRole("heading", { name: "Supermarket" })).toBeInTheDocument();
    expect(screen.getByText("$29/month", { selector: ".pack-price" })).toBeInTheDocument();
    expect(screen.getByText("50 GB")).toBeInTheDocument();
    expect(screen.getByText("500/mo")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /software — one time/i }));
    expect(screen.getByRole("heading", { name: "Supermarket" })).toBeInTheDocument();
    expect(screen.getByText(/\$99 once/i)).toBeInTheDocument();
  });

  test("marketplace operator is listed as operator product", () => {
    const operator = getEcommerceCommercialProduct("marketplace_operator")!;
    expect(operator.productType).toBe("operator");
    expect(operator.software.oneTimePriceMinor).toBe(29900);
    expect(operator.services.monthlyPriceMinor).toBe(7900);
    expect(operator.services.dataZoneGb).toBe(250);
    expect(operator.services.digiAiCreditsMonthly).toBe(2000);

    render(
      <MemoryRouter initialEntries={["/app/business/commerce"]}>
        <Routes>
          <Route path="/app/business/commerce" element={<EcommerceSoftwarePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Online Marketplace Operator" })).toBeInTheDocument();
    expect(screen.getAllByText("Operator").length).toBeGreaterThan(0);
  });
});

describe("catalog search regression", () => {
  test("supermarket / hotel / restaurant / logistics resolve", () => {
    expect(filterVerticalCatalog("supermarket").some((i) => i.verticalId === "supermarket")).toBe(
      true,
    );
    expect(filterVerticalCatalog("hotel").some((i) => i.verticalId === "hotel")).toBe(true);
    expect(filterVerticalCatalog("restaurant").some((i) => i.verticalId === "restaurant")).toBe(
      true,
    );
    expect(filterVerticalCatalog("logistics").some((i) => i.verticalId === "logistics")).toBe(true);
  });

  test('search "creator" surfaces mybrandOS', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/app/business"]}>
        <Routes>
          <Route path="/app/business" element={<Marketplace />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText(/search verticals/i), "creator");
    expect(screen.getByTestId("creator-search-hit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open mybrandos packs/i })).toHaveAttribute(
      "href",
      "/app/personal/packs",
    );
  });

  test("marketplace ordinary seller vertical is not in searchable marketplace cards", () => {
    expect(filterVerticalCatalog("marketplace").every((i) => i.verticalId !== "marketplace")).toBe(
      true,
    );
  });
});
