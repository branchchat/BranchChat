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
    // Primary CTA: create an account (the account-gated beta flow)…
    expect(
      screen.getByRole("link", { name: /create your account/i }),
    ).toHaveAttribute("href", "/app");
    // …with the waitlist kept as a secondary email-updates path.
    expect(
      screen.getByRole("button", { name: /keep me posted/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    // "What to expect" list is present.
    expect(screen.getByText("Early access")).toBeInTheDocument();
    expect(screen.getByText("Shape the product")).toBeInTheDocument();
  });
});
