import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { Marketplace } from "../src/pages/Marketplace";
import { ProvisioningWizard } from "../src/components/ProvisioningWizard";
import { filterVerticalCatalog } from "../src/data/verticalCatalog";

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

describe("marketplace search", () => {
  test('typing "gym" filters the grid down to Gym & Fitness Center', async () => {
    const user = userEvent.setup();
    renderMarketplace();

    await user.type(screen.getByLabelText(/search verticals/i), "gym");

    const cards = screen.getAllByTestId("vertical-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByRole("heading", { name: "Gym & Fitness Center" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hotel & Resort" })).not.toBeInTheDocument();
  });

  test('typing "hotel" matches Hotel & Resort and Full Resort', () => {
    const hits = filterVerticalCatalog("hotel").map((item) => item.name);
    expect(hits).toContain("Hotel & Resort");
    expect(hits).toContain("Full Resort & Leisure Complex");
  });

  test('typing "rental agency" filters the grid down to Car & Fleet Rental Agency', () => {
    const hits = filterVerticalCatalog("rental agency").map((item) => item.name);
    expect(hits).toEqual(["Car & Fleet Rental Agency"]);
  });

  test("transport marketplace cards install TransportationOS presets", async () => {
    const user = userEvent.setup();
    renderMarketplace();

    const rentalCard = document.querySelector('[data-vertical-id="car_fleet_rental"]') as HTMLElement;
    expect(rentalCard).toBeTruthy();
    await user.click(within(rentalCard).getByRole("button", { name: "Install Vertical" }));

    expect(screen.getByTestId("provisioning-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-app-id")).toHaveTextContent("transportationos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("rental_fleet");
    expect(screen.getByDisplayValue("Car & Fleet Rental Agency")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-daily-rate")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-security-deposit")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-license-verification")).toBeChecked();
  });

  test("service marketplace cards install ServiceOS presets", async () => {
    const user = userEvent.setup();
    renderMarketplace();

    expect(document.querySelector('[data-vertical-id="mobile_salon_grooming"]')).toBeTruthy();
    expect(document.querySelector('[data-vertical-id="home_wellness_spa"]')).toBeTruthy();
    expect(document.querySelector('[data-vertical-id="field_technician"]')).toBeTruthy();
    expect(document.querySelector('[data-vertical-id="private_chef_culinary"]')).toBeTruthy();

    const beauty = document.querySelector('[data-vertical-id="mobile_salon_grooming"]') as HTMLElement;
    expect(beauty).toBeTruthy();
    await user.click(within(beauty).getByRole("button", { name: "Install Vertical" }));

    expect(screen.getByTestId("provisioning-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-app-id")).toHaveTextContent("serviceos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("catalog");
    expect(screen.getByDisplayValue("Mobile Salon & Grooming OS")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-per-km-fee")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-cancellation-window")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-skill-certs")).toBeChecked();
    expect(screen.getByTestId("wizard-pos-photo")).toBeChecked();
  });

  test("clicking Install Vertical opens the wizard pre-configured with gym modules", async () => {
    const user = userEvent.setup();
    renderMarketplace();

    const gymCard = document.querySelector('[data-vertical-id="gym_fitness"]') as HTMLElement;
    expect(gymCard).toBeTruthy();
    await user.click(within(gymCard).getByRole("button", { name: "Install Vertical" }));

    expect(screen.getByTestId("provisioning-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-app-id")).toHaveTextContent("hospitalityos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("gym_spa");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("billing");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("crm");
    expect(screen.getByDisplayValue("Gym & Fitness Center")).toBeInTheDocument();

    const gymBox = screen.getByRole("checkbox", { name: /Gym \/ Fitness \/ Spa/i });
    expect(gymBox).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Hotel \/ Accommodation/i })).not.toBeChecked();
  });
});
