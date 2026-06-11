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
        is_beta_tester: true,
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

  it("renders no coding bar when the backend omits the bucket", () => {
    useAuthStore.setState({
      user: null,
      usage: {
        authenticated: false,
        kind: "standard",
        used: 1,
        limit: 10,
        remaining: 9,
      },
      hydrated: true,
    });

    render(<UsageMeter />);
    // Only the standard bar; no coding allowance shown.
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.queryByText(/code$/)).not.toBeInTheDocument();
  });

  it("renders a second coding bar with the backend's coding limits", () => {
    useAuthStore.setState({
      user: null,
      usage: {
        authenticated: true,
        kind: "standard",
        used: 12,
        limit: 50,
        remaining: 38,
        coding: { used: 3, limit: 10, remaining: 7 },
      },
      hydrated: true,
    });

    render(<UsageMeter />);
    expect(screen.getByText("12/50 today")).toBeInTheDocument();
    expect(screen.getByText("3/10 code")).toBeInTheDocument();

    // Two distinct, labelled progressbars.
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    const coding = screen.getByRole("progressbar", {
      name: "coding-mode messages used",
    });
    expect(coding).toHaveAttribute("aria-valuenow", "3");
    expect(coding).toHaveAttribute("aria-valuemax", "10");
  });
});
