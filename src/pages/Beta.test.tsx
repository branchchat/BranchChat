// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Beta } from "@/pages/Beta";

describe("Beta page", () => {
  it("renders the beta signup with beta-specific CTA + email field", () => {
    render(
      <MemoryRouter>
        <Beta />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /help shape branchchat/i }),
    ).toBeInTheDocument();
    // Beta-flavoured CTA (overrides the default "Join waitlist").
    expect(
      screen.getByRole("button", { name: /request beta access/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    // "What to expect" list is present.
    expect(screen.getByText("Early access")).toBeInTheDocument();
    expect(screen.getByText("Shape the product")).toBeInTheDocument();
  });
});
