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
    // Single CTA: create an account (the account-gated beta flow); the
    // waitlist form deliberately does NOT render here.
    expect(
      screen.getByRole("link", { name: /create your account/i }),
    ).toHaveAttribute("href", "/app");
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    // "What to expect" list is present.
    expect(screen.getByText("Early access")).toBeInTheDocument();
    expect(screen.getByText("Shape the product")).toBeInTheDocument();
  });
});
