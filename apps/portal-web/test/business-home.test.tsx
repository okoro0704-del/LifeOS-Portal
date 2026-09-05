import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { BusinessHome } from "../src/components/BusinessHome";

describe("business home", () => {
  test("talks about the business then shows three patron quotes under the CTA", () => {
    render(
      <MemoryRouter>
        <BusinessHome
          name="Harbor Kitchen"
          hostname="harbor-kitchen.getlifeos.app"
          story="Harbor Kitchen is a dining room for people who want a table and a plated dinner."
          primaryCta={{ to: "/menu", label: "See the menu" }}
          secondaryCta={{ to: "/drinks", label: "Open drinks" }}
          testimonials={[
            { name: "Ada K.", quote: "I booked the same table again.", visit: "Dinner" },
            { name: "Musa O.", quote: "Cold chapman, no fuss.", visit: "Friday" },
            { name: "Chioma B.", quote: "Food came fast.", visit: "Regular" },
          ]}
          links={[{ to: "/menu", eyebrow: "Dining", title: "Menu", copy: "Plates from the house." }]}
        />
      </MemoryRouter>,
    );
    const home = screen.getByTestId("business-home");
    const story = screen.getByText(/Harbor Kitchen is a dining room/i);
    const cta = screen.getByRole("link", { name: "See the menu" });
    const quotes = screen.getByTestId("home-testimonials");
    expect(home.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(story.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cta.compareDocumentPosition(quotes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Ada K.")).toBeInTheDocument();
    expect(screen.getByText("Musa O.")).toBeInTheDocument();
    expect(screen.getByText("Chioma B.")).toBeInTheDocument();
  });
});
