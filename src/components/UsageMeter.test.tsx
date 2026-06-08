// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"; // brings jest-dom matcher types into tsc
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { UsageMeter } from "@/components/UsageMeter";
import { useAuthStore } from "@/store/authStore";

afterEach(() => {
  // Reset the singleton store between tests.
  useAuthStore.setState({ user: null, usage: null, hydrated: false });
});

describe("UsageMeter", () => {
  it("renders nothing until usage data exists (local-first / stub mode)", () => {
    const { container } = render(<UsageMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the backend's limits verbatim (never hardcoded) + email", () => {
    useAuthStore.setState({
      user: {
        id: "u1",
        email: "person@example.com",
        email_verified: true,
        created_at: "2026-01-01T00:00:00Z",
      },
      usage: {
        authenticated: true,
        kind: "standard",
        used: 7,
        limit: 50,
        remaining: 43,
      },
      hydrated: true,
    });

    render(<UsageMeter />);
    expect(screen.getByText("7/50 today")).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "7");
    expect(bar).toHaveAttribute("aria-valuemax", "50");
  });

  it("shows the anonymous limit with no email when signed out", () => {
    useAuthStore.setState({
      user: null,
      usage: {
        authenticated: false,
        kind: "standard",
        used: 0,
        limit: 10,
        remaining: 10,
      },
      hydrated: true,
    });

    render(<UsageMeter />);
    expect(screen.getByText("0/10 today")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});
