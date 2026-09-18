import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { Marketplace } from "../src/pages/Marketplace";
import { HospitalitySoftwarePage } from "../src/pages/HospitalitySoftware";
import { ProvisioningWizard } from "../src/components/ProvisioningWizard";
import { filterVerticalCatalog } from "../src/data/verticalCatalog";

function renderMarketplace() {
  return render(
    <MemoryRouter initialEntries={["/app/business"]}>
      <Routes>
        <Route path="/app/business" element={<Marketplace />} />
        <Route path="/app/business/hospitality" element={<HospitalitySoftwarePage />} />
        <Route path="/app/business/:osId" element={<ProvisioningWizard />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function continueHospitality(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(
    screen.getByRole("button", {
      name: new RegExp(`Continue with ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    }),
  );
}

describe("marketplace search", () => {
  test('typing "gym" filters the grid down to Gym & Fitness Center', async () => {
    const user = userEvent.setup();
    renderMarketplace();

    await user.type(screen.getByLabelText(/search verticals/i), "gym");

    const cards = screen.getAllByTestId("vertical-card");
    const names = cards.map((el) => el.querySelector("h2")?.textContent);
    expect(names).toContain("Gym & Fitness Center");
    expect(names).not.toContain("Hotel & Resort");
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

    const rentalCard = document.querySelector('[data-vertical-id="rentals"]') as HTMLElement;
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

    expect(document.querySelector('[data-vertical-id="beauty"]')).toBeTruthy();
    expect(document.querySelector('[data-vertical-id="wellness"]')).toBeTruthy();
    expect(document.querySelector('[data-vertical-id="technical"]')).toBeTruthy();
    expect(document.querySelector('[data-vertical-id="culinary"]')).toBeTruthy();

    const beauty = document.querySelector('[data-vertical-id="beauty"]') as HTMLElement;
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

    const gymCard = document.querySelector('[data-vertical-id="standalone_gym_spa"]') as HTMLElement;
    expect(gymCard).toBeTruthy();
    await user.click(within(gymCard).getByRole("button", { name: "Install Vertical" }));
    await continueHospitality(user, "Gym / Fitness");

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

  test("hotel install extracts hotel features only", async () => {
    const user = userEvent.setup();
    renderMarketplace();

    const hotelCard = document.querySelector('[data-vertical-id="standalone_hotel"]') as HTMLElement;
    expect(hotelCard).toBeTruthy();
    await user.click(within(hotelCard).getByRole("button", { name: "Install Vertical" }));
    await continueHospitality(user, "Hotel");

    expect(screen.getByTestId("provisioning-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-app-id")).toHaveTextContent("hospitalityos");
    expect(screen.getByTestId("wizard-modules")).toHaveTextContent("accommodation");
    expect(screen.getByTestId("wizard-modules")).not.toHaveTextContent("gym_spa");
    expect(screen.getByTestId("wizard-modules")).not.toHaveTextContent("dining");
    expect(screen.getByTestId("hotel-only-features")).toHaveTextContent("Rooms");
    expect(screen.getByTestId("hotel-only-features")).toHaveTextContent("Room service");
    expect(screen.queryByRole("checkbox", { name: /Gym \/ Fitness \/ Spa/i })).not.toBeInTheDocument();
    expect(screen.getByText(/getlifeos\.app/)).toBeInTheDocument();
  });
});
